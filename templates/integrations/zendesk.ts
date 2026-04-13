// zendesk.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/zendesk.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface ZendeskUser {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  external_id?: string;
  created_at?: string;
  updated_at?: string;
  active?: boolean;
}

export interface ZendeskUserSearchResponse {
  users: ZendeskUser[];
  count: number;
}

export interface ZendeskCreateUserParams {
  name: string;
  phone?: string;
  email?: string;
  role?: string;
  external_id?: string;
}

export interface ZendeskUpsertUserParams {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  external_id?: string;
}

export interface ZendeskComment {
  body: string;
  public?: boolean;
}

export type ZendeskTicketStatus = "new" | "open" | "pending" | "solved" | "closed";
export type ZendeskTicketPriority = "low" | "normal" | "high" | "urgent";

export interface ZendeskTicket {
  id: number;
  subject: string;
  status: ZendeskTicketStatus;
  priority?: ZendeskTicketPriority;
  requester_id?: number;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  comment?: ZendeskComment;
}

export interface ZendeskCreateTicketParams {
  subject: string;
  comment: ZendeskComment;
  requester_id?: number;
  priority?: ZendeskTicketPriority;
  status?: ZendeskTicketStatus;
  tags?: string[];
}

export interface ZendeskUpdateTicketParams {
  status?: ZendeskTicketStatus;
  priority?: ZendeskTicketPriority;
  comment?: ZendeskComment;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ZendeskError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Zendesk ${status}: ${message}`);
    this.name = "ZendeskError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ZendeskClient {
  readonly baseUrl: string;

  constructor(
    subdomain: string,
    private readonly email: string,
    private readonly apiToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://${subdomain}.zendesk.com/api/v2`;
  }

  private get headers(): HeadersInit {
    return {
      "Authorization": `Basic ${btoa(`${this.email}/token:${this.apiToken}`)}`,
      "Content-Type": "application/json",
    };
  }

  // GET /users/search?phone={phone}
  async findUserByPhone(phone: string): Promise<ZendeskUserSearchResponse> {
    const url = `${this.baseUrl}/users/search?phone=${encodeURIComponent(phone)}`;
    const res = await this.fetchFn(url, { method: "GET", headers: this.headers });
    if (!res.ok) throw new ZendeskError(res.status, await res.text());
    return res.json() as Promise<ZendeskUserSearchResponse>;
  }

  // POST /users
  async createUser(params: ZendeskCreateUserParams): Promise<ZendeskUser> {
    const res = await this.fetchFn(`${this.baseUrl}/users`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ user: params }),
    });
    if (!res.ok) throw new ZendeskError(res.status, await res.text());
    const data = await res.json() as { user: ZendeskUser };
    return data.user;
  }

  // POST /users/create_or_update
  async upsertUser(params: ZendeskUpsertUserParams): Promise<ZendeskUser> {
    const res = await this.fetchFn(`${this.baseUrl}/users/create_or_update`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ user: params }),
    });
    if (!res.ok) throw new ZendeskError(res.status, await res.text());
    const data = await res.json() as { user: ZendeskUser };
    return data.user;
  }

  // POST /tickets
  async createTicket(params: ZendeskCreateTicketParams): Promise<ZendeskTicket> {
    const res = await this.fetchFn(`${this.baseUrl}/tickets`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ ticket: params }),
    });
    if (!res.ok) throw new ZendeskError(res.status, await res.text());
    const data = await res.json() as { ticket: ZendeskTicket };
    return data.ticket;
  }

  // PUT /tickets/{id}
  async updateTicket(id: number, params: ZendeskUpdateTicketParams): Promise<ZendeskTicket> {
    const res = await this.fetchFn(`${this.baseUrl}/tickets/${id}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({ ticket: params }),
    });
    if (!res.ok) throw new ZendeskError(res.status, await res.text());
    const data = await res.json() as { ticket: ZendeskTicket };
    return data.ticket;
  }

  // PUT /tickets/{id} with comment only (add internal note / call summary)
  async addTicketComment(
    id: number,
    body: string,
    isPublic = false,
  ): Promise<ZendeskTicket> {
    return this.updateTicket(id, { comment: { body, public: isPublic } });
  }
}
