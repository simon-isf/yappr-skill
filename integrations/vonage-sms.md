# Vonage SMS (formerly Nexmo)

> **Use in Yappr context**: Send SMS follow-ups, appointment reminders, and payment links when WhatsApp is unavailable or the caller prefers plain SMS.

## Authentication

Two options depending on which API endpoint you use:

**SMS API (legacy, rest.nexmo.com)**: Pass credentials as query params or in the request body:
```
api_key={your_api_key}&api_secret={your_api_secret}
```

**Newer APIs (api.nexmo.com)**: HTTP Basic auth header:
```
Authorization: Basic base64({api_key}:{api_secret})
```

Find your API key and secret in the [Vonage API Dashboard](https://dashboard.nexmo.com/).

## Base URLs

```
https://rest.nexmo.com       — SMS API (v1, recommended for simple sending)
https://api.nexmo.com        — Verify API, Number Insight, newer APIs
```

## Key Endpoints

### POST /sms/json — Send an SMS

Request body is `application/x-www-form-urlencoded`:

```
POST https://rest.nexmo.com/sms/json
Content-Type: application/x-www-form-urlencoded

api_key=abc123&api_secret=secretXYZ&from=Yappr&to=972501234567&text=Your+appointment+is+confirmed
```

- `from`: Sender ID (alphanumeric up to 11 chars, e.g. `Yappr`) or a Vonage virtual number. Alphanumeric sender IDs are **not supported in all countries** — check Vonage's country-specific guide. For Israel, use a virtual number.
- `to`: E.164 format without the `+` sign (e.g. `972501234567`).
- `text`: URL-encoded message text.
- For Hebrew or other non-ASCII text, add `type=unicode`.

Response:

```json
{
  "message-count": "1",
  "messages": [
    {
      "to": "972501234567",
      "message-id": "0C000000D60C00F3",
      "status": "0",
      "remaining-balance": "3.14159265",
      "message-price": "0.03330000",
      "network": "42502"
    }
  ]
}
```

`status: "0"` means the message was accepted for delivery. Any other value is an error — see error codes below.

---

### POST /sms/json — Send Hebrew (Unicode) SMS

Add `type=unicode` to ensure proper encoding of non-ASCII characters:

```
POST https://rest.nexmo.com/sms/json
Content-Type: application/x-www-form-urlencoded

api_key=abc123&api_secret=secretXYZ&from=972399990000&to=972501234567&text=%D7%A9%D7%9C%D7%95%D7%9D%21+%D7%94%D7%A4%D7%92%D7%99%D7%A9%D7%94+%D7%A9%D7%9C%D7%9A+%D7%90%D7%95%D7%A9%D7%A8%D7%94&type=unicode
```

Unicode SMS messages have a shorter per-message character limit: 70 characters per segment (vs 160 for GSM-7). Long messages are automatically split into concatenated parts.

---

### POST https://api.nexmo.com/v2/verify — Start a phone number verification (OTP)

```
POST https://api.nexmo.com/v2/verify
Authorization: Basic base64(api_key:api_secret)
Content-Type: application/json

{
  "brand": "Yappr",
  "workflow": [
    { "channel": "sms", "to": "972501234567" }
  ]
}
```

Response:

```json
{
  "request_id": "abcdef0123456789abcdef0123456789"
}
```

Then check the OTP the user provides:

```
POST https://api.nexmo.com/v2/verify/{request_id}
Content-Type: application/json

{ "code": "1234" }
```

Response on success:

```json
{ "status": "completed" }
```

---

### GET /sms/json delivery receipts — Inbound DLR webhook

Vonage sends delivery receipts to a callback URL you configure in the dashboard (Settings → Default SMS Settings → Delivery Receipts). Payload:

```json
{
  "msisdn": "972501234567",
  "to": "972399990000",
  "network-code": "42502",
  "messageId": "0C000000D60C00F3",
  "price": "0.03330000",
  "status": "delivered",
  "scts": "2401011200",
  "err-code": "0",
  "message-timestamp": "2024-01-01 12:00:00"
}
```

`status` values: `delivered`, `buffered`, `expired`, `failed`, `rejected`, `unknown`.

---

### Inbound SMS webhook

Configure your inbound SMS webhook URL in the dashboard (Numbers → your number → Edit → Inbound Webhook URL). Vonage sends a GET or POST (configurable) to your URL:

```json
{
  "msisdn": "972501234567",
  "to": "972399990000",
  "messageId": "0C000000D60C00F4",
  "text": "Yes, please confirm",
  "type": "text",
  "keyword": "YES",
  "message-timestamp": "2024-01-01 12:05:00"
}
```

---

## Common Patterns

### Send an SMS follow-up after a call

```typescript
const VONAGE_API_KEY = Deno.env.get("VONAGE_API_KEY")!;
const VONAGE_API_SECRET = Deno.env.get("VONAGE_API_SECRET")!;
const VONAGE_FROM_NUMBER = Deno.env.get("VONAGE_FROM_NUMBER")!; // e.g. "972399990000"

interface VonageSmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function sendVonageSms(
  toE164: string,
  text: string,
  unicode = false
): Promise<VonageSmsSendResult> {
  // Strip leading + if present
  const to = toE164.replace(/^\+/, "");

  const params = new URLSearchParams({
    api_key: VONAGE_API_KEY,
    api_secret: VONAGE_API_SECRET,
    from: VONAGE_FROM_NUMBER,
    to,
    text,
    ...(unicode ? { type: "unicode" } : {}),
  });

  const res = await fetch("https://rest.nexmo.com/sms/json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  const msg = data.messages?.[0];

  if (!msg || msg.status !== "0") {
    return {
      success: false,
      error: `Vonage error ${msg?.status}: ${msg?.["error-text"] ?? "unknown"}`,
    };
  }

  return { success: true, messageId: msg["message-id"] };
}

// For Hebrew messages, set unicode = true:
// await sendVonageSms("+972501234567", "שלום! הפגישה שלך אושרה.", true);
```

### Detect whether to use unicode (Hebrew/Arabic/emoji)

```typescript
function needsUnicode(text: string): boolean {
  // GSM-7 charset — everything outside needs unicode mode
  const gsm7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-.\/0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;
  return !gsm7.test(text);
}

// Usage:
const message = "תודה על שיחתך!";
const result = await sendVonageSms(phone, message, needsUnicode(message));
```

---

## Gotchas & Rate Limits

- **Delivery to Israel**: Vonage has lower delivery rates to Israeli numbers compared to Twilio. Use Twilio as the primary SMS provider for Israeli numbers and Vonage as a fallback if needed.
- **`status: "0"` is success**: Unlike HTTP status codes, Vonage's `status` field in the response body uses `"0"` to mean success and any other string to mean an error.
- **Alphanumeric sender IDs in Israel**: Israel requires you to use a virtual number as the sender — alphanumeric sender IDs (like `Yappr`) are not supported and will result in delivery failures or no sender name.
- **Unicode SMS character limits**: Standard SMS = 160 chars/segment; Unicode SMS = 70 chars/segment. Long messages are split and billed per segment.
- **`to` without `+`**: The SMS API expects E.164 without the leading `+` (e.g. `972501234567`, not `+972501234567`).
- **Rate limits**: Default is 30 messages/second per account. Burst allowed. If you exceed this, Vonage queues (does not drop) messages but may add latency. Contact Vonage to increase limits.
- **Webhook must return 200**: Vonage will retry delivery receipt and inbound webhooks if your endpoint does not return HTTP 200. Respond immediately and process async if needed.
- **Error codes**: Common error status values — `1` = Throttled, `2` = Missing params, `3` = Invalid params, `4` = Invalid credentials, `5` = Internal error, `6` = Invalid message, `9` = Non-whitelisted destination (test accounts only).
