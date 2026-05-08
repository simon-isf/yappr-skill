// google-calendar.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/google-calendar.md

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface CalendarDateTime {
  dateTime: string;
  timeZone?: string;
}

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: "accepted" | "declined" | "needsAction" | "tentative";
}

export interface CalendarReminder {
  method: "email" | "popup";
  minutes: number;
}

export interface CalendarConferenceSolutionKey {
  type: "hangoutsMeet" | "eventHangout" | "addOn";
}

export interface CalendarConferenceCreateRequest {
  requestId: string;
  conferenceSolutionKey: CalendarConferenceSolutionKey;
}

export interface CalendarConferenceData {
  createRequest?: CalendarConferenceCreateRequest;
  entryPoints?: Array<{
    entryPointType: string;
    uri: string;
    label?: string;
  }>;
}

// ---------------------------------------------------------------------------
// freeBusy
// ---------------------------------------------------------------------------

export interface FreeBusyParams {
  timeMin: string;
  timeMax: string;
  timeZone?: string;
  /** Defaults to the calendarId passed to the constructor. */
  calendarIds?: string[];
}

export interface BusyInterval {
  start: string;
  end: string;
}

export interface FreeBusyResponse {
  kind: string;
  timeMin: string;
  timeMax: string;
  calendars: Record<string, { busy: BusyInterval[] }>;
}

// ---------------------------------------------------------------------------
// Events — Create
// ---------------------------------------------------------------------------

export interface CreateEventParams {
  summary: string;
  description?: string;
  start: CalendarDateTime;
  end: CalendarDateTime;
  attendees?: CalendarAttendee[];
  reminders?: {
    useDefault: boolean;
    overrides?: CalendarReminder[];
  };
  conferenceData?: CalendarConferenceData;
  /** Set to true to auto-generate a Google Meet link. Sends conferenceDataVersion=1. */
  createMeetLink?: boolean;
}

export interface CalendarEvent {
  id: string;
  status: string;
  htmlLink: string;
  summary: string;
  description?: string;
  start: CalendarDateTime;
  end: CalendarDateTime;
  attendees?: CalendarAttendee[];
  conferenceData?: CalendarConferenceData;
}

// ---------------------------------------------------------------------------
// Events — Update
// ---------------------------------------------------------------------------

export interface UpdateEventParams {
  summary?: string;
  description?: string;
  start?: CalendarDateTime;
  end?: CalendarDateTime;
  attendees?: CalendarAttendee[];
}

// ---------------------------------------------------------------------------
// Events — List
// ---------------------------------------------------------------------------

export interface ListEventsParams {
  timeMin?: string;
  timeMax?: string;
  orderBy?: "startTime" | "updated";
  singleEvents?: boolean;
  maxResults?: number;
  pageToken?: string;
}

export interface ListEventsResponse {
  items: CalendarEvent[];
  nextPageToken?: string;
}

// ---------------------------------------------------------------------------
// Delete Event
// ---------------------------------------------------------------------------

export type SendUpdates = "all" | "externalOnly" | "none";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class GoogleCalendarError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`GoogleCalendar ${status}: ${message}`);
    this.name = "GoogleCalendarError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GoogleCalendarClient {
  private readonly baseUrl = "https://www.googleapis.com/calendar/v3";

  constructor(
    /** Bearer access token — caller is responsible for generating/refreshing it. */
    private readonly accessToken: string,
    /** The calendar to operate on (e.g. "primary" or a full email address). */
    private readonly calendarId: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text();
      throw new GoogleCalendarError(res.status, text);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Check free/busy intervals for the client's calendar (or an additional list).
   * Use the returned `busy` array to find open slots.
   */
  async freeBusy(params: FreeBusyParams): Promise<FreeBusyResponse> {
    const calendarIds = params.calendarIds ?? [this.calendarId];
    const body = {
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      timeZone: params.timeZone,
      items: calendarIds.map((id) => ({ id })),
    };
    const res = await this.fetchFn(`${this.baseUrl}/freeBusy`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse<FreeBusyResponse>(res);
  }

  /**
   * Create a calendar event. Pass `createMeetLink: true` to automatically
   * generate a Google Meet link (sets `conferenceDataVersion=1`).
   */
  async createEvent(params: CreateEventParams): Promise<CalendarEvent> {
    const url = new URL(`${this.baseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events`);
    if (params.createMeetLink) url.searchParams.set("conferenceDataVersion", "1");

    const { createMeetLink: _, ...body } = params;
    const res = await this.fetchFn(url.toString(), {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse<CalendarEvent>(res);
  }

  /** Partially update an existing event (PATCH — only supplied fields change). */
  async updateEvent(eventId: string, params: UpdateEventParams): Promise<CalendarEvent> {
    const res = await this.fetchFn(
      `${this.baseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`,
      {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    return this.handleResponse<CalendarEvent>(res);
  }

  /**
   * Delete an event.
   * Pass `sendUpdates: "all"` to email attendees a cancellation notice.
   */
  async deleteEvent(eventId: string, sendUpdates: SendUpdates = "none"): Promise<void> {
    const url = new URL(
      `${this.baseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`,
    );
    url.searchParams.set("sendUpdates", sendUpdates);
    const res = await this.fetchFn(url.toString(), {
      method: "DELETE",
      headers: this.headers,
    });
    // 204 No Content is success; anything else is an error
    if (!res.ok) {
      const text = await res.text();
      throw new GoogleCalendarError(res.status, text);
    }
  }

  /** List events within an optional time range. Recurring events are expanded when `singleEvents` is true. */
  async listEvents(params: ListEventsParams = {}): Promise<ListEventsResponse> {
    const url = new URL(
      `${this.baseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events`,
    );
    if (params.timeMin) url.searchParams.set("timeMin", params.timeMin);
    if (params.timeMax) url.searchParams.set("timeMax", params.timeMax);
    if (params.orderBy) url.searchParams.set("orderBy", params.orderBy);
    if (params.singleEvents !== undefined) {
      url.searchParams.set("singleEvents", String(params.singleEvents));
    }
    if (params.maxResults !== undefined) url.searchParams.set("maxResults", String(params.maxResults));
    if (params.pageToken) url.searchParams.set("pageToken", params.pageToken);

    const res = await this.fetchFn(url.toString(), { headers: this.headers });
    return this.handleResponse<ListEventsResponse>(res);
  }
}
