// mailchimp.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/mailchimp.md

// @ts-ignore npm:md5 types resolve at runtime
import md5 from "npm:md5";

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface MailchimpMergeFields {
  FNAME?: string;
  LNAME?: string;
  PHONE?: string;
  [key: string]: string | undefined;
}

export interface MailchimpTag {
  id?: number;
  name: string;
  status?: "active" | "inactive";
}

export interface MailchimpMember {
  id: string;
  email_address: string;
  status: "subscribed" | "unsubscribed" | "cleaned" | "pending";
  merge_fields: MailchimpMergeFields;
  tags?: MailchimpTag[];
}

export interface MailchimpUpsertMemberParams {
  email_address: string;
  status_if_new: "subscribed" | "unsubscribed" | "cleaned" | "pending";
  status: "subscribed" | "unsubscribed" | "cleaned" | "pending";
  merge_fields?: MailchimpMergeFields;
  tags?: string[];
}

export interface MailchimpSetTagsParams {
  tags: Array<{ name: string; status: "active" | "inactive" }>;
}

export interface MailchimpList {
  id: string;
  name: string;
}

export interface MailchimpListsResponse {
  lists: MailchimpList[];
}

export interface MailchimpSegmentOptions {
  match: "all" | "any";
  conditions: Array<{
    condition_type: string;
    field: string;
    op: string;
    value: string;
  }>;
}

export interface MailchimpCreateSegmentParams {
  name: string;
  options: MailchimpSegmentOptions;
}

export interface MailchimpSegment {
  id: number;
  name: string;
  type: string;
  member_count: number;
}

export interface MailchimpMergeField {
  merge_id: number;
  tag: string;
  name: string;
  type: string;
}

export interface MailchimpMergeFieldsResponse {
  merge_fields: MailchimpMergeField[];
}

export interface MailchimpTriggerJourneyParams {
  email_address: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class MailchimpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Mailchimp ${status}: ${message}`);
    this.name = "MailchimpError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MailchimpClient {
  readonly baseUrl: string;
  private readonly credentials: string;

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    const dc = apiKey.split("-").pop() ?? "us1";
    this.baseUrl = `https://${dc}.api.mailchimp.com/3.0`;
    this.credentials = btoa(`anystring:${apiKey}`);
  }

  private get headers(): HeadersInit {
    return {
      "Authorization": `Basic ${this.credentials}`,
      "Content-Type": "application/json",
    };
  }

  /** Compute MD5 subscriber hash from email address. */
  static subscriberHash(email: string): string {
    // Deno built-in: use the Web Crypto subtle digest (sync-friendly via hex encoding)
    // We use a pure-JS MD5 so this file has no external dependencies.
    return md5(email.toLowerCase());
  }

  // PUT /lists/{list_id}/members/{subscriber_hash}
  async upsertMember(
    listId: string,
    params: MailchimpUpsertMemberParams,
  ): Promise<MailchimpMember> {
    const hash = MailchimpClient.subscriberHash(params.email_address);
    const res = await this.fetchFn(
      `${this.baseUrl}/lists/${listId}/members/${hash}`,
      {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new MailchimpError(res.status, await res.text());
    return res.json() as Promise<MailchimpMember>;
  }

  // GET /lists/{list_id}/members/{subscriber_hash}
  async getMember(listId: string, email: string): Promise<MailchimpMember> {
    const hash = MailchimpClient.subscriberHash(email);
    const res = await this.fetchFn(
      `${this.baseUrl}/lists/${listId}/members/${hash}`,
      { method: "GET", headers: this.headers },
    );
    if (!res.ok) throw new MailchimpError(res.status, await res.text());
    return res.json() as Promise<MailchimpMember>;
  }

  // POST /lists/{list_id}/members/{subscriber_hash}/tags
  // Returns 204 No Content on success — resolves void.
  async setTags(
    listId: string,
    email: string,
    params: MailchimpSetTagsParams,
  ): Promise<void> {
    const hash = MailchimpClient.subscriberHash(email);
    const res = await this.fetchFn(
      `${this.baseUrl}/lists/${listId}/members/${hash}/tags`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new MailchimpError(res.status, await res.text());
  }

  // GET /lists
  async getLists(count = 50): Promise<MailchimpListsResponse> {
    const url = new URL(`${this.baseUrl}/lists`);
    url.searchParams.set("count", String(count));
    url.searchParams.set("fields", "lists.id,lists.name");
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new MailchimpError(res.status, await res.text());
    return res.json() as Promise<MailchimpListsResponse>;
  }

  // POST /lists/{list_id}/segments
  async createSegment(
    listId: string,
    params: MailchimpCreateSegmentParams,
  ): Promise<MailchimpSegment> {
    const res = await this.fetchFn(`${this.baseUrl}/lists/${listId}/segments`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new MailchimpError(res.status, await res.text());
    return res.json() as Promise<MailchimpSegment>;
  }

  // GET /lists/{list_id}/merge-fields
  async getMergeFields(listId: string): Promise<MailchimpMergeFieldsResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/lists/${listId}/merge-fields`,
      { method: "GET", headers: this.headers },
    );
    if (!res.ok) throw new MailchimpError(res.status, await res.text());
    return res.json() as Promise<MailchimpMergeFieldsResponse>;
  }

  // POST /customer-journeys/journeys/{journey_id}/steps/{step_id}/actions/trigger
  async triggerJourneyStep(
    journeyId: string,
    stepId: string,
    params: MailchimpTriggerJourneyParams,
  ): Promise<void> {
    const res = await this.fetchFn(
      `${this.baseUrl}/customer-journeys/journeys/${journeyId}/steps/${stepId}/actions/trigger`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new MailchimpError(res.status, await res.text());
  }
}


