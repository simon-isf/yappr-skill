// greenapi-whatsapp.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/greenapi-whatsapp.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface GreenApiSendMessageParams {
  chatId: string; // e.g. "972501234567@c.us"
  message: string;
  quotedMessageId?: string | null;
}

export interface GreenApiSendMessageResponse {
  idMessage: string;
}

export interface GreenApiSendFileByUrlParams {
  chatId: string;
  urlFile: string;
  fileName: string;
  caption?: string;
}

export interface GreenApiSendFileByUrlResponse {
  idMessage: string;
}

export interface GreenApiSendLinkPreviewParams {
  chatId: string;
  urlLink: string;
  quotedMessageId?: string | null;
}

export interface GreenApiSendLinkPreviewResponse {
  idMessage: string;
}

export interface GreenApiGetStateInstanceResponse {
  stateInstance: "authorized" | "notAuthorized" | "blocked";
}

export interface GreenApiGetMessageStatusResponse {
  status: "sent" | "delivered" | "read" | "failed";
}

export interface GreenApiCheckWhatsappParams {
  phoneNumber: string; // e.g. "972501234567" — digits only, no @c.us
}

export interface GreenApiCheckWhatsappResponse {
  existsWhatsapp: boolean;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GreenApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`GreenAPI ${status}: ${message}`);
    this.name = "GreenApiError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GreenApiClient {
  readonly baseUrl: string;

  constructor(
    private readonly instanceId: string,
    private readonly apiToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://api.green-api.com/waInstance${instanceId}`;
  }

  // POST /waInstance{id}/sendMessage/{token}
  async sendMessage(
    params: GreenApiSendMessageParams,
  ): Promise<GreenApiSendMessageResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/sendMessage/${this.apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new GreenApiError(res.status, await res.text());
    return res.json() as Promise<GreenApiSendMessageResponse>;
  }

  // POST /waInstance{id}/sendFileByUrl/{token}
  async sendFileByUrl(
    params: GreenApiSendFileByUrlParams,
  ): Promise<GreenApiSendFileByUrlResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/sendFileByUrl/${this.apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new GreenApiError(res.status, await res.text());
    return res.json() as Promise<GreenApiSendFileByUrlResponse>;
  }

  // POST /waInstance{id}/sendLinkPreview/{token}
  async sendLinkPreview(
    params: GreenApiSendLinkPreviewParams,
  ): Promise<GreenApiSendLinkPreviewResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/sendLinkPreview/${this.apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new GreenApiError(res.status, await res.text());
    return res.json() as Promise<GreenApiSendLinkPreviewResponse>;
  }

  // GET /waInstance{id}/getStateInstance/{token}
  async getStateInstance(): Promise<GreenApiGetStateInstanceResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/getStateInstance/${this.apiToken}`,
      { method: "GET" },
    );
    if (!res.ok) throw new GreenApiError(res.status, await res.text());
    return res.json() as Promise<GreenApiGetStateInstanceResponse>;
  }

  // GET /waInstance{id}/getMessageStatus/{token}?idMessage=...
  async getMessageStatus(
    idMessage: string,
  ): Promise<GreenApiGetMessageStatusResponse> {
    const url = new URL(
      `${this.baseUrl}/getMessageStatus/${this.apiToken}`,
    );
    url.searchParams.set("idMessage", idMessage);
    const res = await this.fetchFn(url.toString(), { method: "GET" });
    if (!res.ok) throw new GreenApiError(res.status, await res.text());
    return res.json() as Promise<GreenApiGetMessageStatusResponse>;
  }

  // POST /waInstance{id}/checkWhatsapp/{token}
  async checkWhatsapp(
    params: GreenApiCheckWhatsappParams,
  ): Promise<GreenApiCheckWhatsappResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/checkWhatsapp/${this.apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new GreenApiError(res.status, await res.text());
    return res.json() as Promise<GreenApiCheckWhatsappResponse>;
  }
}
