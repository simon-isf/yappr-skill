// calendly.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/calendly.md

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CalendlyUser {
  uri: string;
  name: string;
  email: string;
  current_organization: string;
}

export interface GetCurrentUserResponse {
  resource: CalendlyUser;
}

// ---------------------------------------------------------------------------

export interface CalendlyEventType {
  uri: string;
  name: string;
  scheduling_url: string;
  duration: number;
  active: boolean;
  slug: string;
}

export interface ListEventTypesResponse {
  collection: CalendlyEventType[];
}

// ---------------------------------------------------------------------------

export interface CreateOneTimeLinkParams {
  name: string;
  max_event_count: number;
  owner: string;
  owner_type?: "users";
}

export interface OneTimeLinkResource {
  booking_url: string;
  owner: string;
  max_event_count: number;
  status: string;
}

export interface CreateOneTimeLinkResponse {
  resource: OneTimeLinkResource;
}

// ---------------------------------------------------------------------------

export interface AvailableTime {
  status: string;
  invitees_remaining: number;
  start_time: string;
  scheduling_url: string;
}

export interface GetAvailableTimesResponse {
  collection: AvailableTime[];
}

// ---------------------------------------------------------------------------

export interface ScheduledEvent {
  uri: string;
  name: string;
  status: string;
  start_time: string;
  end_time: string;
  event_type: string;
}

export interface ListScheduledEventsParams {
  userUri: string;
  status?: string;
  min_start_time?: string;
  max_start_time?: string;
}

export interface ListScheduledEventsResponse {
  collection: ScheduledEvent[];
  pagination: {
    count: number;
    next_page: string | null;
  };
}

// ---------------------------------------------------------------------------

export interface QuestionAndAnswer {
  question: string;
  answer: string;
}

export interface CalendlyInvitee {
  email: string;
  name: string;
  status: string;
  questions_and_answers: QuestionAndAnswer[];
}

export interface GetEventInviteesResponse {
  collection: CalendlyInvitee[];
}

// ---------------------------------------------------------------------------

export interface CreateWebhookParams {
  url: string;
  events: string[];
  organization: string;
  scope: "organization" | "user";
  user?: string;
}

export interface WebhookResource {
  uri: string;
  state: string;
  events: string[];
}

export interface CreateWebhookResponse {
  resource: WebhookResource;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class CalendlyError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Calendly ${status}: ${message}`);
    this.name = "CalendlyError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class CalendlyClient {
  readonly baseUrl = "https://api.calendly.com";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), { method: "GET", headers: this.headers });
    if (!res.ok) throw new CalendlyError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new CalendlyError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  /** GET /users/me — returns current user URI and org. */
  async getCurrentUser(): Promise<GetCurrentUserResponse> {
    return this.get<GetCurrentUserResponse>("/users/me");
  }

  /**
   * GET /event_types — list active event types for a user.
   * @param userUri  Full Calendly user URI (from getCurrentUser).
   */
  async listEventTypes(userUri: string): Promise<ListEventTypesResponse> {
    return this.get<ListEventTypesResponse>("/event_types", {
      user: userUri,
      active: "true",
    });
  }

  /**
   * POST /one_off_event_types — create a single-use booking link.
   * Share `resource.booking_url` with the customer during a call.
   */
  async createOneTimeLink(params: CreateOneTimeLinkParams): Promise<CreateOneTimeLinkResponse> {
    return this.post<CreateOneTimeLinkResponse>("/one_off_event_types", {
      ...params,
      owner_type: params.owner_type ?? "users",
    });
  }

  /**
   * GET /event_type_available_times — fetch available slots for a given event type and window.
   * @param eventTypeUri  Full Calendly event type URI.
   * @param startTime     ISO 8601 start of window.
   * @param endTime       ISO 8601 end of window.
   */
  async getAvailableTimes(
    eventTypeUri: string,
    startTime: string,
    endTime: string,
  ): Promise<GetAvailableTimesResponse> {
    return this.get<GetAvailableTimesResponse>("/event_type_available_times", {
      event_type: eventTypeUri,
      start_time: startTime,
      end_time: endTime,
    });
  }

  /**
   * GET /scheduled_events — list scheduled events for a user.
   */
  async listScheduledEvents(
    params: ListScheduledEventsParams,
  ): Promise<ListScheduledEventsResponse> {
    const query: Record<string, string> = {
      user: params.userUri,
    };
    if (params.status) query["status"] = params.status;
    if (params.min_start_time) query["min_start_time"] = params.min_start_time;
    if (params.max_start_time) query["max_start_time"] = params.max_start_time;
    return this.get<ListScheduledEventsResponse>("/scheduled_events", query);
  }

  /**
   * GET /scheduled_events/{uuid}/invitees — list invitees for a scheduled event.
   * @param eventUuid  UUID portion of the event URI (last path segment).
   */
  async getEventInvitees(eventUuid: string): Promise<GetEventInviteesResponse> {
    return this.get<GetEventInviteesResponse>(`/scheduled_events/${eventUuid}/invitees`);
  }

  /**
   * POST /webhook_subscriptions — register a webhook for booking/cancellation events.
   */
  async createWebhook(params: CreateWebhookParams): Promise<CreateWebhookResponse> {
    return this.post<CreateWebhookResponse>("/webhook_subscriptions", params);
  }
}
