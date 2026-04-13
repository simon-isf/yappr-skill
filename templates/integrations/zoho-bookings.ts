// zoho-bookings.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/zoho-bookings.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface ZohoWorkspace {
  id: string;
  name: string;
  description?: string;
  type?: string;
  duration?: number;
  status?: string;
}

export interface ZohoService {
  id: string;
  name: string;
  duration?: number;
  workspace_id?: string;
}

export interface ZohoStaffMember {
  id: string;
  name: string;
  email?: string;
}

export interface ZohoSlot {
  start_time: string; // "ddMMYYYY HH:mm"
  end_time: string;   // "ddMMYYYY HH:mm"
  staff_id?: string;
}

export interface ZohoCustomerDetails {
  name: string;
  email: string;
  phone_number?: string;
  comments?: string;
}

export interface ZohoCreateAppointmentParams {
  workspace_id: string;
  service_id: string;
  staff_id: string;
  start_time: string; // "ddMMYYYY HH:mm"
  customer_details: ZohoCustomerDetails;
  additional_fields?: Record<string, string>;
}

export interface ZohoAppointment {
  booking_id: string;
  workspace_name?: string;
  service_name?: string;
  staff_name?: string;
  start_time?: string;
  end_time?: string;
  customer_details?: ZohoCustomerDetails;
  status?: string;
}

export interface ZohoRescheduleParams {
  start_time: string; // "ddMMYYYY HH:mm"
  staff_id?: string;
}

export interface ZohoAvailableSlotsParams {
  workspace_id: string;
  service_id: string;
  staff_id: string;
  from_time: string; // "ddMMYYYY HH:mm"
  to_time: string;   // "ddMMYYYY HH:mm"
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ZohoBookingsError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`ZohoBookings ${status}: ${message}`);
    this.name = "ZohoBookingsError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date to Zoho's non-standard datetime string: "ddMMYYYY HH:mm"
 * e.g. April 14 2026 09:00 → "14042026 09:00"
 */
export function toZohoDatetime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}${mm}${yyyy} ${HH}:${min}`;
}

/**
 * Parse a Zoho datetime string "ddMMYYYY HH:mm" back to a Date.
 */
export function fromZohoDatetime(s: string): Date {
  const [datePart, timePart] = s.split(" ");
  const dd = datePart.slice(0, 2);
  const mo = datePart.slice(2, 4);
  const yyyy = datePart.slice(4, 8);
  return new Date(`${yyyy}-${mo}-${dd}T${timePart}:00`);
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ZohoBookingsClient {
  /**
   * @param accessToken   OAuth access token (Zoho-oauthtoken)
   * @param datacenter    "com" | "eu" | "in" | "au" — defaults to "com" (US / Israel)
   * @param fetchFn       injectable fetch for testing
   */
  constructor(
    private readonly accessToken: string,
    private readonly datacenter: string = "com",
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  get baseUrl(): string {
    if (this.datacenter === "com") {
      return "https://www.zohoapis.com/bookings/v1/json";
    }
    return `https://www.zohoapis.${this.datacenter}/bookings/v1/json`;
  }

  private get headers(): HeadersInit {
    return {
      "Authorization": `Zoho-oauthtoken ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.headers,
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await this.fetchFn(url, init);
    const data = await res.json() as {
      response?: { status?: string; returnvalue?: { data?: T; message?: string } };
    };
    // Zoho always returns HTTP 200; real errors are inside response.status
    const status = data.response?.status;
    if (!res.ok || status !== "success") {
      const message = data.response?.returnvalue?.message ?? JSON.stringify(data);
      throw new ZohoBookingsError(res.status, message);
    }
    return data.response!.returnvalue!.data as T;
  }

  // -------------------------------------------------------------------------
  // Workspaces
  // -------------------------------------------------------------------------

  /** GET /json/workspaces */
  async listWorkspaces(): Promise<ZohoWorkspace[]> {
    return this.request<ZohoWorkspace[]>("GET", "/workspaces");
  }

  // -------------------------------------------------------------------------
  // Services
  // -------------------------------------------------------------------------

  /** GET /json/services?workspace_id={id} */
  async listServices(workspaceId: string): Promise<ZohoService[]> {
    return this.request<ZohoService[]>("GET", `/services?workspace_id=${encodeURIComponent(workspaceId)}`);
  }

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------

  /** GET /json/staffmembers */
  async listStaff(): Promise<ZohoStaffMember[]> {
    return this.request<ZohoStaffMember[]>("GET", "/staffmembers");
  }

  // -------------------------------------------------------------------------
  // Availability
  // -------------------------------------------------------------------------

  /** POST /json/availableslots */
  async getAvailableSlots(params: ZohoAvailableSlotsParams): Promise<ZohoSlot[]> {
    return this.request<ZohoSlot[]>("POST", "/availableslots", params);
  }

  // -------------------------------------------------------------------------
  // Appointments
  // -------------------------------------------------------------------------

  /** POST /json/appointment */
  async createAppointment(params: ZohoCreateAppointmentParams): Promise<ZohoAppointment> {
    return this.request<ZohoAppointment>("POST", "/appointment", params);
  }

  /** GET /json/appointment?bookingId={id} */
  async getAppointment(bookingId: string): Promise<ZohoAppointment> {
    return this.request<ZohoAppointment>(
      "GET",
      `/appointment?bookingId=${encodeURIComponent(bookingId)}`,
    );
  }

  /** PATCH /json/appointment?bookingId={id} */
  async rescheduleAppointment(
    bookingId: string,
    params: ZohoRescheduleParams,
  ): Promise<ZohoAppointment> {
    return this.request<ZohoAppointment>(
      "PATCH",
      `/appointment?bookingId=${encodeURIComponent(bookingId)}`,
      params,
    );
  }

  /** DELETE /json/appointment?bookingId={id} */
  async cancelAppointment(bookingId: string): Promise<ZohoAppointment> {
    return this.request<ZohoAppointment>(
      "DELETE",
      `/appointment?bookingId=${encodeURIComponent(bookingId)}`,
    );
  }
}
