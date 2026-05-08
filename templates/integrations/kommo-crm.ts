// kommo-crm.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/kommo-crm.md

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface KommoCustomFieldValue {
  value: string | number | boolean;
  enum_code?: string;
  enum_id?: number;
}

export interface KommoCustomField {
  field_code?: string;
  field_id?: number;
  values: KommoCustomFieldValue[];
}

export interface KommoEmbeddedContacts {
  contacts: Array<{ id: number; [key: string]: unknown }>;
}

export interface KommoContact {
  id: number;
  name: string;
  created_at?: number;
  custom_fields_values?: KommoCustomField[];
  _embedded?: {
    leads?: Array<{ id: number }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface KommoCreateContactParams {
  name: string;
  custom_fields_values?: KommoCustomField[];
  [key: string]: unknown;
}

export interface KommoContactsResponse {
  _embedded: {
    contacts: KommoContact[];
  };
}

export interface KommoLead {
  id: number;
  name: string;
  status_id?: number;
  pipeline_id?: number;
  price?: number;
  responsible_user_id?: number;
  [key: string]: unknown;
}

export interface KommoCreateLeadParams {
  name: string;
  pipeline_id?: number;
  status_id?: number;
  price?: number;
  responsible_user_id?: number;
  _embedded?: {
    contacts?: Array<{ id: number }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface KommoUpdateLeadParams {
  id: number;
  status_id?: number;
  price?: number;
  responsible_user_id?: number;
  [key: string]: unknown;
}

export interface KommoLeadsResponse {
  _embedded: {
    leads: KommoLead[];
  };
}

export interface KommoComplexLeadContact {
  name: string;
  custom_fields_values?: KommoCustomField[];
  [key: string]: unknown;
}

export interface KommoComplexLeadParams {
  name: string;
  pipeline_id?: number;
  status_id?: number;
  price?: number;
  responsible_user_id?: number;
  _embedded?: {
    contacts?: KommoComplexLeadContact[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface KommoComplexLeadResponse {
  _embedded: {
    leads: KommoLead[];
    contacts?: KommoContact[];
  };
}

export type KommoNoteType = "common" | "call_in" | "call_out";

export interface KommoNoteCommonParams {
  note_type: "common";
  params: { text: string };
}

export interface KommoNoteCallParams {
  note_type: "call_in" | "call_out";
  params: {
    uniq: string;
    duration: number;
    source: string;
    phone: string;
    link?: string;
  };
}

export type KommoNoteParams = KommoNoteCommonParams | KommoNoteCallParams;

export interface KommoNote {
  id: number;
  note_type: KommoNoteType;
  created_at?: number;
  [key: string]: unknown;
}

export interface KommoNotesResponse {
  _embedded: {
    notes: KommoNote[];
  };
}

export interface KommoPipelineStatus {
  id: number;
  name: string;
  sort: number;
}

export interface KommoPipeline {
  id: number;
  name: string;
  _embedded: {
    statuses: KommoPipelineStatus[];
  };
}

export interface KommoPipelinesResponse {
  _embedded: {
    pipelines: KommoPipeline[];
  };
}

export interface KommoTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

export interface KommoExchangeTokenParams {
  client_id: string;
  client_secret: string;
  grant_type: "authorization_code" | "refresh_token";
  code?: string;
  refresh_token?: string;
  redirect_uri: string;
}

export interface KommoSearchContactsParams {
  query: string;
  with?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class KommoError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Kommo ${status}: ${message}`);
    this.name = "KommoError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class KommoClient {
  readonly baseUrl: string;

  constructor(
    private readonly subdomain: string,
    private readonly accessToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://${subdomain}.kommo.com/api/v4`;
  }

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new KommoError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  /** Exchange authorization_code or refresh_token for an access/refresh token pair. */
  async exchangeToken(params: KommoExchangeTokenParams): Promise<KommoTokenResponse> {
    const url = `https://${this.subdomain}.kommo.com/oauth2/access_token`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new KommoError(res.status, await res.text());
    return res.json() as Promise<KommoTokenResponse>;
  }

  /** List all pipelines and their stages. Fetch once and cache IDs. */
  async listPipelines(): Promise<KommoPipelinesResponse> {
    return this.request<KommoPipelinesResponse>("GET", "/pipelines");
  }

  /**
   * Search contacts by phone or any query string.
   * Use `with=leads` to include associated leads in the response.
   */
  async searchContacts(params: KommoSearchContactsParams): Promise<KommoContactsResponse> {
    const url = new URL(`${this.baseUrl}/contacts`);
    url.searchParams.set("query", params.query);
    if (params.with) url.searchParams.set("with", params.with);
    if (params.page !== undefined) url.searchParams.set("page", String(params.page));
    if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new KommoError(res.status, await res.text());
    return res.json() as Promise<KommoContactsResponse>;
  }

  /** Create one or more contacts. Body is always an array. */
  async createContacts(contacts: KommoCreateContactParams[]): Promise<KommoContactsResponse> {
    return this.request<KommoContactsResponse>("POST", "/contacts", contacts);
  }

  /** Create one or more leads. Body is always an array. */
  async createLeads(leads: KommoCreateLeadParams[]): Promise<KommoLeadsResponse> {
    return this.request<KommoLeadsResponse>("POST", "/leads", leads);
  }

  /**
   * Update one or more leads (e.g. change status_id).
   * Pass up to 50 objects in the array.
   * Use status_id 142 = Won, 143 = Lost (Kommo global constants).
   */
  async updateLeads(leads: KommoUpdateLeadParams[]): Promise<KommoLeadsResponse> {
    return this.request<KommoLeadsResponse>("PATCH", "/leads", leads);
  }

  /**
   * Create a lead together with its contact (and optionally company) in one call.
   * Useful post-call when you have all caller details.
   */
  async createComplexLead(leads: KommoComplexLeadParams[]): Promise<KommoComplexLeadResponse> {
    return this.request<KommoComplexLeadResponse>("POST", "/leads/complex", leads);
  }

  /**
   * Add one or more notes to a lead.
   * Use note_type "call_in" / "call_out" for call-log notes,
   * or "common" for a plain text note.
   */
  async addLeadNotes(leadId: number, notes: KommoNoteParams[]): Promise<KommoNotesResponse> {
    return this.request<KommoNotesResponse>("POST", `/leads/${leadId}/notes`, notes);
  }
}
