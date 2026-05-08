// intercom.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/intercom.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface IntercomContact {
  type: "contact";
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: "user" | "lead";
}

export interface IntercomSearchContactsResponse {
  type: "list";
  total_count: number;
  data: IntercomContact[];
}

export interface IntercomSearchContactsParams {
  query: {
    field: string;
    operator: string;
    value: string;
  };
  pagination?: {
    per_page?: number;
    starting_after?: string;
  };
}

export interface IntercomCreateContactParams {
  role: "user" | "lead";
  name?: string;
  phone?: string;
  email?: string;
}

export interface IntercomUpdateContactParams {
  name?: string;
  phone?: string;
  email?: string;
  custom_attributes?: Record<string, string | number | boolean>;
}

export interface IntercomNote {
  type: "note";
  id: string;
  created_at: number;
  body: string;
  author: {
    type: "admin";
    id: string;
    name?: string;
  };
  contact: {
    type: "contact";
    id: string;
  };
}

export interface IntercomCreateNoteParams {
  body: string;
  admin_id: string;
}

export interface IntercomTag {
  type: "tag";
  id: string;
  name: string;
}

export interface IntercomListTagsResponse {
  type: "list";
  data: IntercomTag[];
}

export interface IntercomTagContactParams {
  id: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class IntercomError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Intercom ${status}: ${message}`);
    this.name = "IntercomError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class IntercomClient {
  readonly baseUrl = "https://api.intercom.io";

  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "Intercom-Version": "2.14",
    };
  }

  // POST /contacts/search
  async searchContactsByPhone(
    phone: string,
    perPage = 1,
  ): Promise<IntercomSearchContactsResponse> {
    return this.searchContacts({
      query: { field: "phone", operator: "=", value: phone },
      pagination: { per_page: perPage },
    });
  }

  // POST /contacts/search
  async searchContacts(
    params: IntercomSearchContactsParams,
  ): Promise<IntercomSearchContactsResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts/search`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new IntercomError(res.status, await res.text());
    return res.json() as Promise<IntercomSearchContactsResponse>;
  }

  // POST /contacts
  async createContact(params: IntercomCreateContactParams): Promise<IntercomContact> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new IntercomError(res.status, await res.text());
    return res.json() as Promise<IntercomContact>;
  }

  // PATCH /contacts/{id}
  async updateContact(
    id: string,
    params: IntercomUpdateContactParams,
  ): Promise<IntercomContact> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts/${id}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new IntercomError(res.status, await res.text());
    return res.json() as Promise<IntercomContact>;
  }

  // POST /contacts/{id}/notes
  async createNote(
    contactId: string,
    params: IntercomCreateNoteParams,
  ): Promise<IntercomNote> {
    const res = await this.fetchFn(
      `${this.baseUrl}/contacts/${contactId}/notes`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new IntercomError(res.status, await res.text());
    return res.json() as Promise<IntercomNote>;
  }

  // GET /tags
  async listTags(): Promise<IntercomListTagsResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/tags`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new IntercomError(res.status, await res.text());
    return res.json() as Promise<IntercomListTagsResponse>;
  }

  // POST /contacts/{id}/tags
  async tagContact(
    contactId: string,
    params: IntercomTagContactParams,
  ): Promise<IntercomTag> {
    const res = await this.fetchFn(
      `${this.baseUrl}/contacts/${contactId}/tags`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new IntercomError(res.status, await res.text());
    return res.json() as Promise<IntercomTag>;
  }
}
