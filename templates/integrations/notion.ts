// notion.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/notion.md

// ---------------------------------------------------------------------------
// Primitive Notion property value types
// ---------------------------------------------------------------------------

export interface NotionRichTextItem {
  text: { content: string };
}

export interface NotionTitleProperty {
  title: NotionRichTextItem[];
}

export interface NotionRichTextProperty {
  rich_text: NotionRichTextItem[];
}

export interface NotionPhoneNumberProperty {
  phone_number: string;
}

export interface NotionEmailProperty {
  email: string;
}

export interface NotionSelectProperty {
  select: { name: string };
}

export interface NotionDateProperty {
  date: { start: string; end?: string };
}

export type NotionPropertyValue =
  | NotionTitleProperty
  | NotionRichTextProperty
  | NotionPhoneNumberProperty
  | NotionEmailProperty
  | NotionSelectProperty
  | NotionDateProperty;

export type NotionProperties = Record<string, NotionPropertyValue>;

// ---------------------------------------------------------------------------
// Page / Database interfaces
// ---------------------------------------------------------------------------

export interface NotionPage {
  id: string;
  url: string;
  properties: NotionProperties;
}

export interface NotionQueryResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface NotionDatabaseSchema {
  id: string;
  title: NotionRichTextItem[];
  properties: Record<string, { type: string; [key: string]: unknown }>;
}

export interface NotionCreateDatabaseParams {
  parent: { page_id: string };
  title: NotionRichTextItem[];
  properties: Record<string, { [key: string]: unknown }>;
}

// ---------------------------------------------------------------------------
// Block interfaces
// ---------------------------------------------------------------------------

export interface NotionParagraphBlock {
  object: "block";
  type: "paragraph";
  paragraph: { rich_text: NotionRichTextItem[] };
}

export interface NotionHeading2Block {
  object: "block";
  type: "heading_2";
  heading_2: { rich_text: NotionRichTextItem[] };
}

export interface NotionDividerBlock {
  object: "block";
  type: "divider";
  divider: Record<string, never>;
}

export type NotionBlock = NotionParagraphBlock | NotionHeading2Block | NotionDividerBlock;

export interface NotionAppendBlocksResponse {
  results: (NotionBlock & { id: string })[];
}

// ---------------------------------------------------------------------------
// Query filter
// ---------------------------------------------------------------------------

export interface NotionFilter {
  property: string;
  [filterType: string]: unknown;
}

export interface NotionQueryParams {
  filter?: NotionFilter;
  page_size?: number;
  start_cursor?: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class NotionError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Notion ${status}: ${message}`);
    this.name = "NotionError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class NotionClient {
  readonly baseUrl = "https://api.notion.com/v1";
  static readonly NOTION_VERSION = "2022-06-28";

  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.accessToken}`,
      "Notion-Version": NotionClient.NOTION_VERSION,
      "Content-Type": "application/json",
    };
  }

  // POST /databases/{database_id}/query
  async queryDatabase(
    databaseId: string,
    params: NotionQueryParams = {},
  ): Promise<NotionQueryResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new NotionError(res.status, await res.text());
    return res.json() as Promise<NotionQueryResponse>;
  }

  // POST /pages
  async createPage(params: {
    parent: { database_id: string };
    properties: NotionProperties;
  }): Promise<NotionPage> {
    const res = await this.fetchFn(`${this.baseUrl}/pages`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new NotionError(res.status, await res.text());
    return res.json() as Promise<NotionPage>;
  }

  // PATCH /pages/{page_id}
  async updatePage(
    pageId: string,
    properties: NotionProperties,
  ): Promise<NotionPage> {
    const res = await this.fetchFn(`${this.baseUrl}/pages/${pageId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) throw new NotionError(res.status, await res.text());
    return res.json() as Promise<NotionPage>;
  }

  // PATCH /blocks/{page_id}/children
  async appendBlocks(
    pageId: string,
    children: NotionBlock[],
  ): Promise<NotionAppendBlocksResponse> {
    const res = await this.fetchFn(
      `${this.baseUrl}/blocks/${pageId}/children`,
      {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify({ children }),
      },
    );
    if (!res.ok) throw new NotionError(res.status, await res.text());
    return res.json() as Promise<NotionAppendBlocksResponse>;
  }

  // GET /databases/{database_id}
  async getDatabaseSchema(databaseId: string): Promise<NotionDatabaseSchema> {
    const res = await this.fetchFn(
      `${this.baseUrl}/databases/${databaseId}`,
      {
        method: "GET",
        headers: this.headers,
      },
    );
    if (!res.ok) throw new NotionError(res.status, await res.text());
    return res.json() as Promise<NotionDatabaseSchema>;
  }

  // POST /databases
  async createDatabase(params: NotionCreateDatabaseParams): Promise<NotionDatabaseSchema> {
    const res = await this.fetchFn(`${this.baseUrl}/databases`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new NotionError(res.status, await res.text());
    return res.json() as Promise<NotionDatabaseSchema>;
  }
}
