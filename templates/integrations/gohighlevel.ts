// gohighlevel.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/gohighlevel.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface GHLCustomField {
  id: string;
  value: string;
}

export interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  locationId?: string;
}

export interface GHLContactResponse {
  contact: GHLContact;
}

export interface GHLSearchContactsResponse {
  contacts: GHLContact[];
  total: number;
}

export interface GHLCreateContactParams {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  customFields?: GHLCustomField[];
}

export interface GHLNote {
  id: string;
  body: string;
  contactId: string;
  dateAdded: string;
}

export interface GHLNoteResponse {
  note: GHLNote;
}

export interface GHLAddNoteParams {
  body: string;
  userId?: string;
}

export interface GHLPipelineStage {
  id: string;
  name: string;
}

export interface GHLPipeline {
  id: string;
  name: string;
  stages: GHLPipelineStage[];
}

export interface GHLPipelinesResponse {
  pipelines: GHLPipeline[];
}

export interface GHLOpportunity {
  id: string;
  name: string;
  status: string;
  pipelineId: string;
  pipelineStageId: string;
  contactId: string;
  monetaryValue?: number;
}

export interface GHLOpportunityResponse {
  opportunity: GHLOpportunity;
}

export interface GHLCreateOpportunityParams {
  pipelineId: string;
  pipelineStageId: string;
  contactId: string;
  name: string;
  status?: string;
  monetaryValue?: number;
}

export interface GHLUpdateOpportunityParams {
  pipelineStageId?: string;
  status?: string;
  monetaryValue?: number;
  name?: string;
}

export interface GHLCustomFieldDefinition {
  id: string;
  name: string;
  dataType: string;
}

export interface GHLCustomFieldsResponse {
  customFields: GHLCustomFieldDefinition[];
}

export interface GHLWorkflowSubscribeParams {
  contactId: string;
}

export interface GHLWorkflowSubscribeResponse {
  success: boolean;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GHLError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`GHL ${status}: ${message}`);
    this.name = "GHLError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GHLClient {
  readonly baseUrl = "https://services.leadconnectorhq.com";

  constructor(
    private readonly accessToken: string,
    private readonly locationId: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.accessToken}`,
      "Version": "2021-07-28",
      "Content-Type": "application/json",
    };
  }

  // GET /contacts/search?locationId=...&query=...
  async searchContactsByPhone(phone: string): Promise<GHLSearchContactsResponse> {
    const url = new URL(`${this.baseUrl}/contacts/search`);
    url.searchParams.set("locationId", this.locationId);
    url.searchParams.set("query", phone);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new GHLError(res.status, await res.text());
    return res.json() as Promise<GHLSearchContactsResponse>;
  }

  // POST /contacts/
  async createContact(params: GHLCreateContactParams): Promise<GHLContact> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts/`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ locationId: this.locationId, ...params }),
    });
    if (!res.ok) throw new GHLError(res.status, await res.text());
    const data = (await res.json()) as GHLContactResponse;
    return data.contact;
  }

  // POST /contacts/{contactId}/notes
  async addContactNote(contactId: string, params: GHLAddNoteParams): Promise<GHLNote> {
    const res = await this.fetchFn(
      `${this.baseUrl}/contacts/${contactId}/notes`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new GHLError(res.status, await res.text());
    const data = (await res.json()) as GHLNoteResponse;
    return data.note;
  }

  // GET /opportunities/pipelines?locationId=...
  async getPipelines(): Promise<GHLPipeline[]> {
    const url = new URL(`${this.baseUrl}/opportunities/pipelines`);
    url.searchParams.set("locationId", this.locationId);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new GHLError(res.status, await res.text());
    const data = (await res.json()) as GHLPipelinesResponse;
    return data.pipelines;
  }

  // POST /opportunities/
  async createOpportunity(params: GHLCreateOpportunityParams): Promise<GHLOpportunity> {
    const res = await this.fetchFn(`${this.baseUrl}/opportunities/`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ locationId: this.locationId, ...params }),
    });
    if (!res.ok) throw new GHLError(res.status, await res.text());
    const data = (await res.json()) as GHLOpportunityResponse;
    return data.opportunity;
  }

  // PUT /opportunities/{opportunityId}
  async updateOpportunity(
    opportunityId: string,
    params: GHLUpdateOpportunityParams,
  ): Promise<GHLOpportunity> {
    const res = await this.fetchFn(
      `${this.baseUrl}/opportunities/${opportunityId}`,
      {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new GHLError(res.status, await res.text());
    const data = (await res.json()) as GHLOpportunityResponse;
    return data.opportunity;
  }

  // GET /custom-fields?locationId=...
  async getCustomFields(): Promise<GHLCustomFieldDefinition[]> {
    const url = new URL(`${this.baseUrl}/custom-fields`);
    url.searchParams.set("locationId", this.locationId);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new GHLError(res.status, await res.text());
    const data = (await res.json()) as GHLCustomFieldsResponse;
    return data.customFields;
  }

  // POST /workflows/{workflowId}/subscribe
  async enrollInWorkflow(
    workflowId: string,
    contactId: string,
  ): Promise<GHLWorkflowSubscribeResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/workflows/${workflowId}/subscribe`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ contactId, locationId: this.locationId }),
      },
    );
    if (!res.ok) throw new GHLError(res.status, await res.text());
    return res.json() as Promise<GHLWorkflowSubscribeResponse>;
  }
}
