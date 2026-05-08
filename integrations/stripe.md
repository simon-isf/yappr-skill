# Stripe

> **Use in Yappr context**: After a call where a customer agrees to pay, create a payment link to send via WhatsApp/SMS, or charge a saved card on file.

## Authentication

Stripe uses HTTP Basic auth with your secret key as the username and an empty password, or a Bearer token header:

```
Authorization: Basic base64(sk_live_...:)
// or equivalently:
Authorization: Bearer sk_live_...
```

Use `sk_test_...` keys during development. Never expose secret keys in client-side code.

## Base URL

```
https://api.stripe.com/v1
```

## Key Endpoints

### POST /payment_links — Create a payment link

Request body is `application/x-www-form-urlencoded` (all Stripe v1 endpoints use form encoding, not JSON):

```
POST /v1/payment_links
Content-Type: application/x-www-form-urlencoded

line_items[0][price]=price_1ABC123&line_items[0][quantity]=1
```

Response:

```json
{
  "id": "plink_1ABC123",
  "object": "payment_link",
  "active": true,
  "url": "https://buy.stripe.com/test_abc123",
  "line_items": {
    "data": [
      {
        "id": "li_...",
        "price": { "id": "price_1ABC123", "unit_amount": 5000, "currency": "ils" },
        "quantity": 1
      }
    ]
  },
  "after_completion": { "type": "hosted_confirmation" }
}
```

The `url` field is what you send to the customer via WhatsApp or SMS.

---

### POST /customers — Create a customer

```
POST /v1/customers
Content-Type: application/x-www-form-urlencoded

name=David+Cohen&phone=%2B9725012345678&email=david%40example.com&metadata[source]=yappr_call
```

Response:

```json
{
  "id": "cus_ABC123",
  "object": "customer",
  "name": "David Cohen",
  "phone": "+9725012345678",
  "email": "david@example.com",
  "created": 1710000000
}
```

---

### GET /customers/search — Find customer by phone

```
GET /v1/customers/search?query=phone%3A%27%2B9725012345678%27
```

The `query` value follows Stripe's search syntax. Phone must be stored on the customer object (set via `phone` field when creating the customer).

Response:

```json
{
  "object": "search_result",
  "data": [
    {
      "id": "cus_ABC123",
      "name": "David Cohen",
      "phone": "+9725012345678",
      "email": "david@example.com"
    }
  ],
  "has_more": false
}
```

Returns an empty `data` array if not found.

---

### POST /payment_intents — Charge a saved card

Requires the customer to have a saved `PaymentMethod` on file (collected previously via Stripe Elements or a Checkout session with `setup_future_usage`):

```
POST /v1/payment_intents
Content-Type: application/x-www-form-urlencoded

amount=5000&currency=ils&customer=cus_ABC123&payment_method=pm_ABC123&confirm=true&off_session=true
```

`amount` is in the smallest currency unit (agorot for ILS, cents for USD). `off_session=true` means the customer is not present.

Response:

```json
{
  "id": "pi_ABC123",
  "object": "payment_intent",
  "amount": 5000,
  "currency": "ils",
  "status": "succeeded",
  "customer": "cus_ABC123",
  "payment_method": "pm_ABC123"
}
```

---

### POST /invoices — Create a B2B invoice

Two-step process: create the invoice, then add line items (invoice items), then finalize:

```
POST /v1/invoices
Content-Type: application/x-www-form-urlencoded

customer=cus_ABC123&collection_method=send_invoice&days_until_due=30&description=Service+invoice
```

Then add items:

```
POST /v1/invoiceitems
Content-Type: application/x-www-form-urlencoded

customer=cus_ABC123&invoice=in_ABC123&amount=5000&currency=ils&description=Consulting+services
```

Then finalize and send:

```
POST /v1/invoices/in_ABC123/finalize
POST /v1/invoices/in_ABC123/send
```

---

### GET /payment_links/{id} — Check if a payment link has been used

