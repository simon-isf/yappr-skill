# Setmore

> **Use in Yappr context**: Book appointments and check available slots for small businesses using Setmore's free scheduling platform — the agent can query open slots and create confirmed bookings without sending the customer a link.

## Authentication

Setmore uses OAuth2. The token endpoint issues both an access token and a refresh token.

**Step 1 — Get your app credentials:**
- Register your app at [developer.setmore.com](https://developer.setmore.com)
- Or, for single-business integrations, generate a refresh token directly from: Setmore account → Apps & Integrations → API & Webhooks

**Step 2 — Exchange for access token:**
```
POST https://developer.setmore.com/api/v1/o/oauth2/token
```
**Request:**
```json
{
  "code": "YOUR_AUTHORIZATION_CODE",
  "grant_type": "authorization_code"
}
```

**Or — refresh an existing token:**
```
POST https://developer.setmore.com/api/v1/o/oauth2/token
```
**Request:**
```json
{
  "refresh_token": "YOUR_REFRESH_TOKEN",
  "grant_type": "refresh_token"
}
```

**Response:**
```json
{
  "data": {
    "token": {
      "access_token": "eyJh...",
      "refresh_token": "eyJr...",
      "token_type": "Bearer"
    }
  },
  "status": true,
  "msg": "success"
}
```

Pass `access_token` as `Authorization: Bearer {token}` on all API calls. Access tokens are short-lived (~1 hour) — implement refresh logic using the `refresh_token`.

## Base URL

```
https://developer.setmore.com/api/v1
```

## Key Endpoints

### List Services
**GET /bookingpage/services**

**Headers:**
```
Authorization: Bearer eyJh...
Content-Type: application/json
```

**Response:**
```json
{
  "data": {
    "services": [
      {
        "key": "s_0123456789abcdef",
        "service_name": "Haircut",
        "duration": 45,
        "cost": 80,
        "description": "Full haircut and styling"
      },
      {
        "key": "s_fedcba9876543210",
        "service_name": "Beard Trim",
        "duration": 20,
        "cost": 40,
        "description": ""
      }
    ]
  },
  "status": true
}
```

Store `key` values — they are required for slot queries and bookings.

---

### List Staff Members
**GET /bookingpage/staffmembers**

**Response:**
```json
{
  "data": {
    "staffmembers": [
      {
        "key": "staff_abc123",
        "first_name": "Moshe",
        "last_name": "Shapira",
        "email": "moshe@salon.com",
        "image": "https://..."
      }
    ]
  },
  "status": true
}
```

Store `key` values for slot queries.

---

### Get Available Slots
**GET /bookingpage/slots?staff_key={key}&service_key={key}&selected_date={YYYY-MM-DD}**

**Request URL example:**
```
GET /bookingpage/slots?staff_key=staff_abc123&service_key=s_0123456789abcdef&selected_date=2026-04-14
```

**Response:**
```json
{
  "data": {
    "slots": [
      "09:00",
      "09:45",
      "11:30",
      "14:00",
      "15:30"
    ],
    "time_format": "12"
  },
  "status": true
}
```

Returns an array of time strings in `HH:MM` format (24-hour). An empty `slots` array means no availability for that date.

---

### Create Appointment
**POST /bookingpage/appointment/create**

**Request:**
```json
{
  "staff_key": "staff_abc123",
  "service_key": "s_0123456789abcdef",
  "customer": {
    "first_name": "David",
    "last_name": "Cohen",
    "email": "david@example.com",
    "phone": "+972501234567",
    "comments": "Booked via Yappr voice agent"
  },
  "start_time": "2026-04-14T09:00:00",
  "end_time": "2026-04-14T09:45:00",
  "label": "Booking via voice agent"
}
```

**Response:**
```json
{
  "data": {
    "appointment": {
      "key": "appt_xyz789",
      "service_name": "Haircut",
      "start_time": "2026-04-14T09:00:00",
      "end_time": "2026-04-14T09:45:00",
      "customer": {
        "key": "cust_def456",
        "first_name": "David",
        "last_name": "Cohen"
      },
      "staff": {
        "key": "staff_abc123",
        "first_name": "Moshe"
      }
    }
  },
  "status": true,
  "msg": "Appointment created successfully"
}
```

Store `appointment.key` for cancellations.

---

### Cancel Appointment
**DELETE /bookingpage/appointment/delete?appointment_key={key}**

**Response:**
```json
{
  "data": {},
  "status": true,
  "msg": "Appointment deleted successfully"
}
```

---

### Get Appointment Details
**GET /bookingpage/appointment?appointment_key={key}**

**Response:** Full appointment object as above.

## Common Patterns

### Pre-fetch availability for voice agent
```typescript
// Deno snippet: fetch slots for next 3 days, inject as {{availableSlots}} variable
// This is the KEY pattern — pre-fetch to avoid tool calls during call,
// use bookAppointment tool as safeguard only when caller confirms a slot

const accessToken = Deno.env.get("SETMORE_ACCESS_TOKEN");
const staffKey = Deno.env.get("SETMORE_STAFF_KEY");
const serviceKey = Deno.env.get("SETMORE_SERVICE_KEY");
const serviceDurationMin = Number(Deno.env.get("SETMORE_SERVICE_DURATION_MIN") ?? "45");
const base = "https://developer.setmore.com/api/v1";

const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

const slots: string[] = [];

for (let i = 0; i < 3; i++) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  const dateStr = d.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const res = await fetch(
    `${base}/bookingpage/slots?staff_key=${staffKey}&service_key=${serviceKey}&selected_date=${dateStr}`,
    { headers }
  );
  const data = await res.json();

  if (!data.status || !data.data.slots.length) continue;

  // Take up to 3 slots per day, format for voice
  for (const timeStr of data.data.slots.slice(0, 3)) {
    const [hour, minute] = timeStr.split(":").map(Number);
    const dt = new Date(d);
    dt.setHours(hour, minute, 0, 0);

    slots.push(
      dt.toLocaleString("en-IL", {
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jerusalem",
      })
    );
  }
}

const availableSlots = slots.join(", ");
// Inject as {{availableSlots}} → "Monday 9:00 AM, Monday 9:45 AM, Tuesday 11:30 AM"
```

### Book from tool call
```typescript
// Deno snippet: handle bookAppointment tool webhook from Yappr agent
// Tool definition should expose: date (YYYY-MM-DD), time (HH:MM), callerName, callerPhone

const body = await req.json();
const { date, time, callerName, callerPhone } = body.tool_call.arguments;

const accessToken = Deno.env.get("SETMORE_ACCESS_TOKEN");
const staffKey = Deno.env.get("SETMORE_STAFF_KEY");
const serviceKey = Deno.env.get("SETMORE_SERVICE_KEY");
const serviceDurationMin = Number(Deno.env.get("SETMORE_SERVICE_DURATION_MIN") ?? "45");
const base = "https://developer.setmore.com/api/v1";

const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

// Build ISO datetimes
const startIso = `${date}T${time}:00`;
const [h, m] = time.split(":").map(Number);
const endDate = new Date(`${date}T${time}:00`);
endDate.setMinutes(endDate.getMinutes() + serviceDurationMin);
const endIso = endDate.toISOString().replace("Z", "").slice(0, 19);

const [firstName, ...rest] = callerName.split(" ");

const res = await fetch(`${base}/bookingpage/appointment/create`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    staff_key: staffKey,
    service_key: serviceKey,
    customer: {
      first_name: firstName,
      last_name: rest.join(" ") || "—",
      phone: callerPhone,
      comments: "Booked via Yappr voice agent",
    },
    start_time: startIso,
    end_time: endIso,
  }),
}).then(r => r.json());

if (!res.status) {
  return new Response(
    JSON.stringify({ result: `Booking failed: ${res.msg}` }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

const appt = res.data.appointment;
return new Response(
  JSON.stringify({
    result: `Appointment confirmed for ${appt.start_time}. ID: ${appt.key}`,
  }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);
```

## Gotchas & Rate Limits

- **Refresh token management**: Access tokens expire in ~1 hour. Store the `refresh_token` in Supabase secrets and run a background job (or lazy refresh on 401) to keep the `access_token` current. If the refresh token also expires, the business owner must re-authorize.
- **`staff_key` is required for slot queries**: There is no "any available staff" query. If the business has multiple staff, query each staff member and merge results — or pick the business's default/primary staff member.
- **`end_time` must be computed manually**: Setmore does not calculate end time from service duration. Compute it as `start_time + service.duration` before sending the booking request.
- **Date format in slot query is `YYYY-MM-DD`**: But `start_time` and `end_time` in the booking request must be full ISO datetime strings (`2026-04-14T09:00:00`). Do not include the timezone offset or trailing `Z`.
- **`status: false` on error**: Setmore always returns HTTP 200 even on errors. Check `response.status === true` before treating a response as successful. Error details are in `response.msg`.
- **Free plan limitations**: Setmore's free plan supports 1 staff member. Multi-staff queries are a paid feature. Most small businesses using Setmore are on the free plan — assume one staff key.
- **No webhook support by default**: Setmore does not provide outbound webhooks on free plans. For booking event notifications, poll `/bookingpage/appointment` periodically or upgrade to a paid plan that includes webhook support.
- **Rate limits**: Not officially published. Recommended: cache slot data with a 2-minute TTL, stay under 30 requests/minute.
