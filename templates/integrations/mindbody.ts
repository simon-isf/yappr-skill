// mindbody.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/mindbody.md

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface MindbodyStaffMember {
  Id: number;
  Name: string;
  FirstName: string;
  LastName: string;
}

export interface MindbodyService {
  Id: string;
  Name: string;
  Duration: number;
  CategoryId: number;
  Category: string;
}

export interface MindbodyLocation {
  Id: number;
  Name: string;
}

export interface GetBookableItemsResponse {
  StaffMembers: MindbodyStaffMember[];
  Services: MindbodyService[];
  Locations: MindbodyLocation[];
}

// ---------------------------------------------------------------------------

export interface AvailableTimeSlot {
  StartDateTime: string;
  EndDateTime: string;
  Staff: {
    Id: number;
    Name: string;
  };
}

export interface GetAvailableTimesResponse {
  AvailableTimes: AvailableTimeSlot[];
}

// ---------------------------------------------------------------------------

export interface MindbodyClient {
  Id: string;
  UniqueId: number;
  FirstName: string;
  LastName: string;
  Email: string;
  MobilePhone: string;
}

export interface FindClientsResponse {
  Clients: MindbodyClient[];
  TotalResults: number;
}

// ---------------------------------------------------------------------------

export interface AddClientParams {
  FirstName: string;
  LastName: string;
  MobilePhone?: string;
  Email?: string;
}

export interface AddClientResponse {
  Client: MindbodyClient;
}

// ---------------------------------------------------------------------------

export interface AddBookingParams {
  ClientId: string;
  StaffId: number;
  ServiceId: string;
  LocationId: number;
  StartDateTime: string;
  EndDateTime: string;
  Notes?: string;
  SendEmail?: boolean;
}

export interface MindbodyAppointment {
  Id: number;
  StartDateTime: string;
  EndDateTime: string;
  Status: string;
  Client: { Id: string; FirstName: string; LastName: string };
  Staff: { Id: number; Name: string };
  Service: { Name: string };
}

export interface AddBookingResponse {
  Appointment: MindbodyAppointment;
}

// ---------------------------------------------------------------------------

export interface CancelAppointmentParams {
  AppointmentId: number;
  SendEmail?: boolean;
}

export interface CancelAppointmentResponse {
  Appointment: {
    Id: number;
    Status: string;
  };
}

// ---------------------------------------------------------------------------

export interface MindbodyClass {
  Id: number;
  ClassDescription: { Name: string; Duration: number };
  StartDateTime: string;
  EndDateTime: string;
  MaxCapacity: number;
  TotalBooked: number;
  Staff: { Id: number; Name: string };
  IsAvailable: boolean;
}

export interface GetClassesResponse {
  Classes: MindbodyClass[];
}

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class MindbodyError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Mindbody ${status}: ${message}`);
    this.name = "MindbodyError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MindbodyClient {
  readonly baseUrl = "https://api.mindbodyonline.com/public/v6";

  private tokenCache: TokenCache | null = null;

  /**
   * @param apiKey    Developer subscription key (Api-Key header).
   * @param siteId    Mindbody site ID (use -99 for sandbox).
   * @param username  Staff username for token issuance.
   * @param password  Staff password for token issuance.
   */
  constructor(
    private readonly apiKey: string,
    private readonly siteId: number | string,
    private readonly username: string,
    private readonly password: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  // -------------------------------------------------------------------------
  // Internal auth
  // -------------------------------------------------------------------------

  /**
   * Issues a staff token via POST /usertoken/issue.
   * Caches the result and refreshes automatically when expiry is within 5 minutes.
   */
  async getStaffToken(): Promise<string> {
    const nowMs = Date.now();
    const fiveMin = 5 * 60 * 1000;

    if (this.tokenCache && this.tokenCache.expiresAt - nowMs > fiveMin) {
      return this.tokenCache.accessToken;
    }

    const res = await this.fetchFn(`${this.baseUrl}/usertoken/issue`, {
      method: "POST",
      headers: {
        "Api-Key": this.apiKey,
        "SiteId": String(this.siteId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Username: this.username,
        Password: this.password,
        SiteId: this.siteId,
      }),
    });

    if (!res.ok) throw new MindbodyError(res.status, await res.text());

    const data = await res.json() as { AccessToken: string; TokenExpirationTime: string };
    this.tokenCache = {
      accessToken: data.AccessToken,
      expiresAt: new Date(data.TokenExpirationTime).getTime(),
    };
    return this.tokenCache.accessToken;
  }

  private async authHeaders(): Promise<HeadersInit> {
    const token = await this.getStaffToken();
    return {
      "Api-Key": this.apiKey,
      "SiteId": String(this.siteId),
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: await this.authHeaders(),
    });
    if (!res.ok) throw new MindbodyError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: await this.authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new MindbodyError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * GET /appointment/bookableitems — list bookable services, staff, and locations.
   * Cache the result; IDs are needed for availability and booking calls.
   * @param locationId  Optional location filter.
   */
  async getBookableItems(locationId?: number): Promise<GetBookableItemsResponse> {
    const query: Record<string, string> = {};
    if (locationId !== undefined) query["locationId"] = String(locationId);
    return this.get<GetBookableItemsResponse>("/appointment/bookableitems", query);
  }

  /**
   * GET /appointment/availabletimes — fetch open slots for a service on a given day.
   * @param serviceId      Service ID string.
   * @param startDateTime  ISO datetime string (no Z suffix — site-local time).
   * @param endDateTime    ISO datetime string (no Z suffix — site-local time).
   * @param locationId     Location ID.
   * @param staffId        Optional staff filter.
   */
  async getAvailableTimes(
    serviceId: string,
    startDateTime: string,
    endDateTime: string,
    locationId: number,
    staffId?: number,
  ): Promise<GetAvailableTimesResponse> {
    const query: Record<string, string> = {
      serviceId,
      startDateTime,
      endDateTime,
      locationId: String(locationId),
    };
    if (staffId !== undefined) query["staffId"] = String(staffId);
    return this.get<GetAvailableTimesResponse>("/appointment/availabletimes", query);
  }

  /**
   * GET /client/clients — search clients by phone or name.
   * @param searchText  Phone number or name to search.
   * @param limit       Max results (default 5).
   */
  async findClients(searchText: string, limit = 5): Promise<FindClientsResponse> {
    return this.get<FindClientsResponse>("/client/clients", {
      searchText,
      limit: String(limit),
    });
  }

  /** POST /client/addclient — create a new client record. */
  async addClient(params: AddClientParams): Promise<AddClientResponse> {
    return this.post<AddClientResponse>("/client/addclient", params);
  }

  /** POST /appointment/addbooking — book a service appointment. */
  async addBooking(params: AddBookingParams): Promise<AddBookingResponse> {
    return this.post<AddBookingResponse>("/appointment/addbooking", params);
  }

  /**
   * POST /appointment/cancelappointment — cancel an existing appointment.
   */
  async cancelAppointment(params: CancelAppointmentParams): Promise<CancelAppointmentResponse> {
    return this.post<CancelAppointmentResponse>("/appointment/cancelappointment", params);
  }

  /**
   * GET /class/classes — list scheduled classes for a location and time window.
   * @param locationId     Location ID.
   * @param startDateTime  ISO datetime (site-local).
   * @param endDateTime    ISO datetime (site-local).
   */
  async getClasses(
    locationId: number,
    startDateTime: string,
    endDateTime: string,
  ): Promise<GetClassesResponse> {
    return this.get<GetClassesResponse>("/class/classes", {
      locationIds: String(locationId),
      startDateTime,
      endDateTime,
    });
  }
}
