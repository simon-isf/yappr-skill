# JotForm

> **Use in Yappr context**: Receive leads submitted via JotForm and queue them for an AI outbound callback call.

## Authentication

**Webhooks (recommended for real-time lead intake)**: No auth — JotForm POSTs to your URL. Validate the `formID` field to confirm the request is from the expected form.

**JotForm REST API (for pulling submissions)**: API key as a query parameter:
```
?apiKey={your_api_key}
```

Find your API key in JotForm: Account → Settings → API.

## Base URL

```
https://api.jotform.com
```

## Setting Up a Webhook

In JotForm: open your form → Settings → Integrations → Webhooks → paste your Supabase edge function URL.

JotForm will POST to your URL on every new submission.

## Key Endpoints

### JotForm webhook payload — new form submission

JotForm sends a POST with `application/x-www-form-urlencoded` body. Fields appear both in a `rawRequest` URL-encoded string and as individual top-level fields named `q{number}_{fieldname}`:

```json
{
  "formID": "123456789",
  "submissionID": "5678901234567890123",
  "formTitle": "Lead Form",
  "ip": "1.2.3.4",
  "rawRequest": "q3_fullName=David+Cohen&q4_phone=0501234567&q5_email=david%40example.com&q6_service=Plumbing",
  "pretty": "Full Name: David Cohen\nPhone: 0501234567\nEmail: david@example.com\nService: Plumbing",
  "q3_fullName": "David Cohen",
  "q4_phone": "0501234567",
  "q5_email": "david@example.com",
  "q6_service": "Plumbing",
  "q7_notes": "Leaking pipe under kitchen sink",
  "type": "WEB"
}
```

Field names follow the pattern `q{number}_{fieldUniqueName}` where the unique name is set in the form builder (Form Builder → click field → Properties → Field Name). The number is the field's question order in the form.

The `pretty` field is a pre-formatted human-readable string — useful for logging but not for programmatic extraction (use `qN_fieldname` directly).

---

### GET /form/{id}/submissions — Pull submissions via API

```
GET https://api.jotform.com/form/123456789/submissions?apiKey={key}&limit=20&orderby=created_at&direction=DESC
```

Query params:
- `limit` — number of results (default 20, max 1000)
- `offset` — pagination offset
- `orderby` — field to sort by (e.g. `created_at`)
- `direction` — `ASC` or `DESC`
- `filter` — JSON-encoded filter object (e.g. `{"status:eq": "ACTIVE"}`)

Response:

```json
{
  "responseCode": 200,
  "message": "success",
  "content": [
    {
      "id": "5678901234567890123",
      "form_id": "123456789",
      "ip": "1.2.3.4",
      "created_at": "2024-01-20 12:00:00",
      "status": "ACTIVE",
      "answers": {
        "3": {
          "name": "fullName",
          "order": "1",
          "text": "Full Name",
          "type": "control_fullname",
          "answer": { "first": "David", "last": "Cohen" }
        },
        "4": {
          "name": "phone",
          "order": "2",
          "text": "Phone",
          "type": "control_phone",
          "answer": "0501234567"
        },
        "5": {
          "name": "email",
          "order": "3",
          "text": "Email",
          "type": "control_email",
          "answer": "david@example.com"
        }
      }
    }
  ],
  "resultSet": { "offset": 0, "limit": 20, "count": 1 }
}
```

Note: `answers` is a nested object keyed by question number (as a string). The `answer` field shape varies by field type — scalar string for most fields, nested object for complex fields like `control_fullname` or `control_address`.

---

### GET /form/{id}/submissions?filter= — Filter submissions by date

```
GET https://api.jotform.com/form/123456789/submissions?apiKey={key}&filter={"created_at:gt":"2024-01-20 00:00:00"}
```

URL-encode the filter value. Useful for polling: track the last processed submission timestamp and filter for anything newer.

---

### GET /submission/{id} — Get a single submission

```
GET https://api.jotform.com/submission/5678901234567890123?apiKey={key}
```

Returns the same structure as entries in the `/submissions` array above.

---

### DELETE /submission/{id} — Delete a submission (GDPR compliance)

```
DELETE https://api.jotform.com/submission/5678901234567890123?apiKey={key}
```

Response:

```json
{
  "responseCode": 200,
  "message": "success",
  "content": "Submission with id 5678901234567890123 is deleted."
}
```

---

## Common Patterns

### Receive a JotForm webhook and queue a callback lead

