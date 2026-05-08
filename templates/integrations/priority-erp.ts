// priority-erp.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/priority-erp.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface PriorityPhonebookEntry {
  CUSTNAME?: string;
  NAME?: string;
  PHONE?: string;
  EMAIL?: string;
}

export interface PriorityPhonebookResponse {
  value: PriorityPhonebookEntry[];
}

export interface PriorityCustomer {
  CUSTNAME: string;
  CUSTDES?: string;
  PHONE?: string;
  EMAIL?: string;
  ADDRESS?: string;
  CITY?: string;
  BALANCE?: number;
  WTAX?: string;
}

export interface PriorityLead {
  LEADNUM?: number;
  LEADDES?: string;
  CELLPHONE?: string;
  EMAIL?: string;
  DETAILS?: string;
  LEADSTATUS?: string;
  STATUSDES?: string;
}

export interface PriorityLeadResponse {
  value: PriorityLead[];
}

export interface PriorityCreateLeadParams {
  LEADDES: string;
  CELLPHONE?: string;
  EMAIL?: string;
  DETAILS?: string;
  LEADSTATUS?: string;
}

export interface PriorityActivity {
  ACTDES?: string;
  DETAILS?: string;
  ACTTYPE?: "T" | "M" | "L";
}

export interface PrioritySearchPhonebookParams {
  phone: string;
  select?: string;
  top?: number;
}

export interface PrioritySearchLeadsParams {
  filter: string;
  select?: string;
  top?: number;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PriorityErpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`PriorityERP ${status}: ${message}`);
    this.name = "PriorityErpError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class PriorityErpClient {
  readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private get headers(): HeadersInit {
    const credentials = btoa(`${this.username}:${this.password}`);
    return {
      "Authorization": `Basic ${credentials}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers,
    });
    if (!res.ok) throw new PriorityErpError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // GET /PHONEBOOK?$filter=contains(PHONE,'{phone}')
  async searchPhonebook(params: PrioritySearchPhonebookParams): Promise<PriorityPhonebookResponse> {
    const select = params.select ?? "CUSTNAME,NAME,PHONE,EMAIL";
    const top = params.top ?? 5;
    const phone = encodeURIComponent(params.phone);
    const filter = encodeURIComponent(`contains(PHONE,'${params.phone}')`);
    const path = `/PHONEBOOK?$filter=${filter}&$select=${select}&$top=${top}`;
    return this.request<PriorityPhonebookResponse>(path);
  }

  // GET /CUSTOMERS('{custname}')
  async getCustomer(custname: string): Promise<PriorityCustomer> {
    const path = `/CUSTOMERS('${encodeURIComponent(custname)}')`;
    return this.request<PriorityCustomer>(path);
  }

  // POST /LEADS
  async createLead(params: PriorityCreateLeadParams): Promise<PriorityLead> {
    return this.request<PriorityLead>("/LEADS", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // GET /LEADS?$filter=...
  async searchLeads(params: PrioritySearchLeadsParams): Promise<PriorityLeadResponse> {
    const select = params.select ?? "LEADNUM,LEADDES,CELLPHONE,EMAIL,STATUSDES";
    const top = params.top ?? 10;
    const filter = encodeURIComponent(params.filter);
    const path = `/LEADS?$filter=${filter}&$select=${select}&$top=${top}`;
    return this.request<PriorityLeadResponse>(path);
  }

  // POST /LEADS('{leadnum}')/LEADACTIVITIES_SUBFORM
  async logActivity(leadnum: number, params: PriorityActivity): Promise<PriorityActivity> {
    return this.request<PriorityActivity>(`/LEADS(${leadnum})/LEADACTIVITIES_SUBFORM`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // PATCH /LEADS({leadnum})
  async updateLeadStatus(leadnum: number, leadStatus: string): Promise<PriorityLead> {
    return this.request<PriorityLead>(`/LEADS(${leadnum})`, {
      method: "PATCH",
      body: JSON.stringify({ LEADSTATUS: leadStatus }),
    });
  }
}
