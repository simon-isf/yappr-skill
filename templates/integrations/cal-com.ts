// cal-com.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/cal-com.md

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export interface CalComEventType {
  id: number;
  title: string;
  slug: string;
  length: number;
  hidden: boolean;
  description?: string;
}

export interface ListEventTypesResponse {
  event_types: CalComEventType[];
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export interface GetSlotsParams {
  eventTypeId: number;
  startTime: string;
  endTime: string;
  timeZone?: string;
}

export interface SlotTime {
  time: string;
}

export interface GetSlotsResponse {
  slots: Record<string, SlotTime[]>;
}

// ---------------------------------------------------------------------------
// Bookings — Create
// ---------------------------------------------------------------------------

export interface BookingResponses {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface CreateBookingParams {
  eventTypeId: number;
  start: string;
  end: string;
  timeZone?: string;
  language?: string;
  responses: BookingResponses;
  metadata?: Record<string, string>;
}

export interface CalComAttendee {
  name: string;
  email: string;
  timeZone?: string;
}

export interface CalComBooking {
  id: number;
  uid: string;
  title: string;
  status: string;
  startTime: string;
  endTime: string;
  attendees: CalComAttendee[];
  meetingUrl?: string;
}

// ---------------------------------------------------------------------------
// Bookings — Cancel
// ---------------------------------------------------------------------------

export interface CancelBookingParams {
  cancellationReason?: string;
  allRemainingBookings?: boolean;
}

export interface CancelBookingResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Bookings — Reschedule
// ---------------------------------------------------------------------------

export interface RescheduleBookingParams {
  start: string;
  end: string;
  rescheduledReason?: string;
}

// ---------------------------------------------------------------------------
// Bookings — List
// ---------------------------------------------------------------------------

export interface ListBookingsParams {
  status?: "upcoming" | "recurring" | "past" | "cancelled";
  take?: number;
  skip?: number;
}

export interface ListBookingsResponse {
  bookings: CalComBooking[];
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class CalComError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`CalCom ${status}: ${message}`);
    this.name = "CalComError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class CalComClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
    /** Override for self-hosted Cal.com instances. */
    baseUrl = "https://api.cal.com/v1",
  ) {
    this.baseUrl = baseUrl;
  }

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "cal-api-version": "2024-06-11",
    };
  }

  private authUrl(path: string): string {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("apiKey", this.apiKey);
    return url.toString();
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text();
      throw new CalComError(res.status, text);
    }
    return res.json() as Promise<T>;
  }

  /** List all event types for the authenticated user. */
  async listEventTypes(): Promise<ListEventTypesResponse> {
    const res = await this.fetchFn(this.authUrl("/event-types"), { headers: this.headers });
    return this.handleResponse<ListEventTypesResponse>(res);
  }

  /** Get available time slots for a given event type and date range. */
  async getSlots(params: GetSlotsParams): Promise<GetSlotsResponse> {
    const url = new URL(this.authUrl("/slots"));
    url.searchParams.set("eventTypeId", String(params.eventTypeId));
    url.searchParams.set("startTime", params.startTime);
    url.searchParams.set("endTime", params.endTime);
    if (params.timeZone) url.searchParams.set("timeZone", params.timeZone);
    const res = await this.fetchFn(url.toString(), { headers: this.headers });
    return this.handleResponse<GetSlotsResponse>(res);
  }

  /** Create a booking directly (no redirect required). */
  async createBooking(params: CreateBookingParams): Promise<CalComBooking> {
    const res = await this.fetchFn(this.authUrl("/bookings"), {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    return this.handleResponse<CalComBooking>(res);
  }

  /** Retrieve a single booking by its numeric ID. */
  async getBooking(id: number): Promise<CalComBooking> {
    const res = await this.fetchFn(this.authUrl(`/bookings/${id}`), { headers: this.headers });
    return this.handleResponse<CalComBooking>(res);
  }

  /** List bookings, optionally filtered by status. */
  async listBookings(params: ListBookingsParams = {}): Promise<ListBookingsResponse> {
    const url = new URL(this.authUrl("/bookings"));
    if (params.status) url.searchParams.set("status", params.status);
    if (params.take !== undefined) url.searchParams.set("take", String(params.take));
    if (params.skip !== undefined) url.searchParams.set("skip", String(params.skip));
    const res = await this.fetchFn(url.toString(), { headers: this.headers });
    return this.handleResponse<ListBookingsResponse>(res);
  }

  /** Cancel a booking. Pass `cancellationReason` in the body if desired. */
  async cancelBooking(
    id: number,
    params: CancelBookingParams = {},
  ): Promise<CancelBookingResponse> {
    const url = new URL(this.authUrl(`/bookings/${id}`));
    if (params.allRemainingBookings !== undefined) {
      url.searchParams.set("allRemainingBookings", String(params.allRemainingBookings));
    }
    const { allRemainingBookings: _, ...body } = params;
    const res = await this.fetchFn(url.toString(), {
      method: "DELETE",
      headers: this.headers,
      body: Object.keys(body).length ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<CancelBookingResponse>(res);
  }

  /** Reschedule a booking to a new time. */
  async rescheduleBooking(
    id: number,
    params: RescheduleBookingParams,
  ): Promise<CalComBooking> {
    const res = await this.fetchFn(this.authUrl(`/bookings/${id}`), {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    return this.handleResponse<CalComBooking>(res);
  }
}
