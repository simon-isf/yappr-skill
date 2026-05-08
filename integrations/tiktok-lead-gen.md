# TikTok Lead Generation Forms

> **Use in Yappr context**: Receive a lead from a TikTok In-Feed ad lead form and immediately queue an outbound callback while the lead is still engaged on the app.

## Overview

TikTok Lead Generation captures leads directly within TikTok ads without the user leaving the app. It is growing fast in Israel, particularly for consumer-facing businesses (real estate, finance, beauty, automotive).

Lead delivery has two approaches:
1. **Webhook** — TikTok sends a notification payload to your endpoint (near-real-time, but payload contains only IDs — you must fetch the full lead via API)
2. **API polling** — Periodically call the Leads API to fetch new submissions

For immediate callbacks, use webhooks + API fetch.

## Authentication

```
Access-Token: {app_access_token}
Content-Type: application/json
```

Get your token from TikTok for Business → Developer Portal → Apps → your app → Access Token.

For webhook security, TikTok sends an HMAC-SHA256 signature in the `X-TikTok-Signature` header.

## Base URL

```
https://business-api.tiktok.com/open_api/v1.3
```

## Key Endpoints

### GET /lead/task/list/ — List leads by advertiser

```
GET /lead/task/list/?advertiser_id=12345678901234&page=1&page_size=10
```

Required header: `Access-Token: {token}`

Response:

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "list": [
      {
        "task_id": "7123456789012345678",
        "ad_id": "7111111111111111111",
        "adgroup_id": "7222222222222222222",
        "campaign_id": "7333333333333333333",
        "create_time": 1714000000,
        "form_data": {
          "questions": [
            { "field_name": "PHONE_NUMBER", "value": "0501234567" },
            { "field_name": "FULL_NAME", "value": "Noa Levy" },
            { "field_name": "EMAIL", "value": "noa@example.com" }
          ]
        }
      }
    ],
    "page_info": {
      "total_number": 42,
      "page": 1,
      "page_size": 10,
      "total_page": 5
    }
  }
}
```

`create_time` is Unix timestamp in **seconds**.

### GET /lead/task/ — Get specific lead by task_id

```
GET /lead/task/?task_id=7123456789012345678&advertiser_id=12345678901234
```

Response: same structure as above but for a single lead. Use this after receiving a webhook notification.

### GET /lead/download/ — Download leads as CSV

```
GET /lead/download/?advertiser_id=12345678901234&form_id=7444444444444444444&start_time=1714000000&end_time=1714086400
```

Returns a CSV file URL for bulk lead exports. Not useful for real-time webhook flows.

## Webhook Configuration

In TikTok Ads Manager:
1. Tools → Lead Generation → Webhook Integration
2. Enter your HTTPS endpoint URL
3. TikTok will send a verification request — respond with the `echostr` query parameter value

### Webhook verification request (GET)

```
GET https://your-endpoint.com/tiktok-leads?echostr=RANDOM_STRING
```

Your endpoint must respond with just the `echostr` value as plain text.

### Webhook notification payload (POST)

```json
{
  "ad_id": "7111111111111111111",
  "adgroup_id": "7222222222222222222",
  "campaign_id": "7333333333333333333",
  "advertiser_id": "12345678901234",
  "task_id": "7123456789012345678",
  "form_id": "7444444444444444444",
  "create_time": 1714000000
}
```

This payload contains only IDs — **no lead data**. You must call GET /lead/task/ with the `task_id` to fetch the actual lead information.

### Webhook signature verification

TikTok sends `X-TikTok-Signature` header. Verify with:

```
HMAC-SHA256(app_secret, request_body_raw_bytes)
```

## Common Patterns

### Webhook endpoint: verify, fetch lead, normalize phone, queue call

```typescript
import { createClient } from "npm:@supabase/supabase-js";
import { crypto } from "jsr:@std/crypto";

const TIKTOK_ACCESS_TOKEN = Deno.env.get("TIKTOK_ACCESS_TOKEN")!;
const TIKTOK_APP_SECRET = Deno.env.get("TIKTOK_APP_SECRET")!;
const TIKTOK_ADVERTISER_ID = Deno.env.get("TIKTOK_ADVERTISER_ID")!;
const TIKTOK_BASE = "https://business-api.tiktok.com/open_api/v1.3";

async function verifyTikTokSignature(
  body: string,
  signature: string | null
): Promise<boolean> {
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(TIKTOK_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  );

  const computed = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === signature.toLowerCase();
}

// Normalize Israeli phone to E.164
function normalizeIsraeliPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (digits.startsWith("972")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+972${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("5")) return `+972${digits}`;

  throw new Error(`Cannot normalize phone: ${raw}`);
}

