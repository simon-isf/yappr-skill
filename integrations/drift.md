# Drift

> **Use in Yappr context**: Upsert a contact from a voice call (identified by email or phone), update contact attributes with call outcome data, and post a private note to an open conversation to inform the sales rep of what was discussed.

## Authentication

Drift uses OAuth 2.0. For internal/single-workspace use, generate a **Developer Access Token** directly from the app.

1. Go to [app.drift.com/developers](https://app.drift.com/developers) → New App → OAuth → generate a token
2. For production integrations, use the full OAuth 2.0 Authorization Code flow

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

Required OAuth scope for contact operations: `contact_read`, `contact_write`, `conversation_read`, `conversation_write`

## Base URL

```
https://driftapi.com
```

## Key Endpoints

### Get Contact by Email
**GET /contacts?email={email}**

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Response:**
```json
{
  "data": {
    "id": 9988001,
    "createdAt": 1712800000000,
    "attributes": {
      "email": "yael@example.com",
      "name": "Yael Ben-David",
      "phone": "+972501234567"
    }
  }
}
```

Returns a single contact object (not an array). Returns 404 if no contact exists with that email.

---

### Create Contact (with upsert by email)
**POST /contacts**

When a contact with the same email already exists, Drift silently performs an upsert and returns the existing contact's updated record.

**Request:**
```json
{
  "attributes": {
    "email": "yael@example.com",
    "name": "Yael Ben-David",
    "phone": "+972501234567"
  }
}
```

**Response:**
```json
{
  "data": {
    "id": 9988001,
    "createdAt": 1712800000000,
    "attributes": {
      "email": "yael@example.com",
      "name": "Yael Ben-David",
      "phone": "+972501234567"
    }
  }
}
```

Always check the returned `id` — if the contact existed, you get their pre-existing ID back.

---

### Update Contact
**PATCH /contacts/{contactId}**

**Request:**
```json
{
  "attributes": {
    "call_outcome": "Interested",
    "last_call_date": "2026-04-11",
    "meeting_scheduled": true
  }
}
```

`call_outcome`, `last_call_date`, `meeting_scheduled` are custom contact attributes you define in Drift's settings. Attributes are referenced by their internal key name.

**Response:**
```json
{
  "data": {
    "id": 9988001,
    "attributes": {
      "email": "yael@example.com",
      "call_outcome": "Interested",
      "last_call_date": "2026-04-11"
    }
  }
}
```

---

### Get Conversations for Contact
**GET /conversations?contactId={contactId}**

Used to find active conversations to attach a note to.

**Response:**
```json
{
  "data": [
    {
      "id": 77001,
      "status": "open",
      "contactId": 9988001,
      "assignedTo": 555
    }
  ]
}
```

---

### Send Message to Conversation (Private Note)
**POST /messages**

Sends a message into a conversation. To post a private note (only visible to agents, not the contact), include `"type": "private_note"`.

**Request:**
```json
{
  "conversationId": 77001,
  "type": "private_note",
  "body": "Voice AI call summary — 11 Apr 2026\n\nOutcome: Interested\nDuration: 3m 12s\n\nSummary: Caller confirmed pain with current scheduling solution. Interested in the Business plan. Wants to see the calendar integration. Suggested following up Tuesday."
}
```

**Response:**
```json
{
  "data": {
    "id": "msg_00123",
    "conversationId": 77001,
    "type": "private_note",
    "body": "Voice AI call summary...",
    "author": { "id": 9900, "type": "user" },
    "createdAt": 1712822400000
  }
}
```

---

### Post Timeline Event on Contact
**POST /timeline**

An alternative to conversation notes — logs a structured event on the contact's activity timeline without needing an open conversation.

**Request:**
```json
{
  "orgId": 1234,
  "userId": 9988001,
  "event": {
    "event": "voice_call_completed",
    "eventId": "call-uuid-here",
    "properties": [
      { "label": "Outcome", "value": "Appointment Set" },
      { "label": "Duration", "value": "3m 12s" },
      { "label": "Summary", "value": "Interested in Business plan." }
    ]
  }
}
```

`orgId` is your Drift workspace ID. `userId` is the contact's numeric ID. This is useful when there is no open conversation to attach to.

## Common Patterns

### Post-call contact upsert + note
```typescript
const ACCESS_TOKEN = Deno.env.get("DRIFT_ACCESS_TOKEN")!;
const DRIFT_ORG_ID = parseInt(Deno.env.get("DRIFT_ORG_ID")!);
const BASE = "https://driftapi.com";

const headers = {
  "Authorization": `Bearer ${ACCESS_TOKEN}`,
  "Content-Type": "application/json",
};

async function upsertContact(email: string, name: string, phone: string): Promise<number> {
  const res = await fetch(`${BASE}/contacts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ attributes: { email, name, phone } }),
  });
  const data = await res.json();
  return data.data.id;
}

async function updateContactAttributes(contactId: number, attrs: Record<string, unknown>) {
  await fetch(`${BASE}/contacts/${contactId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ attributes: attrs }),
  });
}

async function getOpenConversation(contactId: number): Promise<number | null> {
  const res = await fetch(`${BASE}/conversations?contactId=${contactId}`, { headers });
  const data = await res.json();
  const open = data.data?.find((c: { status: string }) => c.status === "open");
  return open?.id ?? null;
}

async function postCallNote(contactId: number, summary: string) {
  const convId = await getOpenConversation(contactId);

  if (convId) {
    // Attach as private note on conversation
    await fetch(`${BASE}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        conversationId: convId,
        type: "private_note",
        body: summary,
      }),
    });
  } else {
    // Fall back to timeline event
    await fetch(`${BASE}/timeline`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        orgId: DRIFT_ORG_ID,
        userId: contactId,
        event: {
          event: "voice_call_completed",
          eventId: `call-${Date.now()}`,
          properties: [{ label: "Summary", value: summary }],
        },
      }),
    });
  }
}
```

## Gotchas & Rate Limits

- **Rate limit**: 600 requests/minute (workspace-level). Returns 429 when exceeded.
- **Upsert by email**: `POST /contacts` uses email as the deduplication key. If you omit email, Drift always creates a new contact. For phone-only calls, either collect email during the conversation or use a separate lookup before upserting.
- **No phone-based contact lookup**: Drift does not support `GET /contacts?phone=...`. You need an email to find an existing contact. If you have only a phone number, you cannot reliably find the contact without querying a secondary system.
- **`GET /contacts?email=` vs search**: Drift's contact endpoint returns one contact by exact email match. There is no fuzzy or multi-field search in the standard REST API.
- **Custom attributes**: Fields like `call_outcome` must be defined in Drift Settings → Custom Contact Attributes before you can write to them via API. The key name in the API is the internal key, not the display label.
- **Private note vs regular message**: `"type": "private_note"` is visible only to agents. Without this, the message is sent to the contact — which is the wrong behavior for an AI call summary.
- **Timeline `orgId`**: Required for timeline events. Your org ID is visible in the Drift app URL: `app.drift.com/conversations` — the numeric segment after `/o/` in certain URLs, or retrieve it from `GET /account`.
- **Drift acquisition**: Drift was acquired by Salesloft in 2023. The API is still active and maintained but check devdocs.drift.com for any deprecation notices.
