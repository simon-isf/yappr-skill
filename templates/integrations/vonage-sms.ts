// vonage-sms.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/vonage-sms.md

export interface VonageSendSmsParams {
  /** Vonage virtual number or alphanumeric sender ID (max 11 chars). For Israel, use a virtual number. */
  from: string;
  /** E.164 without leading +, e.g. "972501234567" */
  to: string;
  text: string;
  /** Set to "unicode" for Hebrew/Arabic/emoji content */
  type?: "text" | "unicode";
}

export interface VonageSendSmsMessage {
  to: string;
  messageId: string;
  status: string;
  remainingBalance: string;
  messagePrice: string;
  network: string;
  errorText?: string;
}

export interface VonageSendSmsResponse {
  messageCount: number;
  messages: VonageSendSmsMessage[];
}

export interface VonageStartVerifyParams {
  brand: string;
  /** E.164 without leading +, e.g. "972501234567" */
  to: string;
}

export interface VonageStartVerifyResponse {
  requestId: string;
}

export interface VonageCheckVerifyParams {
  requestId: string;
  code: string;
}

export interface VonageCheckVerifyResponse {
  status: string;
}

/** Inbound delivery receipt payload (sent by Vonage to your webhook URL) */
export interface VonageDeliveryReceipt {
  msisdn: string;
  to: string;
  networkCode: string;
  messageId: string;
  price: string;
  status: string;
  scts: string;
  errCode: string;
  messageTimestamp: string;
}

/** Inbound SMS webhook payload */
export interface VonageInboundSms {
  msisdn: string;
  to: string;
  messageId: string;
  text: string;
  type: string;
  keyword: string;
  messageTimestamp: string;
}

export class VonageError extends Error {
  constructor(
    public readonly status: number,
    public readonly vonageStatus?: string,
    message?: string,
  ) {
    super(`Vonage ${vonageStatus ?? status}: ${message}`);
    this.name = "VonageError";
  }
}

export class VonageClient {
  readonly smsBaseUrl = "https://rest.nexmo.com";
  readonly apiBaseUrl = "https://api.nexmo.com";

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  /** Basic auth header for newer API endpoints (api.nexmo.com) */
  private get basicAuthHeaders(): HeadersInit {
    const credentials = btoa(`${this.apiKey}:${this.apiSecret}`);
    return {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * POST /sms/json — Send an SMS.
   * Credentials are passed in the form-encoded body per the SMS API spec.
   * Throws VonageError if the API returns a non-zero status on any message.
   */
  async sendSms(params: VonageSendSmsParams): Promise<VonageSendSmsResponse> {
    const formParams: Record<string, string> = {
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      from: params.from,
      to: params.to,
      text: params.text,
    };

    if (params.type) {
      formParams.type = params.type;
    }

    const res = await this.fetchFn(`${this.smsBaseUrl}/sms/json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(formParams).toString(),
    });

    if (!res.ok) {
      throw new VonageError(res.status, undefined, res.statusText);
    }

    const data = await res.json();
    const messages: VonageSendSmsMessage[] = (data.messages ?? []).map(
      (m: Record<string, string>) => ({
        to: m.to,
        messageId: m["message-id"],
        status: m.status,
        remainingBalance: m["remaining-balance"],
        messagePrice: m["message-price"],
        network: m.network,
        errorText: m["error-text"],
      }),
    );

    // Vonage uses status "0" for success; anything else is an error
    const failed = messages.find((m) => m.status !== "0");
    if (failed) {
      throw new VonageError(
        res.status,
        failed.status,
        failed.errorText ?? "message rejected",
      );
    }

    return {
      messageCount: Number(data["message-count"]),
      messages,
    };
  }

  /**
   * POST https://api.nexmo.com/v2/verify — Start a phone number verification (OTP).
   * Uses Basic auth (newer API).
   */
  async startVerify(
    params: VonageStartVerifyParams,
  ): Promise<VonageStartVerifyResponse> {
    const res = await this.fetchFn(`${this.apiBaseUrl}/v2/verify`, {
      method: "POST",
      headers: this.basicAuthHeaders,
      body: JSON.stringify({
        brand: params.brand,
        workflow: [{ channel: "sms", to: params.to }],
      }),
    });

    if (!res.ok) {
      let message: string;
      try {
        const data = await res.json();
        message = data.title ?? data.detail ?? res.statusText;
      } catch {
        message = res.statusText;
      }
      throw new VonageError(res.status, undefined, message);
    }

    const data = await res.json();
    return { requestId: data.request_id };
  }

  /**
   * POST https://api.nexmo.com/v2/verify/{request_id} — Check the OTP code submitted by the user.
   * Uses Basic auth (newer API).
   */
  async checkVerify(
    params: VonageCheckVerifyParams,
  ): Promise<VonageCheckVerifyResponse> {
    const res = await this.fetchFn(
      `${this.apiBaseUrl}/v2/verify/${params.requestId}`,
      {
        method: "POST",
        headers: this.basicAuthHeaders,
        body: JSON.stringify({ code: params.code }),
      },
    );

    if (!res.ok) {
      let message: string;
      try {
        const data = await res.json();
        message = data.title ?? data.detail ?? res.statusText;
      } catch {
        message = res.statusText;
      }
      throw new VonageError(res.status, undefined, message);
    }

    const data = await res.json();
    return { status: data.status };
  }
}
