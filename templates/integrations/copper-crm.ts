// copper-crm.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/copper-crm.md

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CopperEmail {
  email: string;
  category: string;
}

export interface CopperPhoneNumber {
  number: string;
  category: string;
}

export interface CopperPerson {
  id: number;
  name: string;
  emails: CopperEmail[];
  phone_numbers: CopperPhoneNumber[];
  title?: string;
  company_name?: string;
  assignee_id?: number;
  tags?: string[];
  custom_fields?: CopperCustomField[];
  [key: string]: unknown;
}

export interface CopperCustomField {
  custom_field_definition_id: number;
  value: unknown;
}

export interface CopperSearchPeopleParams {
  phone_number?: string;
  name?: string;
  email?: string;
  page_size?: number;
  page_number?: number;
}

export interface CopperUpdatePersonParams {
  name?: string;
  emails?: CopperEmail[];
  phone_numbers?: CopperPhoneNumber[];
  title?: string;
  company_name?: string;
  tags?: string[];
  custom_fields?: CopperCustomField[];
  [key: string]: unknown;
}

export interface CopperCreateOpportunityParams {
  name: string;
  primary_contact_id?: number;
  status?: string;
  pipeline_id?: number;
  pipeline_stage_id?: number;
  monetary_value?: number;
  close_date?: number;
  assignee_id?: number;
  [key: string]: unknown;
}

export interface CopperOpportunity {
  id: number;
  name: string;
  status: string;
  pipeline_id?: number;
  pipeline_stage_id?: number;
  monetary_value?: number;
  [key: string]: unknown;
}

export type CopperActivityParentType =
  | "lead"
  | "person"
  | "company"
  | "opportunity"
  | "project"
  | "task";

export interface CopperActivityParent {
  type: CopperActivityParentType;
  id: number;
}

export interface CopperActivityType {
  id: number;
  category: string;
  name?: string;
  is_disabled?: boolean;
  count_as_interaction?: boolean;
}

export interface CopperLogActivityParams {
  parent: CopperActivityParent;
  type: {
    category: string;
    id: number;
  };
  details: string;
  activity_date?: number;
}

export interface CopperActivity {
  id: number;
  type: CopperActivityType;
  parent: CopperActivityParent;
  details: string;
  activity_date: number;
  date_created: number;
}

export interface CopperActivityTypesResponse {
  user: CopperActivityType[];
  system?: CopperActivityType[];
}

export interface CopperPipeline {
  id: number;
  name: string;
  stages?: CopperPipelineStage[];
  [key: string]: unknown;
}

export interface CopperPipelineStage {
  id: number;
  name: string;
  pipeline_id: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class CopperError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Copper ${status}: ${message}`);
    this.name = "CopperError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class CopperClient {
  readonly baseUrl = "https://api.copper.com/developer_api/v1";

  constructor(
    private readonly apiKey: string,
    private readonly userEmail: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "X-PW-AccessToken": this.apiKey,
      "X-PW-Application": "developer_api",
      "X-PW-UserEmail": this.userEmail,
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
    if (!res.ok) throw new CopperError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  /** Search for People (contacts) by phone, name, or email. */
  async searchPeople(params: CopperSearchPeopleParams): Promise<CopperPerson[]> {
    return this.request<CopperPerson[]>("POST", "/people/search", params);
  }

  /** Get a full Person record by ID. */
  async getPerson(id: number): Promise<CopperPerson> {
    return this.request<CopperPerson>("GET", `/people/${id}`);
  }

  /** Update a Person's fields, tags, or custom fields. */
  async updatePerson(id: number, params: CopperUpdatePersonParams): Promise<CopperPerson> {
    return this.request<CopperPerson>("PATCH", `/people/${id}`, params);
  }

  /** Create a new Opportunity and optionally link it to a primary contact. */
  async createOpportunity(params: CopperCreateOpportunityParams): Promise<CopperOpportunity> {
    return this.request<CopperOpportunity>("POST", "/opportunities", params);
  }

  /** Log a call (or any user activity) against a parent object. */
  async logActivity(params: CopperLogActivityParams): Promise<CopperActivity> {
    return this.request<CopperActivity>("POST", "/activities", params);
  }

  /** Fetch all activity types including their account-specific numeric IDs. */
  async listActivityTypes(): Promise<CopperActivityTypesResponse> {
    return this.request<CopperActivityTypesResponse>("GET", "/activity_types");
  }

  /** Fetch all pipelines (use to look up pipeline_id and pipeline_stage_id). */
  async listPipelines(): Promise<CopperPipeline[]> {
    return this.request<CopperPipeline[]>("GET", "/pipelines");
  }
}
