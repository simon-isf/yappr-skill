# Freshdesk

> **Use in Yappr context**: Create a support ticket automatically after an inbound support call, add the call summary as a private note, and look up existing contacts by phone number.

## Authentication

Freshdesk uses HTTP Basic auth with your **API key as the username** and any string (conventionally `X`) as the password:

```
Authorization: Basic base64({api_key}:X)
```

Find your API key in Freshdesk: Profile avatar (top-right) → Profile Settings → API Key.

## Base URL

```
https://{subdomain}.freshdesk.com/api/v2
```

Replace `{subdomain}` with your Freshdesk account subdomain (e.g. `yourcompany.freshdesk.com` → subdomain is `yourcompany`).

## Key Endpoints

### GET /contacts?phone={phone} — Find contact by phone number

```
GET /api/v2/contacts?phone=0501234567
Authorization: Basic base64(api_key:X)
```

Use the phone number as stored (either local format or E.164 — Freshdesk matches both if you've stored them consistently). Try both formats if the first returns empty.

Response is an array:

```json
[
  {
    "id": 12345,
    "name": "David Cohen",
    "phone": "0501234567",
    "mobile": "+972501234567",
    "email": "david@example.com",
    "created_at": "2024-01-01T10:00:00Z",
    "updated_at": "2024-01-15T08:00:00Z",
    "active": true,
    "company_id": 67890
  }
]
```

Returns an empty array `[]` if no match is found.

---

### POST /contacts — Create a new contact

```json
POST /api/v2/contacts
Authorization: Basic base64(api_key:X)
Content-Type: application/json

{
  "name": "David Cohen",
  "phone": "0501234567",
  "mobile": "+972501234567",
  "email": "david@example.com"
}
```

Response:

```json
{
  "id": 12346,
  "name": "David Cohen",
  "phone": "0501234567",
  "mobile": "+972501234567",
  "email": "david@example.com",
  "created_at": "2024-01-20T12:00:00Z",
  "active": true
}
```

---

### POST /tickets — Create a support ticket

```json
POST /api/v2/tickets
Authorization: Basic base64(api_key:X)
Content-Type: application/json

{
  "subject": "Support call – plumbing issue",
  "description": "Customer called about a leaking pipe. Agreed to send a technician tomorrow between 10-12.",
  "status": 2,
  "priority": 2,
  "requester_id": 12345,
  "type": "Question",
  "source": 5,
  "tags": ["voice-call", "yappr"]
}
```

Status codes: `2` = Open, `3` = Pending, `4` = Resolved, `5` = Closed
Priority codes: `1` = Low, `2` = Medium, `3` = High, `4` = Urgent
Source codes: `1` = Email, `2` = Portal, `3` = Phone, `5` = API (use `3` for calls)

Response:

```json
{
  "id": 98765,
  "subject": "Support call – plumbing issue",
  "status": 2,
  "priority": 2,
  "requester_id": 12345,
  "created_at": "2024-01-20T12:05:00Z",
  "updated_at": "2024-01-20T12:05:00Z",
  "type": "Question",
  "tags": ["voice-call", "yappr"]
}
```

---

### PUT /tickets/{id} — Update ticket status or priority

```json
PUT /api/v2/tickets/98765
Authorization: Basic base64(api_key:X)
Content-Type: application/json

{
  "status": 4,
  "priority": 3
}
```

Response: the updated ticket object (same shape as POST /tickets response).

---

### POST /tickets/{id}/notes — Add a private note (call summary)

```json
POST /api/v2/tickets/98765/notes
Authorization: Basic base64(api_key:X)
Content-Type: application/json

{
  "body": "<b>Yappr call summary</b><br><br>Duration: 4m 32s<br><br>Customer asked about pricing for the premium plan. Was quoted ₪299/month. Interested but wants to speak with their accountant first. Follow up in 3 days.",
  "private": true
}
```

`private: true` makes the note invisible to the customer (internal-only). Set to `false` for a public reply. `body` supports HTML.

Response:

```json
{
  "id": 55555,
  "body": "<b>Yappr call summary</b>...",
  "body_text": "Yappr call summary...",
  "private": true,
  "created_at": "2024-01-20T12:06:00Z",
  "ticket_id": 98765
}
```

---

### GET /tickets/{id} — Get ticket details

```
GET /api/v2/tickets/98765
Authorization: Basic base64(api_key:X)
```

Response: full ticket object including `status`, `priority`, `notes`, `description`, etc.

---

## Common Patterns

### Create a ticket from a call — full flow

```typescript
const FRESHDESK_DOMAIN = Deno.env.get("FRESHDESK_DOMAIN")!; // e.g. "yourcompany"
const FRESHDESK_API_KEY = Deno.env.get("FRESHDESK_API_KEY")!;

const freshdeskBase = `https://${FRESHDESK_DOMAIN}.freshdesk.com/api/v2`;

function freshdeskHeaders() {
  const credentials = btoa(`${FRESHDESK_API_KEY}:X`);
  return {
    "Authorization": `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
}

async function findContactByPhone(phone: string): Promise<number | null> {
  // Try both E.164 and local format
  const normalized = phone.startsWith("+") ? phone.slice(1) : phone;
  const formats = [phone, normalized, `0${normalized.slice(3)}`]; // also try 05XXXXXXXX

  for (const fmt of formats) {
    const res = await fetch(
      `${freshdeskBase}/contacts?phone=${encodeURIComponent(fmt)}`,
      { headers: freshdeskHeaders() }
    );
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return data[0].id as number;
    }
  }
  return null;
}

async function findOrCreateContact(
  phone: string,
  name: string,
  email?: string
): Promise<number> {
  const existing = await findContactByPhone(phone);
  if (existing) return existing;

  const res = await fetch(`${freshdeskBase}/contacts`, {
    method: "POST",
    headers: freshdeskHeaders(),
    body: JSON.stringify({
      name,
      phone: phone.startsWith("+") ? undefined : phone,
      mobile: phone.startsWith("+") ? phone : undefined,
      ...(email ? { email } : {}),
    }),
  });
  const contact = await res.json();
  return contact.id as number;
}

async function createTicketFromCall(params: {
  callerPhone: string;
  callerName: string;
  subject: string;
  callSummary: string;
  priority?: 1 | 2 | 3 | 4;
}): Promise<{ ticketId: number; contactId: number }> {
  const contactId = await findOrCreateContact(params.callerPhone, params.callerName);

  const ticketRes = await fetch(`${freshdeskBase}/tickets`, {
    method: "POST",
    headers: freshdeskHeaders(),
    body: JSON.stringify({
      subject: params.subject,
      description: params.callSummary,
      status: 2, // Open
      priority: params.priority ?? 2, // Medium
      requester_id: contactId,
      source: 3, // Phone
      tags: ["voice-call", "yappr"],
    }),
  });
  const ticket = await ticketRes.json();

  // Add a private note with the detailed summary
  await fetch(`${freshdeskBase}/tickets/${ticket.id}/notes`, {
    method: "POST",
    headers: freshdeskHeaders(),
    body: JSON.stringify({
      body: `<b>Yappr AI Call Summary</b><br><br>${params.callSummary.replace(/\n/g, "<br>")}`,
      private: true,
    }),
  });

  return { ticketId: ticket.id as number, contactId };
}

// Usage:
// const { ticketId } = await createTicketFromCall({
//   callerPhone: "+972501234567",
//   callerName: "David Cohen",
//   subject: "Support call - billing question",
//   callSummary: "Customer asked about upgrading their plan. ...",
// });
```

### Resolve a ticket after follow-up call

```typescript
async function resolveTicket(ticketId: number, closingNote?: string): Promise<void> {
  if (closingNote) {
    await fetch(`${freshdeskBase}/tickets/${ticketId}/notes`, {
      method: "POST",
      headers: freshdeskHeaders(),
      body: JSON.stringify({ body: closingNote, private: true }),
    });
  }
  await fetch(`${freshdeskBase}/tickets/${ticketId}`, {
    method: "PUT",
    headers: freshdeskHeaders(),
    body: JSON.stringify({ status: 4 }), // Resolved
  });
}
```

---

## Gotchas & Rate Limits

- **Phone search quirks**: Freshdesk searches only the `phone` field with the `?phone=` query param. The `mobile` field is stored separately and requires the `?mobile=` query param. Store Israeli numbers in both fields (local `05XXXXXXXX` in `phone`, E.164 `+972...` in `mobile`) to maximize searchability.
- **HTML in descriptions and notes**: Both `description` and note `body` fields accept HTML. Plain text is fine, but if your text contains `<` or `>`, they need to be HTML-escaped or the content will be mangled.
- **requester_id vs email**: You can create a ticket using either `requester_id` (contact ID) or `email` (Freshdesk will auto-create a contact). Using `requester_id` is preferred when you've already looked up/created the contact.
- **Status 2 = Open (not 1)**: Status codes start at 2. Status 1 does not exist. This is a common source of errors when integrating.
- **Rate limits**: 1,000 API calls per hour per account on the default plan. Higher tiers get higher limits. Freshdesk returns HTTP 429 with a `Retry-After` header when the limit is hit.
- **API key per agent**: Each Freshdesk agent has their own API key. Use an admin agent's API key for automation so it has full access to create/update tickets for any requester.
- **Subdomain case sensitivity**: The subdomain in the base URL is case-sensitive — use lowercase.
