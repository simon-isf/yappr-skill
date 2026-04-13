// apollo-io.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/apollo-io.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface ApolloOrganization {
  name?: string;
  website_url?: string;
  industry?: string;
  num_employees_range?: string;
}

export interface ApolloPhoneNumber {
  raw_number: string;
  type?: string;
}

export interface ApolloPerson {
  id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  city?: string;
  country?: string;
  organization?: ApolloOrganization;
  phone_numbers?: ApolloPhoneNumber[];
}

export interface ApolloMatchPersonParams {
  phone_numbers?: string[];
  email?: string;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
}

export interface ApolloMatchPersonResponse {
  person: ApolloPerson | null;
}

export interface ApolloContactStage {
  id: string;
  name: string;
}

export interface ApolloContact {
  id: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  label_names?: string[];
  contact_stage?: ApolloContactStage;
}

export interface ApolloCreateContactParams {
  first_name: string;
  last_name: string;
  title?: string;
  organization_name?: string;
  email?: string;
  direct_phone?: string;
  label_names?: string[];
}

export interface ApolloUpdateContactParams {
  first_name?: string;
  last_name?: string;
  title?: string;
  organization_name?: string;
  email?: string;
  direct_phone?: string;
  label_names?: string[];
}

export interface ApolloListContactStagesResponse {
  contact_stages: ApolloContactStage[];
}

export interface ApolloUpdateContactStagesParams {
  contact_ids: string[];
  contact_stage_id: string;
}

export interface ApolloUpdateContactStagesResponse {
  contacts: Array<{
    id: string;
    contact_stage: ApolloContactStage;
  }>;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApolloError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Apollo ${status}: ${message}`);
    this.name = "ApolloError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ApolloClient {
  readonly baseUrl = "https://api.apollo.io/api/v1";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  // POST /people/match
  async matchPerson(params: ApolloMatchPersonParams): Promise<ApolloMatchPersonResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/people/match`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new ApolloError(res.status, await res.text());
    return res.json() as Promise<ApolloMatchPersonResponse>;
  }

  // POST /contacts
  async createContact(params: ApolloCreateContactParams): Promise<{ contact: ApolloContact }> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new ApolloError(res.status, await res.text());
    return res.json() as Promise<{ contact: ApolloContact }>;
  }

  // PATCH /contacts/{id}
  async updateContact(
    id: string,
    params: ApolloUpdateContactParams,
  ): Promise<{ contact: ApolloContact }> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts/${id}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new ApolloError(res.status, await res.text());
    return res.json() as Promise<{ contact: ApolloContact }>;
  }

  // GET /contact_stages
  async listContactStages(): Promise<ApolloListContactStagesResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/contact_stages`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new ApolloError(res.status, await res.text());
    return res.json() as Promise<ApolloListContactStagesResponse>;
  }

  // POST /contacts/update_stages
  async updateContactStages(
    params: ApolloUpdateContactStagesParams,
  ): Promise<ApolloUpdateContactStagesResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts/update_stages`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new ApolloError(res.status, await res.text());
    return res.json() as Promise<ApolloUpdateContactStagesResponse>;
  }
}
