# Intercom

> **Use in Yappr context**: Create or find a contact after a call, add a structured call note to their timeline, and apply tags to reflect call outcomes — enabling support or sales follow-up directly inside Intercom.

## Authentication

- Create an app in the [Intercom Developer Hub](https://app.intercom.com/a/developer-signup)
- For internal integrations, use an **Access Token** (not OAuth flow)
- Token is available under: Your App → Authentication → Access Token

```
Authorization: Bearer YOUR_ACCESS_TOKEN
Intercom-Version: 2.14
```

The `Intercom-Version` header pins the API version. Use the latest stable (`2.14` as of early 2026).

## Base URL

```
https://api.intercom.io
```

## Key Endpoints

### Search Contacts by Phone
**POST /contacts/search**

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
Intercom-Version: 2.14
```

**Request:**
```json
{
  "query": {
    "field": "phone",
    "operator": "=",
    "value": "+972501234567"
  },
  "pagination": {
    "per_page": 1
  }
}
```

**Response:**
```json
{
  "type": "list",
  "total_count": 1,
  "data": [
    {
      "type": "contact",
      "id": "64a1b2c3d4e5f6a7b8c9d0e1",
      "name": "Yael Ben-David",
      "email": "yael@example.com",
      "phone": "+972501234567",
      "role": "user"
    }
  ]
}
```

Use `data[0].id` for notes and tags.

---

### Create Contact
**POST /contacts**

**Request:**
```json
{
  "role": "lead",
  "name": "Yael Ben-David",
  "phone": "+972501234567",
  "email": "yael@example.com"
}
```

**Response:**
```json
{
  "type": "contact",
  "id": "64a1b2c3d4e5f6a7b8c9d0e2",
  "name": "Yael Ben-David",
  "phone": "+972501234567",
  "role": "lead"
}
```

**`role`** values: `"user"` (existing customers) | `"lead"` (unqualified prospects)

---

### Update Contact
**PATCH /contacts/{id}**

**Request:**
```json
{
  "custom_attributes": {
    "last_call_outcome": "Interested",
    "last_call_date": "2026-04-11"
  }
}
```

---

### Create Note on Contact
**POST /contacts/{id}/notes**

**Request:**
```json
{
  "body": "<p>Call outcome: <strong>Appointment Set</strong></p><p>Summary: Caller confirmed interest in the SMB plan. Wants a product demo. Scheduled for Thursday 14 April at 10:00.</p>",
  "admin_id": "991267583"
}
```

**Response:**
```json
{
  "type": "note",
  "id": "note_001abc",
  "created_at": 1712822400,
  "body": "<p>Call outcome: <strong>Appointment Set</strong></p>...",
  "author": {
    "type": "admin",
    "id": "991267583",
    "name": "Bot Admin"
  },
  "contact": {
    "type": "contact",
    "id": "64a1b2c3d4e5f6a7b8c9d0e1"
  }
}
```

The `body` field accepts HTML. `admin_id` must be the ID of an admin in your workspace.

---

### List Tags
**GET /tags**

**Response:**
```json
{
  "type": "list",
  "data": [
    { "type": "tag", "id": "tag_001", "name": "Qualified" },
    { "type": "tag", "id": "tag_002", "name": "Appointment Set" },
    { "type": "tag", "id": "tag_003", "name": "Not Interested" }
  ]
}
```

---

### Tag a Contact
**POST /contacts/{id}/tags**

**Request:**
```json
{
  "id": "tag_002"
}
```

**Response:**
```json
{
  "type": "tag",
  "id": "tag_002",
  "name": "Appointment Set"
}
```

## Common Patterns

### Post-call: find or create contact, add note, apply tag
```typescript
const ACCESS_TOKEN = Deno.env.get("INTERCOM_ACCESS_TOKEN")!;
const ADMIN_ID = Deno.env.get("INTERCOM_ADMIN_ID")!; // the bot/integration admin ID
const BASE = "https://api.intercom.io";

const headers = {
  "Authorization": `Bearer ${ACCESS_TOKEN}`,
  "Content-Type": "application/json",
  "Intercom-Version": "2.14",
};

async function findOrCreateContact(phone: string, name: string, email?: string): Promise<string> {
  // Search first
  const searchRes = await fetch(`${BASE}/contacts/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: { field: "phone", operator: "=", value: phone },
      pagination: { per_page: 1 },
    }),
  });
  const searchData = await searchRes.json();
  if (searchData.data?.length > 0) return searchData.data[0].id;

  // Create if not found
  const createRes = await fetch(`${BASE}/contacts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ role: "lead", name, phone, email }),
  });
  const contact = await createRes.json();
  return contact.id;
}

async function addCallNote(contactId: string, summary: string) {
  await fetch(`${BASE}/contacts/${contactId}/notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: `<p>${summary}</p>`, admin_id: ADMIN_ID }),
  });
}

async function tagContact(contactId: string, tagId: string) {
  await fetch(`${BASE}/contacts/${contactId}/tags`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: tagId }),
  });
}

// Get tag ID by name — call once and cache
async function getTagIdByName(name: string): Promise<string | null> {
  const res = await fetch(`${BASE}/tags`, { headers });
  const data = await res.json();
  return data.data?.find((t: { name: string }) => t.name === name)?.id ?? null;
}
```

## Gotchas & Rate Limits

- **Rate limits**: 83 requests/10 seconds (Workspace-level bucket). Returns 429 with `X-RateLimit-Reset` header.
- **`admin_id` required for notes**: Notes must be authored by an admin. Create a dedicated "Bot" admin in your workspace and store its ID as an env var.
- **`Intercom-Version` header**: Required. Omitting it uses a deprecated default. Use `2.14` or check the Intercom changelog for the latest version.
- **Tag workflow**: Tags must exist in Intercom before you can apply them. You cannot create and apply in one step — retrieve tag IDs from `GET /tags` first.
- **Contact `role`**: `"lead"` is correct for new inbound prospects. `"user"` is for paying/logged-in customers. Mismatching roles causes contact type conflicts.
- **Note body is HTML**: Plain text works but wrapping in `<p>` tags is recommended for correct rendering in the Intercom UI.
- **Search operator**: For phone lookups use `"operator": "="` (exact match). Phone numbers must be in the exact format stored in Intercom.
