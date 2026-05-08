# Tranzila

> **Use in Yappr context**: After a call where a customer agrees to pay, generate a secure Tranzila payment link and send it via WhatsApp or SMS — the customer completes payment on a hosted Tranzila page without sharing card details over the phone.

## Authentication

Tranzila identifies your account by a **terminal name** (supplier ID). There are two APIs:

1. **TRAPI (REST v1)** — modern JSON API, used for payment requests (links). Auth: API key in request body.
2. **Iframe/Hosted Page** — embed a Tranzila payment form. Auth: terminal name in URL parameter.

Get your terminal name and TRAPI API key from Tranzila: terminal setup page in your Tranzila account dashboard.

Store as: `TRANZILA_TERMINAL` and `TRANZILA_API_KEY`.

## Base URL

**TRAPI (REST):**
```
https://api.tranzila.com/v1
```

**Iframe / Hosted payment page:**
```
https://direct.tranzila.com/{terminal_name}/iframenew.php
```

**Legacy direct charge (CGI, used for token-based charges):**
```
https://secure5.tranzila.com/cgi-bin/tranzila71u.cgi
```

## Key Endpoints

### Create Payment Request (Payment Link)
**POST /pr/create**

This is the primary integration for voice agents. It generates a hosted payment page URL you can send to the caller via WhatsApp or SMS.

**Headers:**
```
Content-Type: application/json
```

**Request:**
```json
{
  "terminal_name": "yourterminal",
  "apikey": "your-tranzila-api-key",
  "sum": 150.00,
  "currency": 1,
  "description": "פיקדון תור — 11.4.26",
  "notify_url": "https://your-app.com/webhooks/tranzila",
  "success_url": "https://your-app.com/payment-success",
  "fail_url": "https://your-app.com/payment-failed",
  "contact": "דוד כהן",
  "phone": "0501234567",
  "email": "david@example.com",
  "notify_email": "payments@yourcompany.com",
  "send_email": 1,
  "send_sms": 0
}
```

**`currency` values:** `1` = ILS, `2` = USD, `3` = EUR

**Response:**
```json
{
  "result": 1,
  "msg": "OK",
  "pr_id": "TZ000123456",
  "link": "https://direct.tranzila.com/yourterminal/paymentrequest.php?pr_id=TZ000123456",
  "short_link": "https://link.tranzila.com/s/abc123"
}
```

Send `short_link` to the caller via WhatsApp or SMS. The page supports credit cards, installments, and Apple Pay.

---

### Check Payment Request Status
**POST /pr/info**

**Request:**
```json
{
  "terminal_name": "yourterminal",
  "apikey": "your-tranzila-api-key",
  "pr_id": "TZ000123456"
}
```

**Response:**
```json
{
  "result": 1,
  "pr_id": "TZ000123456",
  "status": "PAID",
  "sum": 150.00,
  "currency": 1,
  "contact": "דוד כהן",
  "transaction_id": "0011223344",
  "paid_at": "2026-04-11T11:30:00+03:00"
}
```

**`status` values:**
- `PENDING` — link sent, not yet paid
- `PAID` — payment completed
- `EXPIRED` — link expired without payment
- `CANCELLED` — cancelled by customer or merchant

---

### List Payment Requests
**POST /pr/list**

**Request:**
```json
{
  "terminal_name": "yourterminal",
  "apikey": "your-tranzila-api-key",
  "from_date": "2026-04-01",
  "to_date": "2026-04-11",
  "status": "PAID"
}
```

**Response:**
```json
{
  "result": 1,
  "list": [
    {
      "pr_id": "TZ000123456",
      "status": "PAID",
      "sum": 150.00,
      "contact": "דוד כהן",
      "created_at": "2026-04-11T10:00:00+03:00"
    }
  ]
}
```

---

### Iframe / Hosted Payment Page (no API call required)

For cases where you want to embed a payment form (not send a link), construct this URL:

```
https://direct.tranzila.com/{terminal_name}/iframenew.php?sum={amount}&currency={currency_code}&cred_type={type}&lang=il&pdesc={description}
```

**Key URL parameters:**

