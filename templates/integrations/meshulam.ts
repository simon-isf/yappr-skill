// meshulam.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/meshulam.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface MeshulamCreatePaymentLinkParams {
  pageCode: string;
  sum: number;
  description: string;
  fullName: string;
  phoneNumber: string;
  email?: string;
  maxPayments?: number;
}

export interface MeshulamCreatePaymentLinkData {
  transactionId: string;
  url: string;
  pageCode: string;
}

export interface MeshulamCreatePaymentLinkResponse {
  success: boolean;
  data: MeshulamCreatePaymentLinkData;
}

export interface MeshulamTransactionData {
  transactionId: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  sum: number;
  fullName: string;
  phoneNumber: string;
  email?: string;
  cardToken?: string;
  paymentDate?: string;
}

export interface MeshulamTransactionResponse {
  success: boolean;
  data: MeshulamTransactionData;
}

export interface MeshulamChargeParams {
  pageCode: string;
  cardToken: string;
  sum: number;
  description: string;
  fullName: string;
  phoneNumber: string;
}

export interface MeshulamChargeData {
  transactionId: string;
  status: string;
  sum: number;
  approvalNumber: string;
}

export interface MeshulamChargeResponse {
  success: boolean;
  data: MeshulamChargeData;
}

export interface MeshulamWebhookPayload {
  transactionId: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  sum: number;
  fullName: string;
  phoneNumber: string;
  email?: string;
  cardToken?: string;
  pageCode: string;
  approvalNumber?: string;
  paymentDate?: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class MeshulamError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Meshulam ${status}: ${message}`);
    this.name = "MeshulamError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MeshulamClient {
  readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private get headers(): HeadersInit {
    return {
      "api_key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  private async post<T extends { success: boolean }>(
    path: string,
    body: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    const data = await res.json() as T;
    // Meshulam returns HTTP 200 even for errors — must check success field
    if (!data.success) {
      throw new MeshulamError(res.status, JSON.stringify(data));
    }
    return data;
  }

  private async get<T extends { success: boolean }>(path: string): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers,
    });
    const data = await res.json() as T;
    if (!data.success) {
      throw new MeshulamError(res.status, JSON.stringify(data));
    }
    return data;
  }

  // POST /transactions/create
  async createPaymentLink(
    params: MeshulamCreatePaymentLinkParams,
  ): Promise<MeshulamCreatePaymentLinkResponse> {
    return this.post<MeshulamCreatePaymentLinkResponse>("/transactions/create", params);
  }

  // GET /transactions/{transactionId}
  async getTransaction(transactionId: string): Promise<MeshulamTransactionResponse> {
    return this.get<MeshulamTransactionResponse>(`/transactions/${transactionId}`);
  }

  // POST /transactions/charge
  async chargeToken(params: MeshulamChargeParams): Promise<MeshulamChargeResponse> {
    return this.post<MeshulamChargeResponse>("/transactions/charge", params);
  }
}
