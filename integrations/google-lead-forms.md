# Google Lead Form Extensions

> **Use in Yappr context**: Receive a lead captured via a Google Ads lead form and immediately queue an outbound callback call while the lead is hot.

## Overview

Google Lead Form Extensions (also called Lead Form Assets) allow leads to submit contact info directly in Google Search, YouTube, Display, and Discovery ads without leaving the ad. Leads can be delivered two ways:

1. **Webhook** — Google POSTs to your endpoint in near-real-time (recommended for immediate callback)
2. **Google Sheets integration** — Google writes to a sheet periodically (polling required, adds delay)

For Yappr, use the webhook approach.

## Authentication

No inbound auth header — Google authenticates via a shared secret (`google_key`) that you configure in Google Ads and validate in your endpoint. Treat it as a static bearer token.

## Webhook Setup

In Google Ads:
1. Campaigns → Assets → Lead form asset → open or create a form
2. Scroll to "Lead delivery" → select "Webhook"
3. Enter your endpoint URL and a `Key` value (your `google_key` secret)
4. Click "Send test data" to verify your endpoint responds with `200 OK`

Your endpoint must respond with `200 OK` within 10 seconds or Google will retry.

## Webhook Payload

Google POSTs `application/json` to your endpoint:

```json
{
  "lead_id": "TeSter-abcd1234-efgh5678",
  "api_version": "1.0",
  "form_id": 12345678901,
  "google_key": "YOUR_CONFIGURED_SECRET",
  "user_column_data": [
    { "column_id": "FULL_NAME", "string_value": "David Cohen" },
    { "column_id": "PHONE_NUMBER", "string_value": "0501234567" },
    { "column_id": "EMAIL", "string_value": "david@example.com" },
    { "column_id": "COMPANY_NAME", "string_value": "Acme Ltd" }
  ],
  "adgroup_id": 67890123456,
  "campaign_id": 11111111111,
  "creative_id": 22222222222,
  "is_test": false
}
```

`is_test: true` when Google sends test data from the Ads UI — skip these in production.

## All Possible `column_id` Values

| column_id | Description |
|-----------|-------------|
| `FULL_NAME` | Full name (single field) |
| `PHONE_NUMBER` | Phone, often local format |
| `EMAIL` | Email address |
| `POSTAL_CODE` | Postal / zip code |
| `CITY` | City |
| `COUNTRY` | Country name |
| `COMPANY_NAME` | Company name |
| `JOB_TITLE` | Job title |
| `WORK_EMAIL` | Work email address |
| `WORK_PHONE` | Work phone number |

Not all fields appear in every payload — only the fields enabled on the specific form.

## Common Patterns

### Receive webhook, validate, normalize phone, queue call

```typescript
import { createClient } from "npm:@supabase/supabase-js";

const GOOGLE_KEY = Deno.env.get("GOOGLE_LEAD_FORM_KEY")!;

interface GoogleLeadPayload {
  lead_id: string;
  api_version: string;
  form_id: number;
  google_key: string;
  user_column_data: Array<{ column_id: string; string_value: string }>;
  adgroup_id: number;
  campaign_id: number;
  creative_id: number;
  is_test: boolean;
}

function extractField(
  data: GoogleLeadPayload["user_column_data"],
  columnId: string
): string | undefined {
  return data.find((d) => d.column_id === columnId)?.string_value;
}

// Normalize Israeli phone to E.164
function normalizeIsraeliPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (digits.startsWith("972")) return `+${digits}`;
  if (digits.startsWith("0")) return `+972${digits.slice(1)}`;

  // Assume local 10-digit starting with 05
  if (digits.length === 10) return `+972${digits.slice(1)}`;
  if (digits.length === 9) return `+972${digits}`;

  throw new Error(`Unrecognized phone format: ${raw}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload: GoogleLeadPayload = await req.json();

  // 1. Validate google_key
  if (payload.google_key !== GOOGLE_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Skip test leads
  if (payload.is_test) {
    return new Response("OK", { status: 200 });
  }

  const cols = payload.user_column_data;
  const rawPhone = extractField(cols, "PHONE_NUMBER") ?? extractField(cols, "WORK_PHONE");
  const email = extractField(cols, "EMAIL") ?? extractField(cols, "WORK_EMAIL");
  const fullName = extractField(cols, "FULL_NAME");
  const company = extractField(cols, "COMPANY_NAME");

  if (!rawPhone) {
    console.error("Google lead missing phone:", payload.lead_id);
    return new Response("OK", { status: 200 }); // Always return 200 to stop retries
  }

  let phone: string;
  try {
    phone = normalizeIsraeliPhone(rawPhone);
  } catch (err) {
    console.error("Phone normalization failed:", rawPhone, err);
    return new Response("OK", { status: 200 });
  }

  // 3. Queue outbound call
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error } = await supabase.from("call_queue").insert({
    phone,
    email,
    full_name: fullName,
    company,
    source: "google_lead_form",
    source_campaign_id: String(payload.campaign_id),
    source_lead_id: payload.lead_id,
    priority: "high", // Hot lead — call immediately
  });

  if (error) {
    console.error("Failed to queue call:", error);
    // Still return 200 so Google doesn't retry — handle via dead letter queue
  }

  return new Response("OK", { status: 200 });
});
```

### Parse name into first/last

```typescript
function parseName(fullName?: string): { firstName?: string; lastName?: string } {
  if (!fullName) return {};
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
  };
}
```

## Gotchas & Rate Limits

- **Always return `200 OK`**: If your endpoint returns anything other than 200, Google retries with exponential backoff. Handle errors internally (dead letter queue, logging) and always acknowledge receipt with 200.
- **Phone numbers are local format**: Israeli leads come as `05XXXXXXXX` (10 digits, no country code). Always normalize to E.164 before queuing.
- **`is_test: true` on test deliveries**: Filter these out or you'll trigger test calls. Google sends test data when you click "Send test data" in the Ads UI.
- **No pull API for webhook leads**: If your endpoint was down when a lead came in, that lead is lost — Google doesn't store webhook payloads for replay. Implement a retry/buffer strategy or use Google Sheets as a fallback.
- **Google Sheets alternative**: Google can also export leads to a Google Sheet automatically. You can poll the sheet via Google Sheets API as a fallback, but adds 1–15 min delay.
- **form_id identifies the form**: If you run multiple lead form assets (different forms for different campaigns), use `form_id` to route to the appropriate agent or call script.
- **Campaign attribution**: `campaign_id`, `adgroup_id`, and `creative_id` are available — store them for conversion reporting back to Google Ads.
- **Sending conversions back**: After a successful call outcome, you should fire a Google Ads conversion event via the Google Ads API Conversions endpoint to close the attribution loop.
