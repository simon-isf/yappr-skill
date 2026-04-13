// resend-email.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/resend-email.md

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResendTag {
  name: string;
  value: string;
}

export interface SendEmailParams {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  scheduled_at?: string; // ISO 8601
  tags?: ResendTag[];
}

export interface SendEmailResponse {
  id: string;
}

export interface BatchSendResponse {
  data: Array<{ id: string }>;
}

export interface EmailStatus {
  id: string;
  object: "email";
  to: string[];
  from: string;
  subject: string;
  created_at: string;
  last_event:
    | "queued"
    | "sent"
    | "delivered"
    | "opened"
    | "clicked"
    | "bounced"
    | "complained";
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ResendError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Resend ${status}: ${message}`);
    this.name = "ResendError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ResendClient {
  readonly baseUrl = "https://api.resend.com";

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

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message: string;
      try {
        const err = await res.json() as { message?: string; name?: string };
        message = err.message ?? err.name ?? res.statusText;
      } catch {
        message = await res.text();
      }
      throw new ResendError(res.status, message);
    }
    return res.json() as Promise<T>;
  }

  /** Send a single transactional email. Returns the Resend email id. */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResponse> {
    return this.request<SendEmailResponse>("POST", "/emails", params);
  }

  /**
   * Send multiple separate emails in one request.
   * Maximum 100 emails per batch.
   */
  async sendBatch(emails: SendEmailParams[]): Promise<BatchSendResponse> {
    return this.request<BatchSendResponse>("POST", "/emails/batch", emails);
  }

  /** Retrieve the delivery status of a previously sent email. */
  async getEmailStatus(id: string): Promise<EmailStatus> {
    return this.request<EmailStatus>("GET", `/emails/${id}`);
  }

  /**
   * Cancel a scheduled email (only works before it has been sent).
   * Returns the updated email status.
   */
  async cancelEmail(id: string): Promise<EmailStatus> {
    return this.request<EmailStatus>("POST", `/emails/${id}/cancel`);
  }
}
