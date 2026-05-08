// sendgrid.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/sendgrid.md

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendGridEmailAddress {
  email: string;
  name?: string;
}

export interface SendGridPersonalization {
  to: SendGridEmailAddress[];
  subject?: string;
  dynamic_template_data?: Record<string, unknown>;
}

export interface SendGridContent {
  type: "text/plain" | "text/html";
  value: string;
}

export interface SendGridReplyTo {
  email: string;
  name?: string;
}

export interface SendGridTrackingSettings {
  subscription_tracking?: {
    enable: boolean;
  };
  open_tracking?: {
    enable: boolean;
  };
  click_tracking?: {
    enable: boolean;
  };
}

/** Parameters for POST /v3/mail/send */
export interface SendEmailParams {
  personalizations: SendGridPersonalization[];
  from: SendGridEmailAddress;
  /** Required when not using a dynamic template. */
  content?: SendGridContent[];
  /** Dynamic Template ID (d-xxxx). Use instead of `content` for templated emails. */
  template_id?: string;
  reply_to?: SendGridReplyTo;
  /** Up to 10 categories for filtering in the SendGrid activity feed. */
  categories?: string[];
  /** Arbitrary key-value metadata attached to the send event. */
  custom_args?: Record<string, string>;
  tracking_settings?: SendGridTrackingSettings;
}

export interface SendGridStats {
  date: string;
  stats: Array<{
    metrics: {
      delivers: number;
      opens: number;
      clicks: number;
      bounces: number;
      spam_reports: number;
    };
  }>;
}

export interface SendGridStatsParams {
  start_date: string; // YYYY-MM-DD
  end_date?: string;
  aggregated_by?: "day" | "week" | "month";
}

export interface SendGridEmailValidationResult {
  email: string;
  verdict: "Valid" | "Risky" | "Invalid";
  score: number;
}

export interface SendGridEmailValidationResponse {
  result: SendGridEmailValidationResult;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class SendGridError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`SendGrid ${status}: ${message}`);
    this.name = "SendGridError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SendGridClient {
  readonly baseUrl = "https://api.sendgrid.com/v3";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async post(path: string, body: unknown): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let message: string;
      try {
        const err = await res.json() as { errors?: Array<{ message: string }> };
        message = err.errors?.[0]?.message ?? res.statusText;
      } catch {
        message = await res.text();
      }
      throw new SendGridError(res.status, message);
    }
    // 202 Accepted — no body
  }

  private async postWithResponse<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let message: string;
      try {
        const err = await res.json() as { errors?: Array<{ message: string }> };
        message = err.errors?.[0]?.message ?? res.statusText;
      } catch {
        message = await res.text();
      }
      throw new SendGridError(res.status, message);
    }
    return res.json() as Promise<T>;
  }

  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) {
      let message: string;
      try {
        const err = await res.json() as { errors?: Array<{ message: string }> };
        message = err.errors?.[0]?.message ?? res.statusText;
      } catch {
        message = await res.text();
      }
      throw new SendGridError(res.status, message);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Send an email via POST /v3/mail/send.
   *
   * For inline emails: provide `content` (text/plain + text/html).
   * For dynamic templates: provide `template_id` and `dynamic_template_data` in each personalization.
   * Supports up to 1,000 personalizations per call (batch send).
   *
   * Success is `202 Accepted` with no response body.
   */
  async sendEmail(params: SendEmailParams): Promise<void> {
    await this.post("/mail/send", params);
  }

  /**
   * Retrieve aggregate send statistics.
   * @param params.start_date Required. Format: YYYY-MM-DD.
   */
  async getStats(params: SendGridStatsParams): Promise<SendGridStats[]> {
    const query: Record<string, string> = { start_date: params.start_date };
    if (params.end_date) query["end_date"] = params.end_date;
    if (params.aggregated_by) query["aggregated_by"] = params.aggregated_by;
    return this.get<SendGridStats[]>("/stats", query);
  }

  /**
   * Validate an email address. Requires the Email Validation add-on.
   */
  async validateEmail(
    email: string,
    source?: string,
  ): Promise<SendGridEmailValidationResponse> {
    return this.postWithResponse<SendGridEmailValidationResponse>(
      "/validations/email",
      { email, ...(source ? { source } : {}) },
    );
  }
}
