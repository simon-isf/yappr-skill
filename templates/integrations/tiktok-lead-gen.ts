// tiktok-lead-gen.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/tiktok-lead-gen.md

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TikTokFormQuestion {
  field_name: string;
  value: string;
}

export interface TikTokFormData {
  questions: TikTokFormQuestion[];
}

export interface TikTokLead {
  task_id: string;
  ad_id: string;
  adgroup_id: string;
  campaign_id: string;
  create_time: number; // Unix seconds
  form_data: TikTokFormData;
}

export interface TikTokPageInfo {
  total_number: number;
  page: number;
  page_size: number;
  total_page: number;
}

export interface TikTokLeadListResponse {
  code: number;
  message: string;
  data: {
    list: TikTokLead[];
    page_info: TikTokPageInfo;
  };
}

export interface TikTokLeadResponse {
  code: number;
  message: string;
  data: {
    list: TikTokLead[];
  };
}

/** Parsed from the POST webhook notification body. Contains only IDs — no lead data. */
export interface TikTokWebhookNotification {
  ad_id: string;
  adgroup_id: string;
  campaign_id: string;
  advertiser_id: string;
  task_id: string;
  form_id: string;
  create_time: number;
}

export interface ListLeadsParams {
  advertiser_id: string;
  page?: number;
  page_size?: number;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class TikTokLeadError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`TikTokLead ${status}: ${message}`);
    this.name = "TikTokLeadError";
  }
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the HMAC-SHA256 signature sent in the `X-TikTok-Signature` header.
 *
 * @param rawBody   Raw request body string (before JSON.parse).
 * @param signature Value of the `X-TikTok-Signature` header.
 * @param appSecret TikTok app secret used as the HMAC key.
 */
export async function verifyTikTokSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );

  const computed = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === signature.toLowerCase();
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class TikTokLeadApiClient {
  readonly baseUrl = "https://business-api.tiktok.com/open_api/v1.3";

  constructor(
    private readonly accessToken: string,
    private readonly advertiserId: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Access-Token": this.accessToken,
      "Content-Type": "application/json",
    };
  }

  private async get<T extends { code: number; message: string }>(
    path: string,
    query: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new TikTokLeadError(res.status, await res.text());
    const data = await res.json() as T;
    if (data.code !== 0) throw new TikTokLeadError(data.code, data.message);
    return data;
  }

  /**
   * Fetch a single lead by task_id. Use this after receiving a webhook notification.
   * Returns null when the API returns an empty list for the given task_id.
   */
  async fetchLead(taskId: string): Promise<TikTokLead | null> {
    const data = await this.get<TikTokLeadResponse>("/lead/task/", {
      task_id: taskId,
      advertiser_id: this.advertiserId,
    });
    return data.data?.list?.[0] ?? null;
  }

  /**
   * List leads for the configured advertiser. Useful for polling or backfill.
   */
  async listLeads(params: Omit<ListLeadsParams, "advertiser_id"> = {}): Promise<TikTokLeadListResponse> {
    const query: Record<string, string> = {
      advertiser_id: this.advertiserId,
      page: String(params.page ?? 1),
      page_size: String(params.page_size ?? 10),
    };
    return this.get<TikTokLeadListResponse>("/lead/task/list/", query);
  }
}
