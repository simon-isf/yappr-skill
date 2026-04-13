// slack.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/slack.md

// ---------------------------------------------------------------------------
// Shared Block Kit types
// ---------------------------------------------------------------------------

export interface SlackTextObject {
  type: "plain_text" | "mrkdwn";
  text: string;
  emoji?: boolean;
}

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackAttachment {
  color?: string;
  fallback?: string;
  blocks?: SlackBlock[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface WebhookParams {
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

// Response is plain-text "ok"
export type WebhookResponse = "ok";

// ---------------------------------------------------------------------------
// chat.postMessage
// ---------------------------------------------------------------------------

export interface PostMessageParams {
  channel: string;
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  thread_ts?: string;
  unfurl_links?: boolean;
}

export interface PostMessageResponse {
  ok: boolean;
  channel: string;
  ts: string;
  message: {
    text: string;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// chat.update
// ---------------------------------------------------------------------------

export interface UpdateMessageParams {
  channel: string;
  ts: string;
  text: string;
  blocks?: SlackBlock[];
}

export interface UpdateMessageResponse {
  ok: boolean;
  channel: string;
  ts: string;
  text: string;
}

// ---------------------------------------------------------------------------
// files.uploadV2
// ---------------------------------------------------------------------------

export interface UploadFileParams {
  channel_id: string;
  filename: string;
  content: string;
}

export interface UploadFileResponse {
  ok: boolean;
  file?: {
    id: string;
    name: string;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// conversations.list
// ---------------------------------------------------------------------------

export interface ListChannelsParams {
  types?: string;
  limit?: number;
  cursor?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
  [key: string]: unknown;
}

export interface ListChannelsResponse {
  ok: boolean;
  channels: SlackChannel[];
  response_metadata?: {
    next_cursor?: string;
  };
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class SlackError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Slack ${status}: ${message}`);
    this.name = "SlackError";
  }
}

// ---------------------------------------------------------------------------
// Webhook-only client (no bot token needed)
// ---------------------------------------------------------------------------

export class SlackWebhookClient {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async send(params: WebhookParams): Promise<WebhookResponse> {
    const res = await this.fetchFn(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new SlackError(res.status, await res.text());
    const body = await res.text();
    // Slack webhooks return plain "ok" on success
    if (body !== "ok") throw new SlackError(res.status, body);
    return "ok";
  }
}

// ---------------------------------------------------------------------------
// Bot token client (xoxb-...)
// ---------------------------------------------------------------------------

export class SlackClient {
  readonly baseUrl = "https://slack.com/api";

  constructor(
    private readonly botToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.botToken}`,
      "Content-Type": "application/json",
    };
  }

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}/${endpoint}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new SlackError(res.status, await res.text());
    const data = await res.json() as { ok: boolean; error?: string } & T;
    if (!data.ok) throw new SlackError(200, data.error ?? "unknown Slack API error");
    return data as T;
  }

  private async get<T>(endpoint: string, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new SlackError(res.status, await res.text());
    const data = await res.json() as { ok: boolean; error?: string } & T;
    if (!data.ok) throw new SlackError(200, data.error ?? "unknown Slack API error");
    return data as T;
  }

  /** Send a message to a channel (supports threading via thread_ts). */
  async postMessage(params: PostMessageParams): Promise<PostMessageResponse> {
    return this.post<PostMessageResponse>("chat.postMessage", params);
  }

  /** Reply inside an existing thread. */
  async postThreadReply(
    channel: string,
    threadTs: string,
    text: string,
    blocks?: SlackBlock[],
  ): Promise<PostMessageResponse> {
    return this.postMessage({ channel, thread_ts: threadTs, text, blocks });
  }

  /** Update a previously sent message. */
  async updateMessage(params: UpdateMessageParams): Promise<UpdateMessageResponse> {
    return this.post<UpdateMessageResponse>("chat.update", params);
  }

  /** Upload a file (e.g. a call transcript) to a channel. */
  async uploadFile(params: UploadFileParams): Promise<UploadFileResponse> {
    return this.post<UploadFileResponse>("files.uploadV2", params);
  }

  /** List channels the bot can see. */
  async listChannels(params: ListChannelsParams = {}): Promise<ListChannelsResponse> {
    const query: Record<string, string> = {
      types: params.types ?? "public_channel,private_channel",
    };
    if (params.limit !== undefined) query["limit"] = String(params.limit);
    if (params.cursor) query["cursor"] = params.cursor;
    return this.get<ListChannelsResponse>("conversations.list", query);
  }
}
