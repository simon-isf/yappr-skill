// hubspot.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/hubspot.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface HubSpotContactProperties {
  firstname?: string;
  lastname?: string;
  phone?: string;
  email?: string;
  hs_lead_status?: string;
  notes_last_contacted?: string;
  hs_object_id?: string;
  createdate?: string;
  [key: string]: string | undefined;
}

export interface HubSpotContact {
  id: string;
  properties: HubSpotContactProperties;
}

export interface HubSpotCreateContactParams {
  properties: HubSpotContactProperties;
}

export interface HubSpotUpdateContactParams {
  properties: HubSpotContactProperties;
}

export interface HubSpotSearchFilter {
  propertyName: string;
  operator: "EQ" | "NEQ" | "LT" | "LTE" | "GT" | "GTE" | "CONTAINS_TOKEN" | "NOT_CONTAINS_TOKEN";
  value: string;
}

export interface HubSpotSearchContactsParams {
  filterGroups: Array<{ filters: HubSpotSearchFilter[] }>;
  properties?: string[];
  limit?: number;
  after?: string;
}

export interface HubSpotSearchContactsResponse {
  total: number;
  results: HubSpotContact[];
  paging?: { next?: { after: string; link: string } };
}

export interface HubSpotAssociation {
  to: { id: string };
  types: Array<{
    associationCategory: "HUBSPOT_DEFINED" | "USER_DEFINED";
    associationTypeId: number;
  }>;
}

export interface HubSpotNoteProperties {
  hs_note_body: string;
  hs_timestamp: string; // ISO 8601 with ms: "2026-04-11T10:00:00.000Z"
  hs_object_id?: string;
  [key: string]: string | undefined;
}

export interface HubSpotNote {
  id: string;
  properties: HubSpotNoteProperties;
}

export interface HubSpotCreateNoteParams {
  properties: HubSpotNoteProperties;
  associations?: HubSpotAssociation[];
}

export interface HubSpotDealProperties {
  dealname: string;
  amount?: string;
  dealstage?: string;
  pipeline?: string;
  closedate?: string;
  hs_object_id?: string;
  [key: string]: string | undefined;
}

export interface HubSpotDeal {
  id: string;
  properties: HubSpotDealProperties;
}

export interface HubSpotCreateDealParams {
  properties: HubSpotDealProperties;
  associations?: HubSpotAssociation[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class HubSpotError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`HubSpot ${status}: ${message}`);
    this.name = "HubSpotError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class HubSpotClient {
  readonly baseUrl = "https://api.hubapi.com";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  // POST /crm/v3/objects/contacts/search
  async searchContactsByPhone(
    phone: string,
    properties: string[] = ["firstname", "lastname", "phone", "email", "hs_object_id"],
  ): Promise<HubSpotSearchContactsResponse> {
    return this.searchContacts({
      filterGroups: [
        { filters: [{ propertyName: "phone", operator: "EQ", value: phone }] },
      ],
      properties,
      limit: 1,
    });
  }

  // POST /crm/v3/objects/contacts/search
  async searchContacts(
    params: HubSpotSearchContactsParams,
  ): Promise<HubSpotSearchContactsResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/crm/v3/objects/contacts/search`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new HubSpotError(res.status, await res.text());
    return res.json() as Promise<HubSpotSearchContactsResponse>;
  }

  // POST /crm/v3/objects/contacts
  async createContact(params: HubSpotCreateContactParams): Promise<HubSpotContact> {
    const res = await this.fetchFn(`${this.baseUrl}/crm/v3/objects/contacts`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new HubSpotError(res.status, await res.text());
    return res.json() as Promise<HubSpotContact>;
  }

  // GET /crm/v3/objects/contacts/:id
  async getContact(
    id: string,
    properties: string[] = ["firstname", "lastname", "phone", "email"],
  ): Promise<HubSpotContact> {
    const url = new URL(`${this.baseUrl}/crm/v3/objects/contacts/${id}`);
    url.searchParams.set("properties", properties.join(","));
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new HubSpotError(res.status, await res.text());
    return res.json() as Promise<HubSpotContact>;
  }

  // PATCH /crm/v3/objects/contacts/:id
  async updateContact(id: string, params: HubSpotUpdateContactParams): Promise<HubSpotContact> {
    const res = await this.fetchFn(
      `${this.baseUrl}/crm/v3/objects/contacts/${id}`,
      {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new HubSpotError(res.status, await res.text());
    return res.json() as Promise<HubSpotContact>;
  }

  // POST /crm/v3/objects/notes
  async createNote(params: HubSpotCreateNoteParams): Promise<HubSpotNote> {
    const res = await this.fetchFn(`${this.baseUrl}/crm/v3/objects/notes`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new HubSpotError(res.status, await res.text());
    return res.json() as Promise<HubSpotNote>;
  }

  // POST /crm/v3/objects/deals
  async createDeal(params: HubSpotCreateDealParams): Promise<HubSpotDeal> {
    const res = await this.fetchFn(`${this.baseUrl}/crm/v3/objects/deals`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new HubSpotError(res.status, await res.text());
    return res.json() as Promise<HubSpotDeal>;
  }
}
