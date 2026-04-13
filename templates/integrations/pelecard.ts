// pelecard.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/pelecard.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface PelecardInitParams {
  TransactionSum: string;        // agorot — e.g. "15000" = ₪150.00
  Currency?: string;             // "1" = ILS (default), "2" = USD, "978" = EUR
  MaxPayments?: string;          // "1" = single payment
  GoodURL?: string;
  ErrorURL?: string;
  CustomerName?: string;
  PhoneNumber?: string;          // local Israeli format: 050XXXXXXX (no country code)
  ProductName?: string;
  HideCardOwnerFields?: string;  // "1" to hide
  Language?: "HE" | "EN";
  CreateInvoice?: string;        // "0" | "1"
  FreeTotal?: string;            // "0" | "1"
}

export interface PelecardInitResponse {
  Error: { ErrCode: string; ErrMsg: string };
  URL: string;
  TransactionID: string;
}

export interface PelecardGetTransactionParams {
  TransactionID: string;
}

export interface PelecardTransactionResultData {
  DebitTotal: string;
  Currency: string;
  VoucherId: string;
  CardOwnerID: string;
  CardNumber: string;
  CardExpiry: string;
  AuthorizationNumber: string;
  CreditType: string;
  Payments: string;
  FirstPaymentSum: string;
  PeriodicalPaymentSum: string;
  ConfirmationKey: string;
  CreditCardCompanyId: string;
  CreditCardCompanyName: string;
  StatusCode: string;  // "000" = approved, "001" = pending, "002" = declined
}

export interface PelecardGetTransactionResponse {
  Error: { ErrCode: string; ErrMsg: string };
  ResultData: PelecardTransactionResultData;
}

export interface PelecardDebitRegularTypeParams {
  ConfirmationKey: string;
  TotalX100: string;             // agorot — e.g. "9900" = ₪99.00
  Currency?: string;
  MaxPayments?: string;
  CreditType?: string;           // "6" for J4 recurring/token
  AuthNumber?: string;
  CardNumber?: string;
  CardExpiry?: string;
  CvvResult?: string;
}

export interface PelecardDebitRegularTypeResultData {
  VoucherId: string;
  AuthorizationNumber: string;
  DebitTotal: string;
  StatusCode: string;
}

export interface PelecardDebitRegularTypeResponse {
  Error: { ErrCode: string; ErrMsg: string };
  ResultData: PelecardDebitRegularTypeResultData;
}

export interface PelecardRefundParams {
  VoucherId: string;
  TotalX100: string;             // agorot
  Currency?: string;
}

export interface PelecardRefundResultData {
  RefundVoucherId: string;
  StatusCode: string;
}

export interface PelecardRefundResponse {
  Error: { ErrCode: string; ErrMsg: string };
  ResultData: PelecardRefundResultData;
}

export interface PelecardVerifyResponse {
  Error: { ErrCode: string; ErrMsg: string };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PelecardError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Pelecard ${status}: ${message}`);
    this.name = "PelecardError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class PelecardClient {
  readonly baseUrl = "https://gateway20.pelecard.biz/PaymentGW";

  constructor(
    private readonly terminal: string,
    private readonly user: string,
    private readonly password: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get credentials() {
    return {
      terminal: this.terminal,
      user: this.user,
      password: this.password,
    };
  }

  private async post<T extends { Error: { ErrCode: string; ErrMsg: string } }>(
    path: string,
    params: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...this.credentials, params }),
    });
    const data = await res.json() as T;
    // Pelecard always returns HTTP 200 — must check ErrCode in body
    if (data.Error?.ErrCode !== "000") {
      throw new PelecardError(
        res.status,
        `ErrCode ${data.Error?.ErrCode}: ${data.Error?.ErrMsg ?? "Unknown error"}`,
      );
    }
    return data;
  }

  // POST /Init — create hosted payment page session
  async init(params: PelecardInitParams): Promise<PelecardInitResponse> {
    return this.post<PelecardInitResponse>("/Init", params);
  }

  // POST /GetTransaction — query transaction result
  async getTransaction(
    params: PelecardGetTransactionParams,
  ): Promise<PelecardGetTransactionResponse> {
    return this.post<PelecardGetTransactionResponse>("/GetTransaction", params);
  }

  // POST /DebitRegularType — charge saved token (J4 recurring)
  async debitRegularType(
    params: PelecardDebitRegularTypeParams,
  ): Promise<PelecardDebitRegularTypeResponse> {
    return this.post<PelecardDebitRegularTypeResponse>("/DebitRegularType", params);
  }

  // POST /RefundToCard — refund a previous transaction
  async refundToCard(params: PelecardRefundParams): Promise<PelecardRefundResponse> {
    return this.post<PelecardRefundResponse>("/RefundToCard", params);
  }

  // POST /VerifyPaymentPageField — validate terminal credentials
  async verifyPaymentPageField(): Promise<PelecardVerifyResponse> {
    return this.post<PelecardVerifyResponse>("/VerifyPaymentPageField", {});
  }
}
