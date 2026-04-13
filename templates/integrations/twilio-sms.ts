// twilio-sms.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/twilio-sms.md

export interface TwilioSendSmsParams {
  to: string;
  from: string;
  body: string;
}

export interface TwilioSendSmsResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  numSegments: string;
  errorCode: string | null;
  errorMessage: string | null;
  dateCreated: string;
  dateSent: string | null;
  accountSid: string;
  direction: string;
}

export interface TwilioSendWhatsAppParams {
  /** E.164 number, will be prefixed with "whatsapp:" automatically */
  to: string;
  /** E.164 number or WhatsApp sandbox number, will be prefixed with "whatsapp:" automatically */
  from: string;
  body: string;
}

export interface TwilioGetMessageResponse {
  sid: string;
  status: string;
  errorCode: string | null;
  to: string;
}

export interface TwilioListMessagesParams {
  to?: string;
  from?: string;
  pageSize?: number;
}

export interface TwilioListMessagesResponse {
  messages: TwilioGetMessageResponse[];
  end: number;
  start: number;
  pageSize: number;
  nextPageUri: string | null;
}

export interface TwilioBuyNumberParams {
  phoneNumber: string;
}

export interface TwilioBuyNumberResponse {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  status: string;
  accountSid: string;
}

export interface TwilioLookupResponse {
  phoneNumber: string;
  nationalFormat: string;
  countryCode: string;
  lineTypeIntelligence: {
    type: string;
    carrierName: string;
  } | null;
}

export class TwilioError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Twilio ${status}: ${message}`);
    this.name = "TwilioError";
  }
}

export class TwilioClient {
  readonly baseUrl: string;
  readonly lookupsBaseUrl = "https://lookups.twilio.com/v2";

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  }

  private get headers(): HeadersInit {
    const credentials = btoa(`${this.accountSid}:${this.authToken}`);
    return {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  private get authHeaders(): HeadersInit {
    const credentials = btoa(`${this.accountSid}:${this.authToken}`);
    return {
      Authorization: `Basic ${credentials}`,
    };
  }

  private async throwIfError(res: Response): Promise<void> {
    if (!res.ok) {
      let message: string;
      try {
        const data = await res.json();
        message = data.message ?? data.error_message ?? res.statusText;
      } catch {
        message = res.statusText;
      }
      throw new TwilioError(res.status, message);
    }
  }

  /** POST /Messages.json — Send an SMS */
  async sendSms(params: TwilioSendSmsParams): Promise<TwilioSendSmsResponse> {
    const body = new URLSearchParams({
      From: params.from,
      To: params.to,
      Body: params.body,
    });

    const res = await this.fetchFn(`${this.baseUrl}/Messages.json`, {
      method: "POST",
      headers: this.headers,
      body: body.toString(),
    });

    await this.throwIfError(res);
    const data = await res.json();

    return {
      sid: data.sid,
      status: data.status,
      to: data.to,
      from: data.from,
      body: data.body,
      numSegments: data.num_segments,
      errorCode: data.error_code,
      errorMessage: data.error_message,
      dateCreated: data.date_created,
      dateSent: data.date_sent,
      accountSid: data.account_sid,
      direction: data.direction,
    };
  }

  /**
   * POST /Messages.json — Send a WhatsApp message via Twilio.
   * Requires Twilio WhatsApp Sandbox (dev) or approved WhatsApp Business number (prod).
   */
  async sendWhatsApp(
    params: TwilioSendWhatsAppParams,
  ): Promise<TwilioSendSmsResponse> {
    const body = new URLSearchParams({
      From: `whatsapp:${params.from}`,
      To: `whatsapp:${params.to}`,
      Body: params.body,
    });

    const res = await this.fetchFn(`${this.baseUrl}/Messages.json`, {
      method: "POST",
      headers: this.headers,
      body: body.toString(),
    });

    await this.throwIfError(res);
    const data = await res.json();

    return {
      sid: data.sid,
      status: data.status,
      to: data.to,
      from: data.from,
      body: data.body,
      numSegments: data.num_segments,
      errorCode: data.error_code,
      errorMessage: data.error_message,
      dateCreated: data.date_created,
      dateSent: data.date_sent,
      accountSid: data.account_sid,
      direction: data.direction,
    };
  }

  /** GET /Messages/{MessageSid}.json — Get message status */
  async getMessage(messageSid: string): Promise<TwilioGetMessageResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/Messages/${messageSid}.json`,
      { headers: this.authHeaders },
    );

    await this.throwIfError(res);
    const data = await res.json();

    return {
      sid: data.sid,
      status: data.status,
      errorCode: data.error_code,
      to: data.to,
    };
  }

  /** GET /Messages.json — List messages with optional filters */
  async listMessages(
    params: TwilioListMessagesParams = {},
  ): Promise<TwilioListMessagesResponse> {
    const query = new URLSearchParams();
    if (params.to) query.set("To", params.to);
    if (params.from) query.set("From", params.from);
    if (params.pageSize) query.set("PageSize", String(params.pageSize));

    const url = `${this.baseUrl}/Messages.json${query.size ? `?${query}` : ""}`;
    const res = await this.fetchFn(url, { headers: this.authHeaders });

    await this.throwIfError(res);
    const data = await res.json();

    return {
      messages: (data.messages ?? []).map(
        (m: Record<string, unknown>) => ({
          sid: m.sid,
          status: m.status,
          errorCode: m.error_code,
          to: m.to,
        }),
      ),
      end: data.end,
      start: data.start,
      pageSize: data.page_size,
      nextPageUri: data.next_page_uri ?? null,
    };
  }

  /** POST /IncomingPhoneNumbers.json — Buy a phone number */
  async buyPhoneNumber(
    params: TwilioBuyNumberParams,
  ): Promise<TwilioBuyNumberResponse> {
    const body = new URLSearchParams({
      PhoneNumber: params.phoneNumber,
    });

    const res = await this.fetchFn(`${this.baseUrl}/IncomingPhoneNumbers.json`, {
      method: "POST",
      headers: this.headers,
      body: body.toString(),
    });

    await this.throwIfError(res);
    const data = await res.json();

    return {
      sid: data.sid,
      phoneNumber: data.phone_number,
      friendlyName: data.friendly_name,
      status: data.status,
      accountSid: data.account_sid,
    };
  }

  /**
   * GET https://lookups.twilio.com/v2/PhoneNumbers/{phone} — Lookup a phone number.
   * Validates the number and returns carrier/line-type info.
   */
  async lookupPhoneNumber(
    phoneNumber: string,
    fields = "line_type_intelligence",
  ): Promise<TwilioLookupResponse> {
    const url = `${this.lookupsBaseUrl}/PhoneNumbers/${encodeURIComponent(phoneNumber)}?Fields=${fields}`;
    const res = await this.fetchFn(url, { headers: this.authHeaders });

    await this.throwIfError(res);
    const data = await res.json();

    return {
      phoneNumber: data.phone_number,
      nationalFormat: data.national_format,
      countryCode: data.country_code,
      lineTypeIntelligence: data.line_type_intelligence
        ? { type: data.line_type_intelligence.type, carrierName: data.line_type_intelligence.carrier_name }
        : null,
    };
  }
}
