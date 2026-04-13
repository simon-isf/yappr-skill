# Keap (formerly Infusionsoft)

> **Use in Yappr context**: Add or update contacts after a call, apply tags to trigger Keap automation sequences (email follow-ups, task creation), and log call notes — ideal for small business sales and marketing workflows.

## Authentication

Keap uses **OAuth 2.0**. There is no simple API key — you must go through an OAuth flow.

1. Create an app at [keys.developer.keap.com](https://keys.developer.keap.com)
2. Complete the OAuth 2.0 Authorization Code flow to get an access token + refresh token
3. Access tokens expire in 24 hours — use the refresh token to rotate automatically
4. Store tokens securely and refresh before they expire

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

For personal/internal use, Keap also offers **Service Account Keys** (legacy; not recommended for new integrations).

## Base URL

```
https://api.infusionsoft.com/crm/rest/v2
```

> A v1 API exists at `https://api.infusionsoft.com/crm/rest/v1` with broader coverage. v2 is the current standard for contacts, tags, and notes.

## Key Endpoints

### Create Contact
**POST /contacts**

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Request:**
```json
{
  "given_name": "Yael",
  "family_name": "Ben-David",
  "email_addresses": [
    { "email": "yael@example.com", "field": "EMAIL1" }
  ],
  "phone_numbers": [
    { "number": "+972501234567", "type": "MOBILE", "field": "PHONE1" }
  ],
  "tag_ids": [112, 115]
}
```

**Response:**
```json
{
  "id": 55001,
  "given_name": "Yael",
  "family_name": "Ben-David",
  "email_addresses": [{ "email": "yael@example.com", "field": "EMAIL1" }],
  "phone_numbers": [{ "number": "+972501234567", "type": "MOBILE", "field": "PHONE1" }],
  "tag_ids": [112, 115]
}
```

---

### Update Contact
**PATCH /contacts/{id}**

**Request:**
```json
{
  "custom_fields": [
    { "id": "custom_field_1", "content": "Interested" }
  ]
}
```

---

### Search Contacts by Phone
**GET /contacts?phone=+972501234567&limit=1**

> Note: The v2 REST API has limited phone filter support. If phone search fails, use the v1 endpoint: `GET /v1/contacts?phone=+972501234567`.

**Response:**
```json
{
  "contacts": [
    {
      "id": 55001,
      "given_name": "Yael",
      "family_name": "Ben-David",
      "phone_numbers": [{ "number": "+972501234567", "type": "MOBILE" }]
    }
  ],
  "count": 1,
  "next": null
}
```

---

### List Tags
**GET /tags?limit=200**

**Response:**
```json
{
  "tags": [
    { "id": 112, "name": "Voice AI Lead", "description": "Created via Yappr voice call", "category": { "id": 5, "name": "Call Outcomes" } },
    { "id": 113, "name": "Interested", "category": { "id": 5, "name": "Call Outcomes" } },
    { "id": 114, "name": "Not Interested", "category": { "id": 5, "name": "Call Outcomes" } },
    { "id": 115, "name": "Appointment Set", "category": { "id": 5, "name": "Call Outcomes" } }
  ],
  "count": 4
}
```

---

### Apply Tags to Contact
**POST /contacts/{id}/tags**

**Request:**
```json
{
  "tag_ids": [113, 115]
}
```

**Response:**
```json
[
  { "tag_id": 113 },
  { "tag_id": 115 }
]
```

Applying a tag that is connected to a campaign sequence will trigger that automation automatically in Keap.

---

### Add Note to Contact
**POST /contacts/{id}/notes**

**Request:**
```json
{
  "body": "Outbound call — Appointment Set. Caller confirmed interest in the Pro plan. Demo scheduled for Thursday.",
  "title": "Voice AI Call Summary",
  "type": "CALL"
}
```

**Response:**
```json
{
  "id": "note_88001",
  "body": "Outbound call — Appointment Set...",
  "title": "Voice AI Call Summary",
  "type": "CALL",
  "contact_id": 55001,
  "date_created": "2026-04-11T09:30:00.000Z"
}
```

## Common Patterns

### Post-call: find or create contact, apply outcome tag, add note
```typescript
const ACCESS_TOKEN = Deno.env.get("KEAP_ACCESS_TOKEN")!;
const REFRESH_TOKEN = Deno.env.get("KEAP_REFRESH_TOKEN")!;
const CLIENT_ID = Deno.env.get("KEAP_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("KEAP_CLIENT_SECRET")!;
const BASE_V2 = "https://api.infusionsoft.com/crm/rest/v2";
const BASE_V1 = "https://api.infusionsoft.com/crm/rest/v1";

const headers = () => ({
  "Authorization": `Bearer ${ACCESS_TOKEN}`,
  "Content-Type": "application/json",
});

async function refreshAccessToken(): Promise<string> {
  const res = await fetch("https://api.infusionsoft.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function findContactByPhone(phone: string): Promise<number | null> {
  const res = await fetch(
    `${BASE_V1}/contacts?phone=${encodeURIComponent(phone)}&limit=1`,
    { headers: headers() }
  );
  const data = await res.json();
  return data.contacts?.[0]?.id ?? null;
}

async function createContact(name: string, phone: string, email?: string): Promise<number> {
  const [given_name, ...rest] = name.split(" ");
  const res = await fetch(`${BASE_V2}/contacts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      given_name,
      family_name: rest.join(" ") || "",
      phone_numbers: [{ number: phone, type: "MOBILE", field: "PHONE1" }],
      ...(email ? { email_addresses: [{ email, field: "EMAIL1" }] } : {}),
    }),
  });
  const data = await res.json();
  return data.id;
}

async function applyTags(contactId: number, tagIds: number[]) {
  await fetch(`${BASE_V2}/contacts/${contactId}/tags`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ tag_ids: tagIds }),
  });
}

async function addCallNote(contactId: number, summary: string) {
  await fetch(`${BASE_V2}/contacts/${contactId}/notes`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title: "Voice AI Call",
      body: summary,
      type: "CALL",
    }),
  });
}

// Get tag name→ID map (cache this at startup)
async function getTagMap(): Promise<Map<string, number>> {
  const res = await fetch(`${BASE_V2}/tags?limit=200`, { headers: headers() });
  const data = await res.json();
  return new Map(data.tags?.map((t: { name: string; id: number }) => [t.name, t.id]));
}
```

## Gotchas & Rate Limits

- **Rate limit**: 25 requests/second. 429 returned when exceeded.
- **OAuth only — no API key auth**: Keap removed simple API key auth for v2. You must implement OAuth 2.0 with token refresh logic.
- **Token expiry**: Access tokens expire in **24 hours**. Build refresh token rotation or use a library to handle this automatically.
- **Tags drive automations**: Applying a tag in Keap can immediately trigger campaign sequences (emails, tasks, internal notifications). Test with non-production contacts to avoid accidentally triggering campaigns during development.
- **Tag IDs are not portable**: Tag IDs differ between Keap accounts and environments. Never hardcode them — fetch from `GET /tags` and map by name.
- **v1 vs v2**: v2 is the current standard, but v1 has better phone number search support. Use v1 for lookups, v2 for creates/updates.
- **`PATCH /contacts/{id}` vs `PUT`**: Use PATCH for partial updates. PUT requires the full contact object and may overwrite fields.
- **Note `type` field**: Accepted values include `"CALL"`, `"EMAIL"`, `"FAX"`, `"LETTER"`, `"OTHER"`. Using `"CALL"` correctly categorizes the note in the Keap UI.
