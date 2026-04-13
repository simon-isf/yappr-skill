// discord.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/discord.md

// ---------------------------------------------------------------------------
// Shared embed types
// ---------------------------------------------------------------------------

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbedFooter {
  text: string;
  icon_url?: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: DiscordEmbedFooter;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface WebhookMessageParams {
  content?: string | null;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

// Success is 204 No Content — no response body
export type WebhookResponse = void;

// ---------------------------------------------------------------------------
// Bot token: send message to channel
// ---------------------------------------------------------------------------

export interface SendMessageParams {
  content?: string;
  embeds?: DiscordEmbed[];
  message_reference?: {
    message_id: string;
  };
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  timestamp: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Bot token: edit message
// ---------------------------------------------------------------------------

export interface EditMessageParams {
  content?: string;
  embeds?: DiscordEmbed[];
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class DiscordError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Discord ${status}: ${message}`);
    this.name = "DiscordError";
  }
}

// ---------------------------------------------------------------------------
// Webhook-only client (no bot token needed)
// ---------------------------------------------------------------------------

export class DiscordWebhookClient {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  /** Post a message (with optional embeds) to the webhook channel. */
  async send(params: WebhookMessageParams): Promise<WebhookResponse> {
    const res = await this.fetchFn(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    // Discord returns 204 No Content on success
    if (res.status === 204) return;
    // Some configurations return 200 with a message object
    if (res.status === 200) return;
    throw new DiscordError(res.status, await res.text());
  }
}

// ---------------------------------------------------------------------------
// Bot token client (Authorization: Bot {token})
// ---------------------------------------------------------------------------

export class DiscordClient {
  readonly baseUrl = "https://discord.com/api/v10";

  constructor(
    private readonly botToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bot ${this.botToken}`,
      "Content-Type": "application/json",
    };
  }

  /** Send a message to a channel. Supports embeds and thread replies via message_reference. */
  async sendMessage(
    channelId: string,
    params: SendMessageParams,
  ): Promise<DiscordMessage> {
    const res = await this.fetchFn(
      `${this.baseUrl}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new DiscordError(res.status, await res.text());
    return res.json() as Promise<DiscordMessage>;
  }

  /** Reply to an existing message in a channel. */
  async replyToMessage(
    channelId: string,
    messageId: string,
    params: Omit<SendMessageParams, "message_reference">,
  ): Promise<DiscordMessage> {
    return this.sendMessage(channelId, {
      ...params,
      message_reference: { message_id: messageId },
    });
  }

  /** Edit an existing message. */
  async editMessage(
    channelId: string,
    messageId: string,
    params: EditMessageParams,
  ): Promise<DiscordMessage> {
    const res = await this.fetchFn(
      `${this.baseUrl}/channels/${channelId}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new DiscordError(res.status, await res.text());
    return res.json() as Promise<DiscordMessage>;
  }
}
