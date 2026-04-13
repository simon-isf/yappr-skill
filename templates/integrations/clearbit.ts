// clearbit.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/clearbit.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface ClearbitPersonName {
  fullName?: string;
  givenName?: string;
  familyName?: string;
}

export interface ClearbitPersonEmployment {
  name?: string;
  title?: string;
  role?: string;
  seniority?: string;
}

export interface ClearbitPerson {
  id?: string;
  name?: ClearbitPersonName;
  email?: string;
  location?: string;
  employment?: ClearbitPersonEmployment;
  linkedin?: { handle?: string };
  phone?: string;
  avatar?: string;
}

export interface ClearbitCompanyCategory {
  industry?: string;
  sector?: string;
  industryGroup?: string;
}

export interface ClearbitCompany {
  id?: string;
  name?: string;
  legalName?: string;
  domain?: string;
  description?: string;
  foundedYear?: number;
  location?: string;
  country?: string;
  employees?: number;
  employeesRange?: string;
  estimatedAnnualRevenue?: string;
  tags?: string[];
  category?: ClearbitCompanyCategory;
  linkedin?: { handle?: string };
  facebook?: { handle?: string };
  phone?: string;
  logo?: string;
}

export interface ClearbitCombinedResponse {
  person?: ClearbitPerson;
  company?: ClearbitCompany;
}

export interface ClearbitCompanySuggestion {
  name: string;
  domain: string;
  logo?: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ClearbitError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Clearbit ${status}: ${message}`);
    this.name = "ClearbitError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ClearbitClient {
  readonly baseUrl = "https://api.clearbit.com";

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

  private async request<T>(url: string): Promise<T | null> {
    const res = await this.fetchFn(url, { method: "GET", headers: this.headers });
    if (res.status === 404 || res.status === 202) return null;
    if (!res.ok) throw new ClearbitError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // GET /v2/people/find?email={email}
  async enrichPerson(email: string): Promise<ClearbitPerson | null> {
    const url = `${this.baseUrl}/v2/people/find?email=${encodeURIComponent(email)}`;
    return this.request<ClearbitPerson>(url);
  }

  // GET /v2/companies/find?domain={domain}
  async enrichCompany(domain: string): Promise<ClearbitCompany | null> {
    const url = `${this.baseUrl}/v2/companies/find?domain=${encodeURIComponent(domain)}`;
    return this.request<ClearbitCompany>(url);
  }

  // GET /v2/combined/find?email={email}
  async combinedEnrich(email: string): Promise<ClearbitCombinedResponse | null> {
    const url = `${this.baseUrl}/v2/combined/find?email=${encodeURIComponent(email)}`;
    return this.request<ClearbitCombinedResponse>(url);
  }

  // GET /v1/companies/suggest?name={partial_company_name}
  async companySuggest(name: string): Promise<ClearbitCompanySuggestion[]> {
    const url = `${this.baseUrl}/v1/companies/suggest?name=${encodeURIComponent(name)}`;
    const res = await this.fetchFn(url, { method: "GET", headers: this.headers });
    if (!res.ok) throw new ClearbitError(res.status, await res.text());
    return res.json() as Promise<ClearbitCompanySuggestion[]>;
  }

  // GET /v2/people/find?ip={ip_address}
  async enrichPersonByIp(ip: string): Promise<ClearbitPerson | null> {
    const url = `${this.baseUrl}/v2/people/find?ip=${encodeURIComponent(ip)}`;
    return this.request<ClearbitPerson>(url);
  }
}
