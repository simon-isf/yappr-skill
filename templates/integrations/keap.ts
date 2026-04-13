// keap.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/keap.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface KeapEmailAddress {
  email: string;
  field: "EMAIL1" | "EMAIL2" | "EMAIL3";
}

export interface KeapPhoneNumber {
  number: string;
  type?: "MOBILE" | "WORK" | "HOME" | "OTHER";
  field?: "PHONE1" | "PHONE2" | "PHONE3" | "PHONE4" | "PHONE5";
}

export interface KeapCustomField {
  id: string;
  content: string | number | boolean;
}

export interface KeapContact {
  id: number;
  given_name?: string;
  family_name?: string;
  email_addresses?: KeapEmailAddress[];
  phone_numbers?: KeapPhoneNumber[];
  tag_ids?: number[];
}

export interface KeapCreateContactParams {
  given_name?: string;
  family_name?: string;
  email_addresses?: KeapEmailAddress[];
  phone_numbers?: KeapPhoneNumber[];
  tag_ids?: number[];
}

export interface KeapUpdateContactParams {
  given_name?: string;
  family_name?: string;
  email_addresses?: KeapEmailAddress[];
  phone_numbers?: KeapPhoneNumber[];
  custom_fields?: KeapCustomField[];
}

export interface KeapSearchContactsResponse {
  contacts: KeapContact[];
  count: number;
  next: string | null;
}

export interface KeapTagCategory {
  id: number;
  name: string;
}

export interface KeapTag {
  id: number;
  name: string;
  description?: string;
  category?: KeapTagCategory;
}

export interface KeapListTagsResponse {
  tags: KeapTag[];
  count: number;
}

export interface KeapApplyTagsParams {
  tag_ids: number[];
}

export type KeapApplyTagsResponse = Array<{ tag_id: number }>;

export interface KeapNote {
  id: string;
  body: string;
  title: string;
  type: "CALL" | "EMAIL" | "FAX" | "LETTER" | "OTHER";
  contact_id: number;
  date_created: string;
}

export interface KeapCreateNoteParams {
  body: string;
  title: string;
  type: "CALL" | "EMAIL" | "FAX" | "LETTER" | "OTHER";
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class KeapError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Keap ${status}: ${message}`);
    this.name = "KeapError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class KeapClient {
  readonly baseUrl = "https://api.infusionsoft.com/crm/rest/v2";
  // v1 used for phone-based contact search (better phone filter support)
  readonly baseUrlV1 = "https://api.infusionsoft.com/crm/rest/v1";

  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  // POST /contacts
  async createContact(params: KeapCreateContactParams): Promise<KeapContact> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new KeapError(res.status, await res.text());
    return res.json() as Promise<KeapContact>;
  }

  // PATCH /contacts/{id}
  async updateContact(
    id: number,
    params: KeapUpdateContactParams,
  ): Promise<KeapContact> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts/${id}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new KeapError(res.status, await res.text());
    return res.json() as Promise<KeapContact>;
  }

  // GET /v1/contacts?phone=...&limit=1
  // Uses v1 base URL — better phone filter support than v2
  async searchContactsByPhone(
    phone: string,
    limit = 1,
  ): Promise<KeapSearchContactsResponse> {
    const url = new URL(`${this.baseUrlV1}/contacts`);
    url.searchParams.set("phone", phone);
    url.searchParams.set("limit", String(limit));
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new KeapError(res.status, await res.text());
    return res.json() as Promise<KeapSearchContactsResponse>;
  }

  // GET /tags?limit=200
  async listTags(limit = 200): Promise<KeapListTagsResponse> {
    const url = new URL(`${this.baseUrl}/tags`);
    url.searchParams.set("limit", String(limit));
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new KeapError(res.status, await res.text());
    return res.json() as Promise<KeapListTagsResponse>;
  }

  // POST /contacts/{id}/tags
  async applyTags(
    contactId: number,
    params: KeapApplyTagsParams,
  ): Promise<KeapApplyTagsResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/contacts/${contactId}/tags`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new KeapError(res.status, await res.text());
    return res.json() as Promise<KeapApplyTagsResponse>;
  }

  // POST /contacts/{id}/notes
  async createNote(
    contactId: number,
    params: KeapCreateNoteParams,
  ): Promise<KeapNote> {
    const res = await this.fetchFn(
      `${this.baseUrl}/contacts/${contactId}/notes`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new KeapError(res.status, await res.text());
    return res.json() as Promise<KeapNote>;
  }
}
