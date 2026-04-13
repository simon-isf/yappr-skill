// booksy.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/booksy.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export type BooksyRegion = "us" | "il";

export interface BooksyAvailabilitySlot {
  time: string;
  available: boolean;
}

export interface BooksyGetAvailabilityResponse {
  availability: BooksyAvailabilitySlot[];
  date: string;
  staff_id: number;
}

export interface BooksyCustomerInput {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
}

export interface BooksyCustomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  visits?: number;
  email?: string;
}

export interface BooksyCreateAppointmentParams {
  service_id: number;
  staff_id: number;
  date: string;
  time: string;
  customer: BooksyCustomerInput;
  notes?: string;
}

export interface BooksyAppointment {
  id: string;
  service_id: number;
  staff_id: number;
  date: string;
  time: string;
  status: string;
  customer: BooksyCustomerInput;
}

export interface BooksyCreateAppointmentResponse {
  appointment: BooksyAppointment;
}

export interface BooksySearchCustomersResponse {
  customers: BooksyCustomer[];
}

export interface BooksyCancelAppointmentResponse {
  cancelled: boolean;
  appointment_id: string;
}

// ---------------------------------------------------------------------------
// Webhook event types (Path B — for handler reference)
// ---------------------------------------------------------------------------

export interface BooksyWebhookCustomer {
  first_name: string;
  last_name: string;
  phone: string;
}

export interface BooksyBookingCreatedData {
  appointment_id: string;
  service_name: string;
  staff_name: string;
  date: string;
  time: string;
  customer: BooksyWebhookCustomer;
}

export interface BooksyBookingCancelledData {
  appointment_id: string;
  cancelled_by: string;
  date: string;
  time: string;
}

export interface BooksyBookingCreatedEvent {
  event: "booking.created";
  data: BooksyBookingCreatedData;
  business_id: string;
  timestamp: string;
}

export interface BooksyBookingCancelledEvent {
  event: "booking.cancelled";
  data: BooksyBookingCancelledData;
  business_id: string;
  timestamp: string;
}

export type BooksyWebhookEvent = BooksyBookingCreatedEvent | BooksyBookingCancelledEvent;

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class BooksyError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Booksy ${status}: ${message}`);
    this.name = "BooksyError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class BooksyClient {
  readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    region: BooksyRegion = "us",
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://booksy.com/api/${region}/business`;
  }

  private get headers(): HeadersInit {
    return {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const res = await this.fetchFn(url, { ...init, headers: this.headers });
    if (!res.ok) throw new BooksyError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // GET /staff/availability?date=&service_id=&staff_id=
  async getStaffAvailability(
    date: string,
    serviceId: number,
    staffId: number,
  ): Promise<BooksyGetAvailabilityResponse> {
    const url = new URL(`${this.baseUrl}/staff/availability`);
    url.searchParams.set("date", date);
    url.searchParams.set("service_id", String(serviceId));
    url.searchParams.set("staff_id", String(staffId));
    return this.request<BooksyGetAvailabilityResponse>(url.toString(), { method: "GET" });
  }

  // POST /appointments
  async createAppointment(
    params: BooksyCreateAppointmentParams,
  ): Promise<BooksyCreateAppointmentResponse> {
    return this.request<BooksyCreateAppointmentResponse>(
      `${this.baseUrl}/appointments`,
      { method: "POST", body: JSON.stringify(params) },
    );
  }

  // GET /customers/search?phone=
  async searchCustomersByPhone(phone: string): Promise<BooksySearchCustomersResponse> {
    const url = new URL(`${this.baseUrl}/customers/search`);
    url.searchParams.set("phone", phone);
    return this.request<BooksySearchCustomersResponse>(url.toString(), { method: "GET" });
  }

  // DELETE /appointments/:appointment_id
  async cancelAppointment(appointmentId: string): Promise<BooksyCancelAppointmentResponse> {
    return this.request<BooksyCancelAppointmentResponse>(
      `${this.baseUrl}/appointments/${appointmentId}`,
      { method: "DELETE" },
    );
  }
}
