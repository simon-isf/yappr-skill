# MailerLite

> **Use in Yappr context**: Add a subscriber after a call and move them into the appropriate group based on call disposition.

## Authentication

```
Authorization: Bearer {api_key}
Content-Type: application/json
Accept: application/json
```

Get your API key from MailerLite → Integrations → MailerLite API → Generate new token.

## Base URL

```
https://connect.mailerlite.com/api
```

## Key Endpoints

### GET /subscribers/{email} — Find subscriber by email

```
GET /subscribers/david%40example.com
```

Response:

```json
{
  "data": {
    "id": "123456789",
    "email": "david@example.com",
    "status": "active",
    "fields": {
      "name": "David",
      "last_name": "Cohen",
      "phone": "+972501234567"
    },
    "groups": [
      { "id": "111", "name": "Leads" }
    ]
  }
}
```

Returns `404` if not found.

### POST /subscribers — Create or update subscriber

```json
{
  "email": "david@example.com",
  "fields": {
    "name": "David",
    "last_name": "Cohen",
    "phone": "+972501234567",
    "last_call_disposition": "appointment_set"
  },
  "groups": ["GROUP_ID_FOR_APPOINTMENT_SET"],
  "status": "active"
}
```

Response: `200 OK` if subscriber updated, `201 Created` if new. MailerLite upserts by email.

### DELETE /subscribers/{id} — Unsubscribe or delete

```
DELETE /subscribers/123456789
```

Response: `204 No Content`. Use when a caller explicitly opts out.

### GET /groups — List all groups

```
GET /groups
```

Response:

```json
{
  "data": [
    { "id": "111", "name": "Leads" },
    { "id": "222", "name": "Interested" },
    { "id": "333", "name": "Appointment Set" },
    { "id": "444", "name": "Not Interested" }
  ]
}
```

Cache group IDs — they rarely change.

### POST /subscribers/{subscriber_id}/assign-subscriber/{group_id} — Add to group

```
POST /subscribers/123456789/assign-subscriber/333
```

No request body needed. Response: `200 OK`.

### DELETE /subscribers/{subscriber_id}/assign-subscriber/{group_id} — Remove from group

```
DELETE /subscribers/123456789/assign-subscriber/222
```

Use this to move a subscriber from "Interested" to "Appointment Set" (remove old, add new).

## Common Patterns

### Add subscriber and route to disposition group

```typescript
const MAILERLITE_API_KEY = Deno.env.get("MAILERLITE_API_KEY")!;
const MAILERLITE_BASE = "https://connect.mailerlite.com/api";

// Pre-configure group IDs from your MailerLite account
const DISPOSITION_GROUPS: Record<string, string> = {
  appointment_set: Deno.env.get("MAILERLITE_GROUP_APPOINTMENT")!,
  interested: Deno.env.get("MAILERLITE_GROUP_INTERESTED")!,
  callback_requested: Deno.env.get("MAILERLITE_GROUP_CALLBACK")!,
  not_interested: Deno.env.get("MAILERLITE_GROUP_NOT_INTERESTED")!,
};

const headers = {
  "Authorization": `Bearer ${MAILERLITE_API_KEY}`,
  "Content-Type": "application/json",
  "Accept": "application/json",
};

async function addSubscriberAfterCall(params: {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  disposition: string;
}) {
  const { email, firstName, lastName, phone, disposition } = params;

  // 1. Upsert subscriber
  const upsertRes = await fetch(`${MAILERLITE_BASE}/subscribers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      fields: {
        ...(firstName && { name: firstName }),
        ...(lastName && { last_name: lastName }),
        ...(phone && { phone }),
        last_call_disposition: disposition,
        last_call_at: new Date().toISOString(),
      },
      status: "active",
    }),
  });

  if (!upsertRes.ok) {
    throw new Error(`MailerLite upsert failed: ${upsertRes.status}`);
  }

  const { data: subscriber } = await upsertRes.json();

  // 2. Assign to disposition group if mapped
  const groupId = DISPOSITION_GROUPS[disposition];
  if (groupId) {
    const groupRes = await fetch(
      `${MAILERLITE_BASE}/subscribers/${subscriber.id}/assign-subscriber/${groupId}`,
      { method: "POST", headers }
    );
    if (!groupRes.ok) {
      console.error(`MailerLite group assign failed: ${groupRes.status}`);
    }
  }

  return subscriber;
}
```

### Look up subscriber before call (check opt-out status)

```typescript
async function getSubscriberByEmail(email: string) {
  const res = await fetch(
    `${MAILERLITE_BASE}/subscribers/${encodeURIComponent(email)}`,
    { headers }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`MailerLite lookup failed: ${res.status}`);

  const { data } = await res.json();

  // Check if unsubscribed
  if (data.status === "unsubscribed") {
    return { ...data, optedOut: true };
  }

  return { ...data, optedOut: false };
}
```

## Gotchas & Rate Limits

- **Email is the primary key** — MailerLite has no phone-based lookup. If you only have a phone number from a call, you cannot find the existing subscriber. Collect email during the call or cross-reference from your CRM first.
- **Custom fields must exist first**: `last_call_disposition` and `last_call_at` must be created in MailerLite → Subscribers → Fields before you can write to them. Creating a subscriber with an unknown field silently drops that field.
- **`groups` on POST /subscribers replaces all groups**, not appends. If you want to add to a specific group without disturbing existing group memberships, use the separate `/assign-subscriber/{group_id}` endpoint instead.
- **Rate limit**: 120 requests/minute. For bulk post-call processing, add a small delay between requests or batch using the import endpoint (`POST /subscribers/import`).
- **Status values**: `active`, `unsubscribed`, `bounced`, `junk`, `unconfirmed`. Never send to `unsubscribed` — MailerLite will block it and may flag your account.
- **Double opt-in**: If your account has double opt-in enabled, new subscribers will be `unconfirmed` until they click the confirmation email. You can bypass with `resubscribe: true` only for previously confirmed subscribers.
- **No native SMS** — MailerLite is email-only. For SMS follow-up after calls, pair with Twilio or a dedicated SMS provider.
