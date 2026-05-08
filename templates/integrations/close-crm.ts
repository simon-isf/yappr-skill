// close-crm.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/close-crm.md

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ClosePhone {
  phone: string;
  type: string;
}

export interface CloseEmail {
  email: string;
  type: string;
}

export interface CloseContact {
  id: string;
  name: string;
  phones?: ClosePhone[];
  emails?: CloseEmail[];
  [key: string]: unknown;
}

export interface CloseLead {
  id: string;
  name?: string;
  display_name?: string;
  status_id?: string;
  contacts?: CloseContact[];
  [key: string]: unknown;
}

export interface CloseLeadSearchResponse {
  data: CloseLead[];
  has_more: boolean;
  cursor?: string;
}

export interface CloseCreateLeadParams {
  name: string;
  status_id?: string;
  contacts?: Array<{
    name: string;
    phones?: ClosePhone[];
    emails?: CloseEmail[];
  }>;
  [key: string]: unknown;
}

export interface CloseUpdateLeadParams {
  status_id?: string;
  name?: string;
  [key: string]: unknown;
}

export type CloseCallDirection = "outbound" | "inbound";
export type CloseCallStatus = "answered" | "no_answer" | "voicemail" | "busy" | "failed";

export interface CloseLogCallParams {
  lead_id: string;
  contact_id?: string;
  direction: CloseCallDirection;
  duration: number;
  status: CloseCallStatus;
  note?: string;
  phone?: string;
  created_by?: string;
}

export interface CloseCallActivity {
  id: string;
  lead_id: string;
  contact_id?: string;
  direction: CloseCallDirection;
  duration: number;
  status: CloseCallStatus;
  note?: string;
  date_created: string;
  [key: string]: unknown;
}

export interface CloseLeadStatus {
  id: string;
  label: string;
  type: string;
}

export interface CloseLeadStatusesResponse {
  data: CloseLeadStatus[];
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class CloseError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Close ${status}: ${message}`);
    this.name = "CloseError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class CloseClient {
  readonly baseUrl = "https://api.close.com/api/v1";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Basic ${btoa(`${this.apiKey}:`)}`,
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
    if (!res.ok) throw new CloseError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  /**
   * Search for leads by phone number.
   * Close query language: `phone:+972501234567`
   * Optionally restrict fields with `_fields`.
   */
  async searchLeadsByPhone(
    phone: string,
    fields = "id,display_name,status_id,contacts",
  ): Promise<CloseLeadSearchResponse> {
    const query = encodeURIComponent(`phone:${phone}`);
    return this.request<CloseLeadSearchResponse>(
      "GET",
      `/lead/?query=${query}&_fields=${encodeURIComponent(fields)}`,
    );
  }

  /** Create a new lead, optionally with embedded contacts. */
  async createLead(params: CloseCreateLeadParams): Promise<CloseLead> {
    return this.request<CloseLead>("POST", "/lead/", params);
  }

  /** Update a lead — typically used to change status after a call. */
  async updateLead(id: string, params: CloseUpdateLeadParams): Promise<CloseLead> {
    return this.request<CloseLead>("PATCH", `/lead/${id}/`, params);
  }

  /** Log a call activity against a lead. Duration is in seconds. */
  async logCall(params: CloseLogCallParams): Promise<CloseCallActivity> {
    return this.request<CloseCallActivity>("POST", "/activity/call/", params);
  }

  /** List all lead statuses for the account. Cache and map by label. */
  async listLeadStatuses(): Promise<CloseLeadStatusesResponse> {
    return this.request<CloseLeadStatusesResponse>("GET", "/status/lead/");
  }
}
