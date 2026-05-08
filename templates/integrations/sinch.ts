// sinch.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/sinch.md

export interface SinchSendBatchParams {
  /** E.164 sender number, e.g. "+972399990000" */
  from: string;
  /** One or more E.164 recipient numbers. Up to 1,000 per request. */
  to: string[];
  body: string;
  /** ISO 8601 datetime to schedule the message. Omit for immediate delivery. */
  sendAt?: string;
  /** Delivery report type. Defaults to "none". */
  deliveryReport?: "none" | "summary" | "full" | "per_recipient";
  /** Webhook URL to receive delivery status callbacks. */
  callbackUrl?: string;
}

export interface SinchBatchResponse {
  id: string;
  to: string[];
  from: string;
  canceled: boolean;
  body: string;
  type: string;
  createdAt: string;
  modifiedAt: string;
  deliveryReport: string;
  sendAt: string;
  expireAt: string;
  callbackUrl: string;
  flashMessage: boolean;
  status: string;
}

export interface SinchDeliveryReportRecipientStatus {
  code: number;
  status: string;
  count: number;
  recipients: string[];
}

export interface SinchDeliveryReport {
  type: string;
  batchId: string;
  statuses: SinchDeliveryReportRecipientStatus[];
  totalMessageCount: number;
}

/** Inbound SMS (Mobile Originated) webhook payload */
export interface SinchInboundSms {
  id: string;
  from: string;
  to: string;
  body: string;
  type: string;
  receivedAt: string;
  operatorId: string;
  sendNumber: string;
}

export class SinchError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Sinch ${status}: ${message}`);
    this.name = "SinchError";
  }
}

export class SinchClient {
  readonly baseUrl: string;

  constructor(
    private readonly servicePlanId: string,
    private readonly apiToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://sms.api.sinch.com/xms/v1/${servicePlanId}`;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  private get authHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiToken}`,
    };
  }

  private async throwIfError(res: Response): Promise<void> {
    if (!res.ok) {
      let message: string;
      try {
        const data = await res.json();
        message = data.text ?? data.message ?? res.statusText;
      } catch {
        message = res.statusText;
      }
      throw new SinchError(res.status, message);
    }
  }

  /**
   * POST /batches — Send an SMS to one or more recipients.
   * Supports immediate, scheduled, and delivery-report-enabled sends.
   */
  async sendBatch(params: SinchSendBatchParams): Promise<SinchBatchResponse> {
    const payload: Record<string, unknown> = {
      from: params.from,
      to: params.to,
      body: params.body,
    };

    if (params.sendAt) payload.send_at = params.sendAt;
    if (params.deliveryReport) payload.delivery_report = params.deliveryReport;
    if (params.callbackUrl) payload.callback_url = params.callbackUrl;

    const res = await this.fetchFn(`${this.baseUrl}/batches`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    await this.throwIfError(res);
    const data = await res.json();
    return this.mapBatch(data);
  }

  /** GET /batches/{id} — Check batch status */
  async getBatch(batchId: string): Promise<SinchBatchResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/batches/${batchId}`, {
      headers: this.authHeaders,
    });

    await this.throwIfError(res);
    const data = await res.json();
    return this.mapBatch(data);
  }

  /** GET /batches/{id}/delivery_report — Detailed delivery report per recipient */
  async getDeliveryReport(batchId: string): Promise<SinchDeliveryReport> {
    const res = await this.fetchFn(
      `${this.baseUrl}/batches/${batchId}/delivery_report`,
      { headers: this.authHeaders },
    );

    await this.throwIfError(res);
    const data = await res.json();

    return {
      type: data.type,
      batchId: data.batch_id,
      statuses: (data.statuses ?? []).map(
        (s: Record<string, unknown>) => ({
          code: s.code,
          status: s.status,
          count: s.count,
          recipients: s.recipients,
        }),
      ),
      totalMessageCount: data.total_message_count,
    };
  }

  /** DELETE /batches/{id} — Cancel a scheduled batch before it sends */
  async cancelBatch(batchId: string): Promise<SinchBatchResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/batches/${batchId}`, {
      method: "DELETE",
      headers: this.authHeaders,
    });

    await this.throwIfError(res);
    const data = await res.json();
    return this.mapBatch(data);
  }

  private mapBatch(data: Record<string, unknown>): SinchBatchResponse {
    return {
      id: data.id as string,
      to: data.to as string[],
      from: data.from as string,
      canceled: data.canceled as boolean,
      body: data.body as string,
      type: data.type as string,
      createdAt: data.created_at as string,
      modifiedAt: data.modified_at as string,
      deliveryReport: data.delivery_report as string,
      sendAt: data.send_at as string,
      expireAt: data.expire_at as string,
      callbackUrl: (data.callback_url as string) ?? "",
      flashMessage: (data.flash_message as boolean) ?? false,
      status: data.status as string,
    };
  }
}
