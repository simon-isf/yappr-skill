// hibob.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/hibob.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface HiBobEmployeeWork {
  email?: string;
  department?: string;
  title?: string;
  site?: string;
  startDate?: string;
  manager?: string;
  [key: string]: unknown;
}

export interface HiBobEmployeePersonal {
  pronouns?: string;
  communication?: {
    mobile?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface HiBobEmployee {
  id: string;
  firstName: string;
  surname: string;
  email?: string;
  work?: HiBobEmployeeWork;
  personal?: HiBobEmployeePersonal;
  about?: {
    avatar?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface HiBobSearchFilter {
  fieldPath: string;
  operator: "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan";
  values: string[];
}

export interface HiBobSearchParams {
  filters: HiBobSearchFilter[];
  fields?: string[];
}

export interface HiBobSearchResponse {
  employees: HiBobEmployee[];
  total: number;
}

export interface HiBobListResponse {
  employees: HiBobEmployee[];
  total: number;
}

export interface HiBobCreateEmployeeParams {
  firstName: string;
  surname: string;
  email: string;
  work?: {
    site?: string;
    department?: string;
    title?: string;
    startDate?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface HiBobCreateEmployeeResponse {
  id: string;
  firstName: string;
  surname: string;
}

export interface HiBobUpdateEmployeeParams {
  work?: Partial<HiBobEmployeeWork>;
  personal?: Partial<HiBobEmployeePersonal>;
  [key: string]: unknown;
}

export interface HiBobTask {
  id: string;
  taskName: string;
  description?: string;
  employeeId: string;
  dueDate: string;
  status: "Open" | "Completed" | string;
  createdAt?: string;
}

export interface HiBobCreateTaskParams {
  taskName: string;
  description?: string;
  employeeId: string;
  dueDate: string;
  status?: "Open" | "Completed";
}

export interface HiBobListTasksResponse {
  tasks: HiBobTask[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class HiBobError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`HiBob ${status}: ${message}`);
    this.name = "HiBobError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class HiBobClient {
  readonly baseUrl = "https://api.hibob.com/v1";

  constructor(
    private readonly serviceAccountToken: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.serviceAccountToken}`,
      "Content-Type": "application/json",
    };
  }

  // POST /people/search
  async searchEmployees(params: HiBobSearchParams): Promise<HiBobSearchResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/people/search`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new HiBobError(res.status, await res.text());
    return res.json() as Promise<HiBobSearchResponse>;
  }

  // GET /people/{employeeId}
  async getEmployee(
    employeeId: string,
    includeHumanReadable = false,
  ): Promise<HiBobEmployee> {
    const url = new URL(`${this.baseUrl}/people/${employeeId}`);
    if (includeHumanReadable) url.searchParams.set("includeHumanReadable", "true");
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new HiBobError(res.status, await res.text());
    return res.json() as Promise<HiBobEmployee>;
  }

  // GET /people
  async listEmployees(
    limit = 100,
    offset = 0,
    includeHumanReadable = false,
  ): Promise<HiBobListResponse> {
    const url = new URL(`${this.baseUrl}/people`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    if (includeHumanReadable) url.searchParams.set("includeHumanReadable", "true");
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new HiBobError(res.status, await res.text());
    return res.json() as Promise<HiBobListResponse>;
  }

  // PATCH /people/{employeeId}
  async updateEmployee(
    employeeId: string,
    params: HiBobUpdateEmployeeParams,
  ): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/people/${employeeId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new HiBobError(res.status, await res.text());
  }

  // POST /people
  async createEmployee(
    params: HiBobCreateEmployeeParams,
  ): Promise<HiBobCreateEmployeeResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/people`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new HiBobError(res.status, await res.text());
    return res.json() as Promise<HiBobCreateEmployeeResponse>;
  }

  // POST /tasks
  async createTask(params: HiBobCreateTaskParams): Promise<HiBobTask> {
    const res = await this.fetchFn(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ status: "Open", ...params }),
    });
    if (!res.ok) throw new HiBobError(res.status, await res.text());
    return res.json() as Promise<HiBobTask>;
  }

  // GET /tasks?employeeId={employeeId}
  async listTasks(employeeId: string): Promise<HiBobListTasksResponse> {
    const url = new URL(`${this.baseUrl}/tasks`);
    url.searchParams.set("employeeId", employeeId);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new HiBobError(res.status, await res.text());
    return res.json() as Promise<HiBobListTasksResponse>;
  }
}
