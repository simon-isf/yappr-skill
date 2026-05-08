// woocommerce.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/woocommerce.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface WooCommerceBillingAddress {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
}

export interface WooCommerceShippingAddress {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface WooCommerceCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  billing: WooCommerceBillingAddress;
  shipping?: WooCommerceShippingAddress;
  orders_count: number;
  total_spent: string;
  avatar_url?: string;
  meta_data?: Array<{ id: number; key: string; value: unknown }>;
}

export interface WooCommerceCreateCustomerParams {
  email: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  billing?: WooCommerceBillingAddress;
  shipping?: WooCommerceShippingAddress;
}

export interface WooCommerceLineItem {
  id: number;
  name: string;
  quantity: number;
  subtotal: string;
  sku?: string;
}

export interface WooCommerceShippingLine {
  method_title: string;
  total: string;
}

export interface WooCommerceOrder {
  id: number;
  status: string;
  date_created: string;
  total: string;
  currency: string;
  billing: WooCommerceBillingAddress;
  line_items: WooCommerceLineItem[];
  shipping_lines?: WooCommerceShippingLine[];
  customer_note?: string;
  meta_data?: Array<{ id: number; key: string; value: unknown }>;
  payment_method?: string;
  transaction_id?: string;
  date_paid?: string;
}

export interface WooCommerceUpdateOrderParams {
  status?: string;
  customer_note?: string;
}

export interface WooCommerceOrderNote {
  id: number;
  author: string;
  date_created: string;
  note: string;
  customer_note: boolean;
}

export interface WooCommerceAddOrderNoteParams {
  note: string;
  customer_note?: boolean;
  added_by_user?: boolean;
}

export interface WooCommerceListOrdersParams {
  customer?: number;
  status?: string;
  per_page?: number;
  page?: number;
  orderby?: string;
  order?: "asc" | "desc";
  search?: string;
}

export interface WooCommerceSearchCustomersParams {
  search?: string;
  per_page?: number;
  page?: number;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class WooCommerceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`WooCommerce ${status}: ${message}`);
    this.name = "WooCommerceError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class WooCommerceClient {
  readonly baseUrl: string;

  constructor(
    storeDomain: string,
    private readonly consumerKey: string,
    private readonly consumerSecret: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://${storeDomain}/wp-json/wc/v3`;
  }

  private get headers(): HeadersInit {
    return {
      "Authorization": `Basic ${btoa(`${this.consumerKey}:${this.consumerSecret}`)}`,
      "Content-Type": "application/json",
    };
  }

  // GET /customers?search={term}&per_page={n}
  async searchCustomers(params: WooCommerceSearchCustomersParams = {}): Promise<WooCommerceCustomer[]> {
    const url = new URL(`${this.baseUrl}/customers`);
    if (params.search !== undefined) url.searchParams.set("search", params.search);
    if (params.per_page !== undefined) url.searchParams.set("per_page", String(params.per_page));
    if (params.page !== undefined) url.searchParams.set("page", String(params.page));
    const res = await this.fetchFn(url.toString(), { method: "GET", headers: this.headers });
    if (!res.ok) throw new WooCommerceError(res.status, await res.text());
    return res.json() as Promise<WooCommerceCustomer[]>;
  }

  // GET /customers/{id}
  async getCustomer(id: number): Promise<WooCommerceCustomer> {
    const res = await this.fetchFn(`${this.baseUrl}/customers/${id}`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new WooCommerceError(res.status, await res.text());
    return res.json() as Promise<WooCommerceCustomer>;
  }

  // POST /customers
  async createCustomer(params: WooCommerceCreateCustomerParams): Promise<WooCommerceCustomer> {
    const res = await this.fetchFn(`${this.baseUrl}/customers`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new WooCommerceError(res.status, await res.text());
    return res.json() as Promise<WooCommerceCustomer>;
  }

  // GET /orders?customer={id}&status={status}&per_page={n}&orderby=date&order=desc
  async listOrders(params: WooCommerceListOrdersParams = {}): Promise<WooCommerceOrder[]> {
    const url = new URL(`${this.baseUrl}/orders`);
    if (params.customer !== undefined) url.searchParams.set("customer", String(params.customer));
    if (params.status !== undefined) url.searchParams.set("status", params.status);
    if (params.per_page !== undefined) url.searchParams.set("per_page", String(params.per_page));
    if (params.page !== undefined) url.searchParams.set("page", String(params.page));
    if (params.orderby !== undefined) url.searchParams.set("orderby", params.orderby);
    if (params.order !== undefined) url.searchParams.set("order", params.order);
    if (params.search !== undefined) url.searchParams.set("search", params.search);
    const res = await this.fetchFn(url.toString(), { method: "GET", headers: this.headers });
    if (!res.ok) throw new WooCommerceError(res.status, await res.text());
    return res.json() as Promise<WooCommerceOrder[]>;
  }

  // GET /orders/{id}
  async getOrder(id: number): Promise<WooCommerceOrder> {
    const res = await this.fetchFn(`${this.baseUrl}/orders/${id}`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new WooCommerceError(res.status, await res.text());
    return res.json() as Promise<WooCommerceOrder>;
  }

  // PUT /orders/{id}
  async updateOrder(id: number, params: WooCommerceUpdateOrderParams): Promise<WooCommerceOrder> {
    const res = await this.fetchFn(`${this.baseUrl}/orders/${id}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new WooCommerceError(res.status, await res.text());
    return res.json() as Promise<WooCommerceOrder>;
  }

  // POST /orders/{id}/notes
  async addOrderNote(id: number, params: WooCommerceAddOrderNoteParams): Promise<WooCommerceOrderNote> {
    const res = await this.fetchFn(`${this.baseUrl}/orders/${id}/notes`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new WooCommerceError(res.status, await res.text());
    return res.json() as Promise<WooCommerceOrderNote>;
  }
}
