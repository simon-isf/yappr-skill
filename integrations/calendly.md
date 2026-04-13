# Calendly

> **Use in Yappr context**: Generate one-time booking links during a call so the agent can share a URL for the customer to schedule an appointment, and receive webhook events when bookings are made or cancelled.

## Authentication

- Generate a Personal Access Token: Calendly account → Integrations → API & Webhooks → Personal Access Tokens
- Pass as `Authorization: Bearer <token>` header

## Base URL

```
https://api.calendly.com
```

## Key Endpoints

### Get Current User
**GET /users/me**

**Headers:**
```
Authorization: Bearer eyJh...
Content-Type: application/json
```

**Response:**
```json
{
  "resource": {
    "uri": "https://api.calendly.com/users/ABCDE12345",
    "name": "Your Name",
    "email": "you@example.com",
    "current_organization": "https://api.calendly.com/organizations/ORGABC123"
  }
}
```

Store `resource.uri` — needed as the `owner` parameter in many other calls.

---

### List Event Types
**GET /event_types?user={user_uri}&active=true**

**Request URL example:**
```
GET /event_types?user=https%3A%2F%2Fapi.calendly.com%2Fusers%2FABCDE12345&active=true
```

**Response:**
```json
{
  "collection": [
    {
      "uri": "https://api.calendly.com/event_types/EVTYPE123",
      "name": "30 Minute Meeting",
      "scheduling_url": "https://calendly.com/yourname/30min",
      "duration": 30,
      "active": true,
      "slug": "30min"
    }
  ]
}
```

The `scheduling_url` can be shared directly. Use `uri` for creating one-time links.

---

### Create One-Time Scheduling Link
**POST /one_off_event_types**

Creates a single-use scheduling link tied to a specific event type.

**Request:**
```json
{
  "name": "Meeting with David Cohen",
  "max_event_count": 1,
  "owner": "https://api.calendly.com/users/ABCDE12345",
  "owner_type": "users"
}
```

**Response:**
```json
{
  "resource": {
    "booking_url": "https://calendly.com/d/abc-def-ghi/meeting-with-david-cohen",
    "owner": "https://api.calendly.com/users/ABCDE12345",
    "max_event_count": 1,
    "status": "pending"
  }
}
```

Share `booking_url` with the customer via WhatsApp or SMS.

---

### Get Available Times
**GET /event_type_available_times?event_type={event_type_uri}&start_time={iso}&end_time={iso}**

**Request URL example:**
```
GET /event_type_available_times?event_type=https%3A%2F%2Fapi.calendly.com%2Fevent_types%2FEVTYPE123&start_time=2026-04-14T00%3A00%3A00Z&end_time=2026-04-18T00%3A00%3A00Z
```

**Response:**
```json
{
  "collection": [
    {
      "status": "available",
      "invitees_remaining": 1,
      "start_time": "2026-04-14T09:00:00Z",
      "scheduling_url": "https://calendly.com/yourname/30min?month=2026-04&date=2026-04-14"
    }
  ]
}
```

Use this to tell the agent what time slots are available before offering them to a customer.

---

### List Scheduled Events
**GET /scheduled_events?user={user_uri}&status=active&min_start_time={iso}&max_start_time={iso}**

**Response:**
```json
{
  "collection": [
    {
      "uri": "https://api.calendly.com/scheduled_events/EVNT123",
      "name": "30 Minute Meeting",
      "status": "active",
      "start_time": "2026-04-14T10:00:00Z",
      "end_time": "2026-04-14T10:30:00Z",
      "event_type": "https://api.calendly.com/event_types/EVTYPE123"
    }
  ],
  "pagination": {
    "count": 1,
    "next_page": null
  }
}
```

---

### Get Event Invitees
**GET /scheduled_events/{event_uuid}/invitees**

**Response:**
```json
{
  "collection": [
    {
      "email": "david@example.com",
      "name": "David Cohen",
      "status": "active",
      "questions_and_answers": [
        { "question": "Phone Number", "answer": "+972501234567" }
      ]
    }
  ]
}
```

---

### Create Webhook Subscription
**POST /webhook_subscriptions**

**Request:**
```json
{
  "url": "https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/calendly-webhook",
  "events": ["invitee.created", "invitee.canceled"],
  "organization": "https://api.calendly.com/organizations/ORGABC123",
  "scope": "organization"
}
```

**Response:**
```json
{
  "resource": {
    "uri": "https://api.calendly.com/webhook_subscriptions/HOOK123",
    "state": "active",
    "events": ["invitee.created", "invitee.canceled"]
  }
}
```

## Common Patterns

### Get booking link to share via WhatsApp during call
```typescript
// 1. Get user URI (do once, cache it)
const me = await fetch("https://api.calendly.com/users/me", {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json());

// 2. Get event types (cache these too)
const eventTypes = await fetch(
  `https://api.calendly.com/event_types?user=${encodeURIComponent(me.resource.uri)}&active=true`,
  { headers: { Authorization: `Bearer ${token}` } }
).then(r => r.json());

const demoEventType = eventTypes.collection.find(e => e.slug === "demo");

// 3. Share scheduling URL (or create one-time link)
const bookingUrl = demoEventType.scheduling_url;
// Send via Green API WhatsApp
```

### Handle booking webhook
```typescript
// Incoming POST from Calendly
const payload = await req.json();

if (payload.event === "invitee.created") {
  const invitee = payload.payload;
  const name = invitee.name;
  const email = invitee.email;
  const startTime = invitee.scheduled_event.start_time;
  const phone = invitee.questions_and_answers?.find(q => q.question === "Phone")?.answer;
  // Update CRM, send confirmation WhatsApp, etc.
}
```

## Gotchas & Rate Limits

- **No direct booking API**: Calendly doesn't let you create a booking programmatically on behalf of an invitee. You can only share URLs. For direct booking, use `cal-com.md` instead.
- **Rate limits**: 600 requests/minute for API v2. Use caching for event types and user URIs.
- **Webhook signature**: Calendly signs webhooks with `Calendly-Webhook-Signature` header (HMAC-SHA256). Always verify in production.
- **One-time links vs event type URL**: `one_off_event_types` links expire after `max_event_count` bookings. Event type URLs never expire.
- **URI encoding**: When passing URIs as query params (event_type, user, organization), always `encodeURIComponent()` them.
- **Organization scope vs user scope**: Webhooks can be scoped to the whole org or a single user. Use `organization` scope to capture all team bookings.
