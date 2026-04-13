// acuity-scheduling.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/acuity-scheduling.md

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface AppointmentType {
  id: number;
  name: string;
  duration: number;
  price: string;
  category: string;
  description?: string;
  active: boolean;
}

// ---------------------------------------------------------------------------

export interface AvailableTime {
  time: string;
}

// ---------------------------------------------------------------------------

export interface AvailableDate {
  date: string;
}

// ---------------------------------------------------------------------------

export interface BookAppointmentParams {
  appointmentTypeID: number;
  datetime: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  notes?: string;
}

export interface Appointment {
  id: number;
  type: string;
  datetime: string;
  datetimeCreated: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  confirmationPage: string;
  canceled: boolean;
}

// ---------------------------------------------------------------------------

export interface CancelParams {
  noShow?: boolean;
}

export interface CancelResponse {
  id: number;
  canceled: boolean;
}

// ---------------------------------------------------------------------------

export interface RescheduleParams {
  datetime: string;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class AcuityError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Acuity ${status}: ${message}`);
    this.name = "AcuityError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AcuityClient {
  readonly baseUrl = "https://acuityscheduling.com/api/v1";

  private readonly authHeader: string;

  /**
   * @param userId  Numeric User ID from Acuity → Integrations → API.
   * @param apiKey  API Key from the same page.
   */
  constructor(
    userId: string | number,
    apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.authHeader = `Basic ${btoa(`${userId}:${apiKey}`)}`;
  }

  private get headers(): HeadersInit {
    return {
      "Authorization": this.authHeader,
      "Content-Type": "application/json",
    };
  }

  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), { method: "GET", headers: this.headers });
    if (!res.ok) throw new AcuityError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new AcuityError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new AcuityError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  /** GET /appointment-types — list all active appointment types. Cache the result. */
  async listAppointmentTypes(): Promise<AppointmentType[]> {
    return this.get<AppointmentType[]>("/appointment-types");
  }

  /**
   * GET /availability/times — fetch available slots for a given date.
   * @param appointmentTypeID  Appointment type ID.
   * @param date               Date string in YYYY-MM-DD format.
   */
  async getAvailableTimes(
    appointmentTypeID: number,
    date: string,
  ): Promise<AvailableTime[]> {
    return this.get<AvailableTime[]>("/availability/times", {
      appointmentTypeID: String(appointmentTypeID),
      date,
    });
  }

  /**
   * GET /availability/dates — fetch available dates for a given month.
   * @param appointmentTypeID  Appointment type ID.
   * @param month              Month string in YYYY-MM format.
   * @param timezone           IANA timezone (e.g. "Asia/Jerusalem").
   */
  async getAvailableDates(
    appointmentTypeID: number,
    month: string,
    timezone?: string,
  ): Promise<AvailableDate[]> {
    const query: Record<string, string> = {
      appointmentTypeID: String(appointmentTypeID),
      month,
    };
    if (timezone) query["timezone"] = timezone;
    return this.get<AvailableDate[]>("/availability/dates", query);
  }

  /** POST /appointments — book an appointment on behalf of a caller. */
  async bookAppointment(params: BookAppointmentParams): Promise<Appointment> {
    return this.post<Appointment>("/appointments", params);
  }

  /**
   * GET /appointments — find appointments by phone number.
   * @param phone  E.164 phone number (e.g. "+972501234567").
   * @param max    Maximum number of results to return.
   */
  async findAppointmentsByPhone(phone: string, max = 5): Promise<Appointment[]> {
    return this.get<Appointment[]>("/appointments", {
      phone,
      max: String(max),
    });
  }

  /**
   * PUT /appointments/{id}/cancel — cancel an appointment.
   * @param id     Appointment ID returned from bookAppointment.
   * @param params Optional cancellation options.
   */
  async cancelAppointment(id: number, params: CancelParams = {}): Promise<CancelResponse> {
    return this.put<CancelResponse>(`/appointments/${id}/cancel`, params);
  }

  /**
   * PUT /appointments/{id} — reschedule an appointment to a new datetime.
   * @param id      Appointment ID.
   * @param params  Object with new `datetime` ISO string.
   */
  async rescheduleAppointment(id: number, params: RescheduleParams): Promise<Appointment> {
    return this.put<Appointment>(`/appointments/${id}`, params);
  }
}
