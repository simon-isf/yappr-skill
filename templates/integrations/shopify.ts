// shopify.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/shopify.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface ShopifyCustomer {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  orders_count: number;
  total_spent: string;
  note?: string | null;
  tags?: string;
  default_address?: {
    address1?: string;
    city?: string;
    country?: string;
  };
}

export interface ShopifyCustomerSearchResponse {
  customers: ShopifyCustomer[];
}

export interface ShopifyCustomerResponse {
  customer: ShopifyCustomer;
}

export interface ShopifyUpdateCustomerParams {
  note?: string;
  tags?: string;
  [key: string]: unknown;
}

export interface ShopifyLineItem {
  name: string;
  quantity: number;
  price: string;
}

export interface ShopifyOrder {
  id: number;
  created_at: string;
  total_price: string;
  financial_status: string;
  fulfillment_status: string | null;
  note?: string | null;
  customer?: Partial<ShopifyCustomer>;
  line_items: ShopifyLineItem[];
}

export interface ShopifyOrdersResponse {
  orders: ShopifyOrder[];
}

export interface ShopifyOrderResponse {
  order: ShopifyOrder;
}

export interface ShopifyUpdateOrderParams {
  note?: string;
  [key: string]: unknown;
}

export interface ShopifyWebhook {
  id: number;
  topic: string;
  address: string;
  format: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifyWebhookResponse {
  webhook: ShopifyWebhook;
}

export interface ShopifyCreateWebhookParams {
  topic: string;
  address: string;
  format?: string;
}

export interface ShopifyDraftOrderLineItem {
  variant_id: number;
  quantity: number;
}

export interface ShopifyDraftOrder {
  id: number;
  status: string;
  invoice_url: string;
  created_at: string;
  note?: string | null;
  customer?: Partial<ShopifyCustomer>;
  line_items: ShopifyDraftOrderLineItem[];
}

export interface ShopifyDraftOrderResponse {
  draft_order: ShopifyDraftOrder;
}

export interface ShopifyCreateDraftOrderParams {
  line_items: ShopifyDraftOrderLineItem[];
  customer?: { id: number };
  note?: string;
}

export interface ShopifyListOrdersParams {
  customer_id?: number;
  status?: string;
  created_at_min?: string;
  limit?: number;
  fields?: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ShopifyError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Shopify ${status}: ${message}`);
    this.name = "ShopifyError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ShopifyClient {
  readonly baseUrl: string;

  constructor(
    storeDomain: string,
    private readonly accessToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://${storeDomain}.myshopify.com/admin/api/2024-01`;
  }

  private get headers(): HeadersInit {
    return {
      "X-Shopify-Access-Token": this.accessToken,
      "Content-Type": "application/json",
    };
  }

  // GET /customers/search.json?query=phone:{phone}&fields=...
  async searchCustomersByPhone(
    phone: string,
    fields = "id,first_name,last_name,phone,email,orders_count,total_spent",
  ): Promise<ShopifyCustomerSearchResponse> {
    const url = new URL(`${this.baseUrl}/customers/search.json`);
    url.searchParams.set("query", `phone:${phone}`);
    url.searchParams.set("fields", fields);
    const res = await this.fetchFn(url.toString(), { method: "GET", headers: this.headers });
    if (!res.ok) throw new ShopifyError(res.status, await res.text());
    return res.json() as Promise<ShopifyCustomerSearchResponse>;
  }

  // GET /customers/{customer_id}.json
  async getCustomer(customerId: number): Promise<ShopifyCustomerResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/customers/${customerId}.json`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new ShopifyError(res.status, await res.text());
    return res.json() as Promise<ShopifyCustomerResponse>;
  }

  // PUT /customers/{customer_id}.json
  async updateCustomer(
    customerId: number,
    params: ShopifyUpdateCustomerParams,
  ): Promise<ShopifyCustomerResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/customers/${customerId}.json`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({ customer: { id: customerId, ...params } }),
    });
    if (!res.ok) throw new ShopifyError(res.status, await res.text());
    return res.json() as Promise<ShopifyCustomerResponse>;
  }

  // GET /orders.json?customer_id={id}&status=any&limit={n}&fields=...
  async listOrders(params: ShopifyListOrdersParams = {}): Promise<ShopifyOrdersResponse> {
    const url = new URL(`${this.baseUrl}/orders.json`);
    if (params.customer_id !== undefined) url.searchParams.set("customer_id", String(params.customer_id));
    if (params.status !== undefined) url.searchParams.set("status", params.status);
    if (params.created_at_min !== undefined) url.searchParams.set("created_at_min", params.created_at_min);
    if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
    if (params.fields !== undefined) url.searchParams.set("fields", params.fields);
    const res = await this.fetchFn(url.toString(), { method: "GET", headers: this.headers });
    if (!res.ok) throw new ShopifyError(res.status, await res.text());
    return res.json() as Promise<ShopifyOrdersResponse>;
  }

  // PUT /orders/{order_id}.json — add/update note
  async updateOrder(
    orderId: number,
    params: ShopifyUpdateOrderParams,
  ): Promise<ShopifyOrderResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/orders/${orderId}.json`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({ order: { id: orderId, ...params } }),
    });
    if (!res.ok) throw new ShopifyError(res.status, await res.text());
    return res.json() as Promise<ShopifyOrderResponse>;
  }

  // POST /webhooks.json
  async createWebhook(params: ShopifyCreateWebhookParams): Promise<ShopifyWebhookResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/webhooks.json`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ webhook: { format: "json", ...params } }),
    });
    if (!res.ok) throw new ShopifyError(res.status, await res.text());
    return res.json() as Promise<ShopifyWebhookResponse>;
  }

  // POST /draft_orders.json
  async createDraftOrder(params: ShopifyCreateDraftOrderParams): Promise<ShopifyDraftOrderResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/draft_orders.json`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ draft_order: params }),
    });
    if (!res.ok) throw new ShopifyError(res.status, await res.text());
    return res.json() as Promise<ShopifyDraftOrderResponse>;
  }
}
