// microsoft-teams.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/microsoft-teams.md

// ---------------------------------------------------------------------------
// Adaptive Card types (Teams modern format)
// ---------------------------------------------------------------------------

export interface AdaptiveCardTextBlock {
  type: "TextBlock";
  text: string;
  weight?: "Bolder" | "Default" | "Lighter";
  size?: "Small" | "Default" | "Medium" | "Large" | "ExtraLarge";
  wrap?: boolean;
  color?: "Default" | "Dark" | "Light" | "Accent" | "Good" | "Warning" | "Attention";
}

export interface AdaptiveCardFact {
  title: string;
  value: string;
}

export interface AdaptiveCardFactSet {
  type: "FactSet";
  facts: AdaptiveCardFact[];
}

export type AdaptiveCardBodyItem = AdaptiveCardTextBlock | AdaptiveCardFactSet;

export interface AdaptiveCardActionOpenUrl {
  type: "Action.OpenUrl";
  title: string;
  url: string;
}

export interface AdaptiveCard {
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json";
  type: "AdaptiveCard";
  version: "1.4";
  body: AdaptiveCardBodyItem[];
  actions?: AdaptiveCardActionOpenUrl[];
}

export interface AdaptiveCardAttachment {
  contentType: "application/vnd.microsoft.card.adaptive";
  content: AdaptiveCard;
}

export interface AdaptiveCardMessageParams {
  type: "message";
  attachments: AdaptiveCardAttachment[];
}

// ---------------------------------------------------------------------------
// MessageCard types (legacy — simpler, supports themeColor)
// ---------------------------------------------------------------------------

export interface MessageCardFact {
  name: string;
  value: string;
}

export interface MessageCardSection {
  facts?: MessageCardFact[];
  text?: string;
  activityTitle?: string;
  activitySubtitle?: string;
  activityText?: string;
}

export interface MessageCardActionOpenUri {
  "@type": "OpenUri";
  name: string;
  targets: Array<{ os: "default" | "iOS" | "android" | "windows"; uri: string }>;
}

export interface MessageCardParams {
  "@type": "MessageCard";
  "@context": "https://schema.org/extensions";
  summary: string;
  themeColor?: string;
  title?: string;
  text?: string;
  sections?: MessageCardSection[];
  potentialAction?: MessageCardActionOpenUri[];
}

// ---------------------------------------------------------------------------
// Simple text params
// ---------------------------------------------------------------------------

export interface SimpleTextParams {
  text: string;
}

// ---------------------------------------------------------------------------
// Graph API: send channel message
// ---------------------------------------------------------------------------

export interface GraphMessageBody {
  contentType: "html" | "text";
  content: string;
}

export interface GraphSendMessageParams {
  body: GraphMessageBody;
}

export interface GraphMessage {
  id: string;
  createdDateTime: string;
  body: GraphMessageBody;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class TeamsError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Teams ${status}: ${message}`);
    this.name = "TeamsError";
  }
}

// ---------------------------------------------------------------------------
// Incoming Webhook client (webhook URL is the auth — no API key)
// ---------------------------------------------------------------------------

export class TeamsWebhookClient {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private async postWebhook(body: unknown): Promise<void> {
    const res = await this.fetchFn(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new TeamsError(res.status, await res.text());
    // Teams returns plain "1" on success — treat any 2xx as success
  }

  /** Send a plain text message. */
  async sendText(params: SimpleTextParams): Promise<void> {
    return this.postWebhook(params);
  }

  /** Send a MessageCard (legacy format with themeColor support). */
  async sendMessageCard(params: MessageCardParams): Promise<void> {
    return this.postWebhook(params);
  }

  /** Send a message with an Adaptive Card attachment (modern format). */
  async sendAdaptiveCard(params: AdaptiveCardMessageParams): Promise<void> {
    return this.postWebhook(params);
  }
}

// ---------------------------------------------------------------------------
// Microsoft Graph API client (requires Azure AD Bearer token)
// ---------------------------------------------------------------------------

export class TeamsGraphClient {
  readonly baseUrl = "https://graph.microsoft.com/v1.0";

  constructor(
    private readonly graphToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.graphToken}`,
      "Content-Type": "application/json",
    };
  }

  /** Send a message to a Teams channel via the Graph API. */
  async sendChannelMessage(
    teamId: string,
    channelId: string,
    params: GraphSendMessageParams,
  ): Promise<GraphMessage> {
    const res = await this.fetchFn(
      `${this.baseUrl}/teams/${teamId}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new TeamsError(res.status, await res.text());
    return res.json() as Promise<GraphMessage>;
  }
}
