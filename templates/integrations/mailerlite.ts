// mailerlite.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/mailerlite.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface MailerLiteSubscriberFields {
  name?: string;
  last_name?: string;
  phone?: string;
  [key: string]: string | undefined;
}

export interface MailerLiteGroup {
  id: string;
  name: string;
}

export interface MailerLiteSubscriber {
  id: string;
  email: string;
  status: "active" | "unsubscribed" | "bounced" | "junk" | "unconfirmed";
  fields?: MailerLiteSubscriberFields;
  groups?: MailerLiteGroup[];
}

export interface MailerLiteSubscriberResponse {
  data: MailerLiteSubscriber;
}

export interface MailerLiteGroupsResponse {
  data: MailerLiteGroup[];
}

export interface MailerLiteUpsertSubscriberParams {
  email: string;
  fields?: MailerLiteSubscriberFields;
  groups?: string[];
  status?: "active" | "unsubscribed";
  resubscribe?: boolean;
}

export interface MailerLiteCreateGroupParams {
  name: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class MailerLiteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`MailerLite ${status}: ${message}`);
    this.name = "MailerLiteError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MailerLiteClient {
  readonly baseUrl = "https://connect.mailerlite.com/api";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers,
    });
    if (!res.ok) throw new MailerLiteError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // POST /subscribers — upsert by email
  async upsertSubscriber(
    params: MailerLiteUpsertSubscriberParams,
  ): Promise<MailerLiteSubscriberResponse> {
    return this.request("/subscribers", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // GET /subscribers/{email}
  async getSubscriberByEmail(email: string): Promise<MailerLiteSubscriber | null> {
    const url = `${this.baseUrl}/subscribers/${encodeURIComponent(email)}`;
    const res = await this.fetchFn(url, { method: "GET", headers: this.headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new MailerLiteError(res.status, await res.text());
    const body = await res.json() as MailerLiteSubscriberResponse;
    return body.data;
  }

  // POST /subscribers/{subscriber_id}/assign-subscriber/{group_id}
  async assignToGroup(subscriberId: string, groupId: string): Promise<void> {
    const url = `${this.baseUrl}/subscribers/${subscriberId}/assign-subscriber/${groupId}`;
    const res = await this.fetchFn(url, { method: "POST", headers: this.headers });
    if (!res.ok) throw new MailerLiteError(res.status, await res.text());
  }

  // DELETE /subscribers/{subscriber_id}/assign-subscriber/{group_id}
  async removeFromGroup(subscriberId: string, groupId: string): Promise<void> {
    const url =
      `${this.baseUrl}/subscribers/${subscriberId}/assign-subscriber/${groupId}`;
    const res = await this.fetchFn(url, { method: "DELETE", headers: this.headers });
    if (!res.ok) throw new MailerLiteError(res.status, await res.text());
  }

  // DELETE /subscribers/{id}
  async unsubscribe(subscriberId: string): Promise<void> {
    const url = `${this.baseUrl}/subscribers/${subscriberId}`;
    const res = await this.fetchFn(url, { method: "DELETE", headers: this.headers });
    if (!res.ok) throw new MailerLiteError(res.status, await res.text());
  }

  // GET /groups
  async getGroups(): Promise<MailerLiteGroupsResponse> {
    return this.request("/groups");
  }

  // POST /groups
  async createGroup(params: MailerLiteCreateGroupParams): Promise<{ data: MailerLiteGroup }> {
    return this.request("/groups", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }
}
