# Asana

> **Use in Yappr context**: Create follow-up tasks in Asana after calls, assign them to team members, and add call summaries as task descriptions.

## Authentication

- Get Personal Access Token: Asana account → Profile → Apps → Manage developer apps → New access token
- Pass as: `Authorization: Bearer {token}`

## Base URL

```
https://app.asana.com/api/1.0
```

## Key Endpoints

**Headers for all requests:**
```
Authorization: Bearer 1/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

### Create Task
**POST /tasks**

**Request:**
```json
{
  "data": {
    "name": "Follow up with David Cohen — Appointment Set",
    "notes": "Call via Yappr AI on April 11.\nCustomer interested in Business plan.\nAppointment booked for April 15 at 10 AM.\n\nSummary: Customer showed strong interest in annual pricing.",
    "due_on": "2026-04-15",
    "assignee": "me",
    "projects": ["1234567890123456"],
    "workspace": "987654321098765"
  }
}
```

**Response:**
```json
{
  "data": {
    "gid": "9876543210123456",
    "name": "Follow up with David Cohen — Appointment Set",
    "resource_type": "task",
    "created_at": "2026-04-11T10:00:00.000Z",
    "permalink_url": "https://app.asana.com/0/12345/9876543210"
  }
}
```

---

### Get Workspaces
**GET /workspaces**

**Response:**
```json
{
  "data": [
    { "gid": "987654321098765", "name": "My Company", "resource_type": "workspace" }
  ]
}
```

---

### Get Projects in Workspace
**GET /projects?workspace={workspace_gid}&limit=50**

**Response:**
```json
{
  "data": [
    { "gid": "1234567890123456", "name": "Sales Pipeline", "resource_type": "project" }
  ]
}
```

---

### Get Sections in Project
**GET /projects/{project_gid}/sections**

**Response:**
```json
{
  "data": [
    { "gid": "111222333", "name": "New Leads", "resource_type": "section" },
    { "gid": "444555666", "name": "Active Deals", "resource_type": "section" }
  ]
}
```

---

### Add Task to Section
**POST /sections/{section_gid}/addTask**

```json
{
  "data": {
    "task": "9876543210123456"
  }
}
```

---

### Update Task
**PUT /tasks/{task_gid}**

```json
{
  "data": {
    "completed": true,
    "notes": "Follow-up completed. Deal closed."
  }
}
```

---

### Add Comment to Task
**POST /tasks/{task_gid}/stories**

```json
{
  "data": {
    "text": "Spoke with David again — confirmed appointment for April 15."
  }
}
```

---

### Search for User
**GET /users?workspace={workspace_gid}&opt_fields=gid,name,email**

**Response:**
```json
{
  "data": [
    { "gid": "111111111111", "name": "Jane Smith", "email": "jane@company.com" }
  ]
}
```

---

### Get Current User
**GET /users/me**

**Response:**
```json
{
  "data": {
    "gid": "111111111111",
    "name": "Your Name",
    "email": "you@company.com",
    "workspaces": [{ "gid": "987654321098765", "name": "My Company" }]
  }
}
```

## Common Patterns

### Create follow-up task after call
```typescript
const token = Deno.env.get("ASANA_TOKEN");
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// Get workspace and project (cache these)
const me = await fetch("https://app.asana.com/api/1.0/users/me", { headers }).then(r => r.json());
const workspaceGid = me.data.workspaces[0].gid;

// Create task
const task = await fetch("https://app.asana.com/api/1.0/tasks", {
  method: "POST",
  headers,
  body: JSON.stringify({
    data: {
      name: `Follow up: ${callerName} — ${disposition}`,
      notes: `Phone: ${callerPhone}\nCall date: ${new Date().toLocaleDateString("en-IL")}\nDisposition: ${disposition}\n\n${callSummary}`,
      due_on: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // +3 days
      assignee: "me",
      projects: [SALES_PROJECT_GID],
      workspace: workspaceGid,
    },
  }),
}).then(r => r.json());

console.log("Task created:", task.data.permalink_url);
```

## Gotchas & Rate Limits

- **Rate limits**: 150 requests/minute per token. Premium plans: 1,500 req/min.
- **`gid` vs `id`**: Asana uses `gid` (global ID) as the identifier field. Always reference `data.gid`.
- **Workspace required**: Most write operations need a `workspace` GID. Fetch once and cache.
- **`assignee: "me"`**: Assigns to the token owner. For specific users, pass their `gid`.
- **Due date format**: `due_on` is a date string `YYYY-MM-DD`. For datetime, use `due_at` with ISO 8601.
- **Task not in project**: Creating a task with `projects` array adds it to that project. Without `projects`, the task is in "My Tasks" only.
- **Section assignment**: Adding a task to a project doesn't put it in a specific section. Call `POST /sections/{gid}/addTask` separately.
- **Personal Access Token**: Long-lived token tied to a user. For production, use service accounts or OAuth apps.
