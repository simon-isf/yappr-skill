// tally-forms.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/tally-forms.md

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type TallyFieldType =
  | "INPUT_TEXT"
  | "INPUT_PHONE_NUMBER"
  | "INPUT_EMAIL"
  | "MULTIPLE_CHOICE"
  | "CHECKBOXES"
  | "DROPDOWN"
  | "TEXTAREA"
  | "NUMBER"
  | "RATING"
  | "DATE"
  | string;

export interface TallyFieldOption {
  id: string;
  text: string;
}

export interface TallyField {
  key: string;
  label: string;
  type: TallyFieldType;
  /** Single string for most types; string[] for CHECKBOXES. */
  value: string | string[] | number | null;
  options?: TallyFieldOption[];
}

export interface TallyFormData {
  responseId: string;
  submissionId: string;
  respondentId: string;
  formId: string;
  formName: string;
  createdAt: string;
  fields: TallyField[];
}

/** Normalized lead extracted from a Tally FORM_RESPONSE webhook payload. */
export interface TallyLead {
  submissionId: string;
  formId: string;
  formName: string;
  createdAt: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  /** All fields as label → value map (value stringified for arrays). */
  fields: Record<string, string>;
}

export interface TallyWebhookBody {
  eventId: string;
  eventType: string;
  createdAt: string;
  data: TallyFormData;
}

// ---------------------------------------------------------------------------
// Tally API types (separate from webhooks)
// ---------------------------------------------------------------------------

export interface TallySubmission {
  id: string;
  formId: string;
  createdAt: string;
  fields: TallyField[];
}

export interface TallySubmissionsPage {
  page: number;
  limit: number;
  submissions: TallySubmission[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class TallyError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Tally ${status}: ${message}`);
    this.name = "TallyError";
  }
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

/**
 * Tally does not sign webhooks (as of 2026). Secure your endpoint by
 * validating a secret query parameter on the incoming request URL.
 *
 * This function validates that the `secret` query parameter on `requestUrl`
 * matches the expected `webhookSecret`.
 *
 * @param requestUrl   Full URL of the incoming POST request (used to read ?secret=)
 * @param webhookSecret The secret you configured in Tally's webhook URL
 */
export function verifyTallySecret(requestUrl: string | URL, webhookSecret: string): boolean {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
  const provided = url.searchParams.get("secret");
  if (!provided) return false;
  // Constant-time comparison to avoid timing attacks
  if (provided.length !== webhookSecret.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ webhookSecret.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Parse a Tally FORM_RESPONSE webhook body into a normalized TallyLead.
 * Returns `null` if the event is not a FORM_RESPONSE.
 *
 * @throws {TypeError} if the payload structure is invalid
 */
export function parseTallyWebhookPayload(body: unknown): TallyLead | null {
  const payload = body as TallyWebhookBody;

  if (!payload || typeof payload !== "object") {
    throw new TypeError("Invalid Tally webhook payload");
  }
  if (payload.eventType !== "FORM_RESPONSE") return null;

  const data = payload.data;
  if (!data || !Array.isArray(data.fields)) {
    throw new TypeError("Invalid Tally webhook payload: missing data.fields");
  }

  const fields = data.fields;

  return {
    submissionId: data.submissionId,
    formId: data.formId,
    formName: data.formName,
    createdAt: data.createdAt,
    phone: getFieldByLabel(fields, "Phone Number") ??
      getFieldByLabel(fields, "טלפון") ??
      getFieldFuzzy(fields, ["phone", "mobile", "טלפון"]),
    name: getFieldByLabel(fields, "Full Name") ??
      getFieldByLabel(fields, "שם מלא") ??
      getFieldFuzzy(fields, ["name", "שם"]),
    email: getFieldByLabel(fields, "Email") ??
      getFieldFuzzy(fields, ["email", "אימייל", "מייל"]),
    fields: Object.fromEntries(
      fields.map((f) => [
        f.label,
        Array.isArray(f.value) ? f.value.join(", ") : String(f.value ?? ""),
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Field extraction utilities
// ---------------------------------------------------------------------------

/**
 * Find a field by exact label match (case-insensitive) and return its value.
 * For CHECKBOXES fields, returns the values joined with ", ".
 */
export function getFieldByLabel(fields: TallyField[], label: string): string | null {
  const field = fields.find(
    (f) => f.label.toLowerCase() === label.toLowerCase(),
  );
  if (!field || field.value === null || field.value === undefined) return null;
  if (Array.isArray(field.value)) return field.value.join(", ");
  return String(field.value);
}

/**
 * Find the first field whose label contains any of the given keywords
 * (case-insensitive). Useful when labels may vary slightly between form versions.
 */
export function getFieldFuzzy(fields: TallyField[], keywords: string[]): string | null {
  const field = fields.find((f) =>
    keywords.some((kw) => f.label.toLowerCase().includes(kw.toLowerCase()))
  );
  if (!field || field.value === null || field.value === undefined) return null;
  if (Array.isArray(field.value)) return field.value.join(", ");
  return String(field.value);
}

// ---------------------------------------------------------------------------
// API client (form management + submissions)
// ---------------------------------------------------------------------------

export class TallyClient {
  static readonly baseUrl = "https://api.tally.so";

  constructor(
    private readonly apiToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${TallyClient.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new TallyError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  /**
   * GET /forms/{formId}/submissions — list submissions for a form.
   * Use `page` and `limit` for pagination (default limit: 50).
   */
  async getSubmissions(
    formId: string,
    page = 1,
    limit = 50,
  ): Promise<TallySubmissionsPage> {
    return this.get<TallySubmissionsPage>(`/forms/${formId}/submissions`, {
      page: String(page),
      limit: String(limit),
    });
  }
}
