export class ConvertKitError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`ConvertKit ${status}: ${message}`);
    this.name = "ConvertKitError";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConvertKitSubscriber {
  id: number;
  first_name: string | null;
  email_address: string;
  state: "active" | "inactive" | "bounced" | "complained" | "cancelled" | "unsubscribed";
  fields: Record<string, unknown>;
}

export interface ConvertKitSubscription {
  id: number;
  state: string;
  subscriber: Pick<ConvertKitSubscriber, "id" | "email_address">;
}

export interface ConvertKitTag {
  id: number;
  name: string;
  created_at: string;
}

export interface ConvertKitSequence {
  id: number;
  name: string;
  created_at: string;
}

export interface ConvertKitSubscribersResponse {
  total_subscribers: number;
  page: number;
  total_pages: number;
  subscribers: ConvertKitSubscriber[];
}

export interface ConvertKitSubscribeToFormParams {
  email: string;
  first_name?: string;
  fields?: Record<string, unknown>;
  /** Tag IDs to apply on subscribe */
  tags?: number[];
}

export interface ConvertKitUpdateSubscriberParams {
  first_name?: string;
  fields?: Record<string, unknown>;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class ConvertKitClient {
  readonly baseUrl = "https://api.convertkit.com/v3";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private url(path: string, extraParams?: Record<string, string>): string {
    const params = new URLSearchParams({ api_key: this.apiKey, ...extraParams });
    return `${this.baseUrl}${path}?${params}`;
  }

  private get jsonHeaders(): HeadersInit {
    return { "Content-Type": "application/json" };
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(url, {
      method,
      headers: this.jsonHeaders,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const json = await res.json() as { message?: string; error?: string };
        if (json.message) message = json.message;
        else if (json.error) message = json.error;
      } catch {
        // ignore parse errors
      }
      throw new ConvertKitError(res.status, message);
    }

    return res.json() as Promise<T>;
  }

  // ── Subscribers ───────────────────────────────────────────────────────────

  /**
   * Find a subscriber by email address.
   * Returns `subscribers: []` if not found — does NOT throw 404.
   */
  findSubscriber(email: string): Promise<ConvertKitSubscribersResponse> {
    return this.request<ConvertKitSubscribersResponse>(
      "GET",
      this.url("/subscribers", { email_address: email }),
    );
  }

  /**
   * Update subscriber fields by subscriber ID.
   * Requires knowing the subscriber ID — use findSubscriber() first.
   */
  updateSubscriber(
    subscriberId: number,
    params: ConvertKitUpdateSubscriberParams,
  ): Promise<{ subscriber: ConvertKitSubscriber }> {
    return this.request<{ subscriber: ConvertKitSubscriber }>(
      "PUT",
      this.url(`/subscribers/${subscriberId}`),
      { api_key: this.apiKey, ...params },
    );
  }

  // ── Forms ─────────────────────────────────────────────────────────────────

  /**
   * Subscribe an email address to a form.
   * This is the primary upsert endpoint — creates the subscriber if they
   * don't exist, or updates their fields if they do.
   */
  subscribeToForm(
    formId: number | string,
    params: ConvertKitSubscribeToFormParams,
  ): Promise<{ subscription: ConvertKitSubscription }> {
    return this.request<{ subscription: ConvertKitSubscription }>(
      "POST",
      this.url(`/forms/${formId}/subscribe`),
      { api_key: this.apiKey, ...params },
    );
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  /** List all tags. Cache the result — tag IDs are stable. */
  listTags(): Promise<{ tags: ConvertKitTag[] }> {
    return this.request<{ tags: ConvertKitTag[] }>("GET", this.url("/tags"));
  }

  /**
   * Add a tag to a subscriber (creates subscriber if not exists).
   * Fires ConvertKit Automations that watch for this tag.
   */
  addTagToSubscriber(
    tagId: number,
    email: string,
  ): Promise<{ subscription: ConvertKitSubscription }> {
    return this.request<{ subscription: ConvertKitSubscription }>(
      "POST",
      this.url(`/tags/${tagId}/subscribe`),
      { api_key: this.apiKey, email },
    );
  }

  /**
   * Remove a tag from a subscriber.
   */
  removeTagFromSubscriber(
    subscriberId: number,
    tagId: number,
  ): Promise<void> {
    return this.request<void>(
      "DELETE",
      this.url(`/subscribers/${subscriberId}/tags/${tagId}`),
    );
  }

  // ── Sequences ─────────────────────────────────────────────────────────────

  /** List all automation sequences (drip campaigns). */
  listSequences(): Promise<{ courses: ConvertKitSequence[] }> {
    return this.request<{ courses: ConvertKitSequence[] }>(
      "GET",
      this.url("/sequences"),
    );
  }

  /**
   * Enroll a subscriber in a sequence (drip campaign).
   */
  subscribeToSequence(
    sequenceId: number | string,
    email: string,
  ): Promise<{ subscription: ConvertKitSubscription }> {
    return this.request<{ subscription: ConvertKitSubscription }>(
      "POST",
      this.url(`/sequences/${sequenceId}/subscribe`),
      { api_key: this.apiKey, email },
    );
  }
}
