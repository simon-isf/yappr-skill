// zapier.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/zapier.md

// ---------------------------------------------------------------------------
// Yappr webhook payload (what Yappr sends to a Zapier Catch Hook)
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

export class ZapierError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Zapier ${status}: ${message}`);
    this.name = "ZapierError";
  }
}

// ---------------------------------------------------------------------------
// Client — sends HTTP POST to a Zapier Catch Hook URL
// Zapier Catch Hook URLs are secret-by-design; no auth header required.
// ---------------------------------------------------------------------------

export class ZapierWebhookClient {
  constructor(
    private readonly catchHookUrl: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  // POST {catchHookUrl} — triggers the Zap with arbitrary data
  async trigger(data: Record<string, unknown>): Promise<unknown> {
    const res = await this.fetchFn(this.catchHookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new ZapierError(res.status, await res.text());
    return res.json();
  }
}

// ---------------------------------------------------------------------------
// Incoming webhook parser
// Parses the payload Yappr sends to a Zapier Catch Hook (call.analyzed event).
// Zapier flattens nested keys with double-underscore when mapping fields,
// but the raw POST body received by the Catch Hook is the original JSON.
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
