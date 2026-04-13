// zoom.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/zoom.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface ZoomMeetingSettings {
  join_before_host?: boolean;
  waiting_room?: boolean;
  host_video?: boolean;
  participant_video?: boolean;
  mute_upon_entry?: boolean;
  approval_type?: 0 | 1 | 2;
}

export interface ZoomCreateMeetingParams {
  topic: string;
  /** 1 = instant, 2 = scheduled, 8 = recurring fixed time */
  type?: 1 | 2 | 8;
  /** ISO 8601 without offset: "2026-04-15T14:00:00" */
  start_time?: string;
  duration?: number;
  timezone?: string;
  agenda?: string;
  password?: string;
  settings?: ZoomMeetingSettings;
}

export interface ZoomMeeting {
  id: number;
  uuid?: string;
  host_id?: string;
  topic: string;
  type?: number;
  status?: string;
  start_time?: string;
  duration?: number;
  timezone?: string;
  join_url?: string;
  start_url?: string;
  password?: string;
  settings?: ZoomMeetingSettings;
}

export interface ZoomUpdateMeetingParams {
  topic?: string;
  start_time?: string;
  duration?: number;
  timezone?: string;
  agenda?: string;
  settings?: ZoomMeetingSettings;
}

export interface ZoomListMeetingsResponse {
  page_count?: number;
  page_size?: number;
  total_records?: number;
  meetings: ZoomMeeting[];
}

export interface ZoomUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  type?: number;
  timezone?: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ZoomError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Zoom ${status}: ${message}`);
    this.name = "ZoomError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ZoomClient {
  static readonly tokenUrl = "https://zoom.us/oauth/token";
  static readonly apiBase = "https://api.zoom.us/v2";

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  /**
   * @param accountId     Server-to-Server OAuth account ID
   * @param clientId      OAuth client ID
   * @param clientSecret  OAuth client secret
   * @param fetchFn       injectable fetch for testing
   */
  constructor(
    private readonly accountId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  /**
   * Fetch (or return cached) a Server-to-Server OAuth access token.
   * Tokens are cached for ~1 hour (invalidated 60 s early to avoid edge races).
   */
  async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }
    const credentials = btoa(`${this.clientId}:${this.clientSecret}`);
    const url =
      `${ZoomClient.tokenUrl}?grant_type=account_credentials&account_id=${encodeURIComponent(this.accountId)}`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    if (!res.ok) {
      throw new ZoomError(res.status, await res.text());
    }
    const data = await res.json() as { access_token: string; expires_in: number };
    if (!data.access_token) {
      throw new ZoomError(res.status, JSON.stringify(data));
    }
    this.cachedToken = data.access_token;
    // Cache for (expires_in - 60) seconds
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return this.cachedToken;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${ZoomClient.apiBase}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await this.fetchFn(url, init);
    // 204 No Content (update / delete)
    if (res.status === 204) return undefined as unknown as T;
    if (!res.ok) {
      throw new ZoomError(res.status, await res.text());
    }
    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  /**
   * GET /users/{userId}
   * Use userId "me" for the service account user.
   */
  async getUser(userId = "me"): Promise<ZoomUser> {
    return this.request<ZoomUser>("GET", `/users/${encodeURIComponent(userId)}`);
  }

  // -------------------------------------------------------------------------
  // Meetings
  // -------------------------------------------------------------------------

  /**
   * POST /users/{userId}/meetings
   * @param userId  "me" or a specific user email / Zoom user ID
   */
  async createMeeting(
    params: ZoomCreateMeetingParams,
    userId = "me",
  ): Promise<ZoomMeeting> {
    return this.request<ZoomMeeting>(
      "POST",
      `/users/${encodeURIComponent(userId)}/meetings`,
      params,
    );
  }

  /** GET /meetings/{meetingId} */
  async getMeeting(meetingId: number | string): Promise<ZoomMeeting> {
    return this.request<ZoomMeeting>("GET", `/meetings/${meetingId}`);
  }

  /**
   * PATCH /meetings/{meetingId}
   * Returns undefined (204 No Content).
   */
  async updateMeeting(
    meetingId: number | string,
    params: ZoomUpdateMeetingParams,
  ): Promise<void> {
    return this.request<void>("PATCH", `/meetings/${meetingId}`, params);
  }

  /**
   * DELETE /meetings/{meetingId}
   * @param scheduleForReminder  send cancellation email to host
   */
  async deleteMeeting(
    meetingId: number | string,
    scheduleForReminder = false,
  ): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/meetings/${meetingId}?schedule_for_reminder=${scheduleForReminder}`,
    );
  }

  /**
   * GET /users/{userId}/meetings
   * @param type  "scheduled" | "live" | "upcoming"
   */
  async listMeetings(
    userId = "me",
    type = "scheduled",
    pageSize = 30,
  ): Promise<ZoomListMeetingsResponse> {
    return this.request<ZoomListMeetingsResponse>(
      "GET",
      `/users/${encodeURIComponent(userId)}/meetings?type=${type}&page_size=${pageSize}`,
    );
  }
}
