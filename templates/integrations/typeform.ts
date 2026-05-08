// typeform.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/typeform.md

// ---------------------------------------------------------------------------
// Answer types
// ---------------------------------------------------------------------------

export type TypeformAnswerType =
  | "text"
  | "email"
  | "phone_number"
  | "number"
  | "boolean"
  | "choice"
  | "choices"
  | "date"
  | string;

export interface TypeformAnswer {
  type: TypeformAnswerType;
  field: {
    id: string;
    ref: string;
    type: string;
  };
  /** Present when type === "text" */
  text?: string;
  /** Present when type === "email" */
  email?: string;
  /** Present when type === "phone_number" */
  phone_number?: string;
  /** Present when type === "number" | "rating" | "opinion_scale" */
  number?: number;
  /** Present when type === "boolean" */
  boolean?: boolean;
  /** Present when type === "choice" | "dropdown" */
  choice?: { label: string };
  /** Present when type === "choices" (multi-select) */
  choices?: { labels: string[] };
  /** Present when type === "date" */
  date?: string;
}

// ---------------------------------------------------------------------------
// Webhook payload interfaces
// ---------------------------------------------------------------------------

export interface TypeformFieldDefinition {
  id: string;
  ref: string;
  type: string;
  title: string;
}

export interface TypeformFormResponse {
  form_id: string;
  token: string;
  landed_at: string;
  submitted_at: string;
  definition: {
    id: string;
    title: string;
    fields: TypeformFieldDefinition[];
  };
  answers: TypeformAnswer[];
  /** Hidden fields passed via URL: ?field1=value1 */
  hidden?: Record<string, string>;
}

export interface TypeformWebhookBody {
  event_id: string;
  event_type: string;
  form_response: TypeformFormResponse;
}

/** Normalized lead extracted from a Typeform form_response webhook. */
export interface TypeformLead {
  eventId: string;
  formId: string;
  responseToken: string;
  submittedAt: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  /** All answers keyed by field ref → string value. */
  answers: Record<string, string>;
  hidden: Record<string, string>;
}

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export interface TypeformForm {
  id: string;
  title: string;
  fields: TypeformFieldDefinition[];
}

export interface TypeformResponsesPage {
  total_items: number;
  page_count: number;
  items: Array<{
    token: string;
    submitted_at: string;
    answers: TypeformAnswer[];
  }>;
}

export interface TypeformWebhookConfig {
  id?: string;
  tag: string;
  url: string;
  enabled: boolean;
  verify_ssl?: boolean;
  secret?: string;
}

