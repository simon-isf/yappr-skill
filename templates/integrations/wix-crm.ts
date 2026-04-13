// wix-crm.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/wix-crm.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface WixContactName {
  first?: string;
  last?: string;
}

export interface WixContactEmailItem {
  tag?: string;
  email?: string;
  primary?: boolean;
}

export interface WixContactPhoneItem {
  tag?: string;
  phone?: string;
  primary?: boolean;
}

export interface WixExtendedFieldItem {
  key: string;
  value: string;
}

export interface WixContactInfo {
  name?: WixContactName;
  emails?: { items?: WixContactEmailItem[] };
  phones?: { items?: WixContactPhoneItem[] };
  labelKeys?: { items?: string[] };
  extendedFields?: { items?: WixExtendedFieldItem[] };
}

export interface WixContact {
  id: string;
  revision?: string;
  info?: WixContactInfo;
  primaryInfo?: { email?: string; phone?: string };
  createdDate?: string;
  updatedDate?: string;
}

export interface WixQueryContactsParams {
  query: {
    filter: Record<string, unknown>;
    fieldsets?: string[];
    paging?: { limit?: number; offset?: number };
  };
}

export interface WixQueryContactsResponse {
  contacts: WixContact[];
  pagingMetadata?: { count: number; total: number };
}

export interface WixCreateContactParams {
  info: WixContactInfo;
}

export interface WixCreateContactResponse {
  contact: WixContact;
}

export interface WixUpdateContactParams {
  info: WixContactInfo;
  revision: string;
}

export interface WixLabelContactParams {
  labelKeys: string[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class WixCrmError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`WixCRM ${status}: ${message}`);
    this.name = "WixCrmError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class WixCrmClient {
  readonly baseUrl = "https://www.wixapis.com/contacts/v4";

  constructor(
    private readonly apiKey: string,
    private readonly siteId: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": this.apiKey,
      "wix-site-id": this.siteId,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers,
    });
    if (!res.ok) throw new WixCrmError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // POST /contacts/query
  async queryContacts(params: WixQueryContactsParams): Promise<WixQueryContactsResponse> {
    return this.request("/contacts/query", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // GET /contacts/{contactId}?fieldsets=FULL
  async getContact(contactId: string, fieldsets = "FULL"): Promise<WixContact> {
    return this.request(`/contacts/${contactId}?fieldsets=${fieldsets}`);
  }

  // POST /contacts
  async createContact(params: WixCreateContactParams): Promise<WixCreateContactResponse> {
    return this.request("/contacts", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // PATCH /contacts/{contactId}
  async updateContact(contactId: string, params: WixUpdateContactParams): Promise<WixContact> {
    return this.request(`/contacts/${contactId}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
  }

  // POST /contacts/{contactId}/labels
  async labelContact(contactId: string, params: WixLabelContactParams): Promise<WixContact> {
    return this.request(`/contacts/${contactId}/labels`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }
}
