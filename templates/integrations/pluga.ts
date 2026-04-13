// pluga.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/pluga.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface PlugaAutomation {
  id: string;
  name: string;
  status: "active" | "inactive";
  trigger_webhook_url: string;
  created_at: string;
}

export interface PlugaListAutomationsResponse {
  automations: PlugaAutomation[];
}

export interface PlugaTriggerResponse {
  success: boolean;
  automation_id: string;
  execution_id: string;
  triggered_at: string;
}

export interface PlugaWebhookTriggerResponse {
  status: "received";
  execution_id: string;
}

export interface PlugaExecutionStep {
  step: string;
  status: "success" | "failed" | "pending";
  result?: Record<string, unknown>;
}

export interface PlugaExecutionStatus {
  execution_id: string;
  automation_id: string;
  status: "success" | "failed" | "pending" | "running";
  started_at: string;
  completed_at?: string;
  steps: PlugaExecutionStep[];
}

// ---------------------------------------------------------------------------
// Inbound webhook payload (what Pluga sends to your edge function)
// ---------------------------------------------------------------------------

export interface PlugaInboundWebhook {
  event: string;
  automation_id: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PlugaError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Pluga ${status}: ${message}`);
    this.name = "PlugaError";
  }
}

// ---------------------------------------------------------------------------
// Client — Pluga REST API + webhook trigger helper
// ---------------------------------------------------------------------------

export class PlugaClient {
  readonly baseUrl = "https://pluga.co/api/v1";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "X-Pluga-Token": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  // GET /automations — returns all active automations
  async listAutomations(): Promise<PlugaListAutomationsResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/automations`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new PlugaError(res.status, await res.text());
    return res.json() as Promise<PlugaListAutomationsResponse>;
  }

  // POST /automations/{automation_id}/trigger — fires automation with data payload
  async triggerAutomation(
    automationId: string,
    data: Record<string, unknown>,
  ): Promise<PlugaTriggerResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/automations/${automationId}/trigger`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ data }),
      },
    );
    if (!res.ok) throw new PlugaError(res.status, await res.text());
    return res.json() as Promise<PlugaTriggerResponse>;
  }

  // POST {triggerWebhookUrl} — fires automation via its webhook URL (no auth header)
  async triggerByWebhookUrl(
    url: string,
    data: Record<string, unknown>,
  ): Promise<PlugaWebhookTriggerResponse> {
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new PlugaError(res.status, await res.text());
    return res.json() as Promise<PlugaWebhookTriggerResponse>;
  }

  // GET /automations/{automation_id}/executions/{execution_id} — poll execution status
  async getExecutionStatus(
    automationId: string,
    executionId: string,
  ): Promise<PlugaExecutionStatus> {
    const res = await this.fetchFn(
      `${this.baseUrl}/automations/${automationId}/executions/${executionId}`,
      {
        method: "GET",
        headers: this.headers,
      },
    );
    if (!res.ok) throw new PlugaError(res.status, await res.text());
    return res.json() as Promise<PlugaExecutionStatus>;
  }
}

// ---------------------------------------------------------------------------
// Incoming webhook parser
// Parses the payload Pluga sends to your Supabase edge function.
// Always validate X-Pluga-Signature before calling this.
// ---------------------------------------------------------------------------

export function parseIncomingWebhook(body: unknown): PlugaInboundWebhook {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>)["event"] !== "string" ||
    typeof (body as Record<string, unknown>)["automation_id"] !== "string" ||
    typeof (body as Record<string, unknown>)["payload"] !== "object"
  ) {
    throw new Error(
      `parseIncomingWebhook: expected Pluga inbound payload, got: ${JSON.stringify(body)}`,
    );
  }
  return body as PlugaInboundWebhook;
}
