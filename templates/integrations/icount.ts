// icount.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/icount.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface ICountLoginResponse {
  status: boolean;
  sid: string;
  user_id: string;
  lang: string;
}

export interface ICountClient {
  client_id: string;
  client_name: string;
  email?: string;
  phone?: string;
  vat_id?: string;
  address?: string;
}

export interface ICountSearchClientsResponse {
  status: boolean;
  clients: ICountClient[];
}

export interface ICountSaveClientParams {
  client_name: string;
  email?: string;
  phone?: string;
  address?: string;
  client_id?: string; // include to update existing
}

export interface ICountSaveClientResponse {
  status: boolean;
  client_id: string;
}

export interface ICountListClientsParams {
  page?: number;
  results_per_page?: number;
}

export interface ICountListClientsResponse {
  status: boolean;
  clients: ICountClient[];
}

export type ICountDoctype =
  | "invoice"
  | "invrec"
  | "receipt"
  | "offer"
  | "order"
  | "delivery";

export type ICountVatType = 0 | 1 | 2;

export interface ICountDocItem {
  description: string;
  quantity: number;
  unitprice: number;
  vat_type: ICountVatType;
}

export interface ICountSaveDocParams {
  doctype: ICountDoctype;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  description?: string;
  items: ICountDocItem[];
  send_email?: boolean;
}

export interface ICountSaveDocResponse {
  status: boolean;
  doc_id: string;
  doc_url: string;
  pdf_url: string;
}

export interface ICountDoc {
  doc_id: string;
  doctype: ICountDoctype;
  client_name: string;
  total: number;
  vat: number;
  doc_status: string;
  created_at: string;
}

export interface ICountGetDocResponse {
  status: boolean;
  doc: ICountDoc;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ICountError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errorCode?: string,
  ) {
    super(`ICount ${status}: ${message}`);
    this.name = "ICountError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const BASE = "https://api.icount.co.il/api/v3.php";

export class ICountClient {
  private sessionId: string | null = null;

  constructor(
    private readonly companyId: string,
    private readonly username: string,
    private readonly password: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  private async getSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const res = await this.fetchFn(`${BASE}?path=login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cid: this.companyId,
        user: this.username,
        pass: this.password,
      }),
    });
    const data = (await res.json()) as ICountLoginResponse & {
      error_code?: string;
      error_message?: string;
    };
    if (!data.status || !data.sid) {
      throw new ICountError(401, data.error_message ?? "Login failed", data.error_code);
    }
    this.sessionId = data.sid;
    return this.sessionId!;
  }

  /** Invalidate the cached session so the next call will re-authenticate. */
  invalidateSession(): void {
    this.sessionId = null;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const sid = await this.getSession();
    const res = await this.fetchFn(`${BASE}?path=${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid, ...body }),
    });
    const data = (await res.json()) as T & {
      status: boolean;
      error_code?: string;
      error_message?: string;
    };
    if (!(data as { status: boolean }).status) {
      // sid_invalid → invalidate cache so caller can retry
      if ((data as { error_code?: string }).error_code === "sid_invalid") {
        this.invalidateSession();
      }
      throw new ICountError(
        res.status,
        (data as { error_message?: string }).error_message ?? "API error",
        (data as { error_code?: string }).error_code,
      );
    }
    return data;
  }

  // ---------------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------------

  // POST /api/v3.php?path=client/search
  async searchClientsByPhone(phone: string): Promise<ICountSearchClientsResponse> {
    return this.post<ICountSearchClientsResponse>("client/search", { phone });
  }

  // POST /api/v3.php?path=client/save
  async saveClient(params: ICountSaveClientParams): Promise<ICountSaveClientResponse> {
    return this.post<ICountSaveClientResponse>("client/save", params as unknown as Record<string, unknown>);
  }

  // POST /api/v3.php?path=client/list
  async listClients(params: ICountListClientsParams = {}): Promise<ICountListClientsResponse> {
    return this.post<ICountListClientsResponse>("client/list", {
      page: params.page ?? 1,
      results_per_page: params.results_per_page ?? 50,
    });
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  // POST /api/v3.php?path=doc/save
  async saveDoc(params: ICountSaveDocParams): Promise<ICountSaveDocResponse> {
    return this.post<ICountSaveDocResponse>("doc/save", params as unknown as Record<string, unknown>);
  }

  // POST /api/v3.php?path=doc/get
  async getDoc(docId: string): Promise<ICountGetDocResponse> {
    return this.post<ICountGetDocResponse>("doc/get", { doc_id: docId });
  }
}
