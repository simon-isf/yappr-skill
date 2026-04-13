# Meshulam

> **Use in Yappr context**: After a sales call, generate a payment link using the caller's phone number and send it to them via WhatsApp — covers one-time payments, installments, and recurring billing for service businesses.

## Authentication

Meshulam uses an API key passed as a request header on every call.

```
api_key: {your_api_key}
```

Get credentials: Meshulam dashboard → Settings (הגדרות) → API → copy your API key.

Store as `MESHULAM_API_KEY` in Supabase Vault / edge function secrets.

## Base URL

- **Sandbox**: `https://sandbox.meshulam.co.il/api/v1`
- **Production**: `https://admin.meshulam.co.il/api/v1`

Store the active base URL as `MESHULAM_BASE_URL` in secrets so you can switch between environments without code changes.

## Key Endpoints

### Create Payment Link
**POST /transactions/create**

Creates a hosted payment page and returns a link to send to the caller.

```http
POST /transactions/create
api_key: your_api_key
Content-Type: application/json

{
  "pageCode": "abc123",
  "sum": 500,
  "description": "ייעוץ עסקי - תשלום",
  "fullName": "יונתן כהן",
  "phoneNumber": "0501234567",
  "email": "yonatan@example.com",
  "maxPayments": 1
}
```

Response:
```json
{
  "success": true,
  "data": {
    "transactionId": "txn_abc123",
    "url": "https://pay.meshulam.co.il/p/abc123xyz",
    "pageCode": "abc123"
  }
}
```

> Send `data.url` to the caller via WhatsApp. Always check `success: true` — HTTP 200 is returned even for errors.

---

### Get Transaction Status
**GET /transactions/{transactionId}**

```http
GET /transactions/txn_abc123
api_key: your_api_key
```

Response:
```json
{
  "success": true,
  "data": {
    "transactionId": "txn_abc123",
    "status": "completed",
    "sum": 500,
    "fullName": "יונתן כהן",
    "phoneNumber": "0501234567",
    "email": "yonatan@example.com",
    "cardToken": "tok_xyz789",
    "paymentDate": "2025-04-12T10:30:00.000Z"
  }
}
```

**`status` values**: `pending`, `completed`, `failed`, `cancelled`.

---

### Charge Saved Token (Recurring)
**POST /transactions/charge**

Charge a card token saved from a previous completed transaction. Used for subscription billing or installment collection.

```http
POST /transactions/charge
api_key: your_api_key
Content-Type: application/json

{
  "pageCode": "abc123",
  "cardToken": "tok_xyz789",
  "sum": 500,
  "description": "מנוי חודשי - אפריל 2025",
  "fullName": "יונתן כהן",
  "phoneNumber": "0501234567"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "transactionId": "txn_new456",
    "status": "completed",
    "sum": 500,
    "approvalNumber": "012345"
  }
}
```

---

### Webhook — Payment Completion

Meshulam sends a `POST` to your configured webhook URL when a payment is completed.

Configure in: Meshulam dashboard → page settings → Webhook URL.

Example payload:
```json
{
  "transactionId": "txn_abc123",
  "status": "completed",
  "sum": 500,
  "fullName": "יונתן כהן",
  "phoneNumber": "0501234567",
  "email": "yonatan@example.com",
  "cardToken": "tok_xyz789",
  "pageCode": "abc123",
  "approvalNumber": "012345",
  "paymentDate": "2025-04-12T10:30:00.000Z"
}
```

Respond with HTTP 200 to acknowledge. Meshulam will retry on non-200 responses.

## Common Patterns

### Post-call workflow

```typescript
// supabase/functions/_shared/meshulam.ts
// Deno edge function helper — generate payment link after a Yappr call

const BASE = Deno.env.get("MESHULAM_BASE_URL")!; // sandbox or production URL
const API_KEY = Deno.env.get("MESHULAM_API_KEY")!;
const PAGE_CODE = Deno.env.get("MESHULAM_PAGE_CODE")!;

const headers = {
  "api_key": API_KEY,
  "Content-Type": "application/json",
};

export async function createPaymentLink(params: {
  phone: string;           // local Israeli format: 05X... (no E.164 needed)
  fullName: string;
  amount: number;          // NIS, whole number
  description: string;
  email?: string;
  maxPayments?: number;    // 1 = single payment; >1 = installments
}): Promise<{ url: string; transactionId: string }> {
  const res = await fetch(`${BASE}/transactions/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      pageCode: PAGE_CODE,
      sum: params.amount,
      description: params.description,
      fullName: params.fullName,
      phoneNumber: params.phone,
      ...(params.email ? { email: params.email } : {}),
      maxPayments: params.maxPayments ?? 1,
    }),
  });

  const data = await res.json();

  // Meshulam returns HTTP 200 even for errors — always check success field
  if (!data.success) {
    throw new Error(`Meshulam error: ${JSON.stringify(data)}`);
  }

  return { url: data.data.url, transactionId: data.data.transactionId };
}

export async function chargeToken(params: {
  cardToken: string;
  phone: string;
  fullName: string;
  amount: number;
  description: string;
}): Promise<{ transactionId: string; approvalNumber: string }> {
  const res = await fetch(`${BASE}/transactions/charge`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      pageCode: PAGE_CODE,
      cardToken: params.cardToken,
      sum: params.amount,
      description: params.description,
      fullName: params.fullName,
      phoneNumber: params.phone,
    }),
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(`Meshulam token charge error: ${JSON.stringify(data)}`);
  }

  return {
    transactionId: data.data.transactionId,
    approvalNumber: data.data.approvalNumber,
  };
}

export async function getTransactionStatus(transactionId: string) {
  const res = await fetch(`${BASE}/transactions/${transactionId}`, { headers });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`Meshulam status error: ${JSON.stringify(data)}`);
  }
  return data.data;
}
```

## Gotchas & Rate Limits

- **`success: false` on HTTP 200** — this is the most common integration mistake. Meshulam always returns HTTP 200 regardless of outcome. Check `data.success` before using any response data.
- **`pageCode`** — Every Meshulam payment page has a code visible in the dashboard. This is the template controlling the payment page appearance, supported payment methods, and webhook destination. You must create at least one page in the dashboard before using the API.
- **Phone format** — Local Israeli format (`0501234567`, `0521234567`) is accepted natively. Do not convert to E.164.
- **Sandbox vs production** — Different hostnames entirely (`sandbox.meshulam.co.il` vs `admin.meshulam.co.il`). Keep as an env var to avoid hardcoding.
- **Card tokens** — The `cardToken` field appears in the webhook payload and in `GET /transactions/{id}` after a completed payment. Store it linked to the customer record to enable future recurring charges.
- **Installments** — Set `maxPayments > 1` to allow the payer to split into installments on the payment page. Each installment becomes a separate charge event with its own webhook notification.
- **Webhook setup** — Webhooks are configured per payment page in the Meshulam dashboard, not per API call. If you use multiple page codes, each needs its webhook URL configured separately.
- **Rate limits** — Meshulam does not publish explicit rate limits. Standard precautions apply — no burst loops, implement exponential backoff on failure.
- **Amounts** — Pass as whole NIS values (e.g., `500` = ₪500). No agorot conversion.
