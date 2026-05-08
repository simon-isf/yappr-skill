# Booksy

> **Use in Yappr context**: Check availability and receive booking events for beauty businesses (barbers, nail salons, hairdressers) on Booksy — especially relevant for the Israeli market where Booksy has strong penetration.

## Authentication

Booksy offers two integration paths depending on your business plan:

**Path A — Booksy Partner API (paid plans):**
- Apply for API access via Booksy's partner program
- You receive a business API key
- Pass as `X-Api-Key: {api_key}` header

**Path B — Webhooks + iCal (available to all):**
- No approval needed
- Booksy can POST to your URL on booking/cancellation events
- Configure under: Booksy Business app → Settings → Integrations → Webhooks
- iCal feed URL available from the same settings page for availability read-only access

> **Recommendation for most Yappr deployments**: Use the iCal + webhook approach (Path B) for pre-fetching availability and receiving booking events. If the business is on a plan with Partner API access, use Path A for direct booking.

## Base URL

```
https://booksy.com/api/us/business
```

> Note: There is also `https://booksy.com/api/il/business` for the Israeli market. Use the region-specific URL matching the business's country.

## Key Endpoints (Partner API — Path A)

### Get Staff Availability
**GET /staff/availability**

**Headers:**
```
X-Api-Key: your_api_key
Content-Type: application/json
```

**Query params:** `date={YYYY-MM-DD}&service_id={id}&staff_id={id}`

**Request URL example:**
```
GET /staff/availability?date=2026-04-14&service_id=555&staff_id=101
```

**Response:**
```json
{
  "availability": [
    { "time": "09:00", "available": true },
    { "time": "09:30", "available": true },
    { "time": "10:00", "available": false },
    { "time": "10:30", "available": true }
  ],
  "date": "2026-04-14",
  "staff_id": 101
}
```

---

### Create Appointment
**POST /appointments**

**Request:**
```json
{
  "service_id": 555,
  "staff_id": 101,
  "date": "2026-04-14",
  "time": "09:00",
  "customer": {
    "first_name": "David",
    "last_name": "Cohen",
    "phone": "+972501234567",
    "email": "david@example.com"
  },
  "notes": "Booked via Yappr voice agent"
}
```

**Response:**
```json
{
  "appointment": {
    "id": "appt_abc123",
    "service_id": 555,
    "staff_id": 101,
    "date": "2026-04-14",
    "time": "09:00",
    "status": "confirmed",
    "customer": {
      "first_name": "David",
      "last_name": "Cohen",
      "phone": "+972501234567"
    }
  }
}
```

---

### Search Customers
**GET /customers/search?phone={phone}**

**Response:**
```json
{
  "customers": [
    {
      "id": "cust_xyz789",
      "first_name": "David",
      "last_name": "Cohen",
      "phone": "+972501234567",
      "visits": 4
    }
  ]
}
```

---

### Cancel Appointment
**DELETE /appointments/{appointment_id}**

**Response:**
```json
{
  "cancelled": true,
  "appointment_id": "appt_abc123"
}
```

## Webhook Integration (Path B)

Configure in Booksy Business app → Settings → Integrations → Webhooks. Point to a Supabase edge function URL.

### Webhook Events

**New Booking (`booking.created`):**
```json
{
  "event": "booking.created",
  "data": {
    "appointment_id": "appt_abc123",
    "service_name": "Haircut",
    "staff_name": "Moshe Shapira",
    "date": "2026-04-14",
    "time": "09:00",
    "customer": {
      "first_name": "David",
      "last_name": "Cohen",
      "phone": "+972501234567"
    }
  },
  "business_id": "biz_12345",
  "timestamp": "2026-04-11T08:00:00Z"
}
```

**Booking Cancelled (`booking.cancelled`):**
```json
{
  "event": "booking.cancelled",
  "data": {
    "appointment_id": "appt_abc123",
    "cancelled_by": "customer",
    "date": "2026-04-14",
    "time": "09:00"
  },
  "business_id": "biz_12345",
  "timestamp": "2026-04-11T09:00:00Z"
}
```

## iCal Availability Feed (Path B — Read-Only Fallback)

Booksy exposes a `.ics` feed of booked slots. Parse it to determine *when the calendar is busy* and infer available windows.

**Feed URL format:**
```
https://booksy.com/calendar/{business_id}/{staff_id}.ics
```

Get the exact URL from Booksy Business → Settings → Calendar → Share Calendar.

