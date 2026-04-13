# WooCommerce

> **Use in Yappr context**: Look up a customer's order history before a support call, read back order status to a caller in real time ("your order #1234 shipped yesterday"), add a private call note to an order, or create a new customer record after an intake call.

## Authentication
HTTP Basic auth using Consumer Key as username and Consumer Secret as password. Generate from WooCommerce → Settings → Advanced → REST API → Add Key. Set permissions to Read/Write.

```
Authorization: Basic base64(ck_xxxx:cs_xxxx)
```

Alternatively pass as query parameters (less secure, avoid in production):
```
?consumer_key=ck_xxxx&consumer_secret=cs_xxxx
```

**HTTPS is mandatory** — Basic auth over HTTP exposes credentials in plaintext.

## Base URL
`https://{store_domain}/wp-json/wc/v3`

## Key Endpoints

### Search Customers
**GET /customers**

Search by email, username, or name. Phone numbers are stored in `billing.phone`, not at the top level — use the `search` param to match against billing fields.

**Query params**: `?search={term}&per_page=10`

**Response**
```json
[
  {
    "id": 142,
    "first_name": "Yael",
    "last_name": "Cohen",
    "email": "yael@example.com",
    "username": "yaelcohen",
    "billing": {
      "first_name": "Yael",
      "last_name": "Cohen",
      "address_1": "Dizengoff 120",
      "city": "Tel Aviv",
      "state": "",
      "postcode": "6433214",
      "country": "IL",
      "email": "yael@example.com",
      "phone": "+972501234567"
    },
    "orders_count": 7,
    "total_spent": "2340.00",
    "avatar_url": "https://secure.gravatar.com/avatar/..."
  }
]
```

### Get Customer Details
**GET /customers/{id}**

Full customer profile with shipping address and metadata.

**Response**: Same shape as search result above, with additional `shipping` object and `meta_data` array.

### Get Customer Orders
**GET /orders**

Filter by customer ID, status, or date range.

**Query params**: `?customer=142&status=any&per_page=5&orderby=date&order=desc`

**Common status values**: `pending`, `processing`, `on-hold`, `completed`, `cancelled`, `refunded`, `failed`

**Response**
```json
[
  {
    "id": 1089,
    "status": "processing",
    "date_created": "2025-01-18T14:22:00",
    "total": "380.00",
    "currency": "ILS",
    "billing": {
      "first_name": "Yael",
      "last_name": "Cohen",
      "phone": "+972501234567"
    },
    "line_items": [
      {
        "id": 45,
        "name": "Premium Skincare Set",
        "quantity": 2,
        "subtotal": "380.00",
        "sku": "SKU-9921"
      }
    ],
    "shipping_lines": [
      {
        "method_title": "Courier delivery",
        "total": "0.00"
      }
    ],
    "customer_note": "",
    "meta_data": []
  }
]
```

### Get Single Order
**GET /orders/{id}**

Full order details including line items, shipping, and notes.

**Response**: Same as the array item above, with additional `payment_method`, `transaction_id`, `date_paid`, and `order_notes` fields.

### Update Order
**PUT /orders/{id}**

Update order status or add a customer-facing note. Only include fields you want to change.

**Request**
```json
{
  "status": "completed",
  "customer_note": "Confirmed delivery with customer by phone. Package received."
}
```

**Response**: Full updated order object.

### Add Order Note
**POST /orders/{id}/notes**

Add an internal or customer-facing note to an order. Preferred over updating `customer_note` since notes are appended, not replaced.

**Request**
```json
{
  "note": "Call completed 2025-01-20 14:32. Disposition: issue resolved. Agent: Liron. Customer confirmed receipt of order.",
  "customer_note": false,
  "added_by_user": false
}
```

`customer_note: true` sends the note to the customer by email and makes it visible in their account. `false` = internal only.

**Response**
```json
{
  "id": 712,
  "author": "WooCommerce",
  "date_created": "2025-01-20T14:32:00",
  "note": "Call completed 2025-01-20 14:32...",
  "customer_note": false
}
```

### Create Customer
**POST /customers**

Create a new customer record after an intake call.

**Request**
```json
{
  "email": "david.levi@example.com",
  "first_name": "David",
  "last_name": "Levi",
  "username": "davidlevi",
  "billing": {
    "first_name": "David",
    "last_name": "Levi",
    "address_1": "Ben Yehuda 55",
    "city": "Tel Aviv",
    "postcode": "6340924",
    "country": "IL",
    "email": "david.levi@example.com",
    "phone": "+972521234567"
  }
}
```

**Response**
```json
{
  "id": 143,
  "email": "david.levi@example.com",
  "first_name": "David",
  "last_name": "Levi",
  "billing": { "phone": "+972521234567" }
}
```

