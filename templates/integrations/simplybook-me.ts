// simplybook-me.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/simplybook-me.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface SimplyBookService {
  id: string;
  name: string;
  duration: number;
  price?: string;
  currency?: string;
}

export interface SimplyBookUnit {
  id: string;
  name: string;
}

/** Record keyed by date (YYYY-MM-DD), value is array of time strings (HH:mm:ss) */
export type SimplyBookSlotMatrix = Record<string, string[]>;

export interface SimplyBookClientData {
  name: string;
  email?: string;
  phone?: string;
}

export interface SimplyBookBooking {
  id: string;
  code: string;
  start_date_time: string;
  end_date_time: string;
  event_name?: string;
  unit_name?: string;
  client_name?: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class SimplyBookError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`SimplyBook ${status}: ${message}`);
    this.name = "SimplyBookError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SimplyBookClient {
  static readonly loginUrl = "https://user-api.simplybook.me/login";
  static readonly apiUrl = "https://user-api.simplybook.me";

  private cachedToken: string | null = null;
  private requestId = 1;

  constructor(
    private readonly company: string,
    private readonly loginName: string,
    private readonly password: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  /** Authenticate and cache the token in memory. */
  async getToken(): Promise<string> {
    if (this.cachedToken) return this.cachedToken;
    const token = await this.rpc<string>(
      SimplyBookClient.loginUrl,
      "getToken",
      [this.company, this.password],
    );
    this.cachedToken = token;
    return token;
  }

  /** Extend the cached token's lifetime without re-authenticating.
   *  Returns the new token, or null if fully expired (call getToken again). */
  async refreshToken(): Promise<string | null> {
    const current = this.cachedToken;
    if (!current) return this.getToken();
    const result = await this.rpc<string | false>(
      SimplyBookClient.loginUrl,
      "refreshToken",
      [this.company, current],
    );
    if (!result) {
      this.cachedToken = null;
      return null;
    }
    this.cachedToken = result;
    return result;
  }

  // -------------------------------------------------------------------------
  // Services
  // -------------------------------------------------------------------------

  /** POST /admin — getEventList */
  async getEventList(): Promise<Record<string, SimplyBookService>> {
    return this.adminRpc<Record<string, SimplyBookService>>("getEventList", []);
  }

  // -------------------------------------------------------------------------
  // Providers
  // -------------------------------------------------------------------------

  /** POST /admin — getUnitList */
  async getUnitList(): Promise<Record<string, SimplyBookUnit>> {
    return this.adminRpc<Record<string, SimplyBookUnit>>("getUnitList", []);
  }

  // -------------------------------------------------------------------------
  // Availability
  // -------------------------------------------------------------------------

  /**
   * POST /admin — getStartTimeMatrix
   * @param from  YYYY-MM-DD
   * @param to    YYYY-MM-DD (keep range ≤14 days)
   * @param eventId  service ID from getEventList
   * @param unitId   provider ID, or null for any
   * @param count    number of participants (usually 1)
   */
  async getStartTimeMatrix(
    from: string,
    to: string,
    eventId: string,
    unitId: string | null = null,
    count = 1,
  ): Promise<SimplyBookSlotMatrix> {
    return this.adminRpc<SimplyBookSlotMatrix>("getStartTimeMatrix", [
      from,
      to,
      eventId,
      unitId,
      count,
    ]);
  }

  // -------------------------------------------------------------------------
  // Bookings
  // -------------------------------------------------------------------------

  /**
   * POST /admin — book
   * @param eventId     service ID
   * @param unitId      provider ID or null
   * @param date        YYYY-MM-DD
   * @param startTime   HH:mm:ss
   * @param clientData  name, email, phone
   * @param count       number of participants (usually 1)
   */
  async book(
    eventId: string,
    unitId: string | null,
    date: string,
    startTime: string,
    clientData: SimplyBookClientData,
    count = 1,
  ): Promise<SimplyBookBooking> {
    return this.adminRpc<SimplyBookBooking>("book", [
      eventId,
      unitId,
      date,
      startTime,
      clientData,
      null,
      count,
      null,
      null,
    ]);
  }

  /**
   * POST /admin — cancelBooking
   * @param bookingId  booking ID returned by book()
   */
  async cancelBooking(bookingId: string): Promise<boolean> {
    return this.adminRpc<boolean>("cancelBooking", [bookingId]);
  }

  /**
   * POST /admin — getBooking
   * @param bookingId  booking ID returned by book()
   */
  async getBooking(bookingId: string): Promise<SimplyBookBooking> {
    return this.adminRpc<SimplyBookBooking>("getBooking", [bookingId]);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Execute a JSON-RPC call that requires an auth token (main API). */
  private async adminRpc<T>(method: string, params: unknown[]): Promise<T> {
    const token = await this.getToken();
    return this.rpc<T>(SimplyBookClient.apiUrl, method, params, token);
  }

  /** Low-level JSON-RPC 2.0 POST. */
  private async rpc<T>(
    url: string,
    method: string,
    params: unknown[],
    token?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["X-Company-Login"] = this.company;
      headers["X-Token"] = token;
    }
    const id = this.requestId++;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
    });
    if (!res.ok) {
      throw new SimplyBookError(res.status, await res.text());
    }
    const data = await res.json() as { result?: T; error?: { message?: string; code?: number } };
    if (data.error) {
      throw new SimplyBookError(
        data.error.code ?? 0,
        data.error.message ?? JSON.stringify(data.error),
      );
    }
    return data.result as T;
  }
}
