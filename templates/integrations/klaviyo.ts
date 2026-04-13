// klaviyo.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/klaviyo.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface KlaviyoProfileAttributes {
  email?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  properties?: Record<string, unknown>;
}

export interface KlaviyoProfile {
  type: "profile";
  id: string;
  attributes: KlaviyoProfileAttributes;
}

export interface KlaviyoProfileResponse {
  data: KlaviyoProfile;
}

export interface KlaviyoProfilesResponse {
  data: KlaviyoProfile[];
}

export interface KlaviyoCreateProfileParams {
  data: {
    type: "profile";
    attributes: KlaviyoProfileAttributes;
  };
}

export interface KlaviyoEventProperties {
  disposition?: string;
  call_duration_seconds?: number;
  agent_name?: string;
  recording_url?: string;
  [key: string]: unknown;
}

export interface KlaviyoTrackEventParams {
  data: {
    type: "event";
    attributes: {
      profile: {
        data: {
          type: "profile";
          attributes: {
            phone_number?: string;
            email?: string;
          };
        };
      };
      metric: {
        data: {
          type: "metric";
          attributes: {
            name: string;
          };
        };
      };
      properties?: KlaviyoEventProperties;
      time?: string;
      value?: number;
    };
  };
}

export interface KlaviyoBulkImportProfile {
  type: "profile";
  attributes: KlaviyoProfileAttributes;
}

export interface KlaviyoBulkImportParams {
  data: {
    type: "profile-bulk-import-job";
    attributes: {
      profiles: {
        data: KlaviyoBulkImportProfile[];
      };
    };
  };
}

export interface KlaviyoBulkImportJob {
  type: "profile-bulk-import-job";
  id: string;
  attributes: {
    status: string;
    total_count: number;
    completed_count: number;
    failed_count: number;
  };
}

export interface KlaviyoBulkImportResponse {
  data: KlaviyoBulkImportJob;
}

export interface KlaviyoMetric {
  type: "metric";
  id: string;
  attributes: {
    name: string;
    created: string;
    updated: string;
    integration?: {
      object: string;
      name: string;
    };
  };
}

export interface KlaviyoMetricsResponse {
  data: KlaviyoMetric[];
}

export interface KlaviyoAddToListParams {
  data: Array<{ type: "profile"; id: string }>;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class KlaviyoError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Klaviyo ${status}: ${message}`);
    this.name = "KlaviyoError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const KLAVIYO_REVISION = "2024-02-15";

export class KlaviyoClient {
  readonly baseUrl = "https://a.klaviyo.com/api";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Klaviyo-API-Key ${this.apiKey}`,
      "revision": KLAVIYO_REVISION,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
  }

  // POST /profiles — create or upsert profile
  // 200 = existing profile updated, 201 = new profile, 409 = conflict (existing by email/phone)
  async createProfile(params: KlaviyoCreateProfileParams): Promise<KlaviyoProfileResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/profiles`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok && res.status !== 409) {
      throw new KlaviyoError(res.status, await res.text());
    }
    return res.json() as Promise<KlaviyoProfileResponse>;
  }

  // GET /profiles?filter=equals(phone_number,"+972...")
  async getProfileByPhone(phoneNumber: string): Promise<KlaviyoProfilesResponse> {
    const url = new URL(`${this.baseUrl}/profiles`);
    url.searchParams.set("filter", `equals(phone_number,"${phoneNumber}")`);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new KlaviyoError(res.status, await res.text());
    return res.json() as Promise<KlaviyoProfilesResponse>;
  }

  // GET /profiles?filter=equals(email,"...")
  async getProfileByEmail(email: string): Promise<KlaviyoProfilesResponse> {
    const url = new URL(`${this.baseUrl}/profiles`);
    url.searchParams.set("filter", `equals(email,"${email}")`);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new KlaviyoError(res.status, await res.text());
    return res.json() as Promise<KlaviyoProfilesResponse>;
  }

  // POST /events — track a custom event (202 Accepted on success)
  async trackEvent(params: KlaviyoTrackEventParams): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/events`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new KlaviyoError(res.status, await res.text());
  }

  // POST /profile-import — bulk upsert profiles
  async bulkImportProfiles(
    params: KlaviyoBulkImportParams,
  ): Promise<KlaviyoBulkImportResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/profile-import`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new KlaviyoError(res.status, await res.text());
    return res.json() as Promise<KlaviyoBulkImportResponse>;
  }

  // GET /metrics — list all metrics
  async getMetrics(): Promise<KlaviyoMetricsResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/metrics`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new KlaviyoError(res.status, await res.text());
    return res.json() as Promise<KlaviyoMetricsResponse>;
  }

  // POST /lists/{list_id}/relationships/profiles — add profiles to a list
  async addProfilesToList(
    listId: string,
    params: KlaviyoAddToListParams,
  ): Promise<void> {
    const res = await this.fetchFn(
      `${this.baseUrl}/lists/${listId}/relationships/profiles`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new KlaviyoError(res.status, await res.text());
  }
}