```typescript
// supabase/functions/receive-lead/index.ts
import { serve } from "npm:@hono/node-server";
import { createClient } from "npm:@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Normalize Israeli phone: 05XXXXXXXX → +972XXXXXXXXX
function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return `+${digits}`;
  if (digits.startsWith("0")) return `+972${digits.slice(1)}`;
  return `+${digits}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let payload: Record<string, string> = {};

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    payload = Object.fromEntries(new URLSearchParams(text));
  } else {
    payload = await req.json();
  }

  // Validate this is from the expected form
  const EXPECTED_FORM_ID = Deno.env.get("JOTFORM_LEAD_FORM_ID")!;
  if (payload.formID !== EXPECTED_FORM_ID) {
    return new Response("Ignored", { status: 200 });
  }

  // Extract fields — adjust qN_ numbers to match your form structure
  const rawPhone = payload.q4_phone ?? payload.q3_phone ?? "";
  const name = payload.q3_fullName ?? payload.q2_fullName ?? "Unknown";
  const email = payload.q5_email ?? "";
  const service = payload.q6_service ?? "";
  const notes = payload.q7_notes ?? "";

  if (!rawPhone) {
    console.error("No phone number in JotForm submission", payload.submissionID);
    return new Response("Missing phone", { status: 200 }); // Still 200 so JotForm doesn't retry
  }

  const phone = normalizeIsraeliPhone(rawPhone);

  // Queue for outbound callback
  const { error } = await supabase.from("call_queue").insert({
    phone_number: phone,
    contact_name: name,
    contact_email: email || null,
    metadata: { source: "jotform", service, notes, submissionId: payload.submissionID },
    status: "pending",
  });

  if (error) {
    console.error("Failed to queue lead:", error);
    return new Response("Error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
});
```

### Poll JotForm API for new submissions (alternative to webhooks)

```typescript
const JOTFORM_API_KEY = Deno.env.get("JOTFORM_API_KEY")!;
const JOTFORM_FORM_ID = Deno.env.get("JOTFORM_FORM_ID")!;

async function fetchNewSubmissions(since: string): Promise<Array<Record<string, unknown>>> {
  const filter = JSON.stringify({ "created_at:gt": since });
  const url = `https://api.jotform.com/form/${JOTFORM_FORM_ID}/submissions?` +
    `apiKey=${JOTFORM_API_KEY}&filter=${encodeURIComponent(filter)}&orderby=created_at&direction=ASC`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.responseCode !== 200) {
    throw new Error(`JotForm API error: ${data.message}`);
  }

  return data.content ?? [];
}

function extractAnswer(answers: Record<string, { answer: unknown }>, questionNumber: string): string {
  const entry = answers[questionNumber];
  if (!entry) return "";
  const answer = entry.answer;
  // Handle fullname type (returns { first, last })
  if (typeof answer === "object" && answer !== null && "first" in answer) {
    return `${(answer as Record<string, string>).first} ${(answer as Record<string, string>).last}`.trim();
  }
  return String(answer ?? "");
}

// Usage in a cron edge function:
// const submissions = await fetchNewSubmissions("2024-01-20 00:00:00");
// for (const sub of submissions) {
//   const phone = extractAnswer(sub.answers as Record<string, { answer: unknown }>, "4");
//   ...
// }
```

---

## Gotchas & Rate Limits

- **Field numbers shift**: If you add or reorder fields in the form builder, the `qN_` numbers in webhook payloads may change. Always set and verify field "Unique Names" in the form builder so you can rely on the name part (e.g. `q4_phone` → the `phone` name) rather than the number.
- **Phone format is local**: Israeli submissions typically arrive as `05XXXXXXXX` — always normalize to E.164 (`+972XXXXXXXXX`) before storing or dialing.
- **Webhook payload is form-encoded**: JotForm sends `Content-Type: application/x-www-form-urlencoded`, not JSON. Parse with `URLSearchParams`, not `JSON.parse`. The individual `qN_fieldname` top-level fields are parsed from `rawRequest` and included at the top level for convenience.
- **Always return HTTP 200**: If your webhook returns any non-200 response, JotForm will retry the webhook multiple times. Return 200 even when you skip or fail to process the submission — log the error internally.
- **Complex field types**: Phone fields with country code selector, full name fields (first/last), address fields, and file upload fields all have non-scalar `answer` shapes in the API response. Webhook payloads flatten these — e.g., a full name field becomes a single string in `q3_fullName`. Test your specific form's output before deploying.
- **API rate limits**: 1,000 API calls/hour per account. Webhooks are not subject to API rate limits.
- **Duplicate submissions**: Users sometimes submit the same form twice. Check for existing leads by phone number before inserting to avoid duplicate callbacks.
- **File uploads**: Form submissions with file uploads include a URL to the uploaded file in the answer. URLs are temporary (expire after some time). Download and store files promptly if needed.
