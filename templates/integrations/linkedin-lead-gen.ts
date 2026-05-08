// linkedin-lead-gen.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/linkedin-lead-gen.md

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
// Country dial-code map
// ---------------------------------------------------------------------------

const COUNTRY_DIAL_CODES: Record<string, string> = {
  IL: "972",
  US: "1",
  GB: "44",
  DE: "49",
  FR: "33",
  AU: "61",
  CA: "1",
  NL: "31",
  SE: "46",
  CH: "41",
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface LinkedInPhoneAnswer {
  number: string;
  countryCode: string;
}

export interface LinkedInAnswer {
  questionType: string;
  stringAnswer?: string;
  phoneAnswer?: LinkedInPhoneAnswer;
}

export interface LinkedInFormResponse {
  answers: LinkedInAnswer[];
}

/** Raw webhook payload from LinkedIn Lead Gen Form webhook. */
export interface LinkedInWebhookPayload {
  owner: string;
  leadId: string;
  submittedAt: number; // Unix timestamp in milliseconds
  formResponse: LinkedInFormResponse;
}

/** Normalised lead extracted from a LinkedIn webhook payload. */
export interface LinkedInLead {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  companySize?: string;
  industry?: string;
  phoneCountryCode?: string;
  leadId: string;
  owner: string;
  submittedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the `X-LI-Signature` header using HMAC-SHA256.
 *
 * LinkedIn may sign payloads with `sha256=<base64-hmac>`. Pass the raw
 * request body string, the full header value, and your shared secret.
 *
 * @param body   - Raw request body string (before JSON.parse).
 * @param header - Value of the `X-LI-Signature` header (e.g. "sha256=...").
 * @param secret - Your shared webhook secret.
 * @returns true if the signature is valid.
 */
export async function verifyLinkedInSignature(
  body: string,
  header: string,
  secret: string,
): Promise<boolean> {
  const prefix = "sha256=";
  if (!header.startsWith(prefix)) return false;
  const receivedB64 = header.slice(prefix.length);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  // Constant-time comparison via XOR to prevent timing attacks
  if (receivedB64.length !== expectedB64.length) return false;
  let diff = 0;
  for (let i = 0; i < receivedB64.length; i++) {
    diff |= receivedB64.charCodeAt(i) ^ expectedB64.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Answer extraction helper
// ---------------------------------------------------------------------------

const QUESTION_TYPE_KEY_MAP: Record<string, keyof LinkedInExtracted> = {
  FULL_NAME: "fullName",
  EMAIL: "email",
  COMPANY: "company",
  JOB_TITLE: "jobTitle",
  COMPANY_SIZE: "companySize",
  INDUSTRY: "industry",
};

interface LinkedInExtracted {
  phone?: string;
  phoneCountryCode?: string;
  fullName?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  companySize?: string;
  industry?: string;
}

/**
 * Extract all recognisable fields from a LinkedIn answers array.
 * Phone is converted to E.164 using the `countryCode` field.
 * Falls back to `normalizeIsraeliPhone` when the country code is unknown.
 */
export function extractLinkedInAnswers(answers: LinkedInAnswer[]): LinkedInExtracted {
  const result: LinkedInExtracted = {};

  for (const answer of answers) {
    if (answer.phoneAnswer) {
      const { number, countryCode } = answer.phoneAnswer;
      const dialCode = COUNTRY_DIAL_CODES[countryCode];
      if (dialCode) {
        const local = number.startsWith("0") ? number.slice(1) : number;
        result.phone = `+${dialCode}${local}`;
      } else {
        // Unknown country — try Israeli normalizer then store as-is
        result.phone = normalizeIsraeliPhone(number);
      }
      result.phoneCountryCode = countryCode;
    } else if (answer.stringAnswer !== undefined) {
      const key = QUESTION_TYPE_KEY_MAP[answer.questionType];
      if (key) result[key] = answer.stringAnswer;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Webhook payload parser
// ---------------------------------------------------------------------------

/**
 * Parse and validate a LinkedIn Lead Gen Form webhook payload.
 *
 * - If `allowedOwners` is non-empty, the payload's `owner` must be in the set.
 * - Throws LinkedInLeadGenError if the owner is not allowed or no phone is found.
 */
export function parseLinkedInWebhookPayload(
  body: unknown,
  allowedOwners?: Set<string>,
): LinkedInLead {
  if (body === null || typeof body !== "object") {
    throw new LinkedInLeadGenError(400, "Payload must be a JSON object");
  }

  const payload = body as LinkedInWebhookPayload;

  if (allowedOwners && allowedOwners.size > 0 && !allowedOwners.has(payload.owner)) {
    throw new LinkedInLeadGenError(403, `Owner not in allowlist: ${payload.owner}`);
  }

  const extracted = extractLinkedInAnswers(payload.formResponse?.answers ?? []);

  if (!extracted.phone) {
    throw new LinkedInLeadGenError(422, `No phone field in lead ${payload.leadId}`);
  }

  return {
    phone: extracted.phone,
    name: extracted.fullName,
    email: extracted.email,
    company: extracted.company,
    jobTitle: extracted.jobTitle,
    companySize: extracted.companySize,
    industry: extracted.industry,
    phoneCountryCode: extracted.phoneCountryCode,
    leadId: payload.leadId,
    owner: payload.owner,
    submittedAt: new Date(payload.submittedAt).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class LinkedInLeadGenError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`LinkedInLeadGen ${status}: ${message}`);
    this.name = "LinkedInLeadGenError";
  }
}

// ---------------------------------------------------------------------------
// Marketing API client (pull mode)
// ---------------------------------------------------------------------------

export interface LinkedInLeadFormResponse {
  id: string;
  submittedAt: number;
  owner: string;
  formResponse: LinkedInFormResponse;
}

export interface LinkedInLeadFormResponsesResponse {
  elements: LinkedInLeadFormResponse[];
  paging: { start: number; count: number; total: number };
}

export interface LinkedInMarkConvertedParams {
  leadId: string;
  conversionType: "MEETING_SCHEDULED" | "PURCHASE" | "SIGN_UP" | string;
}

export class LinkedInApiClient {
  readonly baseUrl = "https://api.linkedin.com/rest";
  readonly liVersion = "202402";

  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.accessToken}`,
      "LinkedIn-Version": this.liVersion,
      "Content-Type": "application/json",
    };
  }

  /**
   * GET /leadFormResponses
   * Fetch all lead form responses for an organization submitted after a given timestamp.
   */
  async getLeadFormResponses(
    ownerUrn: string,
    submittedAfterMs?: number,
  ): Promise<LinkedInLeadFormResponsesResponse> {
    const url = new URL(`${this.baseUrl}/leadFormResponses`);
    url.searchParams.set("q", "owner");
    url.searchParams.set("owner", ownerUrn);
    if (submittedAfterMs !== undefined) {
      url.searchParams.set("submittedAfter", String(submittedAfterMs));
    }

    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new LinkedInLeadGenError(res.status, await res.text());
    return res.json() as Promise<LinkedInLeadFormResponsesResponse>;
  }

  /**
   * GET /leadForms/{formUrn}/leadFormResponses
   * Fetch lead responses for a specific form.
   */
  async getFormLeadResponses(
    formUrn: string,
  ): Promise<LinkedInLeadFormResponsesResponse> {
    const url = new URL(
      `${this.baseUrl}/leadForms/${encodeURIComponent(formUrn)}/leadFormResponses`,
    );

    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new LinkedInLeadGenError(res.status, await res.text());
    return res.json() as Promise<LinkedInLeadFormResponsesResponse>;
  }

  /**
   * POST /leads/markAsConverted
   * Mark a lead as converted after a successful call outcome.
   */
  async markLeadAsConverted(params: LinkedInMarkConvertedParams): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/leads/markAsConverted`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new LinkedInLeadGenError(res.status, await res.text());
  }
}
