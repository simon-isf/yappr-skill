# Sinch SMS / Voice

> **Use in Yappr context**: Send SMS follow-ups and appointment reminders as a fallback when WhatsApp delivery fails or the caller does not have WhatsApp.

## Authentication

Sinch SMS API uses Bearer token auth. You need two values from the [Sinch Dashboard](https://dashboard.sinch.com/):

1. **Service Plan ID** — appears in the SMS section of your account
2. **API Token** — the token associated with that service plan

```
Authorization: Bearer {api_token}
```

The Service Plan ID is part of the URL path, not the auth header.

## Base URL

```
https://sms.api.sinch.com/xms/v1/{service_plan_id}
```

All endpoints below are relative to this base URL. Replace `{service_plan_id}` with your actual service plan ID.

## Key Endpoints

### POST /batches — Send an SMS (single or bulk)

```json
POST /batches
Authorization: Bearer {api_token}
Content-Type: application/json

{
  "from": "+972399990000",
  "to": ["+972501234567"],
  "body": "Your appointment is confirmed for tomorrow at 10:00."
}
```

For bulk sending, add multiple numbers to the `to` array (up to 1,000 per request).

Response:

```json
{
  "id": "01FC66621XXXXX119Z8PMV1QPQ",
  "to": ["+972501234567"],
  "from": "+972399990000",
  "canceled": false,
  "body": "Your appointment is confirmed for tomorrow at 10:00.",
  "type": "mt_text",
  "created_at": "2024-01-01T12:00:00.000Z",
  "modified_at": "2024-01-01T12:00:00.000Z",
  "delivery_report": "none",
  "send_at": "2024-01-01T12:00:00.000Z",
  "expire_at": "2024-01-04T12:00:00.000Z",
  "callback_url": "",
  "flash_message": false,
  "status": "Pending"
}
```

The `id` is the batch ID — use it to check delivery status.

---

### POST /batches — Send with delivery report callback

Add `delivery_report` and `callback_url` to receive delivery status updates:

```json
{
  "from": "+972399990000",
  "to": ["+972501234567"],
  "body": "Your payment link: https://buy.stripe.com/...",
  "delivery_report": "full",
  "callback_url": "https://your-project.supabase.co/functions/v1/sinch-dlr"
}
```

`delivery_report` values: `"none"` (no callback), `"summary"` (one callback per batch), `"full"` (one callback per recipient), `"per_recipient"` (detailed per-recipient).

---

### GET /batches/{id} — Check batch status

```
GET /batches/01FC66621XXXXX119Z8PMV1QPQ
Authorization: Bearer {api_token}
```

Response:

```json
{
  "id": "01FC66621XXXXX119Z8PMV1QPQ",
  "status": "Delivered",
  "to": ["+972501234567"],
  "from": "+972399990000",
  "body": "Your appointment is confirmed.",
  "type": "mt_text",
  "created_at": "2024-01-01T12:00:00.000Z"
}
```

`status` values: `Pending`, `In_process`, `Delivered`, `Failed`, `Cancelled`.

---

### GET /batches/{id}/delivery_report — Detailed delivery report per recipient

```
GET /batches/01FC66621XXXXX119Z8PMV1QPQ/delivery_report
Authorization: Bearer {api_token}
```

Response:

```json
{
  "type": "delivery_report_sms",
  "batch_id": "01FC66621XXXXX119Z8PMV1QPQ",
  "statuses": [
    {
      "code": 0,
      "status": "Delivered",
      "count": 1,
      "recipients": ["+972501234567"]
    }
  ],
  "total_message_count": 1
}
```

`code: 0` = Delivered successfully. Non-zero codes indicate failure reasons.

---

### Inbound SMS webhook

Configure a Mobile Originated (MO) webhook URL in the Sinch dashboard (SMS → Service Plans → your plan → Callback URL). Sinch sends POST requests:

```json
{
  "id": "01FC66621XXXXX119Z8PMV2QPQ",
  "from": "+972501234567",
  "to": "+972399990000",
  "body": "Yes, please confirm my appointment",
  "type": "mo_text",
  "received_at": "2024-01-01T12:05:00.000Z",
  "operator_id": "42502",
  "send_number": "+972399990000"
}
```

---

### POST /batches — Send a scheduled SMS

Use `send_at` (ISO 8601) to schedule delivery in the future:

```json
{
  "from": "+972399990000",
  "to": ["+972501234567"],
  "body": "Reminder: your appointment is in 1 hour.",
  "send_at": "2024-01-02T09:00:00.000Z"
}
```

Cancel a scheduled batch before it sends:

```
DELETE /batches/01FC66621XXXXX119Z8PMV1QPQ
```

---

## Common Patterns

### Send an SMS after a call ends

```typescript
const SINCH_SERVICE_PLAN_ID = Deno.env.get("SINCH_SERVICE_PLAN_ID")!;
const SINCH_API_TOKEN = Deno.env.get("SINCH_API_TOKEN")!;
const SINCH_FROM_NUMBER = Deno.env.get("SINCH_FROM_NUMBER")!;

const sinchBase = `https://sms.api.sinch.com/xms/v1/${SINCH_SERVICE_PLAN_ID}`;

interface SinchSendResult {
  success: boolean;
  batchId?: string;
  error?: string;
}

async function sendSinchSms(
  toE164: string,
  body: string
): Promise<SinchSendResult> {
  const res = await fetch(`${sinchBase}/batches`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SINCH_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SINCH_FROM_NUMBER,
      to: [toE164],
      body,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return {
      success: false,
      error: `Sinch error ${res.status}: ${data.text ?? JSON.stringify(data)}`,
    };
  }

  return { success: true, batchId: data.id };
}

// Usage:
// await sendSinchSms("+972501234567", "Thanks for your call! Your summary: ...");
```

### Check delivery status

```typescript
async function checkDelivery(batchId: string): Promise<string> {
  const res = await fetch(`${sinchBase}/batches/${batchId}`, {
    headers: { "Authorization": `Bearer ${SINCH_API_TOKEN}` },
  });
  const data = await res.json();
  return data.status as string; // "Pending" | "Delivered" | "Failed" | ...
}
```

### Send bulk follow-up to multiple callers

```typescript
async function sendBulkSms(recipients: string[], body: string): Promise<string> {
  // Sinch supports up to 1,000 recipients per batch
  const res = await fetch(`${sinchBase}/batches`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SINCH_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SINCH_FROM_NUMBER,
      to: recipients,
      body,
    }),
  });
  const data = await res.json();
  return data.id;
}
```

---

## Gotchas & Rate Limits

- **Hebrew/Unicode support**: Sinch handles Unicode (Hebrew, Arabic, emoji) automatically — no special `type` parameter needed. Long Unicode messages are split at 70 chars/segment.
- **Service Plan ID in the URL**: Unlike most APIs, Sinch embeds the service plan ID in the base URL path, not as a header or query param. Make sure your `sinchBase` variable includes the correct plan ID.
- **E.164 with `+`**: Sinch expects E.164 format with the `+` prefix (e.g. `+972501234567`), unlike Vonage which expects it without.
- **Israel delivery**: Sinch has solid coverage in MENA including Israel. Better option than Vonage for Israeli numbers, though Twilio still has the highest reliability.
- **Batch status polling**: There is a short delay between sending and the status changing from `Pending` to `Delivered`. For time-sensitive confirmations, use the `callback_url` delivery report instead of polling.
- **Rate limits**: Default sending rate is around 30 messages/second. Contact Sinch support to increase throughput for high-volume use cases.
- **Webhook must respond 200**: Sinch will retry MO (inbound) and DLR (delivery receipt) webhooks with exponential backoff if your endpoint returns non-200. Respond immediately and process the payload asynchronously.
- **Number registration**: Some countries require number registration or local sender IDs. Check Sinch's regulatory requirements for each target country before using alphanumeric sender IDs.
