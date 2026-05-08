# Typeform

> **Use in Yappr context**: Receive leads from Typeform surveys and quizzes via webhook and trigger outbound Yappr calls immediately on form submission.

## Authentication

- Generate Personal Access Token: Typeform account → Profile → My Account → Personal tokens → Generate token
- Pass as: `Authorization: Bearer {token}`

## Base URL

```
https://api.typeform.com
```

## Webhook Setup

**Option A: Via Typeform UI**
1. Form → Connect → Webhooks → Add a webhook
2. URL: `https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/typeform-webhook?secret=your_secret`
3. Enable webhook → Send test

**Option B: Via API**
```
POST /forms/{form_id}/webhooks/{tag}
```
```json
{
  "url": "https://your-endpoint.com/webhook",
  "enabled": true,
  "verify_ssl": true,
  "secret": "your_signing_secret"
}
```

## Webhook Payload Structure

**POST to your endpoint:**

```json
{
  "event_id": "abc123def456",
  "event_type": "form_response",
  "form_response": {
    "form_id": "mBzNlP",
    "token": "unique_response_token",
    "landed_at": "2026-04-11T10:00:00Z",
    "submitted_at": "2026-04-11T10:05:00Z",
    "definition": {
      "id": "mBzNlP",
      "title": "Lead Form",
      "fields": [
        { "id": "abc1", "ref": "full_name", "type": "short_text", "title": "What is your name?" },
        { "id": "def2", "ref": "phone", "type": "phone_number", "title": "Your phone number" },
        { "id": "ghi3", "ref": "email", "type": "email", "title": "Your email address" }
      ]
    },
    "answers": [
      {
        "type": "text",
        "text": "David Cohen",
        "field": { "id": "abc1", "ref": "full_name", "type": "short_text" }
      },
      {
        "type": "phone_number",
        "phone_number": "0501234567",
        "field": { "id": "def2", "ref": "phone", "type": "phone_number" }
      },
      {
        "type": "email",
        "email": "david@example.com",
        "field": { "id": "ghi3", "ref": "email", "type": "email" }
      }
    ]
  }
}
```

**Answer types and value fields:**
| Field type | Answer type | Value key |
|---|---|---|
| short_text | `text` | `text` |
| long_text | `text` | `text` |
| email | `email` | `email` |
| phone_number | `phone_number` | `phone_number` |
| number | `number` | `number` |
| boolean (yes/no) | `boolean` | `boolean` |
| choice (multiple choice) | `choice` | `choice.label` |
| choices (multi-select) | `choices` | `choices.labels` (array) |
| date | `date` | `date` |
| rating | `number` | `number` |
| opinion_scale | `number` | `number` |
| dropdown | `choice` | `choice.label` |

## Key Endpoints

### Get Form
**GET /forms/{form_id}**

**Response:**
```json
{
  "id": "mBzNlP",
  "title": "Lead Form",
  "fields": [
    { "id": "abc1", "ref": "full_name", "type": "short_text", "title": "What is your name?" }
  ]
}
```

Use `ref` (set in Typeform builder) as a stable identifier — it won't change when you edit the question text.

---

### Get Form Responses
**GET /forms/{form_id}/responses?page_size=50&sort=submitted_at,desc**

**Response:**
```json
{
  "total_items": 100,
  "page_count": 2,
  "items": [
    {
      "token": "response_token_abc",
      "submitted_at": "2026-04-11T10:00:00Z",
      "answers": [ ... ]
    }
  ]
}
```

---

### List Webhooks
**GET /forms/{form_id}/webhooks**

**Response:**
```json
{
  "items": [
    {
      "id": "webhook_id",
      "tag": "yappr-calls",
      "url": "https://your-endpoint.com/webhook",
      "enabled": true
    }
  ]
}
```

---

### Create/Update Webhook
**PUT /forms/{form_id}/webhooks/{tag}**

```json
{
  "url": "https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/typeform-webhook",
  "enabled": true,
  "verify_ssl": true,
  "secret": "your_signing_secret"
}
```

---

### Delete Webhook
**DELETE /forms/{form_id}/webhooks/{tag}**

## Common Patterns

### Extract answers by field ref
```typescript
function getAnswer(answers: any[], ref: string): string | null {
  const answer = answers.find(a => a.field.ref === ref);
  if (!answer) return null;

  switch (answer.type) {
    case "text": return answer.text;
    case "email": return answer.email;
    case "phone_number": return answer.phone_number;
    case "number": return String(answer.number);
    case "boolean": return answer.boolean ? "yes" : "no";
    case "choice": return answer.choice?.label ?? null;
    case "choices": return answer.choices?.labels?.join(", ") ?? null;
    case "date": return answer.date;
    default: return null;
  }
}

const { form_response } = payload;
const answers = form_response.answers;

const name = getAnswer(answers, "full_name");
const phone = getAnswer(answers, "phone");     // "phone" is the field ref you set
const email = getAnswer(answers, "email");
const interest = getAnswer(answers, "product_interest");
```

### Verify Typeform webhook signature
```typescript
import { createHmac } from "node:crypto";

function verifyTypeformSignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64");
  return `sha256=${expected}` === signature;
}

// In handler:
const rawBody = await req.text();
const signature = req.headers.get("Typeform-Signature") ?? "";
if (!verifyTypeformSignature(rawBody, signature, TYPEFORM_SECRET)) {
  return new Response("Forbidden", { status: 403 });
}
const payload = JSON.parse(rawBody);
```

### Full webhook handler
```typescript
export default async function handler(req: Request) {
  const rawBody = await req.text();

  // Verify signature
  if (!verifyTypeformSignature(rawBody, req.headers.get("Typeform-Signature") ?? "", SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  const payload = JSON.parse(rawBody);
  if (payload.event_type !== "form_response") return new Response("ok");

  const answers = payload.form_response.answers;
  const phone = normalizeIsraeliPhone(getAnswer(answers, "phone") ?? "");
  const name = getAnswer(answers, "full_name") ?? "Unknown";

  await fetch("https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/api-v1-calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("YAPPR_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: phone, agentId: AGENT_ID, metadata: { name } }),
  });

  return new Response("ok");
}
```

## Gotchas & Rate Limits

- **Use `ref` not `id`**: Field `id` can change; `ref` is a stable human-readable key you set in the Typeform builder. Always use `ref`.
- **Webhook signature**: Typeform signs payloads with `Typeform-Signature: sha256=base64(hmac)`. Verify using the webhook secret.
- **Phone format from Typeform**: Phone Number field in Typeform may include country code if the respondent selected it (e.g. `+972-50-123-4567`), or may not. Always normalize.
- **Rate limits (API)**: 120 requests/minute. Webhooks are event-driven, no rate limit.
- **Duplicates**: Use `form_response.token` as an idempotency key to prevent double processing.
- **Hidden fields**: Typeform supports hidden fields passed in the form URL. Access via `form_response.hidden` object — useful for tracking UTM source or pre-populating lead data.
- **Logic jumps**: If your form uses conditional logic, some fields may not have answers (the user didn't reach them). Always handle `null` from `getAnswer`.