async function fetchLeadDetails(taskId: string) {
  const res = await fetch(
    `${TIKTOK_BASE}/lead/task/?task_id=${taskId}&advertiser_id=${TIKTOK_ADVERTISER_ID}`,
    {
      headers: { "Access-Token": TIKTOK_ACCESS_TOKEN },
    }
  );

  if (!res.ok) throw new Error(`TikTok lead fetch failed: ${res.status}`);

  const json = await res.json();
  if (json.code !== 0) throw new Error(`TikTok API error: ${json.message}`);

  return json.data?.list?.[0] ?? null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Handle webhook verification (GET with echostr)
  if (req.method === "GET") {
    const echostr = url.searchParams.get("echostr");
    if (echostr) {
      return new Response(echostr, { status: 200 });
    }
    return new Response("OK", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("X-TikTok-Signature");

  // Verify signature
  const isValid = await verifyTikTokSignature(rawBody, signature);
  if (!isValid) {
    console.warn("Invalid TikTok webhook signature");
    return new Response("OK", { status: 200 }); // Don't expose rejection
  }

  const notification = JSON.parse(rawBody);
  const { task_id, campaign_id, ad_id, adgroup_id } = notification;

  // Fetch actual lead data
  let lead: Awaited<ReturnType<typeof fetchLeadDetails>>;
  try {
    lead = await fetchLeadDetails(task_id);
  } catch (err) {
    console.error("Failed to fetch TikTok lead:", err);
    return new Response("OK", { status: 200 });
  }

  if (!lead) {
    console.error("TikTok lead not found for task_id:", task_id);
    return new Response("OK", { status: 200 });
  }

  // Extract fields from form_data.questions
  const fields: Record<string, string> = {};
  for (const q of lead.form_data?.questions ?? []) {
    fields[q.field_name] = q.value;
  }

  const rawPhone = fields["PHONE_NUMBER"];
  if (!rawPhone) {
    console.error("TikTok lead missing phone:", task_id);
    return new Response("OK", { status: 200 });
  }

  let phone: string;
  try {
    phone = normalizeIsraeliPhone(rawPhone);
  } catch {
    console.error("Phone normalization failed:", rawPhone);
    return new Response("OK", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error } = await supabase.from("call_queue").insert({
    phone,
    email: fields["EMAIL"],
    full_name: fields["FULL_NAME"],
    source: "tiktok_lead_gen",
    source_campaign_id: String(campaign_id),
    source_ad_id: String(ad_id),
    source_lead_id: task_id,
    priority: "high",
    submitted_at: new Date(lead.create_time * 1000).toISOString(),
  });

  if (error) {
    console.error("Failed to queue TikTok lead:", error);
  }

  return new Response("OK", { status: 200 });
});
```

### Poll for leads (fallback / scheduled)

```typescript
async function pollRecentLeads(sinceTimestamp: number) {
  const params = new URLSearchParams({
    advertiser_id: TIKTOK_ADVERTISER_ID,
    page: "1",
    page_size: "50",
  });

  const res = await fetch(`${TIKTOK_BASE}/lead/task/list/?${params}`, {
    headers: { "Access-Token": TIKTOK_ACCESS_TOKEN },
  });

  if (!res.ok) throw new Error(`TikTok poll failed: ${res.status}`);

  const json = await res.json();
  if (json.code !== 0) throw new Error(`TikTok API error: ${json.message}`);

  // Filter to leads newer than sinceTimestamp
  return (json.data?.list ?? []).filter(
    (lead: { create_time: number }) => lead.create_time > sinceTimestamp
  );
}
```

## Gotchas & Rate Limits

- **Webhook delivers only IDs, not data**: Unlike most lead webhooks, TikTok's payload has no lead fields — you must make a second API call to GET /lead/task/ to get the actual name, phone, and email.
- **Phone numbers are local format for Israeli leads**: Expect `0501234567` — normalize to `+972501234567` before queuing.
- **`create_time` is seconds, not milliseconds**: Multiply by 1000 when constructing a JavaScript `Date`.
- **Webhook verification**: TikTok sends an HMAC-SHA256 signature. Always verify it — the `X-TikTok-Signature` header contains the hex-encoded HMAC of the raw request body using your app secret as the key.
- **Form field names depend on form configuration**: The `field_name` values in `form_data.questions` depend on which fields you added to the form in TikTok Ads Manager. Common values: `PHONE_NUMBER`, `FULL_NAME`, `EMAIL`. Custom questions use the question text as the field name.
- **API rate limits**: TikTok Business API allows 600 requests/minute per access token. For high-volume campaigns, batch polling is fine; for individual webhook-triggered fetches (one per lead), you have ample headroom.
- **Access token expiry**: App access tokens expire. Set up a token refresh flow using your app's secret and check expiry before API calls.
- **Advertiser ID is required on all endpoints**: Every GET request requires `advertiser_id` as a query parameter. Store it as an env var.
- **Test leads**: TikTok has a lead form testing feature in Ads Manager. Test submissions appear in the API with a flag — filter them in production if needed.
- **Data deletion requests**: TikTok's platform policy requires honoring data deletion requests. Implement a lead deletion flow if you receive a request from a user.
