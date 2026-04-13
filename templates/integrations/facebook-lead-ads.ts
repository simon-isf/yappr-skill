// facebook-lead-ads.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/facebook-lead-ads.md

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Normalized lead extracted from a Facebook leadgen webhook + Graph API response. */
export interface FacebookLead {
  leadgenId: string;
  formId: string;
  pageId: string;
  adId?: string;
  adsetId?: string;
  createdTime: number; // Unix timestamp from webhook
  phone: string;
  name: string;
  email?: string;
  /** All raw field_data entries keyed by field name. */
  fields: Record<string, string>;
}

export interface FacebookLeadDetails {
  id: string;
  created_time: string;
  form_id: string;
  field_data: Array<{ name: string; values: string[] }>;
}

export interface FacebookFormQuestion {
  type: string;
  key: string;
  label: string;
}

export interface FacebookFormSchema {
  questions: FacebookFormQuestion[];
}

export interface FacebookLeadsPage {
  data: FacebookLeadDetails[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
}

export interface FacebookTokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Raw webhook body sent by Meta for a new leadgen event. */
export interface FacebookWebhookBody {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    changes: Array<{
      field: string;
      value: {
        leadgen_id: string;
        page_id: string;
        form_id: string;
        created_time: number;
        ad_id?: string;
        adset_id?: string;
      };
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class FacebookError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`FacebookLeadAds ${status}: ${message}`);
    this.name = "FacebookError";
  }
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

/**
 * Verify a Facebook webhook POST signature.
 * Meta sets `X-Hub-Signature-256: sha256=<hex>` using HMAC-SHA256 of the raw
 * request body with your app secret.
 *
 * @param body      Raw request body string (before JSON.parse)
 * @param signature Value of the `X-Hub-Signature-256` header
 * @param appSecret Your Meta app secret
 */
export async function verifyFacebookSignature(
  body: string,
  signature: string,
  appSecret: string,
): Promise<boolean> {
  if (!signature.startsWith("sha256=")) return false;
  const hexSig = signature.slice("sha256=".length);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(body));

  // Convert ArrayBuffer to hex
  const computed = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (computed.length !== hexSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ hexSig.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Parse a Facebook leadgen webhook body into an array of lead stubs.
 * Each item contains only the IDs available in the webhook — call
 * `FacebookLeadApiClient.getLeadDetails` to retrieve the actual field data.
 *
 * @throws {TypeError} if the payload is not a valid Facebook leadgen webhook.
 */
export function parseFacebookLeadPayload(body: unknown): Array<{
  leadgenId: string;
  pageId: string;
  formId: string;
  createdTime: number;
  adId?: string;
  adsetId?: string;
}> {
  const payload = body as FacebookWebhookBody;

  if (!payload || typeof payload !== "object" || !Array.isArray(payload.entry)) {
    throw new TypeError("Invalid Facebook webhook payload: missing entry array");
  }

  const leads: Array<{
    leadgenId: string;
    pageId: string;
    formId: string;
    createdTime: number;
    adId?: string;
    adsetId?: string;
  }> = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) {
        const v = change.value;
        leads.push({
          leadgenId: v.leadgen_id,
          pageId: v.page_id,
          formId: v.form_id,
          createdTime: v.created_time,
          adId: v.ad_id,
          adsetId: v.adset_id,
        });
      }
    }
  }

  return leads;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export class FacebookLeadApiClient {
  static readonly baseUrl = "https://graph.facebook.com/v19.0";

  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${FacebookLeadApiClient.baseUrl}${path}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), { method: "GET" });
    if (!res.ok) throw new FacebookError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  private async postForm<T>(path: string, fields: Record<string, string>): Promise<T> {
    const url = new URL(`${FacebookLeadApiClient.baseUrl}${path}`);
    const body = new URLSearchParams({ ...fields, access_token: this.accessToken });
    const res = await this.fetchFn(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) throw new FacebookError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  /**
   * GET /{leadgen_id} — fetch all field data for a specific lead.
   * Use this immediately after receiving a webhook to get phone/name/email.
   */
  async getLeadDetails(leadgenId: string): Promise<FacebookLeadDetails> {
    return this.get<FacebookLeadDetails>(`/${leadgenId}`);
  }

  /**
   * GET /{form_id}?fields=questions — fetch form field definitions.
   * Use this to discover the key names used by a form.
   */
  async getFormSchema(formId: string): Promise<FacebookFormSchema> {
    return this.get<FacebookFormSchema>(`/${formId}`, { fields: "questions" });
  }

  /**
   * GET /{form_id}/leads — list all leads submitted to a form.
   * Returns raw field_data; use `normalizeIsraeliPhone` before triggering calls.
   */
  async getFormLeads(
    formId: string,
    after?: string,
  ): Promise<FacebookLeadsPage> {
    const query: Record<string, string> = { fields: "field_data,created_time" };
    if (after) query["after"] = after;
    return this.get<FacebookLeadsPage>(`/${formId}/leads`, query);
  }

  /**
   * POST /{page_id}/subscribed_apps — subscribe the page to leadgen webhook events.
   * Must also register the webhook URL in Meta for Developers → Webhooks.
   */
  async subscribePageToWebhook(pageId: string): Promise<{ success: boolean }> {
    return this.postForm<{ success: boolean }>(`/${pageId}/subscribed_apps`, {
      subscribed_fields: "leadgen",
    });
  }

  /**
   * GET /oauth/access_token — exchange a short-lived token for a long-lived one (~60 days).
   */
  async exchangeToken(
    appId: string,
    appSecret: string,
    shortLivedToken: string,
  ): Promise<FacebookTokenExchangeResponse> {
    return this.get<FacebookTokenExchangeResponse>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    });
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Normalize an Israeli phone number to E.164 (+972XXXXXXXXX).
 * Handles formats: 05X-XXX-XXXX, 0501234567, +972-50-123-4567, 97250...
 */
export function normalizeIsraeliPhone(raw: string): string {
  const digits = raw.replace(/[\s\-().+]/g, "");
  if (digits.startsWith("05")) return "+972" + digits.slice(1);
  if (digits.startsWith("972")) return "+" + digits;
  return raw;
}

/**
 * Extract field values from a `field_data` array into a plain object.
 * `field_data` order is not guaranteed — always access by key.
 */
export function extractFieldData(
  fieldData: Array<{ name: string; values: string[] }>,
): Record<string, string> {
  return Object.fromEntries(fieldData.map((f) => [f.name, f.values[0] ?? ""]));
}
