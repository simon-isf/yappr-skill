# Close CRM

> **Use in Yappr context**: Log outbound or inbound calls against leads, update lead status after qualification, and search for leads by phone number to retrieve context before a call.

## Authentication

- Go to Close Settings → API Keys → generate a key
- Authentication uses **HTTP Basic Auth**: API key as the username, empty string as the password
- Base64-encode `api_key:` (note the trailing colon) and pass as the Authorization header

```
Authorization: Basic base64("sk_abc123:")
```

In Deno: `btoa(`${API_KEY}:`)`

## Base URL

```
https://api.close.com/api/v1
```

The old base URL `https://app.close.io/api/v1` is deprecated — use `api.close.com`.

## Key Endpoints

### Search Leads by Phone
**GET /lead/?query=phone%3A{phone}**

Close uses a query language for lead search.

**Headers:**
```
Authorization: Basic base64(api_key:)
Content-Type: application/json
```

**Request:**
```
GET /lead/?query=phone%3A%2B972501234567&_fields=id,display_name,status_id,contacts
```

**Response:**
```json
{
  "data": [
    {
      "id": "lead_abc123",
      "display_name": "Yael Ben-David",
      "status_id": "stat_open",
      "contacts": [
        {
          "id": "cont_xyz789",
          "name": "Yael Ben-David",
          "phones": [{ "phone": "+972501234567", "type": "mobile" }]
        }
      ]
    }
  ],
  "has_more": false
}
```

---

### Create Lead
**POST /lead/**

**Request:**
```json
{
  "name": "Yael Ben-David",
  "contacts": [
    {
      "name": "Yael Ben-David",
      "phones": [{ "phone": "+972501234567", "type": "mobile" }],
      "emails": [{ "email": "yael@example.com", "type": "office" }]
    }
  ]
}
```

**Response:**
```json
{
  "id": "lead_abc124",
  "name": "Yael Ben-David",
  "status_id": "stat_open",
  "contacts": [{ "id": "cont_xyz790", "name": "Yael Ben-David" }]
}
```

---

### Update Lead Status
**PATCH /lead/{id}/**

Fetch valid `status_id` values from `GET /status/lead/`.

**Request:**
```json
{
  "status_id": "stat_qualified"
}
```

---

### Log Call Activity
**POST /activity/call/**

This is the core post-call endpoint. Logs a call that happened outside Close's own VoIP system.

**Request:**
```json
{
  "lead_id": "lead_abc123",
  "contact_id": "cont_xyz789",
  "direction": "outbound",
  "duration": 187,
  "status": "answered",
  "note": "Caller confirmed interest in the annual plan. Requested pricing sheet by email. Follow-up scheduled for Thursday.",
  "phone": "+972501234567",
  "created_by": "user_XXXX"
}
```

**Response:**
```json
{
  "id": "acti_call_123",
  "lead_id": "lead_abc123",
  "contact_id": "cont_xyz789",
  "direction": "outbound",
  "duration": 187,
  "status": "answered",
  "note": "Caller confirmed interest in the annual plan...",
  "date_created": "2026-04-11T09:30:00.000Z"
}
```

**`direction`** values: `"outbound"` | `"inbound"`
**`status`** values: `"answered"` | `"no_answer"` | `"voicemail"` | `"busy"` | `"failed"`
**`duration`** is in seconds.

---

### List Lead Statuses
**GET /status/lead/**

**Response:**
```json
{
  "data": [
    { "id": "stat_open", "label": "Potential", "type": "active" },
    { "id": "stat_qualified", "label": "Qualified", "type": "active" },
    { "id": "stat_won", "label": "Won", "type": "won" },
    { "id": "stat_lost", "label": "Lost", "type": "lost" }
  ]
}
```

Retrieve this once and cache the label-to-ID mapping for dynamic status updates.

## Common Patterns

### Post-call: find lead, log call, update status
```typescript
const API_KEY = Deno.env.get("CLOSE_CRM_API_KEY")!;
const BASE = "https://api.close.com/api/v1";

const authHeader = `Basic ${btoa(`${API_KEY}:`)}`;
const headers = {
  "Authorization": authHeader,
  "Content-Type": "application/json",
};

async function findLeadByPhone(phone: string): Promise<{ leadId: string; contactId: string } | null> {
  const encoded = encodeURIComponent(`phone:${phone}`);
  const res = await fetch(`${BASE}/lead/?query=${encoded}&_fields=id,contacts`, { headers });
  const data = await res.json();
  const lead = data.data?.[0];
  if (!lead) return null;
  return { leadId: lead.id, contactId: lead.contacts?.[0]?.id };
}

async function logCall(leadId: string, contactId: string, opts: {
  direction: "inbound" | "outbound";
  status: "answered" | "no_answer" | "voicemail";
  duration: number;
  note: string;
  phone: string;
}) {
  const res = await fetch(`${BASE}/activity/call/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ lead_id: leadId, contact_id: contactId, ...opts }),
  });
  return res.json();
}

async function updateLeadStatus(leadId: string, statusId: string) {
  await fetch(`${BASE}/lead/${leadId}/`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status_id: statusId }),
  });
}
```

## Gotchas & Rate Limits

- **Rate limits**: 60 requests/second sustained; bursts allowed. 429 with `Retry-After` header when exceeded.
- **Basic Auth format**: The colon after the API key is required. `btoa("key:")` — do not omit it.
- **Call duration**: In seconds as an integer. Not milliseconds.
- **`note` vs `note_html`**: If you send both, `note_html` takes precedence. Use `note` for plain text summaries.
- **Lead vs Contact**: Close uses Leads as the top-level object; Contacts belong to Leads. Always log calls against a `lead_id`.
- **Status IDs are account-specific**: Never hardcode them. Fetch from `GET /status/lead/` and map by label.
- **Phone search query**: Close's query language for phone search is `phone:+972501234567` — URL-encode the colon and `+` when putting in the query string.
- **`created_by`**: Optional. If omitted, the activity is attributed to the API key owner.
