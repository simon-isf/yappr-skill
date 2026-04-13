# Acuity Scheduling

> **Use in Yappr context**: Check real-time appointment availability and book slots on behalf of callers during a voice call — used widely by beauty salons, coaches, and therapists running on Squarespace Scheduling (formerly Acuity).

## Authentication

- Get credentials: Acuity account → Integrations → API → click "Show API credentials"
- You receive a `User ID` (numeric) and an `API Key` (alphanumeric string)
- Encode `{userId}:{apiKey}` in base64 and pass as `Authorization: Basic {base64}` header
- There is no OAuth2 flow — these are permanent credentials, treat them as secrets

## Base URL

```
https://acuityscheduling.com/api/v1
```

## Key Endpoints

### List Appointment Types
**GET /appointment-types**

**Headers:**
```
Authorization: Basic dXNlcl9pZDphcGlfa2V5
Content-Type: application/json
```

**Response:**
```json
[
  {
    "id": 1234567,
    "name": "Haircut – 45 min",
    "duration": 45,
    "price": "80.00",
    "category": "Hair Services",
    "description": "Full haircut and styling",
    "active": true
  },
  {
    "id": 1234568,
    "name": "Color & Cut – 90 min",
    "duration": 90,
    "price": "160.00",
    "category": "Hair Services",
    "active": true
  }
]
```

Cache this list — appointment type IDs are stable and every other call requires one.

---

### Get Available Times
**GET /availability/times?appointmentTypeID={id}&date={YYYY-MM-DD}**

**Request URL example:**
```
GET /availability/times?appointmentTypeID=1234567&date=2026-04-14
```

**Response:**
```json
[
  { "time": "2026-04-14T09:00:00+0300" },
  { "time": "2026-04-14T09:45:00+0300" },
  { "time": "2026-04-14T11:30:00+0300" },
  { "time": "2026-04-14T14:00:00+0300" }
]
```

Times are returned in the business's local timezone. An empty array means no availability for that date.

---

### Get Available Dates (Month View)
**GET /availability/dates?appointmentTypeID={id}&month={YYYY-MM}&timezone={tz}**

**Request URL example:**
```
GET /availability/dates?appointmentTypeID=1234567&month=2026-04&timezone=Asia/Jerusalem
```

**Response:**
```json
[
  { "date": "2026-04-14" },
  { "date": "2026-04-15" },
  { "date": "2026-04-17" }
]
```

Use this to identify which days have at least one slot before fetching exact times.

---

### Book Appointment
**POST /appointments**

**Request:**
```json
{
  "appointmentTypeID": 1234567,
  "datetime": "2026-04-14T09:00:00+0300",
  "firstName": "David",
  "lastName": "Cohen",
  "email": "david@example.com",
  "phone": "+972501234567",
  "notes": "Booked via Yappr voice agent"
}
```

**Response:**
```json
{
  "id": 9876543,
  "type": "Haircut – 45 min",
  "datetime": "April 14, 2026 at 9:00am",
  "datetimeCreated": "2026-04-11T08:00:00+0300",
  "firstName": "David",
  "lastName": "Cohen",
  "email": "david@example.com",
  "phone": "+972501234567",
  "confirmationPage": "https://acuityscheduling.com/schedule.php?action=appt&id=9876543",
  "canceled": false
}
```

Store `id` — needed for cancellation.

---

### Find Appointments by Phone
**GET /appointments?phone={phone}&max=5**

**Request URL example:**
```
GET /appointments?phone=%2B972501234567&max=5
```

**Response:**
```json
[
  {
    "id": 9876543,
    "type": "Haircut – 45 min",
    "datetime": "April 14, 2026 at 9:00am",
    "firstName": "David",
    "lastName": "Cohen",
    "phone": "+972501234567",
    "canceled": false
  }
]
```

Use this before booking to check if the caller already has an upcoming appointment.

---

### Cancel Appointment
**PUT /appointments/{id}/cancel**

**Request (optional body):**
```json
{
  "noShow": false
}
```

**Response:**
```json
{
  "id": 9876543,
  "canceled": true
}
```

---

### Reschedule Appointment
**PUT /appointments/{id}**

**Request:**
```json
{
  "datetime": "2026-04-16T11:00:00+0300"
}
```

**Response:** Updated appointment object.

## Common Patterns

