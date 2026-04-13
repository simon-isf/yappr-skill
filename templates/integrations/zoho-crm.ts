// zoho-crm.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/zoho-crm.md
//
// NOTE: This client accepts a pre-fetched OAuth access token. Zoho tokens expire
// after 1 hour. Use the refresh pattern from the reference doc to obtain and
// cache tokens via your edge function / Supabase vault before constructing this
// client.

// ---------------------------------------------------------------------------
// Data-center base URL map
// ---------------------------------------------------------------------------

type ZohoDataCenter = "com" | "eu" | "in" | "com.au";

const DC_BASE: Record<ZohoDataCenter, string> = {
  "com":    "https://www.zohoapis.com",
  "eu":     "https://www.zohoapis.eu",
  "in":     "https://www.zohoapis.in",
  "com.au": "https://www.zohoapis.com.au",
};

// ---------------------------------------------------------------------------
// Interfaces — Leads
// ---------------------------------------------------------------------------

export interface ZohoLeadInput {
  Last_Name: string;
  First_Name?: string;
  Phone?: string;
  Email?: string;
  Lead_Source?: string;
  Lead_Status?: string;
  Description?: string;
  [key: string]: unknown;
}

export interface ZohoRecordDetail {
  id: string;
  Modified_Time?: string;
  Created_Time?: string;
}

export interface ZohoWriteResult {
  code: string;
  details: ZohoRecordDetail;
  message: string;
  status: string;
}

export interface ZohoWriteResponse {
  data: ZohoWriteResult[];
}

export interface ZohoLeadRecord {
  id: string;
  First_Name?: string;
  Last_Name?: string;
  Phone?: string;
  Email?: string;
  Lead_Status?: string;
  [key: string]: unknown;
}

export interface ZohoSearchResponse {
  data?: ZohoLeadRecord[];
}

export interface ZohoUpsertInput extends ZohoLeadInput {
  Phone: string; // required for phone-based duplicate check
}

// ---------------------------------------------------------------------------
// Interfaces — Calls (activities)
// ---------------------------------------------------------------------------

export interface ZohoCallWhoId {
  name: string;
  id: string;
}

export interface ZohoCallInput {
  Subject: string;
  Call_Type: "Outbound" | "Inbound" | "Missed";
  Call_Start_Time: string; // ISO 8601
  Duration_in_seconds: string; // string per Zoho API
  Description?: string;
  Who_Id?: ZohoCallWhoId;
}

// ---------------------------------------------------------------------------
// Interfaces — Field metadata
// ---------------------------------------------------------------------------

export interface ZohoFieldMeta {
  api_name: string;
  field_label: string;
  data_type: string;
  [key: string]: unknown;
}

export interface ZohoFieldsResponse {
  fields: ZohoFieldMeta[];
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ZohoCrmError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`ZohoCRM ${status}: ${message}`);
    this.name = "ZohoCrmError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ZohoCrmClient {
  private readonly base: string;

  /**
   * @param accessToken  - OAuth access token. Caller is responsible for
   *                       refreshing — see getZohoAccessToken() in the ref doc.
   * @param datacenter   - Zoho data center for the account (default: "com").
   *                       Must match the user's Zoho domain (.com / .eu / .in / .com.au).
   * @param fetchFn      - Optional fetch override (useful for testing).
   */
  constructor(
    private readonly accessToken: string,
    private readonly datacenter: ZohoDataCenter = "com",
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.base = `${DC_BASE[datacenter]}/crm/v3`;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Zoho-oauthtoken ${this.accessToken}`,
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
      throw new ZohoCrmError(res.status, text);
    }
    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------------

  /** Create one or more leads. Returns the write result for each record. */
  async createLead(data: ZohoLeadInput[]): Promise<ZohoWriteResponse> {
    return this.request<ZohoWriteResponse>("POST", "/Leads", { data });
  }

  /**
   * Search leads by phone number.
   * Phone must be E.164; the `+` is URL-encoded automatically.
   * Returns an empty data array (not an error) when no records match.
   */
  async searchLeadsByPhone(phone: string): Promise<ZohoSearchResponse> {
    const criteria = encodeURIComponent(`(Phone:equals:${phone})`);
    const res = await this.fetchFn(
      `${this.base}/Leads/search?criteria=${criteria}`,
      { method: "GET", headers: this.headers },
    );
    // 204 / no-content means no records found
    if (res.status === 204) return { data: [] };
    if (!res.ok) {
      const text = await res.text();
      throw new ZohoCrmError(res.status, text);
    }
    return res.json() as Promise<ZohoSearchResponse>;
  }

  /** Update a single lead by its record ID. */
  async updateLead(
    recordId: string,
    data: Partial<ZohoLeadInput>,
  ): Promise<ZohoWriteResponse> {
    return this.request<ZohoWriteResponse>("PUT", `/Leads/${recordId}`, {
      data: [data],
    });
  }

  /**
   * Upsert a lead using Phone as the duplicate-check field.
   * Inserts if no match; updates the matching record if found.
   */
  async upsertLead(data: ZohoUpsertInput[]): Promise<ZohoWriteResponse> {
    return this.request<ZohoWriteResponse>("POST", "/Leads/upsert", {
      data,
      duplicate_check_fields: ["Phone"],
    });
  }

  // -------------------------------------------------------------------------
  // Calls (activity log)
  // -------------------------------------------------------------------------

  /** Create a call activity record (call log) linked to a lead/contact. */
  async createCall(data: ZohoCallInput[]): Promise<ZohoWriteResponse> {
    return this.request<ZohoWriteResponse>("POST", "/Calls", { data });
  }

  // -------------------------------------------------------------------------
  // Field metadata
  // -------------------------------------------------------------------------

  /** Fetch all field definitions for the Leads module (including custom fields). */
  async getLeadFields(): Promise<ZohoFieldsResponse> {
    return this.request<ZohoFieldsResponse>(
      "GET",
      "/settings/fields?module=Leads",
    );
  }
}
