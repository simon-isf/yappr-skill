// clickup.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/clickup.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  status: { status: string; color?: string };
  assignees?: Array<{ id: number; username: string; email: string }>;
  due_date?: string;
  url: string;
  tags?: string[];
}

export interface ClickUpCreateTaskParams {
  name: string;
  description?: string;
  assignees?: number[];
  status?: string;
  due_date?: number;
  priority?: 1 | 2 | 3 | 4;
  tags?: string[];
  custom_fields?: Array<{ id: string; value: unknown }>;
}

export interface ClickUpUpdateTaskParams {
  name?: string;
  description?: string;
  status?: string;
  priority?: 1 | 2 | 3 | 4;
  due_date?: number;
  assignees?: { add?: number[]; rem?: number[] };
}

export interface ClickUpComment {
  id: string;
  comment_text: string;
  date: string;
  user: { id: number; username: string };
}

export interface ClickUpCreateCommentParams {
  comment_text: string;
  assignee?: number;
  notify_all?: boolean;
}

export interface ClickUpSpace {
  id: string;
  name: string;
  private: boolean;
}

export interface ClickUpFolder {
  id: string;
  name: string;
}

export interface ClickUpList {
  id: string;
  name: string;
  status?: { status: string };
}

export interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  type_config?: {
    options?: Array<{ name: string; orderindex: number }>;
  };
}

export interface ClickUpGetTasksParams {
  assignees?: number[];
  statuses?: string[];
  tags?: string[];
  date_created_gt?: number;
  page?: number;
  custom_fields?: string;
}

export interface ClickUpTeam {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ClickUpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`ClickUp ${status}: ${message}`);
    this.name = "ClickUpError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ClickUpClient {
  readonly baseUrl = "https://api.clickup.com/api/v2";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(url, { ...init, headers: this.headers });
    if (!res.ok) throw new ClickUpError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // GET /team
  async getWorkspaces(): Promise<{ teams: ClickUpTeam[] }> {
    return this.request(`${this.baseUrl}/team`);
  }

  // GET /team/{team_id}/space?archived=false
  async getSpaces(teamId: string, archived = false): Promise<{ spaces: ClickUpSpace[] }> {
    const url = `${this.baseUrl}/team/${teamId}/space?archived=${archived}`;
    return this.request(url);
  }

  // GET /folder/{folder_id}/list
  async getFolders(spaceId: string): Promise<{ folders: ClickUpFolder[] }> {
    return this.request(`${this.baseUrl}/space/${spaceId}/folder`);
  }

  // GET /folder/{folder_id}/list
  async getLists(folderId: string): Promise<{ lists: ClickUpList[] }> {
    return this.request(`${this.baseUrl}/folder/${folderId}/list`);
  }

  // GET /space/{space_id}/list  (folderless lists)
  async getFolderlessLists(spaceId: string): Promise<{ lists: ClickUpList[] }> {
    return this.request(`${this.baseUrl}/space/${spaceId}/list`);
  }

  // GET /list/{list_id}/field
  async getCustomFields(listId: string): Promise<{ fields: ClickUpCustomField[] }> {
    return this.request(`${this.baseUrl}/list/${listId}/field`);
  }

  // POST /list/{list_id}/task
  async createTask(listId: string, params: ClickUpCreateTaskParams): Promise<ClickUpTask> {
    return this.request(`${this.baseUrl}/list/${listId}/task`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // GET /task/{task_id}
  async getTask(taskId: string): Promise<ClickUpTask> {
    return this.request(`${this.baseUrl}/task/${taskId}`);
  }

  // GET /team/{team_id}/task
  async getTasks(
    teamId: string,
    params: ClickUpGetTasksParams = {},
  ): Promise<{ tasks: ClickUpTask[] }> {
    const url = new URL(`${this.baseUrl}/team/${teamId}/task`);
    if (params.assignees) {
      for (const id of params.assignees) url.searchParams.append("assignees[]", String(id));
    }
    if (params.statuses) {
      for (const s of params.statuses) url.searchParams.append("statuses[]", s);
    }
    if (params.tags) {
      for (const t of params.tags) url.searchParams.append("tags[]", t);
    }
    if (params.date_created_gt !== undefined) {
      url.searchParams.set("date_created_gt", String(params.date_created_gt));
    }
    if (params.custom_fields !== undefined) {
      url.searchParams.set("custom_fields", params.custom_fields);
    }
    url.searchParams.set("page", String(params.page ?? 0));
    return this.request(url.toString());
  }

  // PUT /task/{task_id}
  async updateTask(taskId: string, params: ClickUpUpdateTaskParams): Promise<ClickUpTask> {
    return this.request(`${this.baseUrl}/task/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(params),
    });
  }

  // POST /task/{task_id}/comment
  async createComment(
    taskId: string,
    params: ClickUpCreateCommentParams,
  ): Promise<ClickUpComment> {
    return this.request(`${this.baseUrl}/task/${taskId}/comment`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }
}
