// viber.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/viber.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface ViberSender {
  name: string;
  avatar?: string;
}

// set_webhook

export interface ViberSetWebhookParams {
  url: string;
  event_types?: Array<
    "delivered" | "seen" | "failed" | "conversation_started" | "message"
  >;
  send_name?: boolean;
  send_photo?: boolean;
}

export interface ViberSetWebhookResponse {
  status: number;
  status_message: string;
  event_types: string[];
}

// send_message — text

export interface ViberSendTextParams {
  receiver: string; // opaque Viber User ID, e.g. "01234567890A="
  sender: ViberSender;
  text: string;
}

export interface ViberSendMessageResponse {
  status: number;
  status_message: string;
  message_token: number;
  billing_status?: number;
}

// send_message — rich media

export interface ViberRichMediaButton {
  Columns: number;
  Rows: number;
  ActionType: "none" | "open-url" | "reply" | "location-picker" | "share-phone";
  ActionBody?: string;
  Text?: string;
  TextHAlign?: "left" | "center" | "right";
  TextVAlign?: "top" | "middle" | "bottom";
  BgColor?: string;
  BgMedia?: string;
}

export interface ViberRichMedia {
  Type: "rich_media";
  ButtonsGroupColumns: number;
  ButtonsGroupRows: number;
  BgColor?: string;
  Buttons: ViberRichMediaButton[];
}

export interface ViberSendRichMediaParams {
  receiver: string;
  sender: ViberSender;
  rich_media: ViberRichMedia;
}

// get_account_info

export interface ViberGetAccountInfoResponse {
  status: number;
  status_message: string;
  id: string;
  name: string;
  uri: string;
  icon?: string;
  background?: string;
  category?: string;
  subcategory?: string;
  members_count?: number;
  online_members_count?: number;
}

// broadcast_message

export interface ViberBroadcastMessageParams {
  broadcast_list: string[]; // up to 300 Viber User IDs
  sender: ViberSender;
  type: "text";
  text: string;
}

export interface ViberBroadcastMessageResponse {
  status: number;
  status_message: string;
  failed_list: string[];
}

// ---------------------------------------------------------------------------
// Webhook payload types (inbound — for handler reference)
// ---------------------------------------------------------------------------

export interface ViberWebhookMessagePayload {
  event: "message";
  timestamp: number;
  message_token: number;
  sender: {
    id: string;
    name: string;
    language?: string;
    country?: string;
  };
  message: {
    type: string;
    text?: string;
    token: number;
    tracking_data?: string;
  };
}

export interface ViberWebhookConversationStartedPayload {
  event: "conversation_started";
  timestamp: number;
  user: {
    id: string;
    name: string;
    language?: string;
    country?: string;
  };
  subscribed: boolean;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ViberError extends Error {
  constructor(public readonly viberStatus: number, message: string) {
    super(`Viber status ${viberStatus}: ${message}`);
    this.name = "ViberError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ViberClient {
  static readonly BASE_URL = "https://chatapi.viber.com/pa";

  constructor(
    private readonly authToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): Record<string, string> {
    return {
      "X-Viber-Auth-Token": this.authToken,
      "Content-Type": "application/json",
    };
  }

  /**
   * POST to a Viber PA endpoint. Checks HTTP status then checks `status !== 0`
   * inside the response body, both of which indicate failure.
   */
  private async post<T extends { status: number; status_message: string }>(
    path: string,
    body: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(`${ViberClient.BASE_URL}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ViberError(res.status, await res.text());
    }
    const data = (await res.json()) as T;
    if (data.status !== 0) {
      throw new ViberError(data.status, data.status_message);
    }
    return data;
  }

  // POST /set_webhook
  async setWebhook(params: ViberSetWebhookParams): Promise<ViberSetWebhookResponse> {
    return this.post<ViberSetWebhookResponse>("/set_webhook", params);
  }

  // POST /send_message — text
  async sendText(params: ViberSendTextParams): Promise<ViberSendMessageResponse> {
    return this.post<ViberSendMessageResponse>("/send_message", {
      receiver: params.receiver,
      type: "text",
      sender: params.sender,
      text: params.text,
    });
  }

  // POST /send_message — rich media (button card)
  async sendRichMedia(
    params: ViberSendRichMediaParams,
  ): Promise<ViberSendMessageResponse> {
    return this.post<ViberSendMessageResponse>("/send_message", {
      receiver: params.receiver,
      type: "rich_media",
      sender: params.sender,
      rich_media: params.rich_media,
    });
  }

  // POST /get_account_info
  async getAccountInfo(): Promise<ViberGetAccountInfoResponse> {
    return this.post<ViberGetAccountInfoResponse>("/get_account_info", {});
  }

  // POST /broadcast_message
  async broadcastMessage(
    params: ViberBroadcastMessageParams,
  ): Promise<ViberBroadcastMessageResponse> {
    return this.post<ViberBroadcastMessageResponse>(
      "/broadcast_message",
      params,
    );
  }
}
