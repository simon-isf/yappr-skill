# Zendesk

> **Use in Yappr context**: Create or update a support ticket after a call, look up the customer by phone number, and attach the call summary as an internal note.

## Authentication

Zendesk uses HTTP Basic auth with the format `{email}/token:{api_token}` as the username and an empty (or any) password:

```
Authorization: Basic base64({email}/token:{api_token})
```

Example: if your email is `admin@yourcompany.com` and your API token is `abc123`, encode `admin@yourcompany.com/token:abc123`.

Find your API token in Zendesk: Admin Center → Apps and Integrations → Zendesk API → API Tokens.

## Base URL

```
https://{subdomain}.zendesk.com/api/v2
```

Replace `{subdomain}` with your Zendesk account subdomain (the part before `.zendesk.com`).

## Key Endpoints

### GET /users/search?phone={phone} — Find user by phone

```
GET /api/v2/users/search?phone=%2B972501234567
Authorization: Basic base64(email/token:api_token)
```

`phone` should be URL-encoded E.164 format. Zendesk stores phone numbers on user profiles; this search queries the `phone` field.

Response:

```json
{
  "users": [
    {
      "id": 123456789,
      "name": "David Cohen",
      "email": "david@example.com",
      "phone": "+972501234567",
      "role": "end-user",
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-15T08:00:00Z",
      "active": true
    }
  ],
  "count": 1
}
```

Returns `"users": []` with `"count": 0` if not found.

---

### POST /users — Create a user (customer)

```json
POST /api/v2/users
Authorization: Basic base64(email/token:api_token)
Content-Type: application/json

{
  "user": {
    "name": "David Cohen",
    "phone": "+972501234567",
    "email": "david@example.com",
    "role": "end-user"
  }
}
```

Response:

```json
{
  "user": {
    "id": 123456790,
    "name": "David Cohen",
    "phone": "+972501234567",
    "email": "david@example.com",
    "role": "end-user",
    "created_at": "2024-01-20T12:00:00Z"
  }
}
```

---

### POST /users/create_or_update — Upsert user by email or external_id

Use this to avoid duplicates — Zendesk will update an existing user if email or `external_id` matches, or create a new one:

```json
POST /api/v2/users/create_or_update
Authorization: Basic base64(email/token:api_token)
Content-Type: application/json

{
  "user": {
    "name": "David Cohen",
    "email": "david@example.com",
    "phone": "+972501234567",
    "role": "end-user",
    "external_id": "crm_12345"
  }
}
```

Response:

```json
{
  "user": {
    "id": 123456789,
    "name": "David Cohen",
    "email": "david@example.com",
    "phone": "+972501234567"
  }
}
```

---

### POST /tickets — Create a ticket

```json
POST /api/v2/tickets
Authorization: Basic base64(email/token:api_token)
Content-Type: application/json

{
  "ticket": {
    "subject": "Support call – billing question",
    "comment": {
      "body": "Customer called about their invoice. Said they were charged twice in January. Agreed to investigate and call back within 24 hours.",
      "public": false
    },
    "requester_id": 123456789,
    "priority": "normal",
    "status": "new",
    "tags": ["voice-call", "yappr"]
  }
}
```

`comment.public: false` makes the initial comment an internal note (not visible to customer).

Status values: `new`, `open`, `pending`, `solved`, `closed`
Priority values: `low`, `normal`, `high`, `urgent`

Response:

```json
{
  "ticket": {
    "id": 54321,
    "subject": "Support call – billing question",
    "status": "new",
    "priority": "normal",
    "requester_id": 123456789,
    "created_at": "2024-01-20T12:05:00Z",
    "tags": ["voice-call", "yappr"]
  }
}
```

---

### PUT /tickets/{id} — Update ticket status

```json
PUT /api/v2/tickets/54321
Authorization: Basic base64(email/token:api_token)
Content-Type: application/json

{
  "ticket": {
    "status": "solved",
    "priority": "high"
  }
}
```

Response: updated ticket object (same shape as POST /tickets response).

---

### POST /tickets/{id}/comments — Add a call summary note to an existing ticket

Zendesk comments are added via PUT /tickets/{id} with a `comment` object, not a separate `/comments` endpoint:

```json
PUT /api/v2/tickets/54321
Authorization: Basic base64(email/token:api_token)
Content-Type: application/json

{
  "ticket": {
    "comment": {
      "body": "Follow-up call completed. Customer confirmed the refund was received. Closing ticket.",
      "public": false
    },
    "status": "solved"
  }
}
```

To add just a comment without changing other fields:

