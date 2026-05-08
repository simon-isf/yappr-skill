# Shopify

> **Use in Yappr context**: Look up customer orders before a call, update customer notes after a call, or trigger calls when new orders are placed by high-value customers.

## Authentication

**Custom App (recommended for server-side):**
1. Shopify Admin → Settings → Apps and sales channels → Develop apps
2. Create app → Configure Admin API scopes: `read_customers`, `write_customers`, `read_orders`, `write_orders`
3. Install app → Copy Admin API access token

Pass as: `X-Shopify-Access-Token: {token}`

## Base URL

```
https://{store}.myshopify.com/admin/api/2024-01
```

## Key Endpoints

**Headers for all requests:**
```
X-Shopify-Access-Token: shpat_xxx...
Content-Type: application/json
```

### Search Customers by Phone
**GET /customers/search.json?query=phone:{phone}&fields=id,first_name,last_name,phone,email,orders_count,total_spent**

**Response:**
```json
{
  "customers": [
    {
      "id": 1234567890,
      "first_name": "David",
      "last_name": "Cohen",
      "phone": "+972501234567",
      "email": "david@example.com",
      "orders_count": 3,
      "total_spent": "450.00"
    }
  ]
}
```

---

### Get Customer by ID
**GET /customers/{customer_id}.json**

**Response:**
```json
{
  "customer": {
    "id": 1234567890,
    "first_name": "David",
    "last_name": "Cohen",
    "phone": "+972501234567",
    "email": "david@example.com",
    "orders_count": 3,
    "total_spent": "450.00",
    "note": "VIP customer. Prefers morning calls.",
    "tags": "vip,loyal",
    "default_address": {
      "address1": "123 Main St",
      "city": "Tel Aviv",
      "country": "Israel"
    }
  }
}
```

---

### Update Customer
**PUT /customers/{customer_id}.json**

**Request:**
```json
{
  "customer": {
    "id": 1234567890,
    "note": "Spoke via Yappr AI on April 11. Interested in Bundle deal. Follow up April 15.",
    "tags": "vip,loyal,yappr-called"
  }
}
```

---

### Get Customer Orders
**GET /orders.json?customer_id={customer_id}&status=any&limit=10&fields=id,created_at,total_price,financial_status,fulfillment_status,line_items**

**Response:**
```json
{
  "orders": [
    {
      "id": 9876543210,
      "created_at": "2026-03-01T10:00:00+02:00",
      "total_price": "150.00",
      "financial_status": "paid",
      "fulfillment_status": "fulfilled",
      "line_items": [
        { "name": "Widget Pro", "quantity": 2, "price": "75.00" }
      ]
    }
  ]
}
```

---

### Get Recent Orders (for triggering calls)
**GET /orders.json?status=any&created_at_min={iso}&limit=50&fields=id,customer,total_price,financial_status**

Use this to find new high-value orders for proactive outbound calls.

---

### Create Order Note
**PUT /orders/{order_id}.json**

```json
{
  "order": {
    "id": 9876543210,
    "note": "Customer contacted via Yappr AI on April 11. Satisfied with order."
  }
}
```

---

### Webhooks — Subscribe to Order Events
**POST /webhooks.json**

```json
{
  "webhook": {
    "topic": "orders/create",
    "address": "https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/shopify-order-webhook",
    "format": "json"
  }
}
```

Topics: `orders/create`, `orders/updated`, `orders/paid`, `customers/create`, `customers/update`

**Incoming webhook payload (orders/create):**
```json
{
  "id": 9876543210,
  "created_at": "2026-04-11T10:00:00+02:00",
  "total_price": "500.00",
  "customer": {
    "id": 1234567890,
    "first_name": "David",
    "last_name": "Cohen",
    "phone": "+972501234567",
    "email": "david@example.com"
  },
  "line_items": [...]
}
```

---

### Create Draft Order
**POST /draft_orders.json**

```json
{
  "draft_order": {
    "line_items": [{ "variant_id": 123456, "quantity": 1 }],
    "customer": { "id": 1234567890 },
    "note": "Created from Yappr AI call"
  }
}
```

## Common Patterns

### Pre-call customer lookup by phone
```typescript
const store = Deno.env.get("SHOPIFY_STORE"); // "mystore" (without .myshopify.com)
const token = Deno.env.get("SHOPIFY_ACCESS_TOKEN");
const base = `https://${store}.myshopify.com/admin/api/2024-01`;

const search = await fetch(
  `${base}/customers/search.json?query=phone:${encodeURIComponent(callerPhone)}&fields=id,first_name,orders_count,total_spent`,
  { headers: { "X-Shopify-Access-Token": token } }
).then(r => r.json());

const customer = search.customers?.[0];
if (customer) {
  // Pass context to voice agent
  agentContext = {
    customerName: customer.first_name,
    orderCount: customer.orders_count,
    totalSpent: customer.total_spent,
    isVip: parseFloat(customer.total_spent) > 500,
  };
}
```

### Trigger call on new high-value order
```typescript
// Webhook handler for orders/create
const order = await req.json();
if (parseFloat(order.total_price) >= 200 && order.customer?.phone) {
  await fetch("https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/api-v1-calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${YAPPR_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: order.customer.phone,
      agentId: POST_PURCHASE_AGENT_ID,
      metadata: {
        orderId: order.id,
        customerName: order.customer.first_name,
        orderTotal: order.total_price,
      },
    }),
  });
}
```

## Gotchas & Rate Limits

- **Rate limits**: REST API: 2 requests/second (bucket of 40). GraphQL: 50 points/second. Use leaky bucket algorithm.
- **`X-Shopify-Access-Token` header**: Not `Authorization: Bearer`. Exact header name matters.
- **API versioning**: Always specify a version (e.g. `2024-01`). Versionless calls use oldest supported.
- **Phone search**: `query=phone:+972501234567` — include the `+` prefix. Results may be empty if stored in different format.
- **Webhook verification**: Shopify signs webhook payloads with `X-Shopify-Hmac-Sha256` header. Always verify in production.
- **Draft orders vs real orders**: A draft order becomes a real order when the customer pays. Don't create real orders via API unless you're certain.
- **Pagination (cursor-based)**: Use `Link` response header for cursor-based pagination on list endpoints. Look for `rel="next"` in the header.
