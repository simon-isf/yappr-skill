// google-sheets.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/google-sheets.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface SheetProperties {
  sheetId: number;
  title: string;
  index: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  sheets: Array<{ properties: SheetProperties }>;
}

export interface AppendRowResponse {
  spreadsheetId: string;
  tableRange?: string;
  updates: {
    spreadsheetId: string;
    updatedRange: string;
    updatedRows: number;
    updatedColumns: number;
    updatedCells: number;
  };
}

export interface GetRowsResponse {
  range: string;
  majorDimension: string;
  values?: string[][];
}

export interface UpdateRowResponse {
  spreadsheetId: string;
  updatedRange: string;
  updatedRows: number;
  updatedCells: number;
}

export interface BatchUpdateData {
  range: string;
  values: string[][];
}

export interface BatchUpdateResponse {
  spreadsheetId: string;
  totalUpdatedRows: number;
  totalUpdatedCells: number;
  responses: UpdateRowResponse[];
}

export interface ClearRangeResponse {
  spreadsheetId: string;
  clearedRange: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GoogleSheetsError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`GoogleSheets ${status}: ${message}`);
    this.name = "GoogleSheetsError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GoogleSheetsClient {
  readonly baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";

  constructor(
    private readonly accessToken: string,
    private readonly spreadsheetId: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  // POST /{spreadsheetId}/values/{range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS
  async appendRow(range: string, values: string[][]): Promise<AppendRowResponse> {
    const url =
      `${this.baseUrl}/${this.spreadsheetId}/values/${encodeURIComponent(range)}:append` +
      `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ values }),
    });
    if (!res.ok) throw new GoogleSheetsError(res.status, await res.text());
    return res.json() as Promise<AppendRowResponse>;
  }

  // GET /{spreadsheetId}/values/{range}
  async getRows(range: string): Promise<GetRowsResponse> {
    const url =
      `${this.baseUrl}/${this.spreadsheetId}/values/${encodeURIComponent(range)}`;
    const res = await this.fetchFn(url, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new GoogleSheetsError(res.status, await res.text());
    return res.json() as Promise<GetRowsResponse>;
  }

  // PUT /{spreadsheetId}/values/{range}?valueInputOption=USER_ENTERED
  async updateRow(range: string, values: string[][]): Promise<UpdateRowResponse> {
    const url =
      `${this.baseUrl}/${this.spreadsheetId}/values/${encodeURIComponent(range)}` +
      `?valueInputOption=USER_ENTERED`;
    const res = await this.fetchFn(url, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({ range, majorDimension: "ROWS", values }),
    });
    if (!res.ok) throw new GoogleSheetsError(res.status, await res.text());
    return res.json() as Promise<UpdateRowResponse>;
  }

  // POST /{spreadsheetId}/values:batchUpdate
  async batchUpdate(data: BatchUpdateData[]): Promise<BatchUpdateResponse> {
    const url = `${this.baseUrl}/${this.spreadsheetId}/values:batchUpdate`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });
    if (!res.ok) throw new GoogleSheetsError(res.status, await res.text());
    return res.json() as Promise<BatchUpdateResponse>;
  }

  // POST /{spreadsheetId}/values/{range}:clear
  async clearRange(range: string): Promise<ClearRangeResponse> {
    const url =
      `${this.baseUrl}/${this.spreadsheetId}/values/${encodeURIComponent(range)}:clear`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new GoogleSheetsError(res.status, await res.text());
    return res.json() as Promise<ClearRangeResponse>;
  }

  // GET /{spreadsheetId}?fields=sheets.properties
  async getMetadata(): Promise<SpreadsheetMetadata> {
    const url = `${this.baseUrl}/${this.spreadsheetId}?fields=sheets.properties`;
    const res = await this.fetchFn(url, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new GoogleSheetsError(res.status, await res.text());
    return res.json() as Promise<SpreadsheetMetadata>;
  }
}
