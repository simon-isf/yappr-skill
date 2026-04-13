// drift.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/drift.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface DriftContactAttributes {
  email?: string;
  name?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface DriftContact {
  id: number;
  createdAt?: number;
  attributes: DriftContactAttributes;
}

export interface DriftContactResponse {
  data: DriftContact;
}

export interface DriftConversation {
  id: number;
  status: string;
  contactId: number;
  assignedTo?: number;
}

export interface DriftConversationsResponse {
  data: DriftConversation[];
}

export interface DriftMessage {
  id: string;
  conversationId: number;
  type: string;
  body: string;
  author: { id: number; type: string };
  createdAt: number;
}

export interface DriftMessageResponse {
  data: DriftMessage;
}

export interface DriftSendMessageParams {
  conversationId: number;
  type?: "chat" | "private_note";
  body: string;
}

export interface DriftTimelineEventProperty {
  label: string;
  value: string;
}

export interface DriftTimelineEvent {
  event: string;
  eventId: string;
  properties?: DriftTimelineEventProperty[];
}

export interface DriftPostTimelineParams {
  orgId: number;
  userId: number;
  event: DriftTimelineEvent;
}

export interface DriftTimelineResponse {
  data: { success: boolean };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class DriftError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Drift ${status}: ${message}`);
    this.name = "DriftError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class DriftClient {
  readonly baseUrl = "https://driftapi.com";

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

  // GET /contacts?email={email}
  async getContactByEmail(email: string): Promise<DriftContact> {
    const url = `${this.baseUrl}/contacts?email=${encodeURIComponent(email)}`;
    const res = await this.fetchFn(url, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new DriftError(res.status, await res.text());
    const data = (await res.json()) as DriftContactResponse;
    return data.data;
  }

  // POST /contacts (upserts by email)
  async createContact(attributes: DriftContactAttributes): Promise<DriftContact> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ attributes }),
    });
    if (!res.ok) throw new DriftError(res.status, await res.text());
    const data = (await res.json()) as DriftContactResponse;
    return data.data;
  }

  // PATCH /contacts/{contactId}
  async updateContact(
    contactId: number,
    attributes: DriftContactAttributes,
  ): Promise<DriftContact> {
    const res = await this.fetchFn(`${this.baseUrl}/contacts/${contactId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({ attributes }),
    });
    if (!res.ok) throw new DriftError(res.status, await res.text());
    const data = (await res.json()) as DriftContactResponse;
    return data.data;
  }

  // GET /conversations?contactId={contactId}
  async getConversationsForContact(contactId: number): Promise<DriftConversation[]> {
    const url = `${this.baseUrl}/conversations?contactId=${contactId}`;
    const res = await this.fetchFn(url, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new DriftError(res.status, await res.text());
    const data = (await res.json()) as DriftConversationsResponse;
    return data.data;
  }

  // POST /messages
  async sendMessage(params: DriftSendMessageParams): Promise<DriftMessage> {
    const res = await this.fetchFn(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new DriftError(res.status, await res.text());
    const data = (await res.json()) as DriftMessageResponse;
    return data.data;
  }

  // POST /timeline
  async postTimelineEvent(params: DriftPostTimelineParams): Promise<DriftTimelineResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/timeline`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new DriftError(res.status, await res.text());
    return res.json() as Promise<DriftTimelineResponse>;
  }
}
