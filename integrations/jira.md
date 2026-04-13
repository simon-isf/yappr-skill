# Jira

> **Use in Yappr context**: Create support or sales tickets after customer calls, add call summaries as issue comments, transition issue status, and answer caller questions about their ticket status mid-call.

## Authentication

**Basic Auth with API Token**

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) → Create API token
2. Base64-encode `{email}:{api_token}` and use as Basic auth

**Headers for every request:**
```
Authorization: Basic {base64(email:api_token)}
Content-Type: application/json
Accept: application/json
```

Store as: `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_DOMAIN` (your subdomain, e.g. `yourcompany`)

## Base URL

```
https://{your-domain}.atlassian.net/rest/api/3
```

## Key Endpoints

### Create Issue
**POST /issue**

**Request:**
```json
{
  "fields": {
    "project": {
      "key": "SUP"
    },
    "summary": "Customer call — Appointment Set — Yael Cohen",
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Call completed via Yappr AI. Duration: 3m 20s. Disposition: Appointment Set.\n\nSummary: Customer interested in Business plan. Requested demo on April 15 at 14:00."
            }
          ]
        }
      ]
    },
    "issuetype": {
      "name": "Task"
    },
    "priority": {
      "name": "Medium"
    },
    "labels": ["yappr-call", "appointment-set"]
  }
}
```

**Response:**
```json
{
  "id": "10042",
  "key": "SUP-42",
  "self": "https://yourcompany.atlassian.net/rest/api/3/issue/10042"
}
```

---

### Get Issue
**GET /issue/{issueKey}**

Example: `GET /issue/SUP-42`

**Response:**
```json
{
  "id": "10042",
  "key": "SUP-42",
  "fields": {
    "summary": "Customer call — Appointment Set — Yael Cohen",
    "status": {
      "name": "In Progress",
      "statusCategory": { "name": "In Progress" }
    },
    "priority": { "name": "Medium" },
    "assignee": {
      "displayName": "David Levy",
      "emailAddress": "david@yourcompany.com"
    },
    "created": "2026-04-12T10:00:00.000+0000",
    "updated": "2026-04-12T11:30:00.000+0000",
    "description": { "type": "doc", "version": 1, "content": [...] }
  }
}
```

Use `fields.status.name` to answer a caller asking "what's the status of my ticket."

---

### Add Comment to Issue
**POST /issue/{issueKey}/comment**

**Request:**
```json
{
  "body": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "Follow-up call completed. Disposition: Callback Requested. Customer available Tuesday after 15:00. Call duration: 2m 45s."
          }
        ]
      }
    ]
  }
}
```

**Response:**
```json
{
  "id": "10100",
  "self": "https://yourcompany.atlassian.net/rest/api/3/issue/SUP-42/comment/10100",
  "created": "2026-04-12T12:00:00.000+0000"
}
```

---

### Get Available Transitions
**GET /issue/{issueKey}/transitions**

Always call this before transitioning — transition IDs are project-specific.

**Response:**
```json
{
  "transitions": [
    { "id": "11", "name": "To Do" },
    { "id": "21", "name": "In Progress" },
    { "id": "31", "name": "Done" },
    { "id": "41", "name": "Waiting for Customer" }
  ]
}
```

---

### Transition Issue Status
**POST /issue/{issueKey}/transitions**

**Request:**
```json
{
  "transition": {
    "id": "31"
  }
}
```

Response: `204 No Content`

---

### Search Issues (JQL)
**GET /issue/picker?query={text}&currentProjectId={id}**

Or use the full JQL search:

**POST /issue/search** (Jira API v3)

**Request:**
```json
{
  "jql": "project = SUP AND summary ~ \"Yael Cohen\" ORDER BY created DESC",
  "maxResults": 5,
  "fields": ["summary", "status", "assignee", "created"]
}
```

**Response:**
```json
{
  "total": 1,
  "issues": [
    {
      "key": "SUP-42",
      "fields": {
        "summary": "Customer call — Appointment Set — Yael Cohen",
        "status": { "name": "In Progress" }
      }
    }
  ]
}
```

---

### List Projects
**GET /project**

**Response:**
```json
[
  { "id": "10000", "key": "SUP", "name": "Support" },
  { "id": "10001", "key": "SALES", "name": "Sales Pipeline" }
]
```

## Common Patterns

### Post-call: create ticket with call data
```typescript
const jiraDomain = Deno.env.get("JIRA_DOMAIN")!;
const jiraEmail = Deno.env.get("JIRA_EMAIL")!;
const jiraToken = Deno.env.get("JIRA_API_TOKEN")!;
const auth = btoa(`${jiraEmail}:${jiraToken}`);

const baseUrl = `https://${jiraDomain}.atlassian.net/rest/api/3`;

const adfText = (text: string) => ({
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

// Create issue after call.analyzed event
const issue = await fetch(`${baseUrl}/issue`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    fields: {
      project: { key: "SUP" },
      summary: `Yappr call — ${disposition} — ${callerName}`,
      description: adfText(
        `Phone: ${callerPhone}\nDuration: ${durationSeconds}s\nDisposition: ${disposition}\n\n${summary}`
      ),
      issuetype: { name: "Task" },
      labels: ["yappr-call", disposition.toLowerCase().replace(/\s+/g, "-")],
    },
  }),
}).then((r) => r.json());

// issue.key = "SUP-43"
```

### Mid-call: look up ticket status for caller
```typescript
// Caller says "what's the status of ticket SUP-42?"
const issue = await fetch(`${baseUrl}/issue/SUP-42`, {
  headers: {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  },
}).then((r) => r.json());

const status = issue.fields.status.name; // "In Progress"
const assignee = issue.fields.assignee?.displayName ?? "our team";
// Tell caller: "Your ticket SUP-42 is currently In Progress, assigned to David Levy."
```

## Gotchas & Rate Limits

- **Atlassian Document Format (ADF)**: Jira API v3 requires rich text fields (`description`, comment `body`) in ADF JSON format — not plain strings. The minimal wrapper is `{ "type": "doc", "version": 1, "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "your text" }] }] }`.
- **Project key vs project ID**: Most endpoints take the project **key** (e.g. `SUP`) not the numeric ID. Check the project list to confirm the key.
- **Transition IDs are project-specific**: Never hardcode them. Always call `GET /issue/{key}/transitions` first and cache the result per project.
- **Domain subdomain**: Users must know their Atlassian subdomain — it is the part before `.atlassian.net` in their Jira URL.
- **Issue key format**: `{PROJECT_KEY}-{number}` (e.g. `SUP-42`). When a caller gives a ticket number verbally, they may omit the project prefix — if so, prompt for the full key or use JQL search by summary/phone.
- **Rate limits**: Jira Cloud enforces rate limits per API token. Standard plan allows approximately 500 requests/minute. If you hit limits, the response is `429 Too Many Requests` with a `Retry-After` header.
- **Search with JQL**: JQL `~` operator is a full-text contains search. Use `=` for exact field matches. Example: `assignee = "david@company.com" AND status != Done`.
- **Labels**: Labels must not contain spaces in Jira — use hyphens (`appointment-set`, not `appointment set`).