### Search Orders by Phone or Email
**GET /orders**

WooCommerce does not have a dedicated phone search endpoint. Use `?search={value}` which searches across billing email, name, and address fields. For phone-based lookup, search with the normalized phone string.

**Query params**: `?search=0521234567&per_page=10`

Note: search matches are partial-string — `0521234567` will match `+972521234567` stored in billing.

## Common Patterns

### Pre-call order context injection
```typescript
// Fetch last 3 orders for a VIP customer before placing an outbound call
// Inject as a prompt variable for the agent

const WC_BASE = Deno.env.get("WC_BASE_URL")!;         // https://store.example.com/wp-json/wc/v3
const WC_KEY = Deno.env.get("WC_CONSUMER_KEY")!;       // ck_xxxx
const WC_SECRET = Deno.env.get("WC_CONSUMER_SECRET")!; // cs_xxxx

function wcHeaders() {
  const credentials = btoa(`${WC_KEY}:${WC_SECRET}`);
  return { "Authorization": `Basic ${credentials}` };
}

async function getCustomerRecentOrders(customerId: number, limit = 3) {
  const url = new URL(`${WC_BASE}/orders`);
  url.searchParams.set("customer", String(customerId));
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");

  const response = await fetch(url.toString(), { headers: wcHeaders() });

  if (!response.ok) {
    throw new Error(`WooCommerce orders fetch failed: ${response.status}`);
  }

  const orders = await response.json();
  return orders.map((o: { id: number; status: string; total: string; date_created: string; line_items: Array<{ name: string }> }) => ({
    id: o.id,
    status: o.status,
    total: o.total,
    date: o.date_created.split("T")[0],
    items: o.line_items.map((li) => li.name).join(", "),
  }));
}

async function findCustomerByPhone(phone: string) {
  // Normalize: strip country code, try both formats
  const normalized = phone.replace("+972", "0");
  const url = new URL(`${WC_BASE}/customers`);
  url.searchParams.set("search", normalized);
  url.searchParams.set("per_page", "5");

  const response = await fetch(url.toString(), { headers: wcHeaders() });
  const customers = await response.json();
  return customers[0] ?? null;
}
```

### Post-call order note
```typescript
// supabase/functions/call-analyzed/index.ts
// After a support call, add internal note to the customer's most recent order

async function addCallNoteToLastOrder(customerId: number, noteText: string) {
  // Get most recent order
  const ordersUrl = new URL(`${WC_BASE}/orders`);
  ordersUrl.searchParams.set("customer", String(customerId));
  ordersUrl.searchParams.set("per_page", "1");
  ordersUrl.searchParams.set("orderby", "date");
  ordersUrl.searchParams.set("order", "desc");

  const ordersRes = await fetch(ordersUrl.toString(), { headers: wcHeaders() });
  const orders = await ordersRes.json();

  if (!orders.length) return null;

  const orderId = orders[0].id;

  const noteRes = await fetch(`${WC_BASE}/orders/${orderId}/notes`, {
    method: "POST",
    headers: {
      ...wcHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      note: noteText,
      customer_note: false,
    }),
  });

  if (!noteRes.ok) {
    throw new Error(`Failed to add WooCommerce order note: ${noteRes.status}`);
  }

  return noteRes.json();
}
```

## Gotchas & Rate Limits

- Phone numbers are stored in `billing.phone`, not as a top-level customer field. There is no dedicated search-by-phone endpoint — use `?search={phone}` and the API will do a partial string match across billing fields.
- Consumer Key and Consumer Secret are shown only once at creation. If lost, delete and regenerate — you cannot retrieve the existing secret.
- The `search` query param on `/orders` and `/customers` does a broad text match, not an exact field match. Filter results client-side if precision is needed.
- WooCommerce API returns arrays for list endpoints regardless of result count. An empty search returns `[]`, not a 404.
- Default pagination is 10 results per page. Use `per_page` (max 100) and `page` params to paginate large result sets.
- Order status updates via `PUT /orders/{id}` trigger WooCommerce's internal hooks (emails to customer, inventory adjustments). Set status changes intentionally.
- `customer_note: true` on an order note sends an email to the customer. Default to `false` for internal call notes.
- Currency in order responses is the store's configured currency code (e.g., `"ILS"`). `total` is a string, not a number — parse with `parseFloat()` before arithmetic.
- Rate limits depend on the hosting environment (shared hosting may throttle REST requests). Most VPS/managed WooCommerce hosts handle 60–120 requests/minute without issue. Add retry logic with exponential backoff for production use.
- For stores using Cloudflare or similar WAFs, ensure your edge function's IP range is not rate-limited. Pass a descriptive `User-Agent` header to avoid bot detection.
