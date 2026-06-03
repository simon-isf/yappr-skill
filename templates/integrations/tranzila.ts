// tranzila.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/tranzila.md
//
// Tranzila uses the TRAPI (REST v1) JSON API for payment requests (links).
// Auth: terminal name (supplier ID) + API key, both passed in the request body.
// NOTE: Tranzila signals success via `result: 1` in the JSON body, NOT the HTTP
// status code — always check `result`, not just res.ok.

export class TranzilaError extends Error {
  constructor(public readonly result: number, message: string) {
    super(`Tranzila result=${result}: ${message}`);
    this.name = "TranzilaError";
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

/** `1`=ILS, `2`=USD, `3`=EUR, `4`=GBP. Most Israeli businesses use 1. */
export type TranzilaCurrency = 1 | 2 | 3 | 4;

export type TranzilaPaymentStatus =
  | "PENDING"
  | "PAID"
  | "EXPIRED"
  | "CANCELLED";

export interface CreatePaymentRequestParams {
  /** Amount as a decimal, e.g. 150.00 */
  sum: number;
  /** @default 1 (ILS) */
  currency?: TranzilaCurrency;
  description: string;
  /** Payer name (pre-fill on the hosted page) */
  contact?: string;
  /** Local Israeli format, e.g. "0501234567" — NOT E.164 */
  phone?: string;
  email?: string;
  /** Webhook URL Tranzila POSTs (form-encoded) when payment completes */
  notifyUrl?: string;
  successUrl?: string;
  failUrl?: string;
  /** Email to notify the merchant of the payment */
  notifyEmail?: string;
  /** Send the payment link to the payer by email (1) or not (0) */
  sendEmail?: 0 | 1;
  /** Send the payment link to the payer by SMS (1) or not (0) */
  sendSms?: 0 | 1;
}

export interface TranzilaPaymentRequest {
  result: number;
  msg: string;
  pr_id: string;
  link: string;
  short_link?: string;
}

export interface TranzilaPaymentInfo {
  result: number;
  pr_id: string;
  status: TranzilaPaymentStatus;
  sum: number;
  currency: TranzilaCurrency;
  contact?: string;
  transaction_id?: string;
  paid_at?: string;
}

export interface TranzilaPaymentListItem {
  pr_id: string;
  status: TranzilaPaymentStatus;
  sum: number;
  contact?: string;
  created_at: string;
}

export interface TranzilaPaymentList {
  result: number;
  list: TranzilaPaymentListItem[];
}

export interface ListPaymentRequestsParams {
  /** YYYY-MM-DD */
  fromDate?: string;
  /** YYYY-MM-DD */
  toDate?: string;
  status?: TranzilaPaymentStatus;
}

/** Parsed result of a Tranzila `notify_url` callback (form-encoded POST). */
export interface TranzilaWebhookResult {
  /** "000" means the payment succeeded; any other value is an error. */
  responseCode: string | null;
  succeeded: boolean;
  prId: string | null;
  sum: string | null;
  transactionId: string | null;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class TranzilaClient {
  readonly baseUrl = "https://api.tranzila.com/v1";

  /**
   * @param terminalName Tranzila terminal name (supplier ID).
   * @param apiKey       TRAPI API key.
   * @param fetchFn      Optional fetch override (useful for testing).
   */
  constructor(
    private readonly terminalName: string,
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private async request<T extends { result: number; msg?: string }>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminal_name: this.terminalName,
        apikey: this.apiKey,
        ...body,
      }),
    });
    const data = (await res.json()) as T & { error?: string };
    // Tranzila reports failure via result: 0 in the body, even on HTTP 200.
    if (data.result !== 1) {
      throw new TranzilaError(
        data.result,
        data.msg ?? data.error ?? JSON.stringify(data),
      );
    }
    return data;
  }

  /**
   * POST /pr/create — Create a payment request (hosted payment link).
   * Returns the link to send the caller via WhatsApp or SMS (prefer short_link).
   */
  async createPaymentRequest(
    params: CreatePaymentRequestParams,
  ): Promise<TranzilaPaymentRequest> {
    const body: Record<string, unknown> = {
      sum: params.sum,
      currency: params.currency ?? 1,
      description: params.description,
    };
    if (params.contact !== undefined) body.contact = params.contact;
    if (params.phone !== undefined) body.phone = params.phone;
    if (params.email !== undefined) body.email = params.email;
    if (params.notifyUrl !== undefined) body.notify_url = params.notifyUrl;
    if (params.successUrl !== undefined) body.success_url = params.successUrl;
    if (params.failUrl !== undefined) body.fail_url = params.failUrl;
    if (params.notifyEmail !== undefined) body.notify_email = params.notifyEmail;
    if (params.sendEmail !== undefined) body.send_email = params.sendEmail;
    if (params.sendSms !== undefined) body.send_sms = params.sendSms;
    return this.request<TranzilaPaymentRequest>("/pr/create", body);
  }

  /** POST /pr/info — Check the status of a payment request by pr_id. */
  async getPaymentRequest(prId: string): Promise<TranzilaPaymentInfo> {
    return this.request<TranzilaPaymentInfo>("/pr/info", { pr_id: prId });
  }

  /** POST /pr/list — List payment requests, optionally filtered by date and status. */
  async listPaymentRequests(
    params: ListPaymentRequestsParams = {},
  ): Promise<TranzilaPaymentList> {
    const body: Record<string, unknown> = {};
    if (params.fromDate !== undefined) body.from_date = params.fromDate;
    if (params.toDate !== undefined) body.to_date = params.toDate;
    if (params.status !== undefined) body.status = params.status;
    return this.request<TranzilaPaymentList>("/pr/list", body);
  }

  /**
   * Build a hosted payment-page URL for embedding in an iframe (or opening
   * directly). No API call required — the URL is constructed locally.
   * The iframe URL is unauthenticated; never include secrets in its params.
   */
  buildIframeUrl(opts: {
    sum: number;
    currency?: TranzilaCurrency;
    /** `1`=regular, `6`=installments. @default 1 */
    credType?: 1 | 6;
    /** UI language: "il"=Hebrew, "en"=English. @default "il" */
    lang?: "il" | "en";
    description?: string;
    /** Local Israeli format, e.g. "0501234567" */
    phone?: string;
    contact?: string;
    email?: string;
    notifyUrl?: string;
    successUrl?: string;
  }): string {
    const params = new URLSearchParams({
      sum: opts.sum.toString(),
      currency: String(opts.currency ?? 1),
      cred_type: String(opts.credType ?? 1),
      lang: opts.lang ?? "il",
    });
    if (opts.description !== undefined) params.set("pdesc", opts.description);
    if (opts.phone !== undefined) params.set("phone", opts.phone);
    if (opts.contact !== undefined) params.set("contact", opts.contact);
    if (opts.email !== undefined) params.set("email", opts.email);
    if (opts.notifyUrl !== undefined) params.set("notify_url", opts.notifyUrl);
    if (opts.successUrl !== undefined) params.set("success_url", opts.successUrl);
    return `https://direct.tranzila.com/${this.terminalName}/iframenew.php?${params}`;
  }
}

// ── Webhook parsing ───────────────────────────────────────────────────────────

/**
 * Parse a Tranzila `notify_url` callback. Tranzila sends the notification as
 * `application/x-www-form-urlencoded` (NOT JSON), so pass `await req.formData()`.
 * `responseCode === "000"` (and `succeeded === true`) means the payment was
 * approved. Common errors: "051"=insufficient funds, "033"=expired card.
 */
export function parseTranzilaWebhook(form: FormData): TranzilaWebhookResult {
  const responseCode = (form.get("Response") as string | null) ?? null;
  return {
    responseCode,
    succeeded: responseCode === "000",
    prId: (form.get("pr_id") as string | null) ?? null,
    sum: (form.get("sum") as string | null) ?? null,
    transactionId: (form.get("index") as string | null) ?? null,
  };
}