### Pre-fetch availability for voice agent
```typescript
// Deno snippet: fetch slots before call dispatch, inject as {{availableSlots}} variable
// This is the KEY pattern — pre-fetch to avoid tool calls during call,
// use bookAppointment tool as safeguard only when caller confirms a slot

const userId = Deno.env.get("ACUITY_USER_ID");
const apiKey = Deno.env.get("ACUITY_API_KEY");
const appointmentTypeId = Deno.env.get("ACUITY_APPOINTMENT_TYPE_ID"); // e.g. "1234567"

const auth = btoa(`${userId}:${apiKey}`);
const headers = { Authorization: `Basic ${auth}` };
const base = "https://acuityscheduling.com/api/v1";

// Fetch next 3 days worth of slots
const today = new Date();
const slotsByDay: Record<string, string[]> = {};

for (let i = 0; i < 3; i++) {
  const d = new Date(today);
  d.setDate(today.getDate() + i);
  const dateStr = d.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const res = await fetch(
    `${base}/availability/times?appointmentTypeID=${appointmentTypeId}&date=${dateStr}`,
    { headers }
  );
  const slots: { time: string }[] = await res.json();

  if (slots.length > 0) {
    // Format times as readable strings, e.g. "Monday 9:00 AM"
    slotsByDay[dateStr] = slots.slice(0, 4).map(s => {
      const dt = new Date(s.time);
      return dt.toLocaleString("en-IL", {
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jerusalem",
      });
    });
  }
}

// Build a readable string to inject as {{availableSlots}}
const availableSlots = Object.entries(slotsByDay)
  .map(([, times]) => times.join(", "))
  .join("; ");

// Pass to Yappr call dispatch as a variable
// availableSlots → "Monday 9:00 AM, Monday 9:45 AM; Tuesday 11:00 AM, Tuesday 14:00 PM"
```

### Book from tool call
```typescript
// Deno snippet: handle bookAppointment tool webhook from Yappr agent
// Tool definition should expose: datetime (ISO string), callerName, callerPhone

const body = await req.json();
const { datetime, callerName, callerPhone } = body.tool_call.arguments;

const [firstName, ...rest] = callerName.split(" ");
const lastName = rest.join(" ") || "—";

const userId = Deno.env.get("ACUITY_USER_ID");
const apiKey = Deno.env.get("ACUITY_API_KEY");
const appointmentTypeId = Deno.env.get("ACUITY_APPOINTMENT_TYPE_ID");
const auth = btoa(`${userId}:${apiKey}`);

const appt = await fetch("https://acuityscheduling.com/api/v1/appointments", {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    appointmentTypeID: Number(appointmentTypeId),
    datetime,
    firstName,
    lastName,
    phone: callerPhone,
    notes: "Booked via Yappr voice agent",
  }),
}).then(r => r.json());

if (appt.error) {
  return new Response(
    JSON.stringify({ result: `Booking failed: ${appt.message}` }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

return new Response(
  JSON.stringify({
    result: `Appointment confirmed for ${appt.datetime}. Confirmation ID: ${appt.id}`,
  }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);
```

## Gotchas & Rate Limits

- **`appointmentTypeID` is mandatory**: Every availability and booking call requires it. There is no generic "any type" endpoint.
- **Timezone in responses**: Times come back in the business's local timezone (with UTC offset), not UTC. Parse with a timezone-aware parser — `new Date(s.time)` handles this correctly in V8/Deno.
- **Empty availability vs. closed**: An empty array from `/availability/times` means no slots — could be a day off, fully booked, or outside business hours. There is no separate "is this day open" endpoint.
- **Squarespace rebrand**: The product is now marketed as "Squarespace Scheduling" but the API domain and structure remain `acuityscheduling.com`. No migration needed.
- **No webhook support for specific events**: Acuity supports webhooks for `appointment.scheduled`, `appointment.canceled`, `appointment.rescheduled`. Configure under Integrations → Webhooks in the Acuity dashboard.
- **Rate limits**: No officially published limit, but stay under ~60 requests/minute. Pre-fetching and caching appointment types is essential.
- **Phone format**: Pass phone numbers in E.164 format (`+972501234567`). The `/appointments?phone=` search requires URL encoding the `+` sign.
- **Email field**: Required for booking even if the caller didn't provide one. Use a placeholder like `noemail@yappr.ai` if necessary — Acuity will still create the appointment.
