// cardcom.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/cardcom.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface CardcomInvoiceHead {
  CustName: string;
  Language?: string;
  SendByEmail?: boolean;
  Email?: string;
}

export interface CardcomCreatePaymentLinkParams {
  Sum: number;
  CoinID?: number;
  Language?: string;
  MaxNumOfPayments?: number;
  SuccessRedirectUrl?: string;
  ErrorRedirectUrl?: string;
  ReturnUrl?: string;
  InvoiceHead?: CardcomInvoiceHead;
}

export interface CardcomCreatePaymentLinkResponse {
  ResponseCode: number;
  Description: string;
  LowProfileCode: string;
  Url: string;
}

export interface CardcomChargeTokenParams {
  CardToken: string;
  Sum: number;
  CoinID?: number;
  NumOfPayments?: number;
  InvoiceHead?: CardcomInvoiceHead;
}

export interface CardcomChargeTokenResponse {
  ResponseCode: number;
  Description: string;
  TransactionId: number;
  ApprovalNumber: string;
}

export interface CardcomTransactionStatusResponse {
  ResponseCode: number;
  Description: string;
  TransactionId: number;
  Sum: number;
  CoinID: number;
  Status: string;
  Last4Digits: string;
  CardToken: string;
}

export interface CardcomIpnPayload {
  ResponseCode: string;
  Description: string;
  TransactionId: string;
  LowProfileCode: string;
  Sum: string;
  CoinID: string;
  CardToken: string;
  Last4Digits: string;
  ApprovalNumber: string;
  CustName: string;
  [key: string]: string;
}

// ---------------------------------------------------------------------------
// IPN parser
// ---------------------------------------------------------------------------

/**
 * Parse a form-encoded IPN body sent by Cardcom to the ReturnUrl.
 * Cardcom sends application/x-www-form-urlencoded, not JSON.
 */
export function parseCardcomIpn(formBody: string): CardcomIpnPayload {
  const params = new URLSearchParams(formBody);
  const payload: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    payload[key] = value;
  }
  return payload as CardcomIpnPayload;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CardcomError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Cardcom ${status}: ${message}`);
    this.name = "CardcomError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class CardcomClient {
  readonly baseUrl = "https://secure.cardcom.solutions/api/v11";

  constructor(
    private readonly terminalNumber: string,
    private readonly userName: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get credentials() {
    return {
      TerminalNumber: this.terminalNumber,
      UserName: this.userName,
    };
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...this.credentials, ...(body as Record<string, unknown>) }),
    });
    const data = await res.json() as { ResponseCode?: number; Description?: string } & T;
    // Cardcom signals errors via ResponseCode in body, not HTTP status
    if (data.ResponseCode !== 0) {
      throw new CardcomError(
        res.status,
        `ResponseCode ${data.ResponseCode}: ${data.Description ?? "Unknown error"}`,
      );
    }
    return data;
  }

  // POST /Transactions/LowProfile/Create
  async createPaymentLink(
    params: CardcomCreatePaymentLinkParams,
  ): Promise<CardcomCreatePaymentLinkResponse> {
    return this.request<CardcomCreatePaymentLinkResponse>(
      "/Transactions/LowProfile/Create",
      params,
    );
  }

  // POST /Transactions/ChargeToken
  async chargeToken(
    params: CardcomChargeTokenParams,
  ): Promise<CardcomChargeTokenResponse> {
    return this.request<CardcomChargeTokenResponse>("/Transactions/ChargeToken", params);
  }

  // GET /Transactions/{TransactionId}
  async getTransaction(transactionId: number): Promise<CardcomTransactionStatusResponse> {
    const url = new URL(`${this.baseUrl}/Transactions/${transactionId}`);
    url.searchParams.set("TerminalNumber", this.terminalNumber);
    url.searchParams.set("UserName", this.userName);
    const res = await this.fetchFn(url.toString(), { method: "GET" });
    const data = await res.json() as { ResponseCode?: number; Description?: string } &
      CardcomTransactionStatusResponse;
    if (data.ResponseCode !== 0) {
      throw new CardcomError(
        res.status,
        `ResponseCode ${data.ResponseCode}: ${data.Description ?? "Unknown error"}`,
      );
    }
    return data;
  }
}
