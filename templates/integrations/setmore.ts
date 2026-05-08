// setmore.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/setmore.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

// Setmore always returns HTTP 200 — check `status === false` for errors.

export interface SetmoreTokenResponse {
  data: {
    token: {
      access_token: string;
      refresh_token: string;
      token_type: string;
    };
  };
  status: boolean;
  msg: string;
}

export interface SetmoreService {
  key: string;
  service_name: string;
  duration: number;
  cost: number;
  description: string;
}

export interface SetmoreListServicesResponse {
  data: { services: SetmoreService[] };
  status: boolean;
  msg?: string;
}

export interface SetmoreStaffMember {
  key: string;
  first_name: string;
  last_name: string;
  email: string;
  image?: string;
}

export interface SetmoreListStaffResponse {
  data: { staffmembers: SetmoreStaffMember[] };
  status: boolean;
  msg?: string;
}

export interface SetmoreGetSlotsResponse {
  data: { slots: string[]; time_format: string };
  status: boolean;
  msg?: string;
}

export interface SetmoreAppointmentCustomer {
  key?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  comments?: string;
}

export interface SetmoreAppointmentStaff {
  key: string;
  first_name: string;
}

export interface SetmoreAppointment {
  key: string;
  service_name: string;
  start_time: string;
  end_time: string;
  customer: SetmoreAppointmentCustomer;
  staff: SetmoreAppointmentStaff;
}

export interface SetmoreCreateAppointmentParams {
  staff_key: string;
  service_key: string;
  customer: SetmoreAppointmentCustomer;
  start_time: string;
  end_time: string;
  label?: string;
}

export interface SetmoreCreateAppointmentResponse {
  data: { appointment: SetmoreAppointment };
  status: boolean;
  msg: string;
}

export interface SetmoreCancelAppointmentResponse {
  data: Record<string, never>;
  status: boolean;
  msg: string;
}

export interface SetmoreGetAppointmentResponse {
  data: { appointment: SetmoreAppointment };
  status: boolean;
  msg?: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class SetmoreError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Setmore ${status}: ${message}`);
    this.name = "SetmoreError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SetmoreClient {
  readonly baseUrl = "https://developer.setmore.com/api/v1";
  readonly authUrl = "https://developer.setmore.com/api/v1/o/oauth2/token";

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

  // Setmore always returns HTTP 200; errors are signalled by status === false.
  private async request<T extends { status: boolean; msg?: string }>(
    url: string,
    init: RequestInit,
  ): Promise<T> {
    const res = await this.fetchFn(url, { ...init, headers: this.headers });
    // HTTP-level error (should not normally occur with Setmore, but guard anyway)
    if (!res.ok) throw new SetmoreError(res.status, await res.text());
    const data = await res.json() as T;
    if (data.status === false) {
      throw new SetmoreError(0, data.msg ?? "Unknown Setmore error");
    }
    return data;
  }

  // POST /o/oauth2/token — exchange authorization code
  static async exchangeAuthCode(
    code: string,
    fetchFn: typeof fetch = globalThis.fetch,
  ): Promise<SetmoreTokenResponse> {
    const res = await fetchFn("https://developer.setmore.com/api/v1/o/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, grant_type: "authorization_code" }),
    });
    if (!res.ok) throw new SetmoreError(res.status, await res.text());
    const data = await res.json() as SetmoreTokenResponse;
    if (data.status === false) throw new SetmoreError(0, data.msg ?? "Token exchange failed");
    return data;
  }

  // POST /o/oauth2/token — refresh access token
  static async refreshToken(
    refreshToken: string,
    fetchFn: typeof fetch = globalThis.fetch,
  ): Promise<SetmoreTokenResponse> {
    const res = await fetchFn("https://developer.setmore.com/api/v1/o/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    if (!res.ok) throw new SetmoreError(res.status, await res.text());
    const data = await res.json() as SetmoreTokenResponse;
    if (data.status === false) throw new SetmoreError(0, data.msg ?? "Token refresh failed");
    return data;
  }

  // GET /bookingpage/services
  async listServices(): Promise<SetmoreListServicesResponse> {
    return this.request<SetmoreListServicesResponse>(
      `${this.baseUrl}/bookingpage/services`,
      { method: "GET" },
    );
  }

  // GET /bookingpage/staffmembers
  async listStaffMembers(): Promise<SetmoreListStaffResponse> {
    return this.request<SetmoreListStaffResponse>(
      `${this.baseUrl}/bookingpage/staffmembers`,
      { method: "GET" },
    );
  }

  // GET /bookingpage/slots?staff_key=&service_key=&selected_date=
  async getAvailableSlots(
    staffKey: string,
    serviceKey: string,
    date: string,
  ): Promise<SetmoreGetSlotsResponse> {
    const url = new URL(`${this.baseUrl}/bookingpage/slots`);
    url.searchParams.set("staff_key", staffKey);
    url.searchParams.set("service_key", serviceKey);
    url.searchParams.set("selected_date", date);
    return this.request<SetmoreGetSlotsResponse>(url.toString(), { method: "GET" });
  }

  // POST /bookingpage/appointment/create
  async createAppointment(
    params: SetmoreCreateAppointmentParams,
  ): Promise<SetmoreCreateAppointmentResponse> {
    return this.request<SetmoreCreateAppointmentResponse>(
      `${this.baseUrl}/bookingpage/appointment/create`,
      { method: "POST", body: JSON.stringify(params) },
    );
  }

  // DELETE /bookingpage/appointment/delete?appointment_key=
  async cancelAppointment(appointmentKey: string): Promise<SetmoreCancelAppointmentResponse> {
    const url = new URL(`${this.baseUrl}/bookingpage/appointment/delete`);
    url.searchParams.set("appointment_key", appointmentKey);
    return this.request<SetmoreCancelAppointmentResponse>(url.toString(), { method: "DELETE" });
  }

  // GET /bookingpage/appointment?appointment_key=
  async getAppointment(appointmentKey: string): Promise<SetmoreGetAppointmentResponse> {
    const url = new URL(`${this.baseUrl}/bookingpage/appointment`);
    url.searchParams.set("appointment_key", appointmentKey);
    return this.request<SetmoreGetAppointmentResponse>(url.toString(), { method: "GET" });
  }
}