```
GET /v1/payment_links/plink_1ABC123
```

Response includes `active: true/false`. To check actual payment completions, listen to the `checkout.session.completed` webhook event or query:

```
GET /v1/checkout/sessions?payment_link=plink_1ABC123
```

Response:

```json
{
  "object": "list",
  "data": [
    {
      "id": "cs_ABC123",
      "payment_status": "paid",
      "customer_details": { "email": "david@example.com", "phone": "+9725012345678" }
    }
  ]
}
```

---

## Common Patterns

### Create a payment link and send it via WhatsApp after a call closes

```typescript
const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY")!;
const stripeBase = "https://api.stripe.com/v1";

function stripeHeaders() {
  return {
    "Authorization": `Bearer ${STRIPE_SECRET}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

function encodeForm(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function createPaymentLink(priceId: string, quantity = 1): Promise<string> {
  const res = await fetch(`${stripeBase}/payment_links`, {
    method: "POST",
    headers: stripeHeaders(),
    body: encodeForm({
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": String(quantity),
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Stripe error: ${err.error?.message}`);
  }
  const data = await res.json();
  return data.url as string;
}

async function findOrCreateCustomer(phone: string, name: string): Promise<string> {
  // Try to find existing customer by phone
  const searchRes = await fetch(
    `${stripeBase}/customers/search?query=${encodeURIComponent(`phone:'${phone}'`)}`,
    { headers: stripeHeaders() }
  );
  const searchData = await searchRes.json();
  if (searchData.data?.length > 0) {
    return searchData.data[0].id as string;
  }
  // Create new customer
  const createRes = await fetch(`${stripeBase}/customers`, {
    method: "POST",
    headers: stripeHeaders(),
    body: encodeForm({ name, phone, "metadata[source]": "yappr_call" }),
  });
  const customer = await createRes.json();
  return customer.id as string;
}

// Usage in a tool handler:
// const url = await createPaymentLink("price_1ABC123");
// await sendWhatsApp(callerPhone, `Here is your payment link: ${url}`);
```

### Charge a saved card off-session

```typescript
async function chargeOffSession(
  customerId: string,
  paymentMethodId: string,
  amountAgorot: number,
  currency = "ils"
): Promise<{ success: boolean; chargeId?: string; error?: string }> {
  const res = await fetch(`${stripeBase}/payment_intents`, {
    method: "POST",
    headers: stripeHeaders(),
    body: encodeForm({
      amount: String(amountAgorot),
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: "true",
      off_session: "true",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { success: false, error: data.error?.message };
  }
  return { success: data.status === "succeeded", chargeId: data.id };
}
```

---

## Gotchas & Rate Limits

- **Form encoding only**: The `/v1` API uses `application/x-www-form-urlencoded`, not JSON. Nested objects use bracket notation: `line_items[0][price]=...`.
- **Amounts in smallest unit**: ILS uses agorot (1 ILS = 100 agorot). Always multiply by 100 before sending.
- **Phone search requires prior storage**: `GET /customers/search?query=phone:...` only works if you stored the phone number when creating the customer. Stripe does not auto-populate phone from payment methods.
- **Off-session charges require SCA exemptions**: In Europe/Israel, 3DS authentication may block off-session charges unless the PaymentIntent was set up with `setup_future_usage=off_session` originally.
- **Rate limits**: 100 read requests/second, 100 write requests/second per secret key in live mode. Stripe returns HTTP 429 with a `Retry-After` header when exceeded.
- **Idempotency**: Use the `Idempotency-Key` header on POST requests to safely retry without double-charging: `"Idempotency-Key": crypto.randomUUID()`.
- **Webhooks for async events**: Payment link completions and invoice payments are async — use Stripe webhooks (`checkout.session.completed`, `invoice.paid`) rather than polling to confirm payment.
- **Test vs live keys**: `sk_test_` keys hit Stripe's test environment. Card number `4242 4242 4242 4242` always succeeds in test mode.
