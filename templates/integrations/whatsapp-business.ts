// whatsapp-business.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/whatsapp-business.md

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface WabaSendResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status: string }>;
}

// ---------------------------------------------------------------------------
// Template message types
// ---------------------------------------------------------------------------

export interface WabaTemplateComponentParameter {
  type: "text" | "currency" | "date_time";
  text?: string;
}

export interface WabaTemplateComponent {
  type: "header" | "body" | "button";
  parameters: WabaTemplateComponentParameter[];
  sub_type?: string;
  index?: number;
}

export interface WabaTemplate {
  name: string;
  language: { code: string };
  components?: WabaTemplateComponent[];
}

export interface WabaSendTemplateParams {
  to: string; // e.g. "972501234567" — no +, no spaces
  template: WabaTemplate;
}

// ---------------------------------------------------------------------------
// Free-form text message types
// ---------------------------------------------------------------------------

export interface WabaSendTextParams {
  to: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Document message types
// ---------------------------------------------------------------------------

export interface WabaSendDocumentParams {
  to: string;
  link: string;
  caption?: string;
  filename?: string;
}

// ---------------------------------------------------------------------------
// Interactive button message types
// ---------------------------------------------------------------------------

export interface WabaButtonReply {
  id: string;
  title: string;
}

export interface WabaButton {
  type: "reply";
  reply: WabaButtonReply;
}

export interface WabaSendInteractiveButtonParams {
  to: string;
  bodyText: string;
  buttons: WabaButtonReply[]; // up to 3
}

// ---------------------------------------------------------------------------
// Template management types
// ---------------------------------------------------------------------------

export interface WabaTemplateRecord {
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  language: string;
  components: Array<{
    type: string;
    text?: string;
  }>;
}

export interface WabaGetTemplatesResponse {
  data: WabaTemplateRecord[];
}

export interface WabaCreateTemplateParams {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: Array<{
    type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
    text?: string;
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  }>;
}

export interface WabaCreateTemplateResponse {
  id: string;
  status: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class WhatsAppBusinessError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`WhatsAppBusiness ${status}: ${message}`);
    this.name = "WhatsAppBusinessError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class WhatsAppBusinessClient {
  static readonly BASE_URL = "https://graph.facebook.com/v19.0";

  constructor(
    private readonly phoneNumberId: string,
    private readonly wabaId: string,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(
      `${WhatsAppBusinessClient.BASE_URL}${path}`,
      {
        method: "POST",
        headers: this.authHeaders,
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) throw new WhatsAppBusinessError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchFn(
      `${WhatsAppBusinessClient.BASE_URL}${path}`,
      { method: "GET", headers: this.authHeaders },
    );
    if (!res.ok) throw new WhatsAppBusinessError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // POST /{phone_number_id}/messages — template
  async sendTemplate(params: WabaSendTemplateParams): Promise<WabaSendResponse> {
    return this.post<WabaSendResponse>(`/${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      to: params.to,
      type: "template",
      template: params.template,
    });
  }

  // POST /{phone_number_id}/messages — free-form text (24-hour window)
  async sendText(params: WabaSendTextParams): Promise<WabaSendResponse> {
    return this.post<WabaSendResponse>(`/${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      to: params.to,
      type: "text",
      text: { body: params.text },
    });
  }

  // POST /{phone_number_id}/messages — document
  async sendDocument(params: WabaSendDocumentParams): Promise<WabaSendResponse> {
    return this.post<WabaSendResponse>(`/${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      to: params.to,
      type: "document",
      document: {
        link: params.link,
        ...(params.caption !== undefined ? { caption: params.caption } : {}),
        ...(params.filename !== undefined ? { filename: params.filename } : {}),
      },
    });
  }

  // POST /{phone_number_id}/messages — interactive buttons
  async sendInteractiveButtons(
    params: WabaSendInteractiveButtonParams,
  ): Promise<WabaSendResponse> {
    return this.post<WabaSendResponse>(`/${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      to: params.to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: params.bodyText },
        action: {
          buttons: params.buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    });
  }

  // GET /{waba_id}/message_templates
  async getTemplates(): Promise<WabaGetTemplatesResponse> {
    return this.get<WabaGetTemplatesResponse>(
      `/${this.wabaId}/message_templates`,
    );
  }

  // POST /{waba_id}/message_templates
  async createTemplate(
    params: WabaCreateTemplateParams,
  ): Promise<WabaCreateTemplateResponse> {
    return this.post<WabaCreateTemplateResponse>(
      `/${this.wabaId}/message_templates`,
      params,
    );
  }
}
