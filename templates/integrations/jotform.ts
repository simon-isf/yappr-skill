// jotform.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/jotform.md

// ---------------------------------------------------------------------------
// Phone utility
// ---------------------------------------------------------------------------

/** Normalize Israeli local phone to E.164. 05XXXXXXXX → +9725XXXXXXXX */
export function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return `+${digits}`;
  if (digits.startsWith("0")) return `+972${digits.slice(1)}`;
  if (digits.length === 9) return `+972${digits}`;
  return `+${digits}`;
}

// ---------------------------------------------------------------------------
// Webhook payload interfaces
// ---------------------------------------------------------------------------

/**
 * Raw form-encoded fields sent by JotForm on each new submission.
 * Fields follow the pattern q{number}_{fieldUniqueName}.
 * Only the guaranteed meta-fields are typed; domain fields use the index signature.
 */
export interface JotFormWebhookPayload {
  formID: string;
  submissionID: string;
  formTitle?: string;
  ip?: string;
  rawRequest?: string;
  pretty?: string;
  type?: string;
  [key: string]: string | undefined;
}

/** Normalised lead extracted from a JotForm webhook or API submission. */
export interface JotFormLead {
  phone: string;
  name: string;
  email?: string;
  submissionId?: string;
  formId?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Webhook payload parser
// ---------------------------------------------------------------------------

/**
 * Parse a JotForm webhook POST body (application/x-www-form-urlencoded string
 * or already-parsed object) into a normalised JotFormLead.
 *
 * Phone field discovery order:
 *   1. Any top-level key whose name contains "phone" (case-insensitive)
 *   2. Any top-level key whose name contains "mobile" (case-insensitive)
 *
 * Name field discovery order:
 *   1. Any top-level key whose name contains "name" (case-insensitive)
 *   2. Falls back to "Unknown"
 *
 * Throws if no phone field is found.
 */
export function parseJotFormWebhookPayload(body: unknown): JotFormLead {
  let payload: Record<string, string>;

  if (typeof body === "string") {
    payload = Object.fromEntries(new URLSearchParams(body)) as Record<string, string>;
  } else if (body !== null && typeof body === "object") {
    payload = body as Record<string, string>;
  } else {
    throw new JotFormError(400, "Payload must be a string or object");
  }

  // Find phone field
  const phoneKey = Object.keys(payload).find(
    (k) => k !== "formID" && /phone|mobile/i.test(k) && payload[k],
  );
  if (!phoneKey) {
    throw new JotFormError(422, "No phone field found in JotForm payload");
  }

  // Find name field
  const nameKey = Object.keys(payload).find(
    (k) => /name/i.test(k) && payload[k],
  );

  // Find email field
  const emailKey = Object.keys(payload).find(
    (k) => /email/i.test(k) && payload[k],
  );

  const rawPhone = payload[phoneKey] ?? "";
  const name = (nameKey ? payload[nameKey] : undefined) ?? "Unknown";

  return {
    phone: normalizeIsraeliPhone(rawPhone),
    name,
    email: emailKey ? payload[emailKey] : undefined,
    submissionId: payload.submissionID,
    formId: payload.formID,
    ...payload,
  };
}

// ---------------------------------------------------------------------------
// API response interfaces
// ---------------------------------------------------------------------------

export interface JotFormAnswerEntry {
  name: string;
  order: string;
  text: string;
  type: string;
  answer: unknown;
}

export interface JotFormSubmission {
  id: string;
  form_id: string;
  ip?: string;
  created_at: string;
  status: string;
  answers: Record<string, JotFormAnswerEntry>;
}

export interface JotFormSubmissionsResponse {
  responseCode: number;
  message: string;
  content: JotFormSubmission[];
  resultSet: { offset: number; limit: number; count: number };
}

export interface JotFormSingleSubmissionResponse {
  responseCode: number;
  message: string;
  content: JotFormSubmission;
}

export interface JotFormDeleteResponse {
  responseCode: number;
  message: string;
  content: string;
}

export interface JotFormGetSubmissionsParams {
  limit?: number;
  offset?: number;
  orderby?: string;
  direction?: "ASC" | "DESC";
  filter?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Answer extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract a scalar string from a JotForm API `answers` entry.
 * Handles fullname compound type ({ first, last }) and plain scalars.
 */
export function extractJotFormAnswer(
  answers: Record<string, JotFormAnswerEntry>,
  questionNumber: string,
): string {
  const entry = answers[questionNumber];
  if (!entry) return "";
  const answer = entry.answer;
  if (
    typeof answer === "object" &&
    answer !== null &&
    "first" in answer
  ) {
    const a = answer as Record<string, string>;
    return `${a.first ?? ""} ${a.last ?? ""}`.trim();
  }
  return String(answer ?? "");
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class JotFormError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`JotForm ${status}: ${message}`);
    this.name = "JotFormError";
  }
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export class JotFormApiClient {
  readonly baseUrl = "https://api.jotform.com";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  // GET /form/{id}/submissions
  async getFormSubmissions(
    formId: string,
    params: JotFormGetSubmissionsParams = {},
  ): Promise<JotFormSubmissionsResponse> {
    const url = new URL(`${this.baseUrl}/form/${formId}/submissions`);
    url.searchParams.set("apiKey", this.apiKey);
    if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
    if (params.offset !== undefined) url.searchParams.set("offset", String(params.offset));
    if (params.orderby) url.searchParams.set("orderby", params.orderby);
    if (params.direction) url.searchParams.set("direction", params.direction);
    if (params.filter) {
      url.searchParams.set("filter", encodeURIComponent(JSON.stringify(params.filter)));
    }

    const res = await this.fetchFn(url.toString());
    if (!res.ok) throw new JotFormError(res.status, await res.text());
    const data = await res.json() as JotFormSubmissionsResponse;
    if (data.responseCode !== 200) {
      throw new JotFormError(data.responseCode, data.message);
    }
    return data;
  }

  // GET /submission/{id}
  async getSubmission(submissionId: string): Promise<JotFormSubmission> {
    const url = new URL(`${this.baseUrl}/submission/${submissionId}`);
    url.searchParams.set("apiKey", this.apiKey);

    const res = await this.fetchFn(url.toString());
    if (!res.ok) throw new JotFormError(res.status, await res.text());
    const data = await res.json() as JotFormSingleSubmissionResponse;
    if (data.responseCode !== 200) {
      throw new JotFormError(data.responseCode, data.message);
    }
    return data.content;
  }

  // DELETE /submission/{id}
  async deleteSubmission(submissionId: string): Promise<string> {
    const url = new URL(`${this.baseUrl}/submission/${submissionId}`);
    url.searchParams.set("apiKey", this.apiKey);

    const res = await this.fetchFn(url.toString(), { method: "DELETE" });
    if (!res.ok) throw new JotFormError(res.status, await res.text());
    const data = await res.json() as JotFormDeleteResponse;
    if (data.responseCode !== 200) {
      throw new JotFormError(data.responseCode, data.message);
    }
    return data.content;
  }
}
