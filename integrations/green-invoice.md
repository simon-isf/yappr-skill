# Green Invoice (חשבונית ירוקה)

> **Use in Yappr context**: After a sales call, find or create the client in Green Invoice, then issue an invoice, receipt, or price quote and optionally send it to their email — all triggered from the post-call webhook.

## Authentication

Green Invoice uses short-lived JWT tokens. Authenticate with your API credentials to receive a token, then include it on every subsequent request.

```
Authorization: Bearer {jwt_token}
```

Get credentials: Green Invoice dashboard → Settings (הגדרות) → API → copy `id` and `secret`.

Store as `GREEN_INVOICE_API_ID` and `GREEN_INVOICE_API_SECRET` in Supabase Vault / edge function secrets.

**Token lifetime: 30 minutes.** Implement refresh logic — see the post-call snippet below.

## Base URL

`https://api.greeninvoice.co.il/api/v1`

## Key Endpoints

### Get Auth Token
**POST /account/token**

```http
POST /account/token
Content-Type: application/json

{
  "id": "your_api_id",
  "secret": "your_api_secret"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires": 1713960000
}
```

---

### Search Clients by Phone
**GET /clients**

```http
GET /clients?search=0501234567
Authorization: Bearer {token}
```

Response:
```json
{
  "items": [
    {
      "id": "client_abc",
      "name": "יונתן כהן",
      "taxId": "123456789",
      "phone": "0501234567",
      "email": "yonatan@example.com"
    }
  ],
  "total": 1,
  "page": 1
}
```

---

### Create Client
**POST /clients**

```http
POST /clients
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "יונתן כהן",
  "taxId": "123456789",
  "selfEmployed": false,
  "phone": "0501234567",
  "email": "yonatan@example.com",
  "address": {
    "city": "תל אביב",
    "street": "רוטשילד 10"
  }
}
```

Response:
```json
{
  "id": "client_abc",
  "name": "יונתן כהן",
  "phone": "0501234567",
  "email": "yonatan@example.com"
}
```

---

### Create Document (Invoice / Receipt / Quote)
**POST /documents**

```http
POST /documents
Authorization: Bearer {token}
Content-Type: application/json

{
  "description": "שירות ייעוץ - שיחת טלפון",
  "type": 305,
  "lang": "he",
  "currency": "ILS",
  "client": {
    "id": "client_abc"
  },
  "income": [
    {
      "description": "ייעוץ עסקי",
      "quantity": 1,
      "price": 500,
      "currency": "ILS",
      "vatType": 1
    }
  ]
}
```

Response:
```json
{
  "id": "doc_xyz",
  "number": 1042,
  "type": 305,
  "status": 0,
  "url": "https://app.greeninvoice.co.il/documents/doc_xyz/download"
}
```

**Document type values:**

| `type` | Hebrew | English |
|--------|--------|---------|
| 100 | הצעת מחיר | Price Quote |
| 305 | חשבונית מס | Tax Invoice |
| 320 | קבלה | Receipt |
| 400 | חשבון עסקה | Proforma Invoice |

> For receipt + invoice combined (חשבונית מס קבלה) use `type: 400` — this is the most common type for immediate payment confirmation.

---

### Get Client Documents
**GET /documents**

```http
GET /documents?clientId=client_abc
Authorization: Bearer {token}
```

Response:
```json
{
  "items": [
    {
      "id": "doc_xyz",
      "number": 1042,
      "type": 305,
      "status": 0,
      "sum": 585,
      "currency": "ILS"
    }
  ],
  "total": 1
}
```

---

### Send Document by Email
**POST /documents/{id}/send**

```http
POST /documents/doc_xyz/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "email": "yonatan@example.com"
}
```

Response:
```json
{
  "success": true
}
```

## Common Patterns

### Post-call workflow

```typescript
// supabase/functions/_shared/green-invoice.ts
// Deno edge function helper — runs after Yappr post-call webhook

const BASE = "https://api.greeninvoice.co.il/api/v1";
const API_ID = Deno.env.get("GREEN_INVOICE_API_ID")!;
const API_SECRET = Deno.env.get("GREEN_INVOICE_API_SECRET")!;

// Token cache — module-level, lives for the duration of the invocation
let cachedToken: { value: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // Refresh 60 seconds before expiry
  if (cachedToken && cachedToken.expires - 60 > now) {
    return cachedToken.value;
  }

  const res = await fetch(`${BASE}/account/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: API_ID, secret: API_SECRET }),
  });
  const data = await res.json();
  cachedToken = { value: data.token, expires: data.expires };
  return data.token;
}

async function authHeaders() {
  const token = await getToken();
  return { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
}

async function upsertClient(phone: string, name: string, email?: string) {
  const headers = await authHeaders();

  // Search by phone first
  const searchRes = await fetch(`${BASE}/clients?search=${encodeURIComponent(phone)}`, { headers });
  const searchData = await searchRes.json();

  if (searchData.items?.length > 0) {
    return searchData.items[0].id as string;
  }

  // Create new client
  const createRes = await fetch(`${BASE}/clients`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, phone, email }),
  });
  const createData = await createRes.json();
  return createData.id as string;
}

export async function issueInvoiceAfterCall(params: {
  phone: string;
  clientName: string;
  email?: string;
  description: string;
  amount: number;         // in NIS, no agorot conversion needed
  documentType?: number;  // default 305 (tax invoice)
  sendEmail?: boolean;
}) {
  const headers = await authHeaders();
  const clientId = await upsertClient(params.phone, params.clientName, params.email);

  const docRes = await fetch(`${BASE}/documents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      description: params.description,
      type: params.documentType ?? 305,
      lang: "he",
      currency: "ILS",
      client: { id: clientId },
      income: [
        {
          description: params.description,
          quantity: 1,
          price: params.amount,
          currency: "ILS",
          vatType: 1,
        },
      ],
    }),
  });
  const doc = await docRes.json();

  if (params.sendEmail && params.email) {
    await fetch(`${BASE}/documents/${doc.id}/send`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: params.email }),
    });
  }

  return { documentId: doc.id, documentUrl: doc.url };
}
```

## Gotchas & Rate Limits

- **Token expiry**: Tokens are valid for 30 minutes. Always check expiry before use and refresh. The module-level cache pattern above works for a single edge function invocation; for long-running services, implement a persistent refresh timer.
- **`vatType` values**: `0` = exempt (פטור ממע"מ), `1` = standard VAT included in `price`, `2` = VAT calculated on top of `price`. For most B2C Israeli businesses, use `vatType: 1` with VAT-inclusive pricing.
- **VAT rate**: 18% in Israel (updated January 2025, previously 17%). Green Invoice calculates this automatically based on `vatType` — do not manually add VAT to the `price` field.
- **Document `type` 400 vs 320+305**: Type `400` (חשבון עסקה / proforma) is used before payment. For confirmed paid transactions, issue type `320` (receipt) or combined receipt+invoice by passing `type: 320` with invoice details — or check if your account enables combined docs.
- **Amounts**: Pass as plain numbers in NIS (e.g., `500` = 500 NIS). No agorot (cents) conversion required.
- **Phone format**: Local Israeli format (`050...`, `052...`) is accepted. E.164 not required.
- **Rate limits**: Green Invoice does not publish explicit rate limits, but avoid hammering the token endpoint — cache aggressively.
- **`lang: "he"`**: Sets the document language to Hebrew. Use `"en"` for English-language documents.
