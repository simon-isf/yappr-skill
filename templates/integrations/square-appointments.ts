// square-appointments.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/square-appointments.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface SquareTimeRange {
  start_at: string;
  end_at: string;
}

export interface SquareSegmentFilter {
  service_variation_id: string;
  team_member_id_filter?: { any?: string[]; none?: string[] };
}

export interface SquareAvailabilityFilter {
  start_at_range: SquareTimeRange;
  location_id: string;
  segment_filters: SquareSegmentFilter[];
}

export interface SquareSearchAvailabilityParams {
  query: {
    filter: SquareAvailabilityFilter;
  };
}

export interface SquareAppointmentSegment {
  duration_minutes: number;
  service_variation_id: string;
  service_variation_version?: number;
  team_member_id: string;
}

export interface SquareAvailability {
  start_at: string;
  location_id: string;
  appointment_segments: SquareAppointmentSegment[];
}

export interface SquareSearchAvailabilityResponse {
  availabilities: SquareAvailability[];
  errors?: SquareApiError[];
}

export interface SquareApiError {
  category: string;
  code: string;
  detail?: string;
  field?: string;
}

export interface SquareBookingInput {
  start_at: string;
  location_id: string;
  customer_id: string;
  customer_note?: string;
  appointment_segments: SquareAppointmentSegment[];
}

export interface SquareCreateBookingParams {
  booking: SquareBookingInput;
  idempotency_key?: string;
}

export interface SquareBooking {
  id: string;
  version: number;
  status: string;
  created_at?: string;
  start_at: string;
  location_id: string;
  customer_id?: string;
  customer_note?: string;
  appointment_segments: SquareAppointmentSegment[];
}

export interface SquareBookingResponse {
  booking: SquareBooking;
  errors?: SquareApiError[];
}

export interface SquareCancelBookingParams {
  booking_version: number;
  idempotency_key?: string;
}

export interface SquareCustomerPhoneFilter {
  exact: string;
}

export interface SquareSearchCustomersParams {
  query: {
    filter: {
      phone_number: SquareCustomerPhoneFilter;
    };
  };
}

export interface SquareCustomer {
  id: string;
  given_name?: string;
  family_name?: string;
  phone_number?: string;
  email_address?: string;
  created_at?: string;
  reference_id?: string;
}

export interface SquareSearchCustomersResponse {
  customers?: SquareCustomer[];
  errors?: SquareApiError[];
}

export interface SquareCreateCustomerParams {
  given_name: string;
  family_name?: string;
  phone_number?: string;
  email_address?: string;
  reference_id?: string;
}

export interface SquareCreateCustomerResponse {
  customer: SquareCustomer;
  errors?: SquareApiError[];
}

export interface SquareCatalogObjectVariation {
  id: string;
  type: string;
  item_variation_data?: {
    name?: string;
    price_money?: { amount: number; currency: string };
    service_duration?: number;
  };
}

export interface SquareCatalogObject {
  id: string;
  type: string;
  item_data?: {
    name?: string;
    description?: string;
    variations?: SquareCatalogObjectVariation[];
  };
}

export interface SquareListCatalogResponse {
  objects?: SquareCatalogObject[];
  cursor?: string;
  errors?: SquareApiError[];
}

export interface SquareSearchCatalogParams {
  object_types: string[];
  include_related_objects?: boolean;
  cursor?: string;
}

export interface SquareSearchCatalogResponse {
  objects?: SquareCatalogObject[];
  related_objects?: SquareCatalogObject[];
  cursor?: string;
  errors?: SquareApiError[];
}

export interface SquareTeamMember {
  id: string;
  given_name?: string;
  family_name?: string;
  status?: string;
  email_address?: string;
}

export interface SquareListTeamMembersResponse {
  team_members?: SquareTeamMember[];
  cursor?: string;
  errors?: SquareApiError[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class SquareError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Square ${status}: ${message}`);
    this.name = "SquareError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const SQUARE_VERSION = "2024-01-18";

export class SquareClient {
  readonly baseUrl = "https://connect.squareup.com/v2";

  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    };
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const res = await this.fetchFn(url, { ...init, headers: this.headers });
    if (!res.ok) throw new SquareError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // POST /bookings/availability/search
  async searchAvailability(
    params: SquareSearchAvailabilityParams,
  ): Promise<SquareSearchAvailabilityResponse> {
    return this.request<SquareSearchAvailabilityResponse>(
      `${this.baseUrl}/bookings/availability/search`,
      { method: "POST", body: JSON.stringify(params) },
    );
  }

  // POST /bookings
  async createBooking(
    params: SquareCreateBookingParams,
  ): Promise<SquareBookingResponse> {
    const body: SquareCreateBookingParams = {
      ...params,
      idempotency_key: params.idempotency_key ?? crypto.randomUUID(),
    };
    return this.request<SquareBookingResponse>(
      `${this.baseUrl}/bookings`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }

  // GET /bookings/:booking_id
  async getBooking(bookingId: string): Promise<SquareBookingResponse> {
    return this.request<SquareBookingResponse>(
      `${this.baseUrl}/bookings/${bookingId}`,
      { method: "GET" },
    );
  }

  // POST /bookings/:booking_id/cancel
  async cancelBooking(
    bookingId: string,
    params: SquareCancelBookingParams,
  ): Promise<SquareBookingResponse> {
    const body: SquareCancelBookingParams = {
      ...params,
      idempotency_key: params.idempotency_key ?? crypto.randomUUID(),
    };
    return this.request<SquareBookingResponse>(
      `${this.baseUrl}/bookings/${bookingId}/cancel`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }

  // POST /customers/search
  async searchCustomersByPhone(
    phone: string,
  ): Promise<SquareSearchCustomersResponse> {
    return this.request<SquareSearchCustomersResponse>(
      `${this.baseUrl}/customers/search`,
      {
        method: "POST",
        body: JSON.stringify({
          query: { filter: { phone_number: { exact: phone } } },
        } satisfies SquareSearchCustomersParams),
      },
    );
  }

  // POST /customers
  async createCustomer(
    params: SquareCreateCustomerParams,
  ): Promise<SquareCreateCustomerResponse> {
    return this.request<SquareCreateCustomerResponse>(
      `${this.baseUrl}/customers`,
      { method: "POST", body: JSON.stringify(params) },
    );
  }

  // GET /catalog/list?types=ITEM
  async listCatalogItems(cursor?: string): Promise<SquareListCatalogResponse> {
    const url = new URL(`${this.baseUrl}/catalog/list`);
    url.searchParams.set("types", "ITEM");
    if (cursor) url.searchParams.set("cursor", cursor);
    return this.request<SquareListCatalogResponse>(url.toString(), { method: "GET" });
  }

  // POST /catalog/search
  async searchCatalog(
    params: SquareSearchCatalogParams,
  ): Promise<SquareSearchCatalogResponse> {
    return this.request<SquareSearchCatalogResponse>(
      `${this.baseUrl}/catalog/search`,
      { method: "POST", body: JSON.stringify(params) },
    );
  }

  // GET /team-members?location_ids=:id
  async listTeamMembers(locationId: string): Promise<SquareListTeamMembersResponse> {
    const url = new URL(`${this.baseUrl}/team-members`);
    url.searchParams.set("location_ids", locationId);
    return this.request<SquareListTeamMembersResponse>(url.toString(), { method: "GET" });
  }
}