```json
{
  "ticket": {
    "comment": {
      "body": "Yappr AI call summary:\n\nDuration: 3m 15s\nOutcome: Customer agreed to upgrade to Pro plan.\nNext step: Send invoice.",
      "public": false
    }
  }
}
```

---

## Common Patterns

### Create a ticket from a call — full flow

```typescript
const ZENDESK_SUBDOMAIN = Deno.env.get("ZENDESK_SUBDOMAIN")!;
const ZENDESK_EMAIL = Deno.env.get("ZENDESK_EMAIL")!;
const ZENDESK_API_TOKEN = Deno.env.get("ZENDESK_API_TOKEN")!;

const zendeskBase = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;

function zendeskHeaders() {
  const credentials = btoa(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`);
  return {
    "Authorization": `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
}

async function findUserByPhone(phone: string): Promise<number | null> {
  const res = await fetch(
    `${zendeskBase}/users/search?phone=${encodeURIComponent(phone)}`,
    { headers: zendeskHeaders() }
  );
  const data = await res.json();
  if (data.users?.length > 0) {
    return data.users[0].id as number;
  }
  return null;
}

async function upsertUser(
  phone: string,
  name: string,
  email?: string
): Promise<number> {
  // Try to find by phone first
  const existing = await findUserByPhone(phone);
  if (existing) return existing;

  // Create or update by email if provided, or just create
  const endpoint = email
    ? `${zendeskBase}/users/create_or_update`
    : `${zendeskBase}/users`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: zendeskHeaders(),
    body: JSON.stringify({
      user: {
        name,
        phone,
        ...(email ? { email } : {}),
        role: "end-user",
      },
    }),
  });
  const data = await res.json();
  return data.user.id as number;
}

async function createTicketFromCall(params: {
  callerPhone: string;
  callerName: string;
  callerEmail?: string;
  subject: string;
  callSummary: string;
  priority?: "low" | "normal" | "high" | "urgent";
}): Promise<number> {
  const userId = await upsertUser(
    params.callerPhone,
    params.callerName,
    params.callerEmail
  );

  const res = await fetch(`${zendeskBase}/tickets`, {
    method: "POST",
    headers: zendeskHeaders(),
    body: JSON.stringify({
      ticket: {
        subject: params.subject,
        comment: {
          body: `Yappr AI Call Summary\n\n${params.callSummary}`,
          public: false,
        },
        requester_id: userId,
        priority: params.priority ?? "normal",
        status: "new",
        tags: ["voice-call", "yappr"],
      },
    }),
  });
  const data = await res.json();
  return data.ticket.id as number;
}

// Usage:
// const ticketId = await createTicketFromCall({
//   callerPhone: "+972501234567",
//   callerName: "David Cohen",
//   subject: "Support call – account access issue",
//   callSummary: "Customer cannot log in after password reset. ...",
// });
```

### Add a note and resolve a ticket after a follow-up call

```typescript
async function resolveWithNote(ticketId: number, note: string): Promise<void> {
  await fetch(`${zendeskBase}/tickets/${ticketId}`, {
    method: "PUT",
    headers: zendeskHeaders(),
    body: JSON.stringify({
      ticket: {
        status: "solved",
        comment: { body: note, public: false },
      },
    }),
  });
}
```

---

## Gotchas & Rate Limits

- **Auth format is unusual**: The username for Basic auth is `{email}/token:{api_token}` — the literal string `/token:` in the middle. A common mistake is to use just the email or API token alone.
- **Comments go through PUT /tickets, not POST /comments**: Unlike Freshdesk, Zendesk does not have a separate endpoint to add comments. Add comments by PUTting to the ticket with a `comment` object.
- **Phone search is a full-text search**: `GET /users/search?phone=...` performs a general search, not an exact match. If a customer has a similar-looking phone number, it might appear in results. Always verify the top result's phone field matches exactly.
- **`status: "closed"` is terminal**: Closed tickets cannot be reopened via the API. Use `"solved"` instead if there's any chance of reopening.
- **Ticket `comment.public: false`** creates an internal note. `public: true` (the default) sends the comment as a reply visible to the customer — make sure you're using `false` for call summaries unless you want the customer to see them.
- **Rate limits (REST API)**: 700 requests/minute for the default plan, 2,500/minute for Enterprise. Zendesk returns HTTP 429 with a `Retry-After` header when exceeded.
- **Bulk operations**: Use `POST /tickets/create_many` to create up to 100 tickets in a single API call when processing a batch of calls.
- **Localization**: Zendesk has built-in Hebrew locale support (`he`). You can set `locale_id` on user objects if you want the customer portal to appear in Hebrew.
