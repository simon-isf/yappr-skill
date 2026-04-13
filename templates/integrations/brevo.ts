export class BrevoError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Brevo ${status}: ${message}`);
    this.name = "BrevoError";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrevoContact {
  id: number;
  email: string;
  emailBlacklisted: boolean;
  smsBlacklisted: boolean;
  attributes: Record<string, unknown>;
  listIds: number[];
}

export interface BrevoContactList {
  id: number;
  name: string;
  totalBlacklisted: number;
  totalSubscribers: number;
}

export interface BrevoUpsertContactParams {
  email: string;
  attributes?: Record<string, unknown>;
  listIds?: number[];
  unlinkListIds?: number[];
  smsBlacklisted?: boolean;
  emailBlacklisted?: boolean;
  /** When true, updates the contact if it already exists (upsert). Default: false */
  updateEnabled?: boolean;
}

export interface BrevoUpdateContactParams {
  attributes?: Record<string, unknown>;
  listIds?: number[];
  unlinkListIds?: number[];
  smsBlacklisted?: boolean;
  emailBlacklisted?: boolean;
}

export interface BrevoSendEmailParams {
  to: Array<{ email: string; name?: string }>;
  sender: { email: string; name?: string };
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  /** Use templateId instead of inline content */
  templateId?: number;
  params?: Record<string, unknown>;
}

export interface BrevoSendEmailResponse {
  messageId: string;
}

export interface BrevoSendSmsParams {
  /** 3–11 alphanumeric chars or a phone number */
  sender: string;
  /** E.164 format, e.g. "+972501234567" */
  recipient: string;
  content: string;
  /** "transactional" bypasses marketing unsubscribe lists */
  type: "transactional" | "marketing";
}

export interface BrevoSendSmsResponse {
  reference: string;
  messageId: number;
  smsCount?: number;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class BrevoClient {
  readonly baseUrl = "https://api.brevo.com/v3";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "api-key": this.apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const json = await res.json() as { message?: string };
        if (json.message) message = json.message;
      } catch {
        // ignore parse errors
      }
      throw new BrevoError(res.status, message);
    }

    // 204 No Content
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  /**
   * Get a contact by email address or phone number (URL-encode the identifier).
   * Throws BrevoError(404) if not found.
   */
  getContact(identifier: string): Promise<BrevoContact> {
    return this.request<BrevoContact>(
      "GET",
      `/contacts/${encodeURIComponent(identifier)}`,
    );
  }

  /**
   * Create or upsert a contact.
   * Set `updateEnabled: true` to upsert (update if exists, create if not).
   * Returns 201 with an empty body on success.
   */
  async createContact(params: BrevoUpsertContactParams): Promise<void> {
    await this.request<void>("POST", "/contacts", params);
  }

  /**
   * Update an existing contact by email address or phone number.
   */
  async updateContact(
    identifier: string,
    params: BrevoUpdateContactParams,
  ): Promise<void> {
    await this.request<void>(
      "PUT",
      `/contacts/${encodeURIComponent(identifier)}`,
      params,
    );
  }

  // ── Lists ─────────────────────────────────────────────────────────────────

  /** List all contact lists. Use to look up list IDs for disposition routing. */
  getLists(): Promise<{ lists: BrevoContactList[] }> {
    return this.request<{ lists: BrevoContactList[] }>("GET", "/contacts/lists");
  }

  // ── Transactional Email ───────────────────────────────────────────────────

  /**
   * Send a transactional email with inline content or a template ID.
   * Returns the messageId on success.
   */
  sendEmail(params: BrevoSendEmailParams): Promise<BrevoSendEmailResponse> {
    return this.request<BrevoSendEmailResponse>("POST", "/smtp/email", params);
  }

  // ── Transactional SMS ─────────────────────────────────────────────────────

  /** Send a transactional or marketing SMS. */
  sendSms(params: BrevoSendSmsParams): Promise<BrevoSendSmsResponse> {
    return this.request<BrevoSendSmsResponse>(
      "POST",
      "/transactionalSMS/sms",
      params,
    );
  }
}
