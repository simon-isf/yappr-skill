# Bit (ביט) & PayMe — Israeli Payment Requests

> **Use in Yappr context**: After a call where a customer agrees to pay a deposit, send them a Bit payment request link via WhatsApp or SMS so they can pay instantly from the Bit app.

## Overview

**Bit** (ביט) is Israel's dominant P2P + business payment app (Bank Hapoalim / Isracard). Bit does have a developer API at `developer.bitpay.co.il`, but it requires registration and approval as a licensed business or PISP — there is no open sandbox. Bit can also be accepted as a payment method **via PayMe**, which has a fully public API.

**PayMe** (פיימי, powered by Isracard / CashCow) is the recommended integration path for Yappr agents. It supports generating payment links that offer Bit as a payment option alongside credit cards. PayMe is available to any registered Israeli business.

---

## Option A — Bit Business API (direct, requires approval)

### Authentication

Register at `https://developer.bitpay.co.il` and complete business onboarding (Bank Hapoalim account required).

- Auth type: **Bearer token** issued after onboarding
- Pass as `Authorization: Bearer {access_token}` header
- Sandbox is available during development

### Base URL

```
https://developer.bitpay.co.il/api/v1
```

### Create Payment Request
**POST /payment-requests**

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request:**
```json
{
  "amount": 150.00,
  "currency": "ILS",
  "description": "פיקדון תור — דוד כהן",
  "reference_id": "call-abc123",
  "expiration_minutes": 60
}
```

**Response:**
```json
{
  "payment_request_id": "pr_xyz789",
  "link": "https://bit.ly/pay/pr_xyz789",
  "qr_code_url": "https://api.bitpay.co.il/qr/pr_xyz789.png",
  "status": "PENDING",
  "amount": 150.00,
  "currency": "ILS",
  "expires_at": "2026-04-11T12:00:00Z"
}
```

Send `link` to the customer via WhatsApp/SMS. They tap it and pay inside the Bit app. The `qr_code_url` is usable in web contexts.

---

### Get Payment Request Status
**GET /payment-requests/{payment_request_id}**

**Response:**
```json
{
  "payment_request_id": "pr_xyz789",
  "status": "PAID",
  "paid_at": "2026-04-11T11:20:00Z",
  "transaction_id": "txn_111222333"
}
```

Status values: `PENDING`, `PAID`, `EXPIRED`, `CANCELLED`.

---

## Option B — PayMe API (recommended, open to all businesses)

PayMe generates payment pages that include Bit as a payment option. This is the easiest path for most Yappr users.

### Authentication

1. Sign up at `https://payme.io` as a business
2. Get your **Seller PayMe ID** and **API key** from the dashboard (Settings → API)
3. Auth type: API key passed in the request body as `seller_payme_id` + `sale_price` fields (not a header)

### Base URL

```
https://ng.cashcow.co.il
```

Sandbox:
```
https://sandbox.payme.io
```

### Generate Payment Link
**POST /PayMe/api/generateSale**

**Headers:**
```
Content-Type: application/json
```

**Request:**
```json
{
  "seller_payme_id": "MPL00000-0000-0000-0000-000000000000",
  "sale_price": 15000,
  "currency": "ILS",
  "product_name": "פיקדון תור",
  "sale_send_notification": true,
  "sale_callback_url": "https://your-app.com/webhooks/payme",
  "sale_return_url": "https://your-app.com/payment-complete",
  "buyer_name": "דוד כהן",
  "buyer_phone": "0501234567"
}
```

Note: `sale_price` is in **agorot** (hundredths of a shekel) — multiply ILS by 100. So 150 ILS = `15000`.

**Response:**
```json
{
  "payme_status": "success",
  "sale_payme_id": "TBU00000-0000-0000-0000-000000000000",
  "sale_price": 15000,
  "currency": "ILS",
  "payment_url": "https://paypage.payme.io/sale/TBU00000-0000-0000-0000-000000000000",
  "buyer_name": "דוד כהן"
}
```

Send `payment_url` to the caller via WhatsApp or SMS. The page offers Bit, credit card, and other methods.

---

### Get Sale Status
**POST /PayMe/api/getSaleDetails**

**Request:**
```json
{
  "seller_payme_id": "MPL00000-0000-0000-0000-000000000000",
  "sale_payme_id": "TBU00000-0000-0000-0000-000000000000"
}
```

**Response:**
```json
{
  "payme_status": "success",
  "sale_status": "COMPLETED",
  "sale_price": 15000,
  "paid_at": "2026-04-11T11:20:00Z"
}
```

`sale_status` values: `INITIAL`, `COMPLETED`, `REFUNDED`, `FAILED`.

---

## Common Patterns

### Send payment link after call (PayMe via Yappr webhook)
```typescript
// Deno edge function — called from Yappr post-call webhook
const PAYME_SELLER_ID = Deno.env.get("PAYME_SELLER_ID")!;
const PAYME_BASE = "https://ng.cashcow.co.il";

export async function sendPaymentRequest(
  callerPhone: string,
  callerName: string,
  amountILS: number,
  description: string,
  callId: string
) {
  const res = await fetch(`${PAYME_BASE}/PayMe/api/generateSale`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seller_payme_id: PAYME_SELLER_ID,
      sale_price: Math.round(amountILS * 100), // convert to agorot
      currency: "ILS",
      product_name: description,
      sale_send_notification: true,
      sale_callback_url: `https://YOUR_SUPABASE.functions.supabase.co/payme-webhook`,
      buyer_name: callerName,
      buyer_phone: callerPhone.replace("+972", "0"), // PayMe expects local format
    }),
  });

  const data = await res.json();
  if (data.payme_status !== "success") {
    throw new Error(`PayMe error: ${JSON.stringify(data)}`);
  }

  return data.payment_url; // send this via greenapi-whatsapp or twilio-sms
}
```

## Gotchas & Rate Limits

- **Bit direct API**: Requires Bank Hapoalim business account and formal onboarding. Not available on day one. Use PayMe as a faster alternative.
- **PayMe sale_price unit**: Always in agorot (×100). Passing `150` instead of `15000` will charge 1.50 ILS.
- **Phone format**: PayMe expects Israeli local format (`05XXXXXXXX`), not E.164. Strip the `+972` prefix and add `0`.
- **Bit via PayMe**: Bit payment option appears automatically on the PayMe payment page — no extra configuration needed.
- **Callback vs return URL**: `sale_callback_url` is a server-side webhook (POST with payment result). `sale_return_url` is where the browser redirects after payment. Both are optional but recommended.
- **Currency**: Only `ILS` is supported for Israeli business accounts.
- **Transaction limits (Bit)**: Up to 5,000 ILS per transaction, 20,000 ILS/month by default. Limits can be raised with approval.
- **PayMe rate limits**: Not publicly documented; in practice, a few hundred requests/minute is safe for normal usage.
