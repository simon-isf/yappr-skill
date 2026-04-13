// freshdesk.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/freshdesk.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface FreshdeskContact {
  id: number;
  name: string;
  phone?: string;
  mobile?: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
  active?: boolean;
  company_id?: number;
}

export interface FreshdeskCreateContactParams {
  name: string;
  phone?: string;
  mobile?: string;
  email?: string;
}

export interface FreshdeskUpdateContactParams {
  name?: string;
  phone?: string;
  mobile?: string;
  email?: string;
}

export interface FreshdeskTicket {
  id: number;
  subject: string;
  description?: string;
  status: number;
  priority: number;
  requester_id?: number;
  source?: number;
  type?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface FreshdeskCreateTicketParams {
  subject: string;
  description?: string;
  status: 2 | 3 | 4 | 5;
  priority: 1 | 2 | 3 | 4;
  requester_id?: number;
  email?: string;
  source?: 1 | 2 | 3 | 5;
  type?: string;
  tags?: string[];
}

export interface FreshdeskUpdateTicketParams {
  subject?: string;
  description?: string;
  status?: 2 | 3 | 4 | 5;
  priority?: 1 | 2 | 3 | 4;
  type?: string;
  tags?: string[];
}

export interface FreshdeskNote {
  id: number;
  body: string;
  body_text?: string;
  private: boolean;
  created_at?: string;
  ticket_id?: number;
}

export interface FreshdeskCreateNoteParams {
  body: string;
  private?: boolean;
  notify_emails?: string[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class FreshdeskError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Freshdesk ${status}: ${message}`);
    this.name = "FreshdeskError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class FreshdeskClient {
  readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    private readonly subdomain: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://${subdomain}.freshdesk.com/api/v2`;
  }

  private get headers(): HeadersInit {
    const credentials = btoa(`${this.apiKey}:X`);
    return {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers,
    });
    if (!res.ok) throw new FreshdeskError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // GET /contacts?phone={phone}
  async searchContactsByPhone(phone: string): Promise<FreshdeskContact[]> {
    const url = `${this.baseUrl}/contacts?phone=${encodeURIComponent(phone)}`;
    const res = await this.fetchFn(url, { method: "GET", headers: this.headers });
    if (!res.ok) throw new FreshdeskError(res.status, await res.text());
    return res.json() as Promise<FreshdeskContact[]>;
  }

  // POST /contacts
  async createContact(params: FreshdeskCreateContactParams): Promise<FreshdeskContact> {
    return this.request("/contacts", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // PUT /contacts/{id}
  async updateContact(
    id: number,
    params: FreshdeskUpdateContactParams,
  ): Promise<FreshdeskContact> {
    return this.request(`/contacts/${id}`, {
      method: "PUT",
      body: JSON.stringify(params),
    });
  }

  // POST /tickets
  async createTicket(params: FreshdeskCreateTicketParams): Promise<FreshdeskTicket> {
    return this.request("/tickets", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // GET /tickets/{id}
  async getTicket(id: number): Promise<FreshdeskTicket> {
    return this.request(`/tickets/${id}`);
  }

  // PUT /tickets/{id}
  async updateTicket(id: number, params: FreshdeskUpdateTicketParams): Promise<FreshdeskTicket> {
    return this.request(`/tickets/${id}`, {
      method: "PUT",
      body: JSON.stringify(params),
    });
  }

  // POST /tickets/{id}/notes
  async addNoteToTicket(id: number, params: FreshdeskCreateNoteParams): Promise<FreshdeskNote> {
    return this.request(`/tickets/${id}/notes`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }
}
