# Copper CRM

> **Use in Yappr context**: Find a contact (Person) by phone number before a call, update their record with call outcomes, create opportunities, and log call activities — ideal for Google Workspace teams.

## Authentication

Copper uses three custom headers — no Bearer token. All three are required on every request.

- Generate an API key: Copper Settings → Integrations → API Keys → Generate API Key
- The user email must match the account that generated the key

**Headers required on every request:**
```
X-PW-AccessToken: YOUR_API_KEY
X-PW-Application: developer_api
X-PW-UserEmail: you@yourcompany.com
Content-Type: application/json
```

## Base URL

```
https://api.copper.com/developer_api/v1
```

## Key Endpoints

### Search People (Contacts) by Phone
**POST /people/search**

**Headers:**
```
X-PW-AccessToken: YOUR_API_KEY
X-PW-Application: developer_api
X-PW-UserEmail: you@yourcompany.com
Content-Type: application/json
```

**Request:**
```json
{
  "phone_number": "+972501234567",
  "page_size": 5
}
```

**Response:**
```json
[
  {
    "id": 12345678,
    "name": "Yael Ben-David",
    "emails": [{ "email": "yael@example.com", "category": "work" }],
    "phone_numbers": [{ "number": "+972501234567", "category": "mobile" }],
    "title": "Head of Operations",
    "company_name": "Acme Ltd",
    "assignee_id": 555
  }
]
```

Returns an array directly (not wrapped in a key). Empty array if no match.

---

### Get Person by ID
**GET /people/{id}**

Returns the full person object including custom fields and tags.

---

### Update Person
**PATCH /people/{id}**

**Request:**
```json
{
  "custom_fields": [
    { "custom_field_definition_id": 100001, "value": "Interested" }
  ],
  "tags": ["qualified", "warm-lead"]
}
```

---

### Create Opportunity
**POST /opportunities**

**Request:**
```json
{
  "name": "Yael Ben-David — Q2 Deal",
  "primary_contact_id": 12345678,
  "status": "Open",
  "pipeline_id": 22001,
  "pipeline_stage_id": 33002,
  "monetary_value": 4800
}
```

**Response:**
```json
{
  "id": 9900001,
  "name": "Yael Ben-David — Q2 Deal",
  "status": "Open",
  "pipeline_stage_id": 33002
}
```

Fetch pipeline/stage IDs from `GET /pipelines`.

---

### Log Call Activity
**POST /activities**

Activity types with category `"user"` are the ones you can create via API. Default Phone Call type ID is `190711` — but verify via `GET /activity_types` since IDs may differ per account.

**Request:**
```json
{
  "parent": {
    "type": "person",
    "id": 12345678
  },
  "type": {
    "category": "user",
    "id": 190711
  },
  "details": "Outbound qualification call. Caller is evaluating alternatives. Decision in 2 weeks. Sent pricing doc."
}
```

**Response:**
```json
{
  "id": 4400001,
  "type": { "id": 190711, "category": "user", "name": "Phone Call" },
  "parent": { "type": "person", "id": 12345678 },
  "details": "Outbound qualification call...",
  "activity_date": 1712822400,
  "date_created": 1712822450
}
```

**`parent.type`** values: `"lead"` | `"person"` | `"company"` | `"opportunity"` | `"project"` | `"task"`

---

### List Activity Types
**GET /activity_types**

Returns all activity types including their IDs. Use this to look up the numeric ID for "Phone Call" in your specific account.

**Response excerpt:**
```json
{
  "user": [
    { "id": 0, "category": "user", "name": "Note", "is_disabled": false },
    { "id": 190711, "category": "user", "name": "Phone Call", "count_as_interaction": true },
    { "id": 190712, "category": "user", "name": "Meeting", "count_as_interaction": true }
  ]
}
```

## Common Patterns

### Post-call: find person, log call, create opportunity
```typescript
const API_KEY = Deno.env.get("COPPER_API_KEY")!;
const USER_EMAIL = Deno.env.get("COPPER_USER_EMAIL")!;
const BASE = "https://api.copper.com/developer_api/v1";

const headers = {
  "X-PW-AccessToken": API_KEY,
  "X-PW-Application": "developer_api",
  "X-PW-UserEmail": USER_EMAIL,
  "Content-Type": "application/json",
};

async function findPersonByPhone(phone: string): Promise<number | null> {
  const res = await fetch(`${BASE}/people/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone_number: phone, page_size: 1 }),
  });
  const people = await res.json();
  return Array.isArray(people) && people.length > 0 ? people[0].id : null;
}

async function getPhoneCallTypeId(): Promise<number> {
  const res = await fetch(`${BASE}/activity_types`, { headers });
  const data = await res.json();
  const phoneType = data.user?.find((t: { name: string }) => t.name === "Phone Call");
  return phoneType?.id ?? 190711; // fallback to known default
}

async function logCall(personId: number, details: string, typeId: number) {
  await fetch(`${BASE}/activities`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { type: "person", id: personId },
      type: { category: "user", id: typeId },
      details,
    }),
  });
}
```

## Gotchas & Rate Limits

- **Rate limit**: Not publicly documented per-endpoint; practical limit is ~600 requests/minute. Copper returns 429 when exceeded.
- **All 3 auth headers required**: Missing any one of `X-PW-AccessToken`, `X-PW-Application`, or `X-PW-UserEmail` returns a 401.
- **Activity type IDs are account-specific**: The ID `190711` for Phone Call is a common default but is not guaranteed. Always fetch from `GET /activity_types` and cache.
- **`POST /people/search` returns an array**: Unlike most APIs that wrap results in an object, this returns a bare JSON array.
- **`POST /activities` (singular), not `/activity`**: Copper uses the plural form in the endpoint path.
- **Custom fields**: Referenced by `custom_field_definition_id`, not by name. Fetch definitions from `GET /custom_field_definitions/people`.
- **Google Workspace sync**: Copper auto-syncs People with Google Contacts. Programmatic updates appear in Gmail automatically.
