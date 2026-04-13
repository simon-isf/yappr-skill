# Cardcom

> **Use in Yappr context**: After a sales call, generate a secure payment link to send to the caller via WhatsApp or SMS, or charge a previously saved card token for recurring billing.

## Authentication

Cardcom uses `TerminalNumber` and `UserName` passed in every request body. There is no separate auth step or bearer token.

Get credentials: Cardcom account dashboard → Settings → Terminal Details.

Store as `CARDCOM_TERMINAL_NUMBER` and `CARDCOM_USERNAME` in Supabase Vault / edge function secrets.

## Base URL

`https://secure.cardcom.solutions/api/v11`

> Cardcom also offers a legacy SOAP interface — use the REST API documented here for all new integrations.

## Key Endpoints

### Create Payment Link (LowProfile)
**POST /Transactions/LowProfile/Create**

The LowProfile transaction creates a hosted payment page. Send the resulting `Url` to the caller via WhatsApp.

```http
POST /Transactions/LowProfile/Create
Content-Type: application/json

{
  "TerminalNumber": "1000001",
  "UserName": "barak",
  "Sum": 500,
  "CoinID": 1,
  "Language": "he",
  "MaxNumOfPayments": 1,
  "SuccessRedirectUrl": "https://yourdomain.com/payment/success",
  "ErrorRedirectUrl": "https://yourdomain.com/payment/error",
  "ReturnUrl": "https://your-webhook-endpoint.com/cardcom-ipn",
  "InvoiceHead": {
    "CustName": "יונתן כהן",
    "SendByEmail": true,
    "Language": "he",
    "Email": "yonatan@example.com"
  }
}
```

Response:
```json
{
  "ResponseCode": 0,
  "Description": "OK",
  "LowProfileCode": "abc123xyz",
  "Url": "https://secure.cardcom.solutions/External/LowProfile.aspx?LowProfileCode=abc123xyz"
}
```

> Send `Url` directly to the caller. `ResponseCode: 0` means success; any other value is an error — check `Description`.

---

### Charge Saved Token
**POST /Transactions/ChargeToken**

Use when a customer has previously paid and their card token was saved via the LowProfile flow (Cardcom returns the token in the IPN callback).

```http
POST /Transactions/ChargeToken
Content-Type: application/json

{
  "TerminalNumber": "1000001",
  "UserName": "barak",
  "CardToken": "tok_abc123",
  "Sum": 500,
  "CoinID": 1,
  "NumOfPayments": 1,
  "InvoiceHead": {
    "CustName": "יונתן כהן",
    "Language": "he"
  }
}
```

Response:
```json
{
  "ResponseCode": 0,
  "Description": "OK",
  "TransactionId": 98765432,
  "ApprovalNumber": "012345"
}
```

---

### Get Transaction Status
**GET /Transactions/{TransactionId}**

```http
GET /Transactions/98765432?TerminalNumber=1000001&UserName=barak
```

Response:
```json
{
  "ResponseCode": 0,
  "Description": "OK",
  "TransactionId": 98765432,
  "Sum": 500,
  "CoinID": 1,
  "Status": "Approved",
  "Last4Digits": "1234",
  "CardToken": "tok_abc123"
}
```

---

### IPN / Webhook Payload

Cardcom POSTs a **form-encoded** body to the `ReturnUrl` specified in the LowProfile Create request.

Example decoded payload:
```
ResponseCode=0
Description=Transaction+OK
TransactionId=98765432
LowProfileCode=abc123xyz
Sum=500
CoinID=1
CardToken=tok_abc123
Last4Digits=1234
ApprovalNumber=012345
CustName=%D7%99%D7%95%D7%A0%D7%AA%D7%9F+%D7%9B%D7%94%D7%9F
```

In Deno, parse with `URLSearchParams`:
```typescript
const body = await req.text();
const params = new URLSearchParams(body);
const success = params.get("ResponseCode") === "0";
const cardToken = params.get("CardToken");
```

## Common Patterns

### Post-call workflow

