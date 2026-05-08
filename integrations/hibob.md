# HiBob (Bob)

> **Use in Yappr context**: Look up employee details before an internal HR call, create follow-up tasks assigned to HR reps after a call completes, or update employee records during an onboarding intake flow.

## Authentication
Bearer token: `Authorization: Bearer {service_account_token}`

Create a service account in Bob: Settings → Integrations → Service Accounts → New Service Account. Assign the minimum required scopes (People: Read, Tasks: Read+Write). The token does not expire unless manually revoked.

## Base URL
`https://api.hibob.com/v1`

## Key Endpoints

### Search Employees
**POST /people/search**

Filter employees by any field. Bob does not support searching by phone number directly — look up by work email if available, then retrieve the full profile.

**Headers**
```json
{
  "Authorization": "Bearer your_service_account_token",
  "Content-Type": "application/json"
}
```

**Request**
```json
{
  "filters": [
    {
      "fieldPath": "work.email",
      "operator": "equals",
      "values": ["yael.cohen@company.com"]
    }
  ],
  "fields": ["id", "firstName", "surname", "work.department", "work.title", "work.site"]
}
```

**Response**
```json
{
  "employees": [
    {
      "id": "3417649873",
      "firstName": "Yael",
      "surname": "Cohen",
      "work": {
        "email": "yael.cohen@company.com",
        "department": "Engineering",
        "title": "Senior Developer",
        "site": "Tel Aviv"
      }
    }
  ],
  "total": 1
}
```

### Get Employee Profile
**GET /people/{employeeId}**

Retrieves the full employee profile including personal, work, and lifecycle fields.

**Query params**: `?includeHumanReadable=true` — adds display labels alongside raw field values.

**Response**
```json
{
  "id": "3417649873",
  "firstName": "Yael",
  "surname": "Cohen",
  "personal": {
    "pronouns": "she/her"
  },
  "work": {
    "email": "yael.cohen@company.com",
    "department": "Engineering",
    "title": "Senior Developer",
    "site": "Tel Aviv",
    "startDate": "2023-03-01",
    "manager": "5209384710"
  },
  "about": {
    "avatar": "https://images.hibob.com/..."
  }
}
```

### List Employees
**GET /people**

**Query params**: `?limit=100&offset=0&includeHumanReadable=true`

**Response**
```json
{
  "employees": [
    {
      "id": "3417649873",
      "firstName": "Yael",
      "surname": "Cohen",
      "work": { "email": "yael.cohen@company.com", "department": "Engineering" }
    }
  ],
  "total": 247
}
```

### Update Employee Fields
**PATCH /people/{employeeId}**

Partial update — only include the fields you want to change. `work.startDate` is immutable after creation.

**Request**
```json
{
  "work": {
    "title": "Lead Developer",
    "department": "Platform Engineering"
  }
}
```

**Response**: `200 OK` with no body on success.

### Create New Employee
**POST /people**

**Request**
```json
{
  "firstName": "Oren",
  "surname": "Mizrahi",
  "email": "oren.mizrahi@company.com",
  "work": {
    "site": "Tel Aviv",
    "department": "Sales",
    "title": "Account Executive",
    "startDate": "2025-02-01"
  }
}
```

**Response**
```json
{
  "id": "6128374950",
  "firstName": "Oren",
  "surname": "Mizrahi"
}
```

### Create a Task
**POST /tasks**

Assign a follow-up task to an employee or HR rep after a call.

**Request**
```json
{
  "taskName": "Post-call follow-up: benefits intake",
  "description": "Caller confirmed interest in supplemental dental plan. Schedule follow-up with HR.",
  "employeeId": "3417649873",
  "dueDate": "2025-01-27",
  "status": "Open"
}
```

**Response**
```json
{
  "id": "task_abc789",
  "taskName": "Post-call follow-up: benefits intake",
  "employeeId": "3417649873",
  "dueDate": "2025-01-27",
  "status": "Open",
  "createdAt": "2025-01-20T14:32:00Z"
}
```

### List Tasks for Employee
**GET /tasks?employeeId={employeeId}**

**Response**
```json
{
  "tasks": [
    {
      "id": "task_abc789",
      "taskName": "Post-call follow-up: benefits intake",
      "status": "Open",
      "dueDate": "2025-01-27"
    }
  ]
}
```

## Common Patterns

### Pre-call employee enrichment
```typescript
// Look up employee by email before an outbound HR call
// Inject name and department as prompt variables

const HIBOB_TOKEN = Deno.env.get("HIBOB_SERVICE_ACCOUNT_TOKEN")!;

async function getEmployeeByEmail(email: string) {
  const response = await fetch("https://api.hibob.com/v1/people/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HIBOB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filters: [
        { fieldPath: "work.email", operator: "equals", values: [email] }
      ],
      fields: ["id", "firstName", "surname", "work.department", "work.title", "work.site"],
    }),
  });

  if (!response.ok) {
    throw new Error(`HiBob search failed: ${response.status}`);
  }

  const data = await response.json();
  return data.employees[0] ?? null;
}

// Usage in call setup
const employee = await getEmployeeByEmail(callerEmail);
if (employee) {
  callVariables["employeeName"] = `${employee.firstName} ${employee.surname}`;
  callVariables["employeeDepartment"] = employee.work.department;
  callVariables["employeeTitle"] = employee.work.title;
}
```

### Post-call task creation
```typescript
// supabase/functions/call-analyzed/index.ts
// After an HR intake call, create a follow-up task in Bob

async function createHRFollowUpTask(params: {
  employeeId: string;
  callSummary: string;
  daysUntilDue?: number;
}) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (params.daysUntilDue ?? 3));

  const response = await fetch("https://api.hibob.com/v1/tasks", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("HIBOB_SERVICE_ACCOUNT_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      taskName: "AI Call Follow-up Required",
      description: params.callSummary,
      employeeId: params.employeeId,
      dueDate: dueDate.toISOString().split("T")[0],
      status: "Open",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Bob task: ${response.status}`);
  }

  return response.json();
}
```

## Gotchas & Rate Limits

- Bob does not index employees by phone number. Phone numbers (if stored) are under `personal.communication.mobile` but are not searchable — identify callers by email or employee ID obtained from a separate identity lookup.
- `work.startDate` is immutable after an employee record is created. Attempting to PATCH it returns a 422 error.
- PATCH accepts partial objects — only send the fields you intend to change. Sending null for an optional field will clear it.
- Employee IDs are opaque numeric strings (e.g., `"3417649873"`), not sequential integers. Store them after first lookup.
- Rate limit: 100 requests/minute per service account. Batch or cache employee lookups to avoid hitting this in high-volume call scenarios.
- The `/people` list endpoint paginates with `limit` + `offset`. Default `limit` is 100; maximum is 500. For companies with 500+ employees, iterate with offset.
- Bob's field structure uses dot-notation paths (`work.email`, `personal.communication.mobile`) in filter expressions but returns nested JSON objects in responses.
- Service account tokens do not expire automatically, but should be rotated if compromised — revoke in Settings → Integrations → Service Accounts.
