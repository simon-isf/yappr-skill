// pipedrive.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/pipedrive.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface PipedrivePhoneEntry {
  value: string;
  primary?: boolean;
  label?: "mobile" | "work" | "home" | "other" | string;
}

export interface PipedriveEmailEntry {
  value: string;
  primary?: boolean;
  label?: "work" | "home" | "other" | string;
}

export interface PipedrivePerson {
  id: number;
  name: string;
  phone: PipedrivePhoneEntry[];
  email?: PipedriveEmailEntry[];
  add_time?: string;
}

export interface PipedrivePersonResponse {
  success: boolean;
  data: PipedrivePerson;
}

export interface PipedriveCreatePersonParams {
  name: string;
  phone?: PipedrivePhoneEntry[];
  email?: PipedriveEmailEntry[];
  [key: string]: unknown;
}

export interface PipedriveUpdatePersonParams {
  name?: string;
  phone?: PipedrivePhoneEntry[];
  email?: PipedriveEmailEntry[];
  [key: string]: unknown;
}

export interface PipedriveSearchItem {
  result_score: number;
  item: {
    id: number;
    type: string;
    name: string;
    phones: string[];
    emails: string[];
  };
}

export interface PipedriveSearchPersonsResponse {
  success: boolean;
  data: {
    items: PipedriveSearchItem[];
  };
}

export interface PipedriveDeal {
  id: number;
  title: string;
  stage_id: number;
  status: string;
  person_id: { name: string; value: number } | null;
  expected_close_date?: string;
}

export interface PipedriveDealResponse {
  success: boolean;
  data: PipedriveDeal;
}

export interface PipedriveCreateDealParams {
  title: string;
  person_id?: number;
  stage_id?: number;
  status?: "open" | "won" | "lost" | "deleted";
  expected_close_date?: string; // "YYYY-MM-DD"
  [key: string]: unknown;
}

export interface PipedriveUpdateDealParams {
  stage_id?: number;
  status?: "open" | "won" | "lost" | "deleted";
  title?: string;
  [key: string]: unknown;
}

export interface PipedriveActivity {
  id: number;
  subject: string;
  type: string;
  due_date: string;
  done: boolean;
}

export interface PipedriveActivityResponse {
  success: boolean;
  data: PipedriveActivity;
}

export interface PipedriveCreateActivityParams {
  subject: string;
  type: string; // "call" | "meeting" | "task" | "deadline" | "email" | "lunch"
  due_date?: string; // "YYYY-MM-DD"
  due_time?: string; // "HH:MM"
  duration?: string; // "HH:MM"
  person_id?: number;
  deal_id?: number;
  note?: string;
  assigned_to_user_id?: number;
  [key: string]: unknown;
}

export interface PipedriveNote {
  id: number;
  content: string;
  deal_id?: number;
  person_id?: number;
}

export interface PipedriveNoteResponse {
  success: boolean;
  data: PipedriveNote;
}

export interface PipedriveCreateNoteParams {
  content: string;
  deal_id?: number;
  person_id?: number;
  pinned_to_deal_flag?: boolean;
  [key: string]: unknown;
}

export interface PipedriveStage {
  id: number;
  name: string;
  pipeline_id: number;
  order_nr: number;
}

export interface PipedriveStagesResponse {
  success: boolean;
  data: PipedriveStage[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PipedriveError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Pipedrive ${status}: ${message}`);
    this.name = "PipedriveError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class PipedriveClient {
  readonly baseUrl: string;

  constructor(
    private readonly subdomain: string,
    private readonly apiToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://${subdomain}.pipedrive.com/v1`;
  }

  private qs(extra?: Record<string, string>): string {
    const params = new URLSearchParams({ api_token: this.apiToken });
    if (extra) {
      for (const [k, v] of Object.entries(extra)) params.set(k, v);
    }
    return params.toString();
  }

  private get jsonHeaders(): HeadersInit {
    return { "Content-Type": "application/json" };
  }

  // GET /v1/persons/search?term=...&fields=phone&exact_match=true
  async searchPersonsByPhone(phone: string): Promise<PipedriveSearchPersonsResponse> {
    const url =
      `${this.baseUrl}/persons/search?${this.qs({
        term: phone,
        fields: "phone",
        exact_match: "true",
      })}`;
    const res = await this.fetchFn(url, { method: "GET" });
    if (!res.ok) throw new PipedriveError(res.status, await res.text());
    return res.json() as Promise<PipedriveSearchPersonsResponse>;
  }

  // POST /v1/persons
  async createPerson(params: PipedriveCreatePersonParams): Promise<PipedrivePersonResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/persons?${this.qs()}`, {
      method: "POST",
      headers: this.jsonHeaders,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new PipedriveError(res.status, await res.text());
    return res.json() as Promise<PipedrivePersonResponse>;
  }

  // PATCH /v1/persons/:id
  async updatePerson(
    id: number,
    params: PipedriveUpdatePersonParams,
  ): Promise<PipedrivePersonResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/persons/${id}?${this.qs()}`, {
      method: "PATCH",
      headers: this.jsonHeaders,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new PipedriveError(res.status, await res.text());
    return res.json() as Promise<PipedrivePersonResponse>;
  }

  // POST /v1/deals
  async createDeal(params: PipedriveCreateDealParams): Promise<PipedriveDealResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/deals?${this.qs()}`, {
      method: "POST",
      headers: this.jsonHeaders,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new PipedriveError(res.status, await res.text());
    return res.json() as Promise<PipedriveDealResponse>;
  }

  // PATCH /v1/deals/:id
  async updateDeal(
    id: number,
    params: PipedriveUpdateDealParams,
  ): Promise<PipedriveDealResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/deals/${id}?${this.qs()}`, {
      method: "PATCH",
      headers: this.jsonHeaders,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new PipedriveError(res.status, await res.text());
    return res.json() as Promise<PipedriveDealResponse>;
  }

  // POST /v1/activities
  async createActivity(
    params: PipedriveCreateActivityParams,
  ): Promise<PipedriveActivityResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/activities?${this.qs()}`, {
      method: "POST",
      headers: this.jsonHeaders,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new PipedriveError(res.status, await res.text());
    return res.json() as Promise<PipedriveActivityResponse>;
  }

  // POST /v1/notes
  async createNote(params: PipedriveCreateNoteParams): Promise<PipedriveNoteResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/notes?${this.qs()}`, {
      method: "POST",
      headers: this.jsonHeaders,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new PipedriveError(res.status, await res.text());
    return res.json() as Promise<PipedriveNoteResponse>;
  }

  // GET /v1/stages?pipeline_id=...
  async getStages(pipelineId?: number): Promise<PipedriveStagesResponse> {
    const extra: Record<string, string> = {};
    if (pipelineId !== undefined) extra.pipeline_id = String(pipelineId);
    const res = await this.fetchFn(`${this.baseUrl}/stages?${this.qs(extra)}`, {
      method: "GET",
    });
    if (!res.ok) throw new PipedriveError(res.status, await res.text());
    return res.json() as Promise<PipedriveStagesResponse>;
  }
}
