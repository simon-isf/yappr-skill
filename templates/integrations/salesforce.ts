// salesforce.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/salesforce.md
//
// NOTE: This client accepts a pre-fetched OAuth access token and the org-specific
// instance URL. Both are returned by the OAuth token endpoint. Use the
// getSalesforceToken() helper from the reference doc to obtain and cache them
// before constructing this client. Tokens expire and must be refreshed via the
// client-credentials flow.

// ---------------------------------------------------------------------------
// Interfaces — Lead
// ---------------------------------------------------------------------------

export interface SalesforceLeadInput {
  LastName: string;
  FirstName?: string;
  Phone?: string;
  Email?: string;
  Company?: string;
  LeadSource?: string;
  Status?: string;
  Description?: string;
  [key: string]: unknown;
}

export interface SalesforceCreateResponse {
  id: string;
  success: boolean;
  errors: unknown[];
}

export interface SalesforceLeadRecord {
  Id: string;
  FirstName?: string;
  LastName?: string;
  Phone?: string;
  Email?: string;
  Status?: string;
  [key: string]: unknown;
}

export interface SalesforceQueryResponse<T> {
  totalSize: number;
  done: boolean;
  records: T[];
}

// ---------------------------------------------------------------------------
// Interfaces — Contact
// ---------------------------------------------------------------------------

export interface SalesforceContactInput {
  LastName: string;
  FirstName?: string;
  Phone?: string;
  Email?: string;
  AccountId?: string;
  [key: string]: unknown;
}

export interface SalesforceContactRecord {
  Id: string;
  FirstName?: string;
  LastName?: string;
  Phone?: string;
  Email?: string;
  AccountId?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Interfaces — Task (call log)
// ---------------------------------------------------------------------------

export interface SalesforceTaskInput {
  WhoId?: string;
  Subject: string;
  Status: string;
  Priority?: string;
  Type?: string;
  CallType?: "Inbound" | "Outbound" | "Internal";
  CallDurationInSeconds?: number;
  Description?: string;
  ActivityDate?: string; // YYYY-MM-DD
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Interfaces — Opportunity
// ---------------------------------------------------------------------------

export interface SalesforceOpportunityInput {
  Name: string;
  StageName: string;
  CloseDate: string; // YYYY-MM-DD
  AccountId?: string;
  Description?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Interfaces — Describe (field metadata)
// ---------------------------------------------------------------------------

export interface SalesforceFieldMeta {
  name: string;
  label: string;
  type: string;
  picklistValues?: { label: string; value: string; active: boolean }[];
  [key: string]: unknown;
}

export interface SalesforceDescribeResponse {
  name: string;
  label: string;
  fields: SalesforceFieldMeta[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class SalesforceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Salesforce ${status}: ${message}`);
    this.name = "SalesforceError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SalesforceClient {
  private readonly base: string;

  /**
   * @param accessToken  - OAuth access token. Caller is responsible for
   *                       refreshing — see getSalesforceToken() in the ref doc.
   * @param instanceUrl  - Org-specific instance URL returned by the token
   *                       endpoint (e.g. "https://yourorg.my.salesforce.com").
   *                       Never hardcode this — always derive it from the token response.
   * @param fetchFn      - Optional fetch override (useful for testing).
   */
  constructor(
    private readonly accessToken: string,
    private readonly instanceUrl: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.base = `${instanceUrl}/services/data/v59.0`;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.accessToken}`,
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
    // 204 No Content is a valid success for PATCH (update)
    if (res.status === 204) return undefined as unknown as T;
    if (!res.ok) {
      const text = await res.text();
      throw new SalesforceError(res.status, text);
    }
    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------------

  /**
   * Create a new Lead.
   * Note: `Company` is required by Salesforce — use `"Unknown"` if unavailable.
   */
  async createLead(data: SalesforceLeadInput): Promise<SalesforceCreateResponse> {
    return this.request<SalesforceCreateResponse>("POST", "/sobjects/Lead", data);
  }

  /**
   * Search for Leads by phone using SOQL.
   * Phone must match the format stored in Salesforce exactly.
   * The `+` in E.164 numbers is automatically encoded.
   */
  async findLeadByPhone(
    phone: string,
  ): Promise<SalesforceQueryResponse<SalesforceLeadRecord>> {
    const encoded = encodeURIComponent(`'${phone}'`);
    const soql = `SELECT+Id,FirstName,LastName,Phone,Email,Status+FROM+Lead+WHERE+Phone=${encoded}+LIMIT+1`;
    return this.request<SalesforceQueryResponse<SalesforceLeadRecord>>(
      "GET",
      `/query?q=${soql}`,
    );
  }

  /**
   * Update a Lead by Salesforce ID.
   * Returns undefined (204 No Content) on success.
   */
  async updateLead(id: string, data: Partial<SalesforceLeadInput>): Promise<void> {
    return this.request<void>("PATCH", `/sobjects/Lead/${id}`, data);
  }

  /**
   * Upsert a Lead by an external ID field.
   * Creates the record if the external ID is not found; updates if found.
   * Common external ID fields: `Phone__c`, or any custom field marked as External ID.
   */
  async upsertLeadByExternalId(
    externalIdField: string,
    externalIdValue: string,
    data: Partial<SalesforceLeadInput>,
  ): Promise<SalesforceCreateResponse | void> {
    const encodedId = encodeURIComponent(externalIdValue);
    return this.request<SalesforceCreateResponse | void>(
      "PATCH",
      `/sobjects/Lead/${externalIdField}/${encodedId}`,
      data,
    );
  }

  // -------------------------------------------------------------------------
  // Contacts
  // -------------------------------------------------------------------------

  /** Create a new Contact. */
  async createContact(
    data: SalesforceContactInput,
  ): Promise<SalesforceCreateResponse> {
    return this.request<SalesforceCreateResponse>(
      "POST",
      "/sobjects/Contact",
      data,
    );
  }

  // -------------------------------------------------------------------------
  // Tasks (call log)
  // -------------------------------------------------------------------------

  /** Create a Task to log a completed call against a Lead or Contact. */
  async createTask(data: SalesforceTaskInput): Promise<SalesforceCreateResponse> {
    return this.request<SalesforceCreateResponse>("POST", "/sobjects/Task", data);
  }

  // -------------------------------------------------------------------------
  // Opportunities
  // -------------------------------------------------------------------------

  /** Create a new Opportunity. */
  async createOpportunity(
    data: SalesforceOpportunityInput,
  ): Promise<SalesforceCreateResponse> {
    return this.request<SalesforceCreateResponse>(
      "POST",
      "/sobjects/Opportunity",
      data,
    );
  }

  // -------------------------------------------------------------------------
  // Object metadata
  // -------------------------------------------------------------------------

  /**
   * Describe a Salesforce object to discover field names, types, and picklists.
   * Useful for finding custom field API names (they always end in `__c`).
   */
  async describeObject(objectName: string): Promise<SalesforceDescribeResponse> {
    return this.request<SalesforceDescribeResponse>(
      "GET",
      `/sobjects/${objectName}/describe`,
    );
  }

  // -------------------------------------------------------------------------
  // SOQL query (generic)
  // -------------------------------------------------------------------------

  /**
   * Run an arbitrary SOQL query.
   * The `q` parameter should be a URL-encoded SOQL string.
   */
  async query<T>(soql: string): Promise<SalesforceQueryResponse<T>> {
    return this.request<SalesforceQueryResponse<T>>(
      "GET",
      `/query?q=${encodeURIComponent(soql)}`,
    );
  }
}
