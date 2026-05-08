// asana.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/asana.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface AsanaResource {
  gid: string;
  resource_type: string;
}

export interface AsanaWorkspace extends AsanaResource {
  name: string;
}

export interface AsanaProject extends AsanaResource {
  name: string;
}

export interface AsanaSection extends AsanaResource {
  name: string;
}

export interface AsanaUser extends AsanaResource {
  name: string;
  email?: string;
  workspaces?: AsanaWorkspace[];
}

export interface AsanaTask extends AsanaResource {
  name: string;
  notes?: string;
  completed?: boolean;
  due_on?: string;
  due_at?: string;
  permalink_url?: string;
  created_at?: string;
  assignee?: AsanaResource | null;
}

export interface AsanaStory extends AsanaResource {
  text: string;
  created_at?: string;
}

export interface AsanaCreateTaskParams {
  name: string;
  notes?: string;
  due_on?: string;
  due_at?: string;
  assignee?: string;
  projects?: string[];
  workspace?: string;
}

export interface AsanaUpdateTaskParams {
  name?: string;
  notes?: string;
  completed?: boolean;
  due_on?: string;
  due_at?: string;
  assignee?: string;
}

export interface AsanaAddCommentParams {
  text: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AsanaError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Asana ${status}: ${message}`);
    this.name = "AsanaError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AsanaClient {
  readonly baseUrl = "https://app.asana.com/api/1.0";

  constructor(
    private readonly apiToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  // GET /workspaces
  async getWorkspaces(): Promise<AsanaWorkspace[]> {
    const res = await this.fetchFn(`${this.baseUrl}/workspaces`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new AsanaError(res.status, await res.text());
    const data = await res.json() as { data: AsanaWorkspace[] };
    return data.data;
  }

  // GET /projects?workspace={workspace_gid}&limit=50
  async getProjects(workspaceGid: string, limit = 50): Promise<AsanaProject[]> {
    const url = new URL(`${this.baseUrl}/projects`);
    url.searchParams.set("workspace", workspaceGid);
    url.searchParams.set("limit", String(limit));
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new AsanaError(res.status, await res.text());
    const data = await res.json() as { data: AsanaProject[] };
    return data.data;
  }

  // GET /projects/{project_gid}/sections
  async getSections(projectGid: string): Promise<AsanaSection[]> {
    const res = await this.fetchFn(
      `${this.baseUrl}/projects/${projectGid}/sections`,
      { method: "GET", headers: this.headers },
    );
    if (!res.ok) throw new AsanaError(res.status, await res.text());
    const data = await res.json() as { data: AsanaSection[] };
    return data.data;
  }

  // POST /tasks
  async createTask(params: AsanaCreateTaskParams): Promise<AsanaTask> {
    const res = await this.fetchFn(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ data: params }),
    });
    if (!res.ok) throw new AsanaError(res.status, await res.text());
    const data = await res.json() as { data: AsanaTask };
    return data.data;
  }

  // PUT /tasks/{task_gid}
  async updateTask(taskGid: string, params: AsanaUpdateTaskParams): Promise<AsanaTask> {
    const res = await this.fetchFn(`${this.baseUrl}/tasks/${taskGid}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({ data: params }),
    });
    if (!res.ok) throw new AsanaError(res.status, await res.text());
    const data = await res.json() as { data: AsanaTask };
    return data.data;
  }

  // POST /sections/{section_gid}/addTask
  async addTaskToSection(sectionGid: string, taskGid: string): Promise<void> {
    const res = await this.fetchFn(
      `${this.baseUrl}/sections/${sectionGid}/addTask`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ data: { task: taskGid } }),
      },
    );
    if (!res.ok) throw new AsanaError(res.status, await res.text());
  }

  // POST /tasks/{task_gid}/stories
  async addComment(taskGid: string, params: AsanaAddCommentParams): Promise<AsanaStory> {
    const res = await this.fetchFn(`${this.baseUrl}/tasks/${taskGid}/stories`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ data: params }),
    });
    if (!res.ok) throw new AsanaError(res.status, await res.text());
    const data = await res.json() as { data: AsanaStory };
    return data.data;
  }

  // GET /users?workspace={workspace_gid}&opt_fields=gid,name,email
  async getUsers(
    workspaceGid: string,
    optFields = "gid,name,email",
  ): Promise<AsanaUser[]> {
    const url = new URL(`${this.baseUrl}/users`);
    url.searchParams.set("workspace", workspaceGid);
    url.searchParams.set("opt_fields", optFields);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new AsanaError(res.status, await res.text());
    const data = await res.json() as { data: AsanaUser[] };
    return data.data;
  }

  // GET /users/me
  async getCurrentUser(): Promise<AsanaUser> {
    const res = await this.fetchFn(`${this.baseUrl}/users/me`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new AsanaError(res.status, await res.text());
    const data = await res.json() as { data: AsanaUser };
    return data.data;
  }
}
