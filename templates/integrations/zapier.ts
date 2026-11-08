// zapier.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/zapier.md

// ---------------------------------------------------------------------------
// Yappr webhook payload (what Yappr sends to a Zapier Catch Hook)
// ---------------------------------------------------------------------------

export interface YapprCallTranscriptTurn {
  role: "agent" | "user";
  content: string;
}

// The call package an After-trigger follow-up (analysis.ready) posts under `call`.
export interface YapprCallPackage {
  phase: "after";
  call_id: string;
  agent_id: string;
  company_id: string;
  call_direction: "inbound" | "outbound" | "web_call";
  status: string; // completed | failed | no_answer
  caller_number: string;
  callee_number: string;
  duration_seconds?: number;
  disposition?: { id: string; label: string };
  analysis?: { summary?: string; extracted_data?: Record<string, unknown> };
  transcript?: unknown;
  call_metadata?: Record<string, unknown>;
  call_variables?: Record<string, unknown>;
}

// Body of a follow-up: {"call": {...}} plus the step's own inputs. Only a
// converted agent's follow-up carries a top-level `event` ("call.analyzed").
export interface YapprCallAnalyzedWebhook {
  event?: string;
  call: YapprCallPackage;
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
// Parses the follow-up Yappr sends to a Zapier Catch Hook (analysis.ready trigger).
// Zapier flattens nested keys with double-underscore when mapping fields,
// but the raw POST body received by the Catch Hook is the original JSON.
// ---------------------------------------------------------------------------

export function parseIncomingWebhook(body: unknown): YapprCallAnalyzedWebhook {
  const call = (body as Record<string, unknown> | null)?.["call"] as Record<string, unknown> | undefined;
  if (typeof call !== "object" || call === null || !call["analysis"]) {
    throw new Error(
      `parseIncomingWebhook: expected a follow-up with call.analysis, got: ${JSON.stringify(body)}`,
    );
  }
  return body as YapprCallAnalyzedWebhook;
}