```typescript
// Deno snippet: parse iCal feed to extract busy times
// Then invert against business hours to get available slots

import ical from "npm:ical.js";

const icsUrl = Deno.env.get("BOOKSY_ICAL_URL"); // e.g. the .ics share URL
const res = await fetch(icsUrl);
const icsText = await res.text();

const parsed = ical.parse(icsText);
const comp = new ical.Component(parsed);
const events = comp.getAllSubcomponents("vevent");

const busyTimes = events.map(ev => {
  const vEvent = new ical.Event(ev);
  return {
    start: vEvent.startDate.toJSDate(),
    end: vEvent.endDate.toJSDate(),
  };
});

// businessHours: 09:00–18:00 in 30-min slots
// Filter out busy slots to get available slots
const SLOT_MIN = 30;
const businessStart = 9; // 9 AM
const businessEnd = 18;  // 6 PM

const today = new Date();
const availableSlots: string[] = [];

for (let day = 0; day < 3; day++) {
  const d = new Date(today);
  d.setDate(today.getDate() + day);

  for (let hour = businessStart; hour < businessEnd; hour++) {
    for (const min of [0, 30]) {
      const slotStart = new Date(d);
      slotStart.setHours(hour, min, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + SLOT_MIN * 60000);

      const isBusy = busyTimes.some(
        b => slotStart < b.end && slotEnd > b.start
      );

      if (!isBusy) {
        availableSlots.push(
          slotStart.toLocaleString("en-IL", {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Jerusalem",
          })
        );
      }
    }
  }
}

// Take first 6 slots → inject as {{availableSlots}}
const availableSlotsStr = availableSlots.slice(0, 6).join(", ");
```

## Common Patterns

### Pre-fetch availability for voice agent
```typescript
// Deno snippet: fetch Partner API slots for next 3 days, inject as {{availableSlots}}
// This is the KEY pattern — pre-fetch to avoid tool calls during call,
// use bookAppointment tool as safeguard only when caller confirms a slot

const apiKey = Deno.env.get("BOOKSY_API_KEY");
const serviceId = Deno.env.get("BOOKSY_SERVICE_ID");
const staffId = Deno.env.get("BOOKSY_STAFF_ID");
const region = Deno.env.get("BOOKSY_REGION") ?? "us"; // "us" or "il"
const base = `https://booksy.com/api/${region}/business`;

const headers = { "X-Api-Key": apiKey, "Content-Type": "application/json" };
const slots: string[] = [];

for (let i = 0; i < 3; i++) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  const dateStr = d.toISOString().slice(0, 10);

  const res = await fetch(
    `${base}/staff/availability?date=${dateStr}&service_id=${serviceId}&staff_id=${staffId}`,
    { headers }
  );
  const data = await res.json();

  for (const slot of (data.availability ?? []).filter((s: { available: boolean }) => s.available).slice(0, 3)) {
    const dt = new Date(`${dateStr}T${slot.time}:00`);
    slots.push(
      dt.toLocaleString("en-IL", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jerusalem",
      })
    );
  }
}

const availableSlots = slots.join(", ");
// Inject as {{availableSlots}} in Yappr call dispatch
```

### Book from tool call
```typescript
// Deno snippet: handle bookAppointment tool webhook from Yappr agent
// Tool definition should expose: date (YYYY-MM-DD), time (HH:MM), callerName, callerPhone

const body = await req.json();
const { date, time, callerName, callerPhone } = body.tool_call.arguments;

const apiKey = Deno.env.get("BOOKSY_API_KEY");
const serviceId = Deno.env.get("BOOKSY_SERVICE_ID");
const staffId = Deno.env.get("BOOKSY_STAFF_ID");
const region = Deno.env.get("BOOKSY_REGION") ?? "us";
const base = `https://booksy.com/api/${region}/business`;

const [firstName, ...rest] = callerName.split(" ");

const appt = await fetch(`${base}/appointments`, {
  method: "POST",
  headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
  body: JSON.stringify({
    service_id: Number(serviceId),
    staff_id: Number(staffId),
    date,
    time,
    customer: {
      first_name: firstName,
      last_name: rest.join(" ") || "—",
      phone: callerPhone,
    },
    notes: "Booked via Yappr voice agent",
  }),
}).then(r => r.json());

return new Response(
  JSON.stringify({
    result: `Appointment confirmed for ${appt.appointment.date} at ${appt.appointment.time}. ID: ${appt.appointment.id}`,
  }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);
```

## Gotchas & Rate Limits

- **Partner API access is gated**: Not all Booksy plans include API access. If the business is on a free or basic plan, use the iCal + webhook path. Advise clients to contact Booksy sales to enable API access.
- **Israeli region URL**: For Israeli businesses, use `https://booksy.com/api/il/business`. Using the `us` endpoint for an Israeli business may return no data or authentication errors.
- **iCal feed shows busy, not available**: The `.ics` export lists booked appointments, not free slots. You must subtract from business hours to derive availability — see the iCal snippet above.
- **Webhook payload is not signed by default**: Booksy does not send a signature header with webhooks (unlike Calendly/Cal.com). Validate the `business_id` in the payload against a stored expected value, and enforce HTTPS on your receiving endpoint.
- **Zapier alternative**: For businesses unable to obtain API access, Booksy has a native Zapier integration. You can build a Zap that triggers on `New Appointment` and POSTs to a Supabase edge function. This is a valid fallback for capture-only use cases.
- **No direct reschedule endpoint**: Rescheduling via API requires cancelling the existing appointment and creating a new one at the new time.
- **Rate limits**: Not published for the Partner API. Conservative default: stay under 60 requests/minute. The iCal feed should be cached with a TTL of at least 5 minutes.
