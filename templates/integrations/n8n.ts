// n8n.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/n8n.md

// ---------------------------------------------------------------------------
// Yappr webhook payload (what Yappr sends to an n8n Webhook node)
// ---------------------------------------------------------------------------

export interface YapprCallTranscriptTurn {
  role: "agent" | "user";
  content: string;
}

export interface YapprCallAnalyzedData {
  direction: "inbound" | "outbound" | "web";
  status: string;
  from_number: string;
  to_number: string;
  duration_seconds: number;
  disposition: string;
  summary: string;
  transcript: YapprCallTranscriptTurn[];
}

export interface YapprCallAnalyzedWebhook {
  event: "call.analyzed";
  timestamp: string;
  agent_id: string;
  company_id: string;
  call_id: string;
  data: YapprCallAnalyzedData;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class N8nError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`n8n ${status}: ${message}`);
    this.name = "N8nError";
  }
}

// ---------------------------------------------------------------------------
// Client — sends HTTP POST to an n8n Webhook node
// ---------------------------------------------------------------------------

export class N8nWebhookClient {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  // POST {webhookUrl} — triggers the n8n workflow with arbitrary data
  async trigger(data: Record<string, unknown>): Promise<unknown> {
    const res = await this.fetchFn(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new N8nError(res.status, await res.text());
    return res.json();
  }
}

// ---------------------------------------------------------------------------
// Incoming webhook parser
// Parses the payload Yappr sends to an n8n Webhook node (call.analyzed event).
// ---------------------------------------------------------------------------

export function parseIncomingWebhook(body: unknown): YapprCallAnalyzedWebhook {
  if (
    typeof body !== "object" ||
    body === null ||
    (body as Record<string, unknown>)["event"] !== "call.analyzed"
  ) {
    throw new Error(
      `parseIncomingWebhook: expected call.analyzed payload, got: ${JSON.stringify(body)}`,
    );
  }
  return body as YapprCallAnalyzedWebhook;
}
