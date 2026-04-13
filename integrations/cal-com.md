# Cal.com

> **Use in Yappr context**: Programmatically book appointments directly during or after a call without requiring the customer to click a link — the agent can check availability and create the booking on their behalf.

## Authentication

- Get API key: Cal.com → Settings → Developer → API Keys → Add
- Pass as query param: `?apiKey=<key>` on every request
- Or as header: `Authorization: Bearer <key>`

## Base URL

```
https://api.cal.com/v1
```

## Key Endpoints

### List Event Types
**GET /v1/event-types?apiKey={key}**

**Response:**
```json
{
  "event_types": [
    {
      "id": 12,
      "title": "30min Demo",
      "slug": "demo",
      "length": 30,
      "hidden": false,
      "description": "Quick product demo call"
    }
  ]
}
```

---

### Get Available Slots
**GET /v1/slots?eventTypeId={id}&startTime={iso}&endTime={iso}&timeZone=Asia/Jerusalem&apiKey={key}**

**Response:**
```json
{
  "slots": {
    "2026-04-14": [
      { "time": "2026-04-14T09:00:00.000Z" },
      { "time": "2026-04-14T09:30:00.000Z" },
      { "time": "2026-04-14T10:00:00.000Z" }
    ],
    "2026-04-15": [
      { "time": "2026-04-15T08:00:00.000Z" }
    ]
  }
}
```

Returns slots grouped by date. `time` values are UTC ISO strings.

---

### Create Booking
**POST /v1/bookings?apiKey={key}**

**Headers:**
```
Content-Type: application/json
```

**Request:**
```json
{
  "eventTypeId": 12,
  "start": "2026-04-14T09:00:00.000Z",
  "end": "2026-04-14T09:30:00.000Z",
  "timeZone": "Asia/Jerusalem",
  "language": "en",
  "responses": {
    "name": "David Cohen",
    "email": "david@example.com",
    "phone": "+972501234567",
    "notes": "Interested in the Business plan"
  },
  "metadata": {
    "source": "yappr-voice-call",
    "callId": "call_abc123"
  }
}
```

**Response:**
```json
{
  "id": 777,
  "uid": "abc123def456",
  "title": "30min Demo: David Cohen",
  "status": "ACCEPTED",
  "startTime": "2026-04-14T09:00:00.000Z",
  "endTime": "2026-04-14T09:30:00.000Z",
  "attendees": [
    {
      "name": "David Cohen",
      "email": "david@example.com",
      "timeZone": "Asia/Jerusalem"
    }
  ],
  "meetingUrl": "https://cal.com/meet/abc123def456"
}
```

`uid` is used for future reschedules/cancellations.

---

### Cancel Booking
**DELETE /v1/bookings/:id?apiKey={key}**

Or using query param:
```
DELETE /v1/bookings/777?apiKey=abc&allRemainingBookings=false
```

**Request body (optional):**
```json
{
  "cancellationReason": "Customer requested cancellation"
}
```

**Response:**
```json
{
  "message": "Booking successfully cancelled."
}
```

---

### Reschedule Booking
**PATCH /v1/bookings/:id?apiKey={key}**

**Request:**
```json
{
  "start": "2026-04-16T10:00:00.000Z",
  "end": "2026-04-16T10:30:00.000Z",
  "rescheduledReason": "Customer requested different time"
}
```

**Response:** Updated booking object.

---

### Get Booking by ID
**GET /v1/bookings/:id?apiKey={key}**

**Response:**
```json
{
  "id": 777,
  "uid": "abc123def456",
  "title": "30min Demo: David Cohen",
  "status": "ACCEPTED",
  "startTime": "2026-04-14T09:00:00.000Z",
  "attendees": [{ "email": "david@example.com", "name": "David Cohen" }]
}
```

---

### List Bookings
**GET /v1/bookings?apiKey={key}&status=upcoming&take=20**

---

### Webhook Setup (via Cal.com Dashboard)
Webhooks are configured in Cal.com → Settings → Developer → Webhooks.

**Trigger events:**
- `BOOKING_CREATED`
- `BOOKING_RESCHEDULED`
- `BOOKING_CANCELLED`
- `MEETING_STARTED`

**Payload example (BOOKING_CREATED):**
```json
{
  "triggerEvent": "BOOKING_CREATED",
  "payload": {
    "bookingId": 777,
    "uid": "abc123def456",
    "title": "30min Demo: David Cohen",
    "startTime": "2026-04-14T09:00:00Z",
    "organizer": { "name": "Your Name", "email": "you@cal.com" },
    "attendees": [{ "name": "David Cohen", "email": "david@example.com" }],
    "responses": { "phone": "+972501234567", "notes": "Interested in Business plan" }
  }
}
```

## Common Patterns

### Book appointment directly from call outcome
```typescript
const apiKey = Deno.env.get("CAL_COM_API_KEY");
const base = "https://api.cal.com/v1";

// 1. Get available slots for next 5 days
const now = new Date();
const endDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

const slots = await fetch(
  `${base}/slots?eventTypeId=${EVENT_TYPE_ID}&startTime=${now.toISOString()}&endTime=${endDate.toISOString()}&timeZone=Asia/Jerusalem&apiKey=${apiKey}`
).then(r => r.json());

// 2. Pick first available slot
const firstDate = Object.keys(slots.slots)[0];
const firstSlot = slots.slots[firstDate]?.[0]?.time;

if (!firstSlot) throw new Error("No available slots");

// 3. Create booking
const booking = await fetch(`${base}/bookings?apiKey=${apiKey}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    eventTypeId: EVENT_TYPE_ID,
    start: firstSlot,
    end: new Date(new Date(firstSlot).getTime() + 30 * 60 * 1000).toISOString(),
    timeZone: "Asia/Jerusalem",
    responses: {
      name: callerName,
      email: callerEmail,
      phone: callerPhone,
    },
    metadata: { callId },
  }),
}).then(r => r.json());

return booking.uid; // Store for future reschedule/cancel
```

## Gotchas & Rate Limits

- **Direct booking**: Unlike Calendly, Cal.com allows creating bookings via API without sending the customer to a URL. This is the primary advantage.
- **`responses` field**: Field names depend on your event type's custom fields. The defaults are `name`, `email`. Custom fields you add in the event type editor appear here by their identifier.
- **Time zone**: Always pass `timeZone` in both the slots request and the booking. Use `Asia/Jerusalem` for Israeli customers.
- **`end` time**: Must match the event type duration exactly. Compute as `start + duration_minutes`.
- **Rate limits**: Not officially published; ~100 req/min is safe.
- **Self-hosted**: If the customer uses self-hosted Cal.com, the base URL will be their own domain. Store as a credential.
- **Webhook verification**: Cal.com signs webhook payloads with `X-Cal-Signature-256` header (HMAC-SHA256 of the raw body using the webhook secret).
