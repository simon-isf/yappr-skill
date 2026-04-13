// google-lead-forms.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/google-lead-forms.md

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
// Interfaces
// ---------------------------------------------------------------------------

export interface GoogleLeadColumnData {
  column_id: string;
  string_value: string;
}

export interface GoogleLeadPayload {
  lead_id: string;
  api_version: string;
  form_id: number;
  google_key: string;
  user_column_data: GoogleLeadColumnData[];
  adgroup_id: number;
  campaign_id: number;
  creative_id: number;
  is_test: boolean;
}

/**
 * All possible column_id values from Google Lead Form Extensions.
 * Not all fields appear in every payload — only the fields enabled on the form.
 */
export type GoogleLeadColumnId =
  | "FULL_NAME"
  | "PHONE_NUMBER"
  | "EMAIL"
  | "POSTAL_CODE"
  | "CITY"
  | "COUNTRY"
  | "COMPANY_NAME"
  | "JOB_TITLE"
  | "WORK_EMAIL"
  | "WORK_PHONE";

/** Normalised lead extracted from a Google Lead Form webhook. */
export interface GoogleLead {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  leadId: string;
  formId: number;
  campaignId: number;
  adgroupId: number;
  creativeId: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a field by column_id from user_column_data. */
export function extractGoogleLeadField(
  data: GoogleLeadColumnData[],
  columnId: GoogleLeadColumnId,
): string | undefined {
  return data.find((d) => d.column_id === columnId)?.string_value;
}

/** Split a "First Last" full name into its parts. */
export function parseFullName(fullName?: string): { firstName?: string; lastName?: string } {
  if (!fullName) return {};
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
  };
}

// ---------------------------------------------------------------------------
// Webhook validation
// ---------------------------------------------------------------------------

/**
 * Validate the `google_key` in the incoming payload against your configured secret.
 * Google does not use HMAC — it sends the raw secret inside the payload body.
 *
 * @param payload - Parsed webhook payload object.
 * @param secret  - Your `google_key` as configured in Google Ads.
 * @returns true if the key matches.
 */
export function verifyGoogleLeadKey(payload: GoogleLeadPayload, secret: string): boolean {
  return payload.google_key === secret;
}

// ---------------------------------------------------------------------------
// Payload parser
// ---------------------------------------------------------------------------

/**
 * Parse and validate a raw Google Lead Form webhook payload.
 *
 * - Validates google_key against `secret`.
 * - Returns `null` for test payloads (`is_test: true`) — caller should respond 200 and skip.
 * - Throws GoogleLeadFormError if the key is invalid or if no phone field is present.
 */
export function parseGoogleLeadPayload(
  body: unknown,
  secret: string,
): GoogleLead | null {
  if (body === null || typeof body !== "object") {
    throw new GoogleLeadFormError(400, "Payload must be a JSON object");
  }

  const payload = body as GoogleLeadPayload;

  if (!verifyGoogleLeadKey(payload, secret)) {
    throw new GoogleLeadFormError(401, "Invalid google_key");
  }

  // Test submissions — skip silently
  if (payload.is_test) return null;

  const cols = payload.user_column_data ?? [];
  const rawPhone =
    extractGoogleLeadField(cols, "PHONE_NUMBER") ??
    extractGoogleLeadField(cols, "WORK_PHONE");

  if (!rawPhone) {
    throw new GoogleLeadFormError(422, `No phone field in lead ${payload.lead_id}`);
  }

  const phone = normalizeIsraeliPhone(rawPhone);

  return {
    phone,
    name: extractGoogleLeadField(cols, "FULL_NAME"),
    email:
      extractGoogleLeadField(cols, "EMAIL") ??
      extractGoogleLeadField(cols, "WORK_EMAIL"),
    company: extractGoogleLeadField(cols, "COMPANY_NAME"),
    jobTitle: extractGoogleLeadField(cols, "JOB_TITLE"),
    city: extractGoogleLeadField(cols, "CITY"),
    country: extractGoogleLeadField(cols, "COUNTRY"),
    postalCode: extractGoogleLeadField(cols, "POSTAL_CODE"),
    leadId: payload.lead_id,
    formId: payload.form_id,
    campaignId: payload.campaign_id,
    adgroupId: payload.adgroup_id,
    creativeId: payload.creative_id,
  };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GoogleLeadFormError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`GoogleLeadForm ${status}: ${message}`);
    this.name = "GoogleLeadFormError";
  }
}
