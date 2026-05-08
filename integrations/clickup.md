# ClickUp

> **Use in Yappr context**: Create follow-up tasks in ClickUp after calls, update task statuses, and log call summaries as task descriptions or comments.

## Authentication

- Get API Token: ClickUp profile (bottom-left avatar) → Apps → API Token → Generate
- Pass as: `Authorization: {token}` (no "Bearer" prefix)

## Base URL

```
https://api.clickup.com/api/v2
```

## Key Endpoints

**Headers for all requests:**
```
Authorization: pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

### Get Workspaces (Teams)
**GET /team**

**Response:**
```json
{
  "teams": [
    { "id": "12345678", "name": "My Company", "members": [...] }
  ]
}
```

---

### Get Spaces in Workspace
**GET /team/{team_id}/space?archived=false**

---

### Get Lists in Folder
**GET /folder/{folder_id}/list**

**Response:**
```json
{
  "lists": [
    { "id": "90123456789", "name": "Sales Pipeline", "status": { "status": "open" } }
  ]
}
```

---

### Get Lists Without Folder
**GET /space/{space_id}/list**

---

### Create Task
**POST /list/{list_id}/task**

**Request:**
```json
{
  "name": "Follow up with David Cohen — Appointment Set",
  "description": "Call via Yappr AI on April 11.\nPhone: +972501234567\nDisposition: Appointment Set\n\nSummary: Customer interested in Business plan. Appointment for April 15 at 10 AM.",
  "assignees": [12345678],
  "status": "Open",
  "due_date": 1744671600000,
  "priority": 2,
  "tags": ["yappr", "appointment-set"],
  "custom_fields": [
    { "id": "field-uuid", "value": "+972501234567" }
  ]
}
```

`due_date` is Unix timestamp in milliseconds.
Priority: `1` = Urgent, `2` = High, `3` = Normal, `4` = Low

**Response:**
```json
{
  "id": "abc123def456",
  "name": "Follow up with David Cohen — Appointment Set",
  "status": { "status": "Open", "color": "#87909e" },
  "url": "https://app.clickup.com/t/abc123def456"
}
```

---

### Update Task
**PUT /task/{task_id}**

```json
{
  "status": "in progress",
  "priority": 1
}
```

---

### Create Comment on Task
**POST /task/{task_id}/comment**

```json
{
  "comment_text": "Customer confirmed appointment via WhatsApp. CRM updated.",
  "assignee": 12345678,
  "notify_all": true
}
```

---

### Get Task
**GET /task/{task_id}**

**Response:**
```json
{
  "id": "abc123def456",
  "name": "Follow up with David Cohen",
  "description": "...",
  "status": { "status": "Open" },
  "assignees": [{ "id": 12345678, "username": "john", "email": "john@company.com" }],
  "due_date": "1744671600000",
  "url": "https://app.clickup.com/t/abc123def456"
}
```

---

### Search Tasks
**GET /team/{team_id}/task?assignees[]=12345678&statuses[]=Open&page=0**

Query params:
- `assignees[]` — filter by assignee user ID
- `statuses[]` — filter by status name
- `tags[]` — filter by tag
- `date_created_gt` — Unix ms timestamp filter
- `custom_fields` — JSON encoded custom field filters

---

### Get Custom Fields for List
**GET /list/{list_id}/field**

**Response:**
```json
{
  "fields": [
    { "id": "field-uuid", "name": "Phone Number", "type": "text" },
    { "id": "field-uuid2", "name": "Disposition", "type": "drop_down",
      "type_config": { "options": [
        { "name": "Appointment Set", "orderindex": 0 },
        { "name": "Not Interested", "orderindex": 1 }
      ]}
    }
  ]
}
```

## Common Patterns

### Create follow-up task after call
```typescript
const token = Deno.env.get("CLICKUP_TOKEN");
const listId = Deno.env.get("CLICKUP_SALES_LIST_ID");

const dueDate = new Date();
dueDate.setDate(dueDate.getDate() + 3); // 3 days from now

const task = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
  method: "POST",
  headers: {
    Authorization: token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: `${callerName} — ${disposition}`,
    description: `Phone: ${callerPhone}\nCall: ${new Date().toLocaleDateString("en-IL")}\n\n${callSummary}`,
    status: "Open",
    priority: disposition === "Appointment Set" ? 2 : 3,
    due_date: dueDate.getTime(),
    tags: ["yappr-call", disposition.toLowerCase().replace(/\s+/g, "-")],
  }),
}).then(r => r.json());

console.log("ClickUp task:", task.url);
```

## Gotchas & Rate Limits

- **Rate limits**: 100 requests/minute per token. 10,000 requests/day.
- **`Authorization` header**: No "Bearer" prefix. Just the raw token: `Authorization: pk_xxx...`
- **Task ID**: ClickUp task IDs are alphanumeric strings (e.g. `abc123def456`), not integers.
- **List ID required**: Every task belongs to a list. Must know the list ID before creating tasks. Navigate the workspace → spaces → folders → lists hierarchy.
- **`due_date` in milliseconds**: Unix timestamp in milliseconds (multiply seconds by 1000).
- **Status names**: Status names are case-insensitive but must match the statuses configured for the specific list/space. Fetch the list statuses via `GET /list/{id}`.
- **Custom field values**: Custom field format depends on type. Text: `"value": "text"`. Dropdown: `"value": 0` (option index). Currency: `"value": 1000`. Fetch fields to get the correct format.
- **Webhooks**: ClickUp supports webhooks at the team level. Configure via `POST /team/{team_id}/webhook`.
