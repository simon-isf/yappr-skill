// supabase.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/supabase.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export type SupabaseFilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "like"
  | "is"
  | "in";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface SupabaseSelectParams {
  columns?: string;
  filters?: Record<string, string>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
}

export interface SupabaseInsertParams {
  record: Record<string, Json>;
  returnRepresentation?: boolean;
}

export interface SupabaseUpsertParams {
  record: Record<string, Json>;
  onConflict?: string;
  returnRepresentation?: boolean;
}

export interface SupabaseUpdateParams {
  patch: Record<string, Json>;
  filters: Record<string, string>;
  returnRepresentation?: boolean;
}

export interface SupabaseDeleteParams {
  filters: Record<string, string>;
}

export interface SupabaseRpcParams {
  args?: Record<string, Json>;
}

export interface SupabaseStorageUploadParams {
  bucket: string;
  path: string;
  body: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
  upsert?: boolean;
}

export interface SupabaseStorageUploadResponse {
  Key: string;
  Id?: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class SupabaseError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Supabase ${status}: ${message}`);
    this.name = "SupabaseError";
  }
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

export class SupabaseQueryBuilder {
  private _table: string;
  private _columns = "*";
  private _filters: Array<[string, string]> = [];
  private _order: { column: string; ascending: boolean } | null = null;
  private _limit: number | null = null;
  private _single = false;

  constructor(
    private readonly client: SupabaseClient,
    table: string,
  ) {
    this._table = table;
  }

  select(columns = "*"): this {
    this._columns = columns;
    return this;
  }

  eq(column: string, value: string | number | boolean): this {
    this._filters.push([column, `eq.${value}`]);
    return this;
  }

  neq(column: string, value: string | number | boolean): this {
    this._filters.push([column, `neq.${value}`]);
    return this;
  }

  gt(column: string, value: string | number): this {
    this._filters.push([column, `gt.${value}`]);
    return this;
  }

  lt(column: string, value: string | number): this {
    this._filters.push([column, `lt.${value}`]);
    return this;
  }

  gte(column: string, value: string | number): this {
    this._filters.push([column, `gte.${value}`]);
    return this;
  }

  lte(column: string, value: string | number): this {
    this._filters.push([column, `lte.${value}`]);
    return this;
  }

  like(column: string, pattern: string): this {
    this._filters.push([column, `like.${pattern}`]);
    return this;
  }

  is(column: string, value: "null" | "true" | "false"): this {
    this._filters.push([column, `is.${value}`]);
    return this;
  }

  in(column: string, values: Array<string | number>): this {
    this._filters.push([column, `in.(${values.join(",")})`]);
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this._order = { column, ascending: options.ascending ?? true };
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  single(): this {
    this._single = true;
    return this;
  }

  async execute<T = Record<string, Json>>(): Promise<T[]> {
    const url = new URL(`${this.client.baseUrl}/rest/v1/${this._table}`);
    url.searchParams.set("select", this._columns);
    for (const [col, val] of this._filters) {
      url.searchParams.append(col, val);
    }
    if (this._order) {
      url.searchParams.set(
        "order",
        `${this._order.column}.${this._order.ascending ? "asc" : "desc"}`,
      );
    }
    if (this._limit !== null) {
      url.searchParams.set("limit", String(this._limit));
    }

    const headers: HeadersInit = {
      ...(this.client as unknown as { _headers(): HeadersInit })._headers(),
      "Accept": "application/json",
    };

    const res = await (this.client as unknown as { _fetch: typeof fetch })._fetch(
      url.toString(),
      { method: "GET", headers },
    );
    if (!res.ok) throw new SupabaseError(res.status, await res.text());
    const data = (await res.json()) as T[];
    if (this._single) {
      if (!data || data.length === 0) throw new SupabaseError(406, "No rows found");
      return [data[0]];
    }
    return data;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SupabaseClient {
  readonly baseUrl: string;
  // Exposed for SupabaseQueryBuilder
  _fetch: typeof fetch;

  constructor(
    projectUrl: string,
    private readonly apiKey: string,
    fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = projectUrl.replace(/\/$/, "");
    this._fetch = fetchFn;
  }

  _headers(): HeadersInit {
    return {
      "apikey": this.apiKey,
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  // ---------------------------------------------------------------------------
  // Query builder entry point
  // GET /rest/v1/{table}?select=...&filters...
  // ---------------------------------------------------------------------------

  from(table: string): SupabaseQueryBuilder {
    return new SupabaseQueryBuilder(this, table);
  }

  // ---------------------------------------------------------------------------
  // Insert row
  // POST /rest/v1/{table}
  // ---------------------------------------------------------------------------

  async insert<T = Record<string, Json>>(
    table: string,
    params: SupabaseInsertParams,
  ): Promise<T[]> {
    const headers: HeadersInit = {
      ...this._headers(),
      ...(params.returnRepresentation ? { "Prefer": "return=representation" } : {}),
    };
    const res = await this._fetch(`${this.baseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers,
      body: JSON.stringify(params.record),
    });
    if (!res.ok) throw new SupabaseError(res.status, await res.text());
    if (params.returnRepresentation) return res.json() as Promise<T[]>;
    return [];
  }

  // ---------------------------------------------------------------------------
  // Upsert row
  // POST /rest/v1/{table}  (Prefer: resolution=merge-duplicates)
  // ---------------------------------------------------------------------------

  async upsert<T = Record<string, Json>>(
    table: string,
    params: SupabaseUpsertParams,
  ): Promise<T[]> {
    const preferParts = ["resolution=merge-duplicates"];
    if (params.returnRepresentation) preferParts.push("return=representation");
    const headers: HeadersInit = {
      ...this._headers(),
      "Prefer": preferParts.join(","),
    };
    const url = new URL(`${this.baseUrl}/rest/v1/${table}`);
    if (params.onConflict) url.searchParams.set("on_conflict", params.onConflict);
    const res = await this._fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(params.record),
    });
    if (!res.ok) throw new SupabaseError(res.status, await res.text());
    if (params.returnRepresentation) return res.json() as Promise<T[]>;
    return [];
  }

  // ---------------------------------------------------------------------------
  // Update row
  // PATCH /rest/v1/{table}?{filters}
  // ---------------------------------------------------------------------------

  async update<T = Record<string, Json>>(
    table: string,
    params: SupabaseUpdateParams,
  ): Promise<T[]> {
    const url = new URL(`${this.baseUrl}/rest/v1/${table}`);
    for (const [col, val] of Object.entries(params.filters)) {
      url.searchParams.set(col, val);
    }
    const headers: HeadersInit = {
      ...this._headers(),
      ...(params.returnRepresentation ? { "Prefer": "return=representation" } : {}),
    };
    const res = await this._fetch(url.toString(), {
      method: "PATCH",
      headers,
      body: JSON.stringify(params.patch),
    });
    if (!res.ok) throw new SupabaseError(res.status, await res.text());
    if (params.returnRepresentation) return res.json() as Promise<T[]>;
    return [];
  }

  // ---------------------------------------------------------------------------
  // Delete row
  // DELETE /rest/v1/{table}?{filters}
  // ---------------------------------------------------------------------------

  async delete(table: string, params: SupabaseDeleteParams): Promise<void> {
    const url = new URL(`${this.baseUrl}/rest/v1/${table}`);
    for (const [col, val] of Object.entries(params.filters)) {
      url.searchParams.set(col, val);
    }
    const res = await this._fetch(url.toString(), {
      method: "DELETE",
      headers: this._headers(),
    });
    if (!res.ok) throw new SupabaseError(res.status, await res.text());
  }

  // ---------------------------------------------------------------------------
  // RPC (stored procedure)
  // POST /rest/v1/rpc/{function_name}
  // ---------------------------------------------------------------------------

  async rpc<T = Json>(functionName: string, params: SupabaseRpcParams = {}): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(params.args ?? {}),
    });
    if (!res.ok) throw new SupabaseError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // Storage file upload
  // POST /storage/v1/object/{bucket}/{path}
  // ---------------------------------------------------------------------------

  async uploadFile(params: SupabaseStorageUploadParams): Promise<SupabaseStorageUploadResponse> {
    const url = `${this.baseUrl}/storage/v1/object/${params.bucket}/${params.path}`;
    const headers: Record<string, string> = {
      "apikey": this.apiKey,
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": params.contentType ?? "application/octet-stream",
      ...(params.upsert ? { "x-upsert": "true" } : {}),
    };
    const res = await this._fetch(url, {
      method: "POST",
      headers,
      body: params.body as BodyInit,
    });
    if (!res.ok) throw new SupabaseError(res.status, await res.text());
    return res.json() as Promise<SupabaseStorageUploadResponse>;
  }

  // ---------------------------------------------------------------------------
  // Call edge function
  // POST /functions/v1/{function_name}
  // ---------------------------------------------------------------------------

  async invokeFunction<T = Json>(
    functionName: string,
    body?: Record<string, Json>,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: { ...this._headers(), ...(extraHeaders ?? {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new SupabaseError(res.status, await res.text());
    return res.json() as Promise<T>;
  }
}
