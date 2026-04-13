# ConvertKit (Kit)

> **Use in Yappr context**: Subscribe a caller to an email sequence and apply tags based on call disposition to trigger automated nurture flows.

## Authentication

ConvertKit uses an `api_key` query parameter on every request (not a header). Get yours from Account → Settings → Advanced → API Key.

For write operations that modify subscriber data on behalf of a creator account, some endpoints also accept an `api_secret` — but for agent automation, `api_key` is sufficient for the endpoints below.

## Base URL

```
https://api.convertkit.com/v3
```

## Key Endpoints

### GET /subscribers?email_address={email} — Find subscriber by email

```
GET /subscribers?api_key=YOUR_KEY&email_address=david%40example.com
```

Response:

```json
{
  "total_subscribers": 1,
  "page": 1,
  "total_pages": 1,
  "subscribers": [
    {
      "id": 1234567,
      "first_name": "David",
      "email_address": "david@example.com",
      "state": "active",
      "fields": {
        "phone": "+972501234567",
        "last_call_disposition": "appointment_set"
      }
    }
  ]
}
```

Returns `subscribers: []` if not found.

### POST /forms/{form_id}/subscribe — Subscribe to a form (creates if not exists)

```json
{
  "api_key": "YOUR_KEY",
  "email": "david@example.com",
  "first_name": "David",
  "fields": {
    "phone": "+972501234567",
    "last_call_disposition": "appointment_set",
    "last_call_at": "2024-02-15T10:30:00Z"
  },
  "tags": [12345]
}
```

This is the primary upsert endpoint — it creates the subscriber if they don't exist, or updates their fields if they do. `form_id` is found in ConvertKit → Forms → select form → URL (e.g. `app.convertkit.com/forms/12345`).

Response:

```json
{
  "subscription": {
    "id": 9876543,
    "state": "active",
    "subscriber": {
      "id": 1234567,
      "email_address": "david@example.com"
    }
  }
}
```

### POST /tags/{tag_id}/subscribe — Add tag to subscriber

```json
{
  "api_key": "YOUR_KEY",
  "email": "david@example.com"
}
```

Response: same subscription object as above. Creates the subscriber if they don't exist (with just email + tag).

### DELETE /subscribers/{subscriber_id}/tags/{tag_id} — Remove tag

```
DELETE /subscribers/1234567/tags/12345?api_key=YOUR_KEY
```

Response: `200 OK`.

### GET /tags — List all tags

```
GET /tags?api_key=YOUR_KEY
```

Response:

```json
{
  "tags": [
    { "id": 11111, "name": "appointment-set", "created_at": "..." },
    { "id": 22222, "name": "interested", "created_at": "..." },
    { "id": 33333, "name": "callback-requested", "created_at": "..." },
    { "id": 44444, "name": "not-interested", "created_at": "..." }
  ]
}
```

Cache tag IDs — they are stable.

### PUT /subscribers/{subscriber_id} — Update subscriber fields

```json
{
  "api_key": "YOUR_KEY",
  "fields": {
    "last_call_disposition": "appointment_set",
    "last_call_at": "2024-02-15T10:30:00Z"
  }
}
```

Requires knowing the subscriber ID first. Use GET /subscribers to look up.

### GET /sequences — List all sequences

```
GET /sequences?api_key=YOUR_KEY
```

Returns all automation sequences (drip campaigns). Use to find the sequence ID to enroll a subscriber into.

### POST /sequences/{sequence_id}/subscribe — Enroll in a sequence

```json
{
  "api_key": "YOUR_KEY",
  "email": "david@example.com"
}
```

## Common Patterns

### Post-call: subscribe and tag based on disposition

```typescript
const CK_API_KEY = Deno.env.get("CONVERTKIT_API_KEY")!;
const CK_FORM_ID = Deno.env.get("CONVERTKIT_FORM_ID")!;
const CK_BASE = "https://api.convertkit.com/v3";

// Pre-map disposition names to tag IDs from GET /tags
const DISPOSITION_TAG_IDS: Record<string, number> = {
  appointment_set: parseInt(Deno.env.get("CK_TAG_APPOINTMENT")!),
  interested: parseInt(Deno.env.get("CK_TAG_INTERESTED")!),
  callback_requested: parseInt(Deno.env.get("CK_TAG_CALLBACK")!),
  not_interested: parseInt(Deno.env.get("CK_TAG_NOT_INTERESTED")!),
};

async function subscribeCallerToConvertKit(params: {
  email: string;
  firstName?: string;
  phone?: string;
  disposition: string;
}) {
  const { email, firstName, phone, disposition } = params;

  // 1. Subscribe to form (upserts subscriber, sets custom fields)
  const subscribeRes = await fetch(`${CK_BASE}/forms/${CK_FORM_ID}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: CK_API_KEY,
      email,
      ...(firstName && { first_name: firstName }),
      fields: {
        ...(phone && { phone }),
        last_call_disposition: disposition,
        last_call_at: new Date().toISOString(),
      },
    }),
  });

  if (!subscribeRes.ok) {
    throw new Error(`ConvertKit subscribe failed: ${subscribeRes.status}`);
  }

  // 2. Apply disposition tag (triggers automations)
  const tagId = DISPOSITION_TAG_IDS[disposition];
  if (tagId) {
    const tagRes = await fetch(`${CK_BASE}/tags/${tagId}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: CK_API_KEY, email }),
    });

    if (!tagRes.ok) {
      console.error(`ConvertKit tag apply failed: ${tagRes.status}`);
    }
  }
}
```

### Enroll in post-call nurture sequence

```typescript
async function enrollInSequence(email: string, sequenceId: string) {
  const res = await fetch(`${CK_BASE}/sequences/${sequenceId}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: CK_API_KEY, email }),
  });

  if (!res.ok) {
    throw new Error(`ConvertKit sequence enroll failed: ${res.status}`);
  }
}
```

## Gotchas & Rate Limits

- **Email-primary, not phone-primary**: ConvertKit has no phone number lookup. If a call ends without capturing an email, you cannot add the caller. For phone-first flows, collect the email during the call or use a CRM as the source of truth and sync email to ConvertKit post-call.
- **Custom fields must be created first**: `phone`, `last_call_disposition`, `last_call_at` must exist in ConvertKit → Subscribers → Custom fields before you can write to them. Writing to unknown fields silently ignores those values.
- **`api_key` in body, not header**: Most modern APIs use header auth — ConvertKit still uses a query param or request body field. Do not accidentally log request bodies that contain `api_key`.
- **Tag-based automations**: The main value of ConvertKit for voice AI is triggering automations via tags. Set up a ConvertKit Automation: "When subscriber is tagged with 'appointment-set' → send sequence X". The `POST /tags/{id}/subscribe` call fires this instantly.
- **No bulk tag endpoint**: You must call POST /tags/{id}/subscribe once per subscriber. For post-call processing this is fine since it's one subscriber at a time.
- **Rate limits**: ConvertKit does not publish hard rate limits but recommends staying under 10 requests/second. In practice, bursts of 5–10 requests/second are reliable.
- **Subscriber state**: `active`, `inactive`, `bounced`, `complained`, `cancelled`. Only `active` subscribers receive emails. If a returned subscriber has `state: "unsubscribed"` or `cancelled`, do not attempt to re-subscribe without explicit consent.
- **Rebranding**: ConvertKit has rebranded to "Kit" (kit.com) but the API URL and credentials remain the same as of early 2025.