| Parameter | Description | Example |
|-----------|-------------|---------|
| `sum` | Amount (decimal) | `150.00` |
| `currency` | `1`=ILS, `2`=USD, `3`=EUR | `1` |
| `cred_type` | `1`=regular, `6`=installments | `1` |
| `pdesc` | Payment description (URL-encoded) | `%D7%A4%D7%99%D7%A7%D7%93%D7%95%D7%9F` |
| `lang` | UI language: `il`=Hebrew, `en`=English | `il` |
| `contact` | Payer name (pre-fill) | `%D7%93%D7%95%D7%93` |
| `phone` | Payer phone (pre-fill) | `0501234567` |
| `email` | Payer email (pre-fill) | `david%40example.com` |
| `notify_url` | Webhook URL for payment notification | (your URL) |
| `success_url` | Redirect after successful payment | (your URL) |

This URL can be opened in a browser or embedded in an iframe. No server-side API call needed to generate it — construct it directly.

---

## Common Patterns

### Generate payment link after call and send via WhatsApp
```typescript
// Deno edge function snippet

const TRANZILA_TERMINAL = Deno.env.get("TRANZILA_TERMINAL")!;
const TRANZILA_API_KEY = Deno.env.get("TRANZILA_API_KEY")!;

export async function createPaymentLink(
  callerPhone: string,
  callerName: string,
  callerEmail: string | undefined,
  amountILS: number,
  description: string
): Promise<string> {
  const res = await fetch("https://api.tranzila.com/v1/pr/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      terminal_name: TRANZILA_TERMINAL,
      apikey: TRANZILA_API_KEY,
      sum: amountILS,
      currency: 1, // ILS
      description,
      contact: callerName,
      phone: callerPhone.replace("+972", "0"),
      email: callerEmail ?? "",
      notify_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/tranzila-webhook`,
      send_email: callerEmail ? 1 : 0,
      send_sms: 0,
    }),
  });

  const data = await res.json();
  if (data.result !== 1) {
    throw new Error(`Tranzila error: ${data.msg} (code: ${data.error})`);
  }

  return data.short_link ?? data.link;
}

// Webhook handler for Tranzila payment notification
export async function handleTranzilaWebhook(req: Request) {
  // Tranzila sends a POST with form-encoded data
  const form = await req.formData();
  const status = form.get("Response"); // "000" = success
  const prId = form.get("pr_id") as string;
  const sum = form.get("sum") as string;
  const transactionId = form.get("index") as string;

  if (status === "000") {
    // Payment succeeded — update your DB, trigger follow-up, etc.
    console.log(`Payment confirmed: pr_id=${prId}, sum=${sum}, txn=${transactionId}`);
  }

  return new Response("OK");
}
```

### Fallback: generate iframe URL without server call
```typescript
export function buildTranzilaIframeUrl(
  amountILS: number,
  description: string,
  callerPhone: string
): string {
  const params = new URLSearchParams({
    sum: amountILS.toString(),
    currency: "1",
    cred_type: "1",
    lang: "il",
    pdesc: description,
    phone: callerPhone.replace("+972", "0"),
  });
  return `https://direct.tranzila.com/${TRANZILA_TERMINAL}/iframenew.php?${params}`;
}
```

## Gotchas & Rate Limits

- **TRAPI vs legacy**: The newer `api.tranzila.com/v1` REST API is preferred. The legacy `secure5.tranzila.com` CGI endpoint uses different parameter names and is harder to work with.
- **`result: 1` = success**: Unlike HTTP status codes, Tranzila uses `result: 1` for success and `result: 0` for failure in the JSON response body. Always check `result`, not just HTTP 200.
- **Webhook format**: Tranzila's `notify_url` callback is sent as `application/x-www-form-urlencoded` (form POST), not JSON. Use `req.formData()` to parse it in Deno.
- **Payment response code**: In webhook callbacks, `Response === "000"` means success. Any other value is an error. Common: `"051"` = insufficient funds, `"033"` = expired card.
- **Phone format**: Pass local Israeli format (`05XXXXXXXX`) to Tranzila, not E.164.
- **`cred_type: 6`** for installments: If using installments, also pass `maxpay` (max number of payments) parameter.
- **Currency codes**: `1`=ILS, `2`=USD, `3`=EUR, `4`=GBP. Most Israeli businesses will use `1`.
- **Link expiry**: Payment request links expire by default after 7 days. This is configurable in Tranzila account settings.
- **Iframe security**: The iframe URL is unauthenticated — it's meant to be embedded. Do not include sensitive data (private keys, full card numbers) in the URL parameters.
- **Rate limits**: Tranzila does not publish rate limits. Normal business usage (a few hundred payment requests per day) is well within limits.
