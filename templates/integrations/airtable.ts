// airtable.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/airtable.md

// ---------------------------------------------------------------------------
// Interfaces — Records
// ---------------------------------------------------------------------------

export interface AirtableRecord<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: T;
}

// ---------------------------------------------------------------------------
// List Records
// ---------------------------------------------------------------------------

export interface ListRecordsParams {
  maxRecords?: number;
  view?: string;
  filterByFormula?: string;
  fields?: string[];
  sortField?: string;
  sortDirection?: "asc" | "desc";
  offset?: string;
}

export interface ListRecordsResponse<T extends Record<string, unknown> = Record<string, unknown>> {
  records: AirtableRecord<T>[];
  offset?: string;
}

// ---------------------------------------------------------------------------
// Create Records
// ---------------------------------------------------------------------------

export interface CreateRecordsParams<T extends Record<string, unknown> = Record<string, unknown>> {
  records: Array<{ fields: T }>;
}

export interface CreateRecordsResponse<T extends Record<string, unknown> = Record<string, unknown>> {
  records: AirtableRecord<T>[];
}

// ---------------------------------------------------------------------------
// Update Record (PATCH / PUT)
// ---------------------------------------------------------------------------

export interface UpdateRecordParams<T extends Record<string, unknown> = Record<string, unknown>> {
  fields: T;
}

// ---------------------------------------------------------------------------
// Delete Record
// ---------------------------------------------------------------------------

export interface DeleteRecordResponse {
  deleted: boolean;
  id: string;
}

// ---------------------------------------------------------------------------
// Base Schema
// ---------------------------------------------------------------------------

export interface AirtableFieldChoice {
  name: string;
  color?: string;
}

export interface AirtableField {
  id: string;
  name: string;
  type: string;
  options?: {
    choices?: AirtableFieldChoice[];
    [key: string]: unknown;
  };
}

export interface AirtableTable {
  id: string;
  name: string;
  fields: AirtableField[];
}

export interface BaseSchemaResponse {
  tables: AirtableTable[];
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class AirtableError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Airtable ${status}: ${message}`);
    this.name = "AirtableError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AirtableClient {
  private readonly baseUrl = "https://api.airtable.com";

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

  private tableUrl(baseId: string, tableName: string): string {
    return `${this.baseUrl}/v0/${baseId}/${encodeURIComponent(tableName)}`;
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text();
      throw new AirtableError(res.status, text);
    }
    return res.json() as Promise<T>;
  }

  /** List records in a table. Pass optional filtering, sorting, and pagination params. */
  async listRecords<T extends Record<string, unknown> = Record<string, unknown>>(
    baseId: string,
    tableName: string,
    params: ListRecordsParams = {},
  ): Promise<ListRecordsResponse<T>> {
    const url = new URL(this.tableUrl(baseId, tableName));
    if (params.maxRecords !== undefined) url.searchParams.set("maxRecords", String(params.maxRecords));
    if (params.view) url.searchParams.set("view", params.view);
    if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
    if (params.fields) {
      for (const f of params.fields) url.searchParams.append("fields[]", f);
    }
    if (params.sortField) {
      url.searchParams.set("sort[0][field]", params.sortField);
      url.searchParams.set("sort[0][direction]", params.sortDirection ?? "asc");
    }
    if (params.offset) url.searchParams.set("offset", params.offset);

    const res = await this.fetchFn(url.toString(), { headers: this.headers });
    return this.handleResponse<ListRecordsResponse<T>>(res);
  }

  /** Create up to 10 records in a single request. */
  async createRecords<T extends Record<string, unknown> = Record<string, unknown>>(
    baseId: string,
    tableName: string,
    params: CreateRecordsParams<T>,
  ): Promise<CreateRecordsResponse<T>> {
    const res = await this.fetchFn(this.tableUrl(baseId, tableName), {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    return this.handleResponse<CreateRecordsResponse<T>>(res);
  }

  /** Partially update a record — only the supplied fields are changed. */
  async updateRecord<T extends Record<string, unknown> = Record<string, unknown>>(
    baseId: string,
    tableName: string,
    recordId: string,
    params: UpdateRecordParams<T>,
  ): Promise<AirtableRecord<T>> {
    const res = await this.fetchFn(`${this.tableUrl(baseId, tableName)}/${recordId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    return this.handleResponse<AirtableRecord<T>>(res);
  }

  /** Fully replace a record — unspecified fields become null. */
  async replaceRecord<T extends Record<string, unknown> = Record<string, unknown>>(
    baseId: string,
    tableName: string,
    recordId: string,
    params: UpdateRecordParams<T>,
  ): Promise<AirtableRecord<T>> {
    const res = await this.fetchFn(`${this.tableUrl(baseId, tableName)}/${recordId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    return this.handleResponse<AirtableRecord<T>>(res);
  }

  /** Delete a single record. */
  async deleteRecord(
    baseId: string,
    tableName: string,
    recordId: string,
  ): Promise<DeleteRecordResponse> {
    const res = await this.fetchFn(`${this.tableUrl(baseId, tableName)}/${recordId}`, {
      method: "DELETE",
      headers: this.headers,
    });
    return this.handleResponse<DeleteRecordResponse>(res);
  }

  /**
   * Search records by a single field value using filterByFormula.
   * Handles `+` in phone numbers by encoding them as `%2B` inside the formula.
   */
  async searchByField<T extends Record<string, unknown> = Record<string, unknown>>(
    baseId: string,
    tableName: string,
    fieldName: string,
    value: string,
    maxRecords = 10,
  ): Promise<ListRecordsResponse<T>> {
    const escaped = value.replace(/\+/g, "%2B");
    const formula = `({${fieldName}}="${escaped}")`;
    return this.listRecords<T>(baseId, tableName, { filterByFormula: formula, maxRecords });
  }

  /** Retrieve field names and types for all tables in a base. */
  async getBaseSchema(baseId: string): Promise<BaseSchemaResponse> {
    const url = `${this.baseUrl}/v0/meta/bases/${baseId}/tables`;
    const res = await this.fetchFn(url, { headers: this.headers });
    return this.handleResponse<BaseSchemaResponse>(res);
  }
}
