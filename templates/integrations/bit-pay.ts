// Bit Business API + PayMe (CashCow) client
//
// Two providers:
//   BitClient  — Bit Business API (developer.bitpay.co.il). Requires formal onboarding.
//   PayMeClient — PayMe / CashCow (ng.cashcow.co.il). Recommended for most users.
//
// PayMe sale_price is in AGOROT (hundredths of a shekel). Multiply ILS × 100.
// Phone must be in local Israeli format (05XXXXXXXX), not E.164.

// ── Errors ────────────────────────────────────────────────────────────────────

export class BitError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Bit ${status}: ${message}`);
    this.name = "BitError";
  }
}

export class PayMeError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`PayMe ${status}: ${message}`);
    this.name = "PayMeError";
  }
}

// ── Bit types ─────────────────────────────────────────────────────────────────

export type BitPaymentStatus = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";

export interface BitPaymentRequest {
  payment_request_id: string;
  link: string;
  qr_code_url: string;
  status: BitPaymentStatus;
  amount: number;
  currency: string;
  expires_at: string;
}

export interface BitPaymentRequestStatus {
  payment_request_id: string;
  status: BitPaymentStatus;
  paid_at?: string;
  transaction_id?: string;
}

export interface CreateBitPaymentRequestParams {
  amount: number;
  currency?: string;
  description: string;
  reference_id: string;
  expiration_minutes?: number;
}

// ── Bit client ────────────────────────────────────────────────────────────────

export class BitClient {
  readonly baseUrl = "https://developer.bitpay.co.il/api/v1";

  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new BitError(res.status, data.message ?? JSON.stringify(data));
    }
    return data as T;
  }

  /** POST /payment-requests — Create a Bit payment request */
  async createPaymentRequest(
    params: CreateBitPaymentRequestParams,
  ): Promise<BitPaymentRequest> {
    return this.request<BitPaymentRequest>("POST", "/payment-requests", {
      amount: params.amount,
      currency: params.currency ?? "ILS",
      description: params.description,
      reference_id: params.reference_id,
      expiration_minutes: params.expiration_minutes ?? 60,
    });
  }

  /** GET /payment-requests/:id — Get payment request status */
  async getPaymentRequest(paymentRequestId: string): Promise<BitPaymentRequestStatus> {
    return this.request<BitPaymentRequestStatus>(
      "GET",
      `/payment-requests/${paymentRequestId}`,
    );
  }
}

// ── PayMe types ───────────────────────────────────────────────────────────────

export type PayMeSaleStatus = "INITIAL" | "COMPLETED" | "REFUNDED" | "FAILED";

export interface PayMeSale {
  payme_status: "success" | string;
  sale_payme_id: string;
  sale_price: number;
  currency: string;
  payment_url: string;
  buyer_name: string;
}

export interface PayMeSaleDetails {
  payme_status: "success" | string;
  sale_status: PayMeSaleStatus;
  sale_price: number;
  paid_at?: string;
}

export interface GenerateSaleParams {
  /** PayMe seller ID from dashboard (MPL...) */
  sellerPaymeId: string;
  /** Amount in AGOROT (ILS × 100). 150 ILS → 15000. */
  salePriceAgorot: number;
  currency?: string;
  productName: string;
  /** Server-side webhook URL (POST with payment result) */
  saleCallbackUrl?: string;
  /** Browser redirect after payment */
  saleReturnUrl?: string;
  buyerName?: string;
  /** Local Israeli format (05XXXXXXXX) */
  buyerPhone?: string;
  sendNotification?: boolean;
}

export interface GetSaleDetailsParams {
  sellerPaymeId: string;
  salePaymeId: string;
}

// ── PayMe client ──────────────────────────────────────────────────────────────

export class PayMeClient {
  readonly baseUrl: string;

  /**
   * @param sellerPaymeId  Your PayMe seller ID (MPL...)
   * @param sandbox        Set true for sandbox (https://sandbox.payme.io)
   */
  constructor(
    private readonly sellerPaymeId: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
    sandbox = false,
  ) {
    this.baseUrl = sandbox
      ? "https://sandbox.payme.io"
      : "https://ng.cashcow.co.il";
  }

  private get headers(): HeadersInit {
    return { "Content-Type": "application/json" };
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new PayMeError(res.status, data.status_error_details ?? JSON.stringify(data));
    }
    if (data.payme_status && data.payme_status !== "success") {
      throw new PayMeError(200, data.status_error_details ?? JSON.stringify(data));
    }
    return data as T;
  }

  /**
   * POST /PayMe/api/generateSale — Generate a PayMe payment link.
   *
   * The returned `payment_url` offers Bit, credit card, and other methods.
   * Send it to the caller via WhatsApp or SMS.
   */
  async generateSale(params: GenerateSaleParams): Promise<PayMeSale> {
    return this.request<PayMeSale>("/PayMe/api/generateSale", {
      seller_payme_id: params.sellerPaymeId ?? this.sellerPaymeId,
      sale_price: params.salePriceAgorot,
      currency: params.currency ?? "ILS",
      product_name: params.productName,
      sale_send_notification: params.sendNotification ?? true,
      sale_callback_url: params.saleCallbackUrl,
      sale_return_url: params.saleReturnUrl,
      buyer_name: params.buyerName,
      buyer_phone: params.buyerPhone,
    });
  }

  /**
   * POST /PayMe/api/getSaleDetails — Check the status of a sale.
   *
   * `sale_status` values: INITIAL | COMPLETED | REFUNDED | FAILED
   */
  async getSaleDetails(params: GetSaleDetailsParams): Promise<PayMeSaleDetails> {
    return this.request<PayMeSaleDetails>("/PayMe/api/getSaleDetails", {
      seller_payme_id: params.sellerPaymeId,
      sale_payme_id: params.salePaymeId,
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert an E.164 Israeli number to local format expected by PayMe/Tranzila.
 * "+972501234567" → "0501234567"
 */
export function toLocalPhone(phone: string): string {
  if (phone.startsWith("+972")) return "0" + phone.slice(4);
  return phone;
}

/**
 * Convert an ILS amount (decimal) to agorot (integer).
 * 150.00 → 15000
 */
export function ilsToAgorot(amountILS: number): number {
  return Math.round(amountILS * 100);
}
