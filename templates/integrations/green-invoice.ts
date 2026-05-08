// green-invoice.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/green-invoice.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface GreenInvoiceTokenResponse {
  token: string;
  expires: number; // Unix timestamp (seconds)
}

export interface GreenInvoiceClientAddress {
  city?: string;
  street?: string;
  zip?: string;
}

export interface GreenInvoiceClientRecord {
  id: string;
  name: string;
  taxId?: string;
  selfEmployed?: boolean;
  phone?: string;
  email?: string;
  address?: GreenInvoiceClientAddress;
}

export interface GreenInvoiceSearchClientsResponse {
  items: GreenInvoiceClientRecord[];
  total: number;
  page: number;
}

export interface GreenInvoiceCreateClientParams {
  name: string;
  taxId?: string;
  selfEmployed?: boolean;
  phone?: string;
  email?: string;
  address?: GreenInvoiceClientAddress;
}

export interface GreenInvoiceIncomeItem {
  description: string;
  quantity: number;
  price: number;
  currency?: string;
  vatType?: 0 | 1 | 2; // 0=exempt, 1=VAT included, 2=VAT added on top
}

/** Document type values:
 * 100 = Price Quote (הצעת מחיר)
 * 305 = Tax Invoice (חשבונית מס)
 * 320 = Receipt (קבלה)
 * 400 = Proforma / Invoice+Receipt combined (חשבון עסקה)
 */
export type GreenInvoiceDocType = 100 | 305 | 320 | 400;

export interface GreenInvoiceCreateDocParams {
  description: string;
  type: GreenInvoiceDocType;
  lang?: "he" | "en";
  currency?: string;
  client: { id: string };
  income: GreenInvoiceIncomeItem[];
}

export interface GreenInvoiceDocRecord {
  id: string;
  number: number;
  type: GreenInvoiceDocType;
  status: number;
  url?: string;
  sum?: number;
  currency?: string;
}

export interface GreenInvoiceListDocumentsResponse {
  items: GreenInvoiceDocRecord[];
  total: number;
}

export interface GreenInvoiceSendDocumentParams {
  email: string;
}

export interface GreenInvoiceSendDocumentResponse {
  success: boolean;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GreenInvoiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`GreenInvoice ${status}: ${message}`);
    this.name = "GreenInvoiceError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const BASE = "https://api.greeninvoice.co.il/api/v1";

export class GreenInvoiceClient {
  private token: string | null = null;
  private tokenExpiresAt: number = 0; // Date.now() ms

  constructor(
    private readonly apiId: string,
    private readonly apiSecret: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  async getToken(): Promise<string> {
    const now = Date.now();
    // Refresh if no token or within 60 s of expiry
    if (this.token && this.tokenExpiresAt - now > 60_000) {
      return this.token;
    }
    const res = await this.fetchFn(`${BASE}/account/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: this.apiId, secret: this.apiSecret }),
    });
    if (!res.ok) {
      throw new GreenInvoiceError(res.status, await res.text());
    }
    const data = (await res.json()) as GreenInvoiceTokenResponse;
    this.token = data.token;
    // Cache using Date.now() + 29 min (slightly under 30 min server lifetime)
    this.tokenExpiresAt = Date.now() + 29 * 60_000;
    return this.token!;
  }

  private async authHeaders(): Promise<HeadersInit> {
    const token = await this.getToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers = await this.authHeaders();
    const res = await this.fetchFn(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new GreenInvoiceError(res.status, await res.text());
    }
    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------------

  // GET /clients?search={query}
  async searchClients(query: string): Promise<GreenInvoiceSearchClientsResponse> {
    const headers = await this.authHeaders();
    const url = `${BASE}/clients?search=${encodeURIComponent(query)}`;
    const res = await this.fetchFn(url, { method: "GET", headers });
    if (!res.ok) throw new GreenInvoiceError(res.status, await res.text());
    return res.json() as Promise<GreenInvoiceSearchClientsResponse>;
  }

  // POST /clients
  async createClient(
    params: GreenInvoiceCreateClientParams,
  ): Promise<GreenInvoiceClientRecord> {
    return this.request<GreenInvoiceClientRecord>("POST", "/clients", params);
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  // POST /documents
  async createDocument(
    params: GreenInvoiceCreateDocParams,
  ): Promise<GreenInvoiceDocRecord> {
    return this.request<GreenInvoiceDocRecord>("POST", "/documents", params);
  }

  // GET /documents?clientId={clientId}
  async listDocuments(clientId: string): Promise<GreenInvoiceListDocumentsResponse> {
    const headers = await this.authHeaders();
    const url = `${BASE}/documents?clientId=${encodeURIComponent(clientId)}`;
    const res = await this.fetchFn(url, { method: "GET", headers });
    if (!res.ok) throw new GreenInvoiceError(res.status, await res.text());
    return res.json() as Promise<GreenInvoiceListDocumentsResponse>;
  }

  // POST /documents/{id}/send
  async sendDocument(
    documentId: string,
    params: GreenInvoiceSendDocumentParams,
  ): Promise<GreenInvoiceSendDocumentResponse> {
    return this.request<GreenInvoiceSendDocumentResponse>(
      "POST",
      `/documents/${documentId}/send`,
      params,
    );
  }
}
