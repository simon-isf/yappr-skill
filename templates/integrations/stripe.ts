// Stripe API client — form-encoded v1 endpoints
// Auth: Bearer token (secret key). All amounts in smallest currency unit (agorot for ILS).

export class StripeError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Stripe ${status}: ${message}`);
    this.name = "StripeError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StripePaymentLink {
  id: string;
  object: "payment_link";
  active: boolean;
  url: string;
  line_items: {
    data: Array<{
      id: string;
      price: { id: string; unit_amount: number; currency: string };
      quantity: number;
    }>;
  };
  after_completion: { type: string };
}

export interface StripeCustomer {
  id: string;
  object: "customer";
  name: string;
  phone: string;
  email: string;
  created: number;
}

export interface StripeCustomerSearchResult {
  object: "search_result";
  data: StripeCustomer[];
  has_more: boolean;
}

export interface StripePaymentIntent {
  id: string;
  object: "payment_intent";
  amount: number;
  currency: string;
  status: string;
  customer: string;
  payment_method: string;
}

export interface StripeInvoice {
  id: string;
  object: "invoice";
  customer: string;
  status: string;
  collection_method: string;
  days_until_due: number | null;
  description: string | null;
  hosted_invoice_url: string | null;
}

export interface StripeInvoiceItem {
  id: string;
  object: "invoiceitem";
  customer: string;
  invoice: string;
  amount: number;
  currency: string;
  description: string;
}

export interface StripeCheckoutSessionList {
  object: "list";
  data: Array<{
    id: string;
    payment_status: string;
    customer_details: { email: string; phone: string } | null;
  }>;
  has_more: boolean;
}

export interface CreatePaymentLinkParams {
  lineItems: Array<{ price: string; quantity?: number }>;
  /** Optional: idempotency key to prevent duplicate links */
  idempotencyKey?: string;
}

export interface CreateCustomerParams {
  name: string;
  phone: string;
  email?: string;
  metadata?: Record<string, string>;
}

export interface CreatePaymentIntentParams {
  /** Amount in smallest currency unit (e.g. agorot for ILS) */
  amount: number;
  currency: string;
  customerId: string;
  paymentMethodId: string;
  /** @default true */
  offSession?: boolean;
  idempotencyKey?: string;
}

export interface CreateInvoiceParams {
  customerId: string;
  /** @default "send_invoice" */
  collectionMethod?: "send_invoice" | "charge_automatically";
  /** Days until payment is due (for send_invoice) */
  daysUntilDue?: number;
  description?: string;
}

export interface AddInvoiceItemParams {
  customerId: string;
  invoiceId: string;
  /** Amount in smallest currency unit */
  amount: number;
  currency: string;
  description?: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class StripeClient {
  readonly baseUrl = "https://api.stripe.com/v1";

  constructor(
    private readonly secretKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  private headersWithIdempotency(key?: string): HeadersInit {
    const h: Record<string, string> = {
      "Authorization": `Bearer ${this.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (key) h["Idempotency-Key"] = key;
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: this.headersWithIdempotency(idempotencyKey),
      body: body?.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new StripeError(res.status, data.error?.message ?? JSON.stringify(data));
    }
    return data as T;
  }

  /** POST /v1/payment_links — Create a hosted payment link */
  async createPaymentLink(params: CreatePaymentLinkParams): Promise<StripePaymentLink> {
    const body = new URLSearchParams();
    params.lineItems.forEach((item, i) => {
      body.set(`line_items[${i}][price]`, item.price);
      body.set(`line_items[${i}][quantity]`, String(item.quantity ?? 1));
    });
    return this.request<StripePaymentLink>(
      "POST",
      "/payment_links",
      body,
      params.idempotencyKey,
    );
  }

  /** GET /v1/payment_links/:id — Get a payment link (check active status) */
  async getPaymentLink(id: string): Promise<StripePaymentLink> {
    return this.request<StripePaymentLink>("GET", `/payment_links/${id}`);
  }

  /** GET /v1/checkout/sessions?payment_link=... — List sessions for a payment link */
  async listCheckoutSessions(paymentLinkId: string): Promise<StripeCheckoutSessionList> {
    return this.request<StripeCheckoutSessionList>(
      "GET",
      `/checkout/sessions?payment_link=${encodeURIComponent(paymentLinkId)}`,
    );
  }

  /** POST /v1/customers — Create a customer */
  async createCustomer(params: CreateCustomerParams): Promise<StripeCustomer> {
    const body = new URLSearchParams();
    body.set("name", params.name);
    body.set("phone", params.phone);
    if (params.email) body.set("email", params.email);
    if (params.metadata) {
      for (const [k, v] of Object.entries(params.metadata)) {
        body.set(`metadata[${k}]`, v);
      }
    }
    return this.request<StripeCustomer>("POST", "/customers", body);
  }

  /** GET /v1/customers/search?query=phone:'...' — Find customer by phone */
  async searchCustomersByPhone(phone: string): Promise<StripeCustomerSearchResult> {
    const query = encodeURIComponent(`phone:'${phone}'`);
    return this.request<StripeCustomerSearchResult>(
      "GET",
      `/customers/search?query=${query}`,
    );
  }

  /**
   * Find customer by phone; create if not found.
   * Returns customer id.
   */
  async findOrCreateCustomer(
    phone: string,
    name: string,
    email?: string,
  ): Promise<string> {
    const result = await this.searchCustomersByPhone(phone);
    if (result.data.length > 0) return result.data[0].id;
    const customer = await this.createCustomer({
      name,
      phone,
      email,
      metadata: { source: "yappr_call" },
    });
    return customer.id;
  }

  /** POST /v1/payment_intents — Charge a saved card off-session */
  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<StripePaymentIntent> {
    const body = new URLSearchParams();
    body.set("amount", String(params.amount));
    body.set("currency", params.currency);
    body.set("customer", params.customerId);
    body.set("payment_method", params.paymentMethodId);
    body.set("confirm", "true");
    body.set("off_session", String(params.offSession ?? true));
    return this.request<StripePaymentIntent>(
      "POST",
      "/payment_intents",
      body,
      params.idempotencyKey,
    );
  }

  /** POST /v1/invoices — Create a B2B invoice */
  async createInvoice(params: CreateInvoiceParams): Promise<StripeInvoice> {
    const body = new URLSearchParams();
    body.set("customer", params.customerId);
    body.set("collection_method", params.collectionMethod ?? "send_invoice");
    if (params.daysUntilDue !== undefined) {
      body.set("days_until_due", String(params.daysUntilDue));
    }
    if (params.description) body.set("description", params.description);
    return this.request<StripeInvoice>("POST", "/invoices", body);
  }

  /** POST /v1/invoiceitems — Add a line item to an invoice */
  async addInvoiceItem(params: AddInvoiceItemParams): Promise<StripeInvoiceItem> {
    const body = new URLSearchParams();
    body.set("customer", params.customerId);
    body.set("invoice", params.invoiceId);
    body.set("amount", String(params.amount));
    body.set("currency", params.currency);
    if (params.description) body.set("description", params.description);
    return this.request<StripeInvoiceItem>("POST", "/invoiceitems", body);
  }

  /** POST /v1/invoices/:id/finalize — Finalize a draft invoice */
  async finalizeInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.request<StripeInvoice>("POST", `/invoices/${invoiceId}/finalize`);
  }

  /** POST /v1/invoices/:id/send — Email the finalized invoice to the customer */
  async sendInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.request<StripeInvoice>("POST", `/invoices/${invoiceId}/send`);
  }
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Verify a Stripe webhook signature using the `Stripe-Signature` header.
 * Returns true if valid, throws if tampered/expired.
 *
 * @param rawBody   Raw request body as string (do NOT parse first)
 * @param signature Value of the `Stripe-Signature` header
 * @param secret    Webhook endpoint secret (whsec_...)
 */
export async function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  // Parse timestamp and v1 signatures from header
  // Header format: t=1234567890,v1=abc...,v1=def...
  const parts = Object.fromEntries(
    signature.split(",").map((p) => {
      const idx = p.indexOf("=");
      return [p.slice(0, idx), p.slice(idx + 1)];
    }),
  );

  const timestamp = parts["t"];
  const expectedHex = parts["v1"];
  if (!timestamp || !expectedHex) {
    throw new Error("Invalid Stripe-Signature header format");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();

  // Derive HMAC key from the webhook secret
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    keyMaterial,
    encoder.encode(signedPayload),
  );

  // Convert computed signature to hex
  const computedHex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  if (computedHex.length !== expectedHex.length) {
    throw new Error("Stripe signature mismatch");
  }
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  if (diff !== 0) {
    throw new Error("Stripe signature mismatch");
  }

  return true;
}