```typescript
// supabase/functions/_shared/cardcom.ts
// Deno edge function helper — generate payment link after a Yappr call

const BASE = "https://secure.cardcom.solutions/api/v11";
const TERMINAL = Deno.env.get("CARDCOM_TERMINAL_NUMBER")!;
const USERNAME = Deno.env.get("CARDCOM_USERNAME")!;
const WEBHOOK_URL = Deno.env.get("CARDCOM_WEBHOOK_URL")!; // your IPN endpoint

export async function createPaymentLink(params: {
  amount: number;         // NIS, whole number (e.g. 500 = ₪500)
  customerName: string;
  customerEmail?: string;
  description?: string;
  maxPayments?: number;   // installments — 1 for single payment
  successUrl?: string;
  errorUrl?: string;
}): Promise<{ url: string; lowProfileCode: string }> {
  const body: Record<string, unknown> = {
    TerminalNumber: TERMINAL,
    UserName: USERNAME,
    Sum: params.amount,
    CoinID: 1, // ILS
    Language: "he",
    MaxNumOfPayments: params.maxPayments ?? 1,
    ReturnUrl: WEBHOOK_URL,
    SuccessRedirectUrl: params.successUrl ?? `${Deno.env.get("APP_URL")}/payment/success`,
    ErrorRedirectUrl: params.errorUrl ?? `${Deno.env.get("APP_URL")}/payment/error`,
    InvoiceHead: {
      CustName: params.customerName,
      Language: "he",
      SendByEmail: !!params.customerEmail,
      ...(params.customerEmail ? { Email: params.customerEmail } : {}),
    },
  };

  const res = await fetch(`${BASE}/Transactions/LowProfile/Create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.ResponseCode !== 0) {
    throw new Error(`Cardcom error ${data.ResponseCode}: ${data.Description}`);
  }

  return { url: data.Url, lowProfileCode: data.LowProfileCode };
}

export async function chargeToken(params: {
  cardToken: string;
  amount: number;
  customerName: string;
}): Promise<{ transactionId: number; approvalNumber: string }> {
  const res = await fetch(`${BASE}/Transactions/ChargeToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      TerminalNumber: TERMINAL,
      UserName: USERNAME,
      CardToken: params.cardToken,
      Sum: params.amount,
      CoinID: 1,
      NumOfPayments: 1,
      InvoiceHead: { CustName: params.customerName, Language: "he" },
    }),
  });

  const data = await res.json();
  if (data.ResponseCode !== 0) {
    throw new Error(`Cardcom token charge error ${data.ResponseCode}: ${data.Description}`);
  }

  return { transactionId: data.TransactionId, approvalNumber: data.ApprovalNumber };
}
```

## Gotchas & Rate Limits

- **`ResponseCode: 0` = success** — Cardcom signals errors via `ResponseCode` in the JSON body, not via HTTP status codes. Always check `ResponseCode`, not `res.ok`.
- **`CoinID: 1`** = ILS (Israeli Shekel). Do not omit this field — default may not be ILS in all terminal configurations.
- **`Language: "he"`** — shows a Hebrew-language payment page. Use `"en"` for English.
- **IPN is form-encoded, not JSON** — parse with `URLSearchParams`, not `JSON.parse`. This is the most common integration bug.
- **`ReturnUrl` vs redirect URLs** — `ReturnUrl` is the server-side IPN webhook (form POST from Cardcom servers). `SuccessRedirectUrl` / `ErrorRedirectUrl` are browser redirects after the user finishes. Both can be set independently.
- **Card tokens** — Cardcom includes `CardToken` in the IPN payload after a successful payment. Store this token (linked to the contact/customer) in your DB to enable future charges without a new payment page.
- **Installments** — `MaxNumOfPayments > 1` enables the payer to choose installments on the payment page. Set to `1` to enforce single payment.
- **Amounts** — Pass as whole NIS values. There is no agorot (cent) conversion.
- **Rate limits** — Cardcom does not publish API rate limits. Treat as standard — avoid burst patterns and implement basic retry with backoff.
- **Test credentials** — Cardcom provides a sandbox terminal for testing. Use separate `CARDCOM_TERMINAL_NUMBER` and `CARDCOM_USERNAME` secrets for staging vs production.
