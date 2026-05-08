// google-forms-sheets.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/google-forms-sheets.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface GoogleFormSubmission {
  timestamp: string;
  name: string;
  phone: string;
  email: string;
  service: string;
  notes: string;
  /** All raw row values in original column order (index 0 = Timestamp). */
  raw: string[];
}

export interface SheetRowsResponse {
  range: string;
  majorDimension: string;
  values?: string[][];
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  properties: { title: string };
  sheets: Array<{
    properties: {
      sheetId: number;
      title: string;
      index: number;
      sheetType: string;
      gridProperties: { rowCount: number; columnCount: number };
    };
  }>;
}

export interface ColumnMapping {
  /** 0-based column index for each field. Defaults match standard Google Forms → Sheets layout. */
  timestamp?: number;
  name?: number;
  phone?: number;
  email?: number;
  service?: number;
  notes?: number;
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

/**
 * No-op — Google Forms does not send webhook signatures.
 * Included for API symmetry; always returns true.
 */
export function verifyGoogleFormWebhook(_headers: Record<string, string>): boolean {
  return true;
}

/**
 * Normalise a raw row array (as returned by the Sheets API or Apps Script e.values)
 * into a structured GoogleFormSubmission.
 *
 * Column mapping defaults to the standard Google Forms→Sheets layout:
 *   0 = Timestamp, 1 = Name, 2 = Phone, 3 = Email, 4 = Service, 5 = Notes
 *
 * Trailing empty cells are omitted by Google, so every index access falls back to "".
 */
export function parseGoogleFormSubmission(
  row: string[],
  mapping: ColumnMapping = {},
): GoogleFormSubmission {
  const col = {
    timestamp: mapping.timestamp ?? 0,
    name: mapping.name ?? 1,
    phone: mapping.phone ?? 2,
    email: mapping.email ?? 3,
    service: mapping.service ?? 4,
    notes: mapping.notes ?? 5,
  };
  return {
    timestamp: row[col.timestamp] ?? "",
    name: row[col.name] ?? "",
    phone: normalizeIsraeliPhone(row[col.phone] ?? ""),
    email: row[col.email] ?? "",
    service: row[col.service] ?? "",
    notes: row[col.notes] ?? "",
    raw: row,
  };
}

/**
 * Normalize an Israeli phone number to E.164 (+972XXXXXXXXX).
 * Passes through numbers already in E.164 or international format.
 */
export function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return `+${digits}`;
  if (digits.startsWith("0")) return `+972${digits.slice(1)}`;
  return digits ? `+${digits}` : "";
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GoogleSheetsPollerError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`GoogleSheetsPoller ${status}: ${message}`);
    this.name = "GoogleSheetsPollerError";
  }
}

// ---------------------------------------------------------------------------
// Poller class
// ---------------------------------------------------------------------------

/**
 * GoogleSheetsPoller — polling-based Google Forms lead intake.
 *
 * Reads a Google Sheets spreadsheet (linked to a Google Form), tracks the last
 * processed row count, and yields only new submissions since the last poll.
 *
 * Usage:
 *   const poller = new GoogleSheetsPoller(token, spreadsheetId, "Form Responses 1!A:F");
 *   const newLeads = await poller.pollNew(lastProcessedCount);
 */
export class GoogleSheetsPoller {
  readonly baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";

  constructor(
    private readonly accessToken: string,
    private readonly spreadsheetId: string,
    private readonly range: string = "Form Responses 1!A:F",
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.accessToken}`,
    };
  }

  /**
   * GET /{spreadsheetId}/values/{range}
   * Returns all rows (including header at index 0).
   */
  async readAllRows(): Promise<SheetRowsResponse> {
    const url =
      `${this.baseUrl}/${this.spreadsheetId}/values/${encodeURIComponent(this.range)}`;
    const res = await this.fetchFn(url, { method: "GET", headers: this.headers });
    if (!res.ok) throw new GoogleSheetsPollerError(res.status, await res.text());
    return res.json() as Promise<SheetRowsResponse>;
  }

  /**
   * GET /{spreadsheetId}
   * Returns spreadsheet metadata including all sheet names and row/column counts.
   */
  async getSpreadsheetInfo(): Promise<SpreadsheetInfo> {
    const url = `${this.baseUrl}/${this.spreadsheetId}`;
    const res = await this.fetchFn(url, { method: "GET", headers: this.headers });
    if (!res.ok) throw new GoogleSheetsPollerError(res.status, await res.text());
    return res.json() as Promise<SpreadsheetInfo>;
  }

  /**
   * Returns new data rows (parsed) that appear after `lastProcessedCount` data rows.
   * `lastProcessedCount` is the number of data rows (header excluded) already processed.
   * Returns both the parsed submissions and the updated total data row count.
   */
  async pollNew(
    lastProcessedCount: number,
    mapping?: ColumnMapping,
  ): Promise<{ submissions: GoogleFormSubmission[]; totalDataRows: number }> {
    const response = await this.readAllRows();
    const allRows = response.values ?? [];

    if (allRows.length < 2) {
      // Only header or empty — nothing to process
      return { submissions: [], totalDataRows: 0 };
    }

    const dataRows = allRows.slice(1); // skip header row
    const newRows = dataRows.slice(lastProcessedCount);

    const submissions = newRows
      .filter((row) => (row[mapping?.phone ?? 2] ?? "").replace(/\D/g, "").length > 0)
      .map((row) => parseGoogleFormSubmission(row, mapping));

    return { submissions, totalDataRows: dataRows.length };
  }
}
