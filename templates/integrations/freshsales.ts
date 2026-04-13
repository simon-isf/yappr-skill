// freshsales.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/freshsales.md

// ---------------------------------------------------------------------------
// Interfaces — Contact
// ---------------------------------------------------------------------------

export interface FreshsalesContactInput {
  first_name?: string;
  last_name?: string;
  mobile_number?: string;
  email?: string;
  custom_field?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FreshsalesContact {
  id: number;
  first_name?: string;
  last_name?: string;
  mobile_number?: string;
  email?: string;
  owner_id?: number;
  [key: string]: unknown;
}

export interface FreshsalesContactResponse {
  contact: FreshsalesContact;
}

export interface FreshsalesSearchResponse {
  contacts: FreshsalesContact[];
  meta: {
    total_pages: number;
    total_count: number;
  };
}

// ---------------------------------------------------------------------------
// Interfaces — Lead
// ---------------------------------------------------------------------------

export interface FreshsalesLeadInput {
  first_name?: string;
  last_name?: string;
  mobile_number?: string;
  email?: string;
  company?: { name: string };
  custom_field?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FreshsalesLead {
  id: number;
  first_name?: string;
  last_name?: string;
  mobile_number?: string;
  email?: string;
  [key: string]: unknown;
}

export interface FreshsalesLeadResponse {
  lead: FreshsalesLead;
}

// ---------------------------------------------------------------------------
// Interfaces — Sales Activity
// ---------------------------------------------------------------------------

export interface FreshsalesSalesActivityInput {
  sales_activity_type_id: number;
  title: string;
  notes?: string;
  /** Unix timestamp in seconds */
  start_date: number;
  /** Unix timestamp in seconds */
  end_date: number;
  targetable_type: "Contact" | "Lead" | "Deal";
  targetable_id: number;
}

export interface FreshsalesSalesActivity {
  id: number;
  title: string;
  sales_activity_type_id: number;
  targetable_type: string;
  targetable_id: number;
  notes?: string;
  [key: string]: unknown;
}

export interface FreshsalesSalesActivityResponse {
  sales_activity: FreshsalesSalesActivity;
}

// ---------------------------------------------------------------------------
// Interfaces — Activity type selector
// ---------------------------------------------------------------------------

export interface FreshsalesActivityType {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface FreshsalesActivityTypesResponse {
  sales_activity_types: FreshsalesActivityType[];
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class FreshsalesError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Freshsales ${status}: ${message}`);
    this.name = "FreshsalesError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class FreshsalesClient {
  private readonly base: string;

  /**
   * @param apiKey    - Freshsales API key (from Profile → Settings → API Settings).
   *                    Sent as `Token token=<apiKey>` — not a Bearer token.
   * @param subdomain - Your Freshworks account subdomain
   *                    (e.g. "acme" → acme.myfreshworks.com).
   * @param fetchFn   - Optional fetch override (useful for testing).
   */
  constructor(
    private readonly apiKey: string,
    private readonly subdomain: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.base = `https://${subdomain}.myfreshworks.com/crm/sales/api`;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Token token=${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.base}${path}`, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new FreshsalesError(res.status, text);
    }
    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Contacts
  // -------------------------------------------------------------------------

  /**
   * Search contacts by phone using filtered_search.
   * Always use this instead of the lookup endpoint for phone searches.
   * Normalize phone to E.164 before querying.
   */
  async searchContactsByPhone(
    phone: string,
    page = 1,
    perPage = 1,
  ): Promise<FreshsalesSearchResponse> {
    return this.request<FreshsalesSearchResponse>(
      "POST",
      "/filtered_search/contact",
      {
        filter_rule: [
          { attribute: "mobile_number", operator: "is_in", value: phone },
        ],
        page,
        per_page: perPage,
      },
    );
  }

  /** Create a new Contact. */
  async createContact(
    data: FreshsalesContactInput,
  ): Promise<FreshsalesContactResponse> {
    return this.request<FreshsalesContactResponse>("POST", "/contacts", {
      contact: data,
    });
  }

  /** Update a Contact by its numeric ID. */
  async updateContact(
    id: number,
    data: FreshsalesContactInput,
  ): Promise<FreshsalesContactResponse> {
    return this.request<FreshsalesContactResponse>("PUT", `/contacts/${id}`, {
      contact: data,
    });
  }

  // -------------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------------

  /** Create a new Lead. */
  async createLead(data: FreshsalesLeadInput): Promise<FreshsalesLeadResponse> {
    return this.request<FreshsalesLeadResponse>("POST", "/leads", {
      lead: data,
    });
  }

  // -------------------------------------------------------------------------
  // Sales Activities
  // -------------------------------------------------------------------------

  /**
   * Log a call as a sales activity.
   * Requires a `sales_activity_type_id` — fetch it via `getSalesActivityTypes()`
   * and look for the entry with `name: "Phone"`. Cache this ID to avoid extra requests.
   * `start_date` and `end_date` are Unix timestamps in seconds (not milliseconds).
   */
  async logCallActivity(
    data: FreshsalesSalesActivityInput,
  ): Promise<FreshsalesSalesActivityResponse> {
    return this.request<FreshsalesSalesActivityResponse>(
      "POST",
      "/sales_activities",
      { sales_activity: data },
    );
  }

  // -------------------------------------------------------------------------
  // Selectors
  // -------------------------------------------------------------------------

  /**
   * Fetch all sales activity types for this account.
   * Activity type IDs are account-specific — never hardcode them.
   * Find the "Phone" type to get the ID for call logging.
   */
  async getSalesActivityTypes(): Promise<FreshsalesActivityTypesResponse> {
    return this.request<FreshsalesActivityTypesResponse>(
      "GET",
      "/selector/sales_activity_types",
    );
  }
}
