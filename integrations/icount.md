# iCount (iקאונט)

> **Use in Yappr context**: After a successful call where a customer agrees to a service, automatically create a quote or invoice in iCount and send it to their email — without any manual data entry.

## Authentication

iCount uses **session-based auth**. Every API call flow starts with a login request that returns a `sid` (session ID), which is then passed with all subsequent requests.

1. Get your company ID (`cid`), username, and password from iCount settings
2. POST to `/login` with credentials → receive `sid`
3. Include `sid` in all subsequent requests (in the POST body, not as a header)

Sessions expire after ~30 minutes of inactivity. Re-authenticate on `401` or `sid_invalid` errors.

Store credentials as environment variables: `ICOUNT_CID`, `ICOUNT_USER`, `ICOUNT_PASS`.

## Base URL

```
https://api.icount.co.il/api/v3.php
```

All requests are **POST** with `Content-Type: application/x-www-form-urlencoded` or `application/json`. The API accepts both formats. JSON is recommended.

## Key Endpoints

### Login (Get Session)
**POST /api/v3.php?path=login**

**Headers:**
```
Content-Type: application/json
```

**Request:**
```json
{
  "cid": "your_company_id",
  "user": "your_username",
  "pass": "your_password"
}
```

**Response:**
```json
{
  "status": true,
  "sid": "abc123xyz456",
  "user_id": "42",
  "lang": "he"
}
```

Store `sid` for all subsequent requests in this session. On `status: false`, check `error_code` and `error_message`.

---

### Find Client by Phone
**POST /api/v3.php?path=client/search**

**Request:**
```json
{
  "sid": "abc123xyz456",
  "phone": "0501234567"
}
```

**Response:**
```json
{
  "status": true,
  "clients": [
    {
      "client_id": "1001",
      "client_name": "דוד כהן",
      "email": "david@example.com",
      "phone": "0501234567",
      "vat_id": "123456789"
    }
  ]
}
```

Use `clients[0].client_id` for document creation. Returns empty array if not found.

---

### Create or Update Client
**POST /api/v3.php?path=client/save**

**Request:**
```json
{
  "sid": "abc123xyz456",
  "client_name": "דוד כהן",
  "email": "david@example.com",
  "phone": "0501234567",
  "address": "רחוב הרצל 10, תל אביב"
}
```

To update an existing client, include `client_id` in the body.

**Response:**
```json
{
  "status": true,
  "client_id": "1001"
}
```

---

### Create Document (Invoice / Quote / Receipt)
**POST /api/v3.php?path=doc/save**

**Request:**
```json
{
  "sid": "abc123xyz456",
  "doctype": "invoice",
  "client_id": "1001",
  "client_name": "דוד כהן",
  "client_email": "david@example.com",
  "description": "שירות ייעוץ — שיחה מיום 11.4.2026",
  "items": [
    {
      "description": "שעת ייעוץ",
      "quantity": 1,
      "unitprice": 500,
      "vat_type": 1
    }
  ],
  "send_email": true
}
```

**`doctype` values:**
- `invoice` — חשבונית מס
- `invrec` — חשבונית מס קבלה (invoice + receipt combined)
- `receipt` — קבלה
- `offer` — הצעת מחיר (quote)
- `order` — הזמנה
- `delivery` — תעודת משלוח

**`vat_type` values:** `1` = include VAT (המחיר כולל מע"מ), `0` = VAT added on top, `2` = VAT exempt

**Response:**
```json
{
  "status": true,
  "doc_id": "55001",
  "doc_url": "https://app.icount.co.il/documents/55001/view",
  "pdf_url": "https://app.icount.co.il/documents/55001/pdf"
}
```

`doc_url` is a shareable link. `pdf_url` downloads the PDF. If `send_email: true`, iCount emails the document to `client_email` automatically.

---

### Get Document
**POST /api/v3.php?path=doc/get**

**Request:**
```json
{
  "sid": "abc123xyz456",
  "doc_id": "55001"
}
```

**Response:**
```json
{
  "status": true,
  "doc": {
    "doc_id": "55001",
    "doctype": "invoice",
    "client_name": "דוד כהן",
    "total": 585,
    "vat": 85,
    "doc_status": "open",
    "created_at": "2026-04-11"
  }
}
```

---

### List Clients
**POST /api/v3.php?path=client/list**

**Request:**
```json
{
  "sid": "abc123xyz456",
  "page": 1,
  "results_per_page": 50
}
```

---

## Common Patterns

### Create invoice after a successful call
```typescript
// Deno edge function — called from Yappr post-call webhook

const BASE = "https://api.icount.co.il/api/v3.php";

async function icountPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}?path=${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.status) throw new Error(`iCount error [${path}]: ${data.error_message}`);
  return data;
}

export async function createInvoiceAfterCall(
  callerPhone: string,
  callerName: string,
  callerEmail: string,
  amountILS: number,
  serviceDescription: string
) {
  // 1. Login
  const { sid } = await icountPost("login", {
    cid: Deno.env.get("ICOUNT_CID"),
    user: Deno.env.get("ICOUNT_USER"),
    pass: Deno.env.get("ICOUNT_PASS"),
  });

  // 2. Find or create client
  const search = await icountPost("client/search", { sid, phone: callerPhone });
  let clientId: string;

  if (search.clients?.length > 0) {
    clientId = search.clients[0].client_id;
  } else {
    const created = await icountPost("client/save", {
      sid,
      client_name: callerName,
      email: callerEmail,
      phone: callerPhone,
    });
    clientId = created.client_id;
  }

  // 3. Create invoice
  const doc = await icountPost("doc/save", {
    sid,
    doctype: "invrec", // invoice + receipt
    client_id: clientId,
    client_name: callerName,
    client_email: callerEmail,
    description: serviceDescription,
    items: [
      {
        description: serviceDescription,
        quantity: 1,
        unitprice: amountILS,
        vat_type: 1,
      },
    ],
    send_email: true,
  });

  return { docId: doc.doc_id, docUrl: doc.doc_url, pdfUrl: doc.pdf_url };
}
```

## Gotchas & Rate Limits

- **Session expiry**: Sessions expire after ~30 minutes. In edge functions (stateless), log in at the start of every invocation. Don't cache `sid` across cold starts.
- **No rate limit documentation**: iCount does not publish rate limits. Practical safe rate is ~10 requests/second per account.
- **`unitprice` is pre-VAT**: When `vat_type: 0`, the price excludes VAT and iCount adds 17% on top. When `vat_type: 1`, the price includes VAT (what you show to customers). Double-check which your use case requires.
- **`send_email` requires `client_email`**: If email is not set on the client or not passed in the doc, iCount silently skips sending.
- **Doctype `invrec`**: This is the most common Israeli document — it is both a tax invoice and a receipt, confirming payment was received. Use this when the customer paid on the spot.
- **Hebrew encoding**: The API fully supports UTF-8 Hebrew in all string fields. No special encoding needed.
- **Pagination**: Client list and document list endpoints paginate at 50 records by default. Use `page` and `results_per_page` parameters.
- **API key alternative**: Some iCount plan tiers support API key auth instead of `cid`+`user`+`pass`. Check your account settings. If available, prefer the API key as it doesn't expire with session timeouts.