export interface TypeformWebhookListResponse {
  items: TypeformWebhookConfig[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class TypeformError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Typeform ${status}: ${message}`);
    this.name = "TypeformError";
  }
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

/**
 * Verify a Typeform webhook signature.
 * Typeform sets `Typeform-Signature: sha256=base64(hmac-sha256(body, secret))`.
 *
 * @param body      Raw request body string (before JSON.parse)
 * @param signature Value of the `Typeform-Signature` header
 * @param secret    The webhook secret you configured on the Typeform webhook
 */
export async function verifyTypeformSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature.startsWith("sha256=")) return false;
  const b64Sig = signature.slice("sha256=".length);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(body));

  // Encode computed HMAC as base64
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // Constant-time comparison
  if (computed.length !== b64Sig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ b64Sig.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Parse a Typeform `form_response` webhook body into a normalized TypeformLead.
 * Returns `null` if the event is not a `form_response`.
 *
 * @throws {TypeError} if the payload structure is invalid
 */
export function parseTypeformWebhookPayload(body: unknown): TypeformLead | null {
  const payload = body as TypeformWebhookBody;

  if (!payload || typeof payload !== "object") {
    throw new TypeError("Invalid Typeform webhook payload");
  }
  if (payload.event_type !== "form_response") return null;

  const fr = payload.form_response;
  if (!fr || !Array.isArray(fr.answers)) {
    throw new TypeError("Invalid Typeform webhook payload: missing form_response.answers");
  }

  const answers = fr.answers;

  return {
    eventId: payload.event_id,
    formId: fr.form_id,
    responseToken: fr.token,
    submittedAt: fr.submitted_at,
    phone: getAnswer(answers, "phone") ?? getAnswerByType(answers, "phone_number"),
    name: getAnswer(answers, "full_name") ?? getAnswer(answers, "name"),
    email: getAnswer(answers, "email") ?? getAnswerByType(answers, "email"),
    answers: Object.fromEntries(
      answers
        .filter((a) => a.field?.ref)
        .map((a) => [a.field.ref, extractAnswerValue(a) ?? ""]),
    ),
    hidden: fr.hidden ?? {},
  };
}

// ---------------------------------------------------------------------------
// Answer extraction utilities
// ---------------------------------------------------------------------------

/**
 * Find an answer by field `ref` and return its string value.
 * Use `ref` (not `id`) — it's a stable identifier you set in the Typeform builder.
 */
export function getAnswer(answers: TypeformAnswer[], ref: string): string | null {
  const answer = answers.find((a) => a.field?.ref === ref);
  if (!answer) return null;
  return extractAnswerValue(answer);
}

/**
 * Find the first answer whose `type` matches and return its string value.
 * Useful for auto-detecting phone or email fields when refs are not known.
 */
export function getAnswerByType(
  answers: TypeformAnswer[],
  type: TypeformAnswerType,
): string | null {
  const answer = answers.find((a) => a.type === type);
  if (!answer) return null;
  return extractAnswerValue(answer);
}

/**
 * Extract the string value from a TypeformAnswer regardless of type.
 * Returns `null` if the type is not recognised or the value is missing.
 */
export function extractAnswerValue(answer: TypeformAnswer): string | null {
  switch (answer.type) {
    case "text":
      return answer.text ?? null;
    case "email":
      return answer.email ?? null;
    case "phone_number":
      return answer.phone_number ?? null;
    case "number":
      return answer.number !== undefined ? String(answer.number) : null;
    case "boolean":
      return answer.boolean !== undefined ? (answer.boolean ? "yes" : "no") : null;
    case "choice":
      return answer.choice?.label ?? null;
    case "choices":
      return answer.choices?.labels?.join(", ") ?? null;
    case "date":
      return answer.date ?? null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export class TypeformClient {
  static readonly baseUrl = "https://api.typeform.com";

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

  private async request<T>(
    method: string,
    path: string,
    query: Record<string, string> = {},
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${TypeformClient.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new TypeformError(res.status, await res.text());
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /** GET /forms/{form_id} — fetch form definition and field list. */
  async getForm(formId: string): Promise<TypeformForm> {
    return this.request<TypeformForm>("GET", `/forms/${formId}`);
  }

  /**
   * GET /forms/{form_id}/responses — fetch paginated form responses.
   *
   * @param pageSize  Number of responses per page (max 1000)
   * @param since     ISO 8601 date string — return responses submitted after this time
   */
  async getResponses(
    formId: string,
    pageSize = 50,
    since?: string,
  ): Promise<TypeformResponsesPage> {
    const query: Record<string, string> = {
      page_size: String(pageSize),
      sort: "submitted_at,desc",
    };
    if (since) query["since"] = since;
    return this.request<TypeformResponsesPage>("GET", `/forms/${formId}/responses`, query);
  }

  /** GET /forms/{form_id}/webhooks — list all webhooks for a form. */
  async listWebhooks(formId: string): Promise<TypeformWebhookListResponse> {
    return this.request<TypeformWebhookListResponse>(
      "GET",
      `/forms/${formId}/webhooks`,
    );
  }

  /**
   * PUT /forms/{form_id}/webhooks/{tag} — create or update a webhook.
   * Use a stable `tag` like "yappr-calls" to upsert idempotently.
   */
  async upsertWebhook(
    formId: string,
    tag: string,
    config: Omit<TypeformWebhookConfig, "id" | "tag">,
  ): Promise<TypeformWebhookConfig> {
    return this.request<TypeformWebhookConfig>(
      "PUT",
      `/forms/${formId}/webhooks/${tag}`,
      {},
      config,
    );
  }

  /** DELETE /forms/{form_id}/webhooks/{tag} — remove a webhook. */
  async deleteWebhook(formId: string, tag: string): Promise<void> {
    return this.request<void>("DELETE", `/forms/${formId}/webhooks/${tag}`);
  }
}
