# Zoom

> **Use in Yappr context**: After a successful call where the caller agrees to a demo or meeting, create a Zoom meeting and send the join link via WhatsApp as the appointment confirmation.

## Authentication

**Server-to-Server OAuth** (recommended — no per-user login required)

1. Go to [Zoom Marketplace](https://marketplace.zoom.us/) → Develop → Build App → **Server-to-Server OAuth**
2. Note your **Account ID**, **Client ID**, and **Client Secret**
3. Add required scopes: `meeting:write:meeting`, `meeting:read:meeting`, `user:read:user`
4. Activate the app

**Token request:**
```
POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id={accountId}
Authorization: Basic {base64(clientId:clientSecret)}
Content-Type: application/x-www-form-urlencoded
```

**Token response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3599
}
```

Tokens are valid for 1 hour. Re-fetch before each edge function invocation.

## Base URL

```
https://api.zoom.us/v2
```

## Key Endpoints

### Create Meeting
**POST /users/{userId}/meetings**

`userId` can be `me` (for the authenticated service account) or a specific user email.

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request:**
```json
{
  "topic": "Consultation with Yael Cohen",
  "type": 2,
  "start_time": "2026-04-15T14:00:00",
  "duration": 30,
  "timezone": "Asia/Jerusalem",
  "agenda": "Follow-up meeting booked via Yappr AI voice call",
  "settings": {
    "join_before_host": true,
    "waiting_room": false,
    "host_video": true,
    "participant_video": true,
    "mute_upon_entry": false,
    "approval_type": 2
  }
}
```

**Response:**
```json
{
  "id": 87654321098,
  "uuid": "abc123==",
  "host_id": "user_id_here",
  "topic": "Consultation with Yael Cohen",
  "type": 2,
  "status": "waiting",
  "start_time": "2026-04-15T14:00:00Z",
  "duration": 30,
  "timezone": "Asia/Jerusalem",
  "join_url": "https://zoom.us/j/87654321098?pwd=abc123",
  "start_url": "https://zoom.us/s/87654321098?zak=...",
  "password": "abc123"
}
```

---

### Get Meeting Details
**GET /meetings/{meetingId}**

**Response:**
```json
{
  "id": 87654321098,
  "topic": "Consultation with Yael Cohen",
  "status": "waiting",
  "start_time": "2026-04-15T14:00:00Z",
  "duration": 30,
  "timezone": "Asia/Jerusalem",
  "join_url": "https://zoom.us/j/87654321098?pwd=abc123",
  "settings": {
    "join_before_host": true,
    "waiting_room": false
  }
}
```

---

### Update Meeting
**PATCH /meetings/{meetingId}**

**Request (partial update):**
```json
{
  "topic": "Rescheduled Consultation with Yael Cohen",
  "start_time": "2026-04-17T11:00:00",
  "duration": 45,
  "timezone": "Asia/Jerusalem"
}
```

Response: `204 No Content`

---

### Delete Meeting
**DELETE /meetings/{meetingId}**

**Query params:** `?schedule_for_reminder=true` (sends cancellation email to host)

Response: `204 No Content`

---

### List User Meetings
**GET /users/{userId}/meetings?type=scheduled&page_size=30**

**Response:**
```json
{
  "page_count": 1,
  "page_size": 30,
  "total_records": 3,
  "meetings": [
    {
      "id": 87654321098,
      "topic": "Consultation with Yael Cohen",
      "type": 2,
      "start_time": "2026-04-15T14:00:00Z",
      "duration": 30,
      "join_url": "https://zoom.us/j/87654321098"
    }
  ]
}
```

---

### Get Host User Info
**GET /users/me**

**Response:**
```json
{
  "id": "user_id_abc123",
  "email": "host@yourcompany.com",
  "first_name": "Sales",
  "last_name": "Team",
  "type": 2,
  "timezone": "Asia/Jerusalem"
}
```

Use this to get the `userId` needed for creating meetings under a specific host.

## Common Patterns

### Post-call workflow — create meeting and send join link
```typescript
// Get access token
async function getZoomToken(): Promise<string> {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID")!;
  const clientId = Deno.env.get("ZOOM_CLIENT_ID")!;
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET")!;

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  const data = await res.json();
  return data.access_token;
}

// Create meeting after call disposition = "Appointment Set"
const token = await getZoomToken();

const meetingRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    topic: `Consultation with ${callerName}`,
    type: 2,
    start_time: appointmentDateTime, // ISO 8601, e.g. "2026-04-15T14:00:00"
    duration: 30,
    timezone: "Asia/Jerusalem",
    settings: {
      join_before_host: true,
      waiting_room: false,
    },
  }),
});

const meeting = await meetingRes.json();
const joinUrl = meeting.join_url;

// Send join_url via WhatsApp (GreenAPI / 360dialog)
await sendWhatsApp({
  to: callerPhone,
  message: `שלום ${callerName}, הפגישה שלנו נקבעה ל-${formattedDate}.\nקישור להצטרפות: ${joinUrl}`,
});

// Optionally store join_url in calendar event description or CRM
```

## Gotchas & Rate Limits

- **Meeting type 2 is "scheduled"** — this is almost always what you want. Type 1 = instant (starts immediately), type 8 = recurring fixed time.
- **`timezone: "Asia/Jerusalem"`** is the correct value for Israel — covers both UTC+2 (winter) and UTC+3 (summer/DST). Zoom handles DST automatically.
- **`userId: "me"`** refers to the service account user (the app's owner). To create meetings under a specific host's account, first call `GET /users` to list users, or hardcode the host's email as `userId`.
- **`join_before_host: true`** is critical — without it, callers are blocked in the waiting room until the host joins. Most B2B/B2C appointment flows want guests to be able to enter the room.
- **`start_url` is private** — this is the host link and includes a `zak` token. Never send it to the caller. Only send `join_url`.
- **Rate limits**: 100 create-meeting requests/day/user on Basic (free) plan. Pro plan: higher (varies). For production volume, use Pro or Business plan.
- **Token content-type**: The token endpoint requires `Content-Type: application/x-www-form-urlencoded` — JSON body will return `4700` error.
- **`start_time` format**: Use `YYYY-MM-DDTHH:mm:ss` without timezone offset in the body — the `timezone` field handles it. ISO with offset may cause duplicate offset application.
- **Scopes**: Ensure your Server-to-Server OAuth app has `meeting:write:meeting` scope activated. Missing scopes return a `4711` error.
