# Google Calendar

> **Use in Yappr context**: Check availability before offering time slots on a call, create calendar events when appointments are booked, and send invites to both the sales rep and the customer.

## Authentication

**Recommended: Service Account** (server-side, no user consent flow)

1. GCP Console → IAM & Admin → Service Accounts → Create
2. Download JSON key file
3. Share the calendar with the service account email (`*.gserviceaccount.com`) with "Make changes to events" permission
4. Generate an access token before each API call:

```typescript
import { GoogleAuth } from "npm:google-auth-library";

const auth = new GoogleAuth({
  credentials: JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!),
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
});
const client = await auth.getClient();
const token = await client.getAccessToken(); // token.token
```

Or exchange the service account JWT manually using the `google-auth-library` npm package.

## Base URL

```
https://www.googleapis.com/calendar/v3
```

## Key Endpoints

### Check Free/Busy
**POST /freeBusy**

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request:**
```json
{
  "timeMin": "2026-04-14T00:00:00Z",
  "timeMax": "2026-04-18T23:59:59Z",
  "timeZone": "Asia/Jerusalem",
  "items": [
    { "id": "your-calendar@gmail.com" }
  ]
}
```

**Response:**
```json
{
  "kind": "calendar#freeBusy",
  "timeMin": "2026-04-14T00:00:00Z",
  "timeMax": "2026-04-18T23:59:59Z",
  "calendars": {
    "your-calendar@gmail.com": {
      "busy": [
        {
          "start": "2026-04-14T08:00:00Z",
          "end": "2026-04-14T09:00:00Z"
        },
        {
          "start": "2026-04-15T10:00:00Z",
          "end": "2026-04-15T11:00:00Z"
        }
      ]
    }
  }
}
```

Use `busy` intervals to find free slots by exclusion.

---

### Create Event
**POST /calendars/{calendarId}/events**

**Request:**
```json
{
  "summary": "Demo with David Cohen",
  "description": "Post-call appointment. Customer interested in Business plan.\n\nBooked via Yappr AI voice call.",
  "start": {
    "dateTime": "2026-04-15T10:00:00+03:00",
    "timeZone": "Asia/Jerusalem"
  },
  "end": {
    "dateTime": "2026-04-15T10:30:00+03:00",
    "timeZone": "Asia/Jerusalem"
  },
  "attendees": [
    { "email": "david@example.com", "displayName": "David Cohen" },
    { "email": "sales@yourcompany.com" }
  ],
  "reminders": {
    "useDefault": false,
    "overrides": [
      { "method": "email", "minutes": 60 },
      { "method": "popup", "minutes": 15 }
    ]
  },
  "conferenceData": {
    "createRequest": {
      "requestId": "unique-id-123",
      "conferenceSolutionKey": { "type": "hangoutsMeet" }
    }
  }
}
```

**Query params:** `?conferenceDataVersion=1` (required to generate Google Meet link)

**Response:**
```json
{
  "id": "abc123def456",
  "status": "confirmed",
  "htmlLink": "https://calendar.google.com/calendar/event?eid=...",
  "summary": "Demo with David Cohen",
  "start": { "dateTime": "2026-04-15T10:00:00+03:00" },
  "end": { "dateTime": "2026-04-15T10:30:00+03:00" },
  "conferenceData": {
    "entryPoints": [
      {
        "entryPointType": "video",
        "uri": "https://meet.google.com/abc-defg-hij",
        "label": "meet.google.com/abc-defg-hij"
      }
    ]
  }
}
```

---

### Update Event
**PATCH /calendars/{calendarId}/events/{eventId}**

**Request (partial update):**
```json
{
  "summary": "Rescheduled Demo with David Cohen",
  "start": {
    "dateTime": "2026-04-17T11:00:00+03:00",
    "timeZone": "Asia/Jerusalem"
  },
  "end": {
    "dateTime": "2026-04-17T11:30:00+03:00",
    "timeZone": "Asia/Jerusalem"
  }
}
```

---

### Delete Event
**DELETE /calendars/{calendarId}/events/{eventId}**

**Query params:** `?sendUpdates=all` (sends cancellation emails to attendees)

Response: `204 No Content`

---

### List Events
**GET /calendars/{calendarId}/events?timeMin={iso}&timeMax={iso}&orderBy=startTime&singleEvents=true**

**Response:**
```json
{
  "items": [
    {
      "id": "abc123",
      "summary": "Demo with David Cohen",
      "start": { "dateTime": "2026-04-15T10:00:00+03:00" },
      "end": { "dateTime": "2026-04-15T10:30:00+03:00" },
      "attendees": [{ "email": "david@example.com", "responseStatus": "accepted" }]
    }
  ]
}
```

`singleEvents=true` expands recurring events into individual instances.

## Common Patterns

### Find free slot and create event
```typescript
import { GoogleAuth } from "npm:google-auth-library";

const auth = new GoogleAuth({
  credentials: JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!),
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
});
const { token } = await (await auth.getClient()).getAccessToken();
const calendarId = "primary"; // or specific calendar email

// 1. Check free/busy
const now = new Date();
const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

const freebusy = await fetch(
  "https://www.googleapis.com/calendar/v3/freeBusy",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: calendarId }],
    }),
  }
).then(r => r.json());

const busySlots = freebusy.calendars[calendarId].busy;

// 2. Find first available 30-min slot during business hours (09:00-17:00 Israel)
// ... (slot-finding logic) ...

// 3. Create event
const event = await fetch(
  `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: `Demo with ${callerName}`,
      start: { dateTime: slotStart, timeZone: "Asia/Jerusalem" },
      end: { dateTime: slotEnd, timeZone: "Asia/Jerusalem" },
      attendees: [{ email: callerEmail }],
    }),
  }
).then(r => r.json());

const meetLink = event.conferenceData?.entryPoints?.[0]?.uri;
```

## Gotchas & Rate Limits

- **Service account vs OAuth2**: Service accounts require sharing the calendar with the SA email. Without this share, all operations return 404.
- **Calendar ID**: `"primary"` only works for the authenticated user. For service accounts, use the actual calendar email address.
- **Time zones**: Always specify `timeZone` in event start/end. Israel uses `Asia/Jerusalem` (UTC+2/+3 DST). Using UTC without conversion will create events at the wrong time.
- **Rate limits**: 1,000,000 requests/day, 500 requests/100 seconds per user. Very generous.
- **`sendUpdates` on delete**: `?sendUpdates=all` sends attendees a cancellation email. `?sendUpdates=none` silently deletes.
- **Google Meet creation**: Requires `?conferenceDataVersion=1` query param AND `conferenceData.createRequest` in the body. The `requestId` must be unique per request.
- **Access token expiry**: Service account tokens expire in 1 hour. Re-generate before each edge function invocation.
