// jira.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/jira.md

// ---------------------------------------------------------------------------
// ADF helper
// ---------------------------------------------------------------------------

export interface AdfNode {
  type: string;
  version?: number;
  content?: AdfNode[];
  text?: string;
}

export interface AdfDoc {
  type: "doc";
  version: 1;
  content: AdfNode[];
}

/** Wrap plain text in the minimal Atlassian Document Format structure. */
export function makeAdfText(text: string): AdfDoc {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface JiraIssueFields {
  project: { key: string };
  summary: string;
  description?: AdfDoc;
  issuetype: { name: string };
  priority?: { name: string };
  labels?: string[];
  assignee?: { accountId: string };
  [key: string]: unknown;
}

export interface JiraCreateIssueParams {
  fields: JiraIssueFields;
}

export interface JiraCreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

export interface JiraIssueStatus {
  name: string;
  statusCategory: { name: string };
}

export interface JiraIssueAssignee {
  displayName: string;
  emailAddress: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: JiraIssueStatus;
    priority?: { name: string };
    assignee?: JiraIssueAssignee;
    created: string;
    updated: string;
    description?: AdfDoc;
    [key: string]: unknown;
  };
}

export interface JiraComment {
  id: string;
  self: string;
  created: string;
}

export interface JiraTransition {
  id: string;
  name: string;
}

export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

export interface JiraSearchParams {
  jql: string;
  maxResults?: number;
  fields?: string[];
  startAt?: number;
}

export interface JiraSearchResult {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    assignee?: JiraIssueAssignee;
    created?: string;
    [key: string]: unknown;
  };
}

export interface JiraSearchResponse {
  total: number;
  startAt: number;
  maxResults: number;
  issues: JiraSearchResult[];
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class JiraError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Jira ${status}: ${message}`);
    this.name = "JiraError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class JiraClient {
  readonly baseUrl: string;

  constructor(
    domain: string,
    private readonly email: string,
    private readonly apiToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `https://${domain}.atlassian.net/rest/api/3`;
  }

  private get headers(): HeadersInit {
    return {
      "Authorization": `Basic ${btoa(`${this.email}:${this.apiToken}`)}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
  }

  // POST /issue
  async createIssue(params: JiraCreateIssueParams): Promise<JiraCreateIssueResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/issue`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new JiraError(res.status, await res.text());
    return res.json() as Promise<JiraCreateIssueResponse>;
  }

  // GET /issue/{issueKey}
  async getIssue(issueKey: string): Promise<JiraIssue> {
    const res = await this.fetchFn(`${this.baseUrl}/issue/${issueKey}`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new JiraError(res.status, await res.text());
    return res.json() as Promise<JiraIssue>;
  }

  // POST /issue/{issueKey}/comment
  async addComment(issueKey: string, text: string): Promise<JiraComment> {
    const res = await this.fetchFn(`${this.baseUrl}/issue/${issueKey}/comment`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ body: makeAdfText(text) }),
    });
    if (!res.ok) throw new JiraError(res.status, await res.text());
    return res.json() as Promise<JiraComment>;
  }

  // GET /issue/{issueKey}/transitions
  async getTransitions(issueKey: string): Promise<JiraTransitionsResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/issue/${issueKey}/transitions`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new JiraError(res.status, await res.text());
    return res.json() as Promise<JiraTransitionsResponse>;
  }

  // POST /issue/{issueKey}/transitions — returns void (204 No Content)
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/issue/${issueKey}/transitions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
    if (!res.ok) throw new JiraError(res.status, await res.text());
  }

  // POST /issue/search
  async searchIssues(params: JiraSearchParams): Promise<JiraSearchResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/issue/search`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        jql: params.jql,
        maxResults: params.maxResults ?? 10,
        fields: params.fields ?? ["summary", "status", "assignee", "created"],
        startAt: params.startAt ?? 0,
      }),
    });
    if (!res.ok) throw new JiraError(res.status, await res.text());
    return res.json() as Promise<JiraSearchResponse>;
  }

  // GET /project
  async listProjects(): Promise<JiraProject[]> {
    const res = await this.fetchFn(`${this.baseUrl}/project`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new JiraError(res.status, await res.text());
    return res.json() as Promise<JiraProject[]>;
  }
}
