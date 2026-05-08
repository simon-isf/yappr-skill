# Mindbody

> **Use in Yappr context**: Book fitness classes or service appointments during a call for gyms, yoga studios, pilates centers, and spas running on Mindbody — the dominant platform for wellness businesses.

## Authentication

Mindbody uses a two-layer auth model: a static API key identifies your developer application, and a per-site staff token authenticates actions on behalf of a specific business.

**Step 1 — Get a developer API key:**
- Sign up at [developers.mindbodyonline.com](https://developers.mindbodyonline.com)
- Create an app → you receive an `Api-Key` (also called "Subscription Key")
- This key is passed on every request as the `Api-Key` header

**Step 2 — Get a Staff Token for a site:**
```
POST https://api.mindbodyonline.com/public/v6/usertoken/issue
```
**Request:**
```json
{
  "Username": "your_staff_username",
  "Password": "your_staff_password",
  "SiteId": -99
}
```
**Response:**
```json
{
  "AccessToken": "eyJh...",
  "TokenExpirationTime": "2026-04-11T20:00:00Z"
}
```
Pass as `Authorization: Bearer {AccessToken}` on subsequent requests. Tokens expire — implement refresh logic (re-issue when expiry is within 5 minutes).

**Headers for all requests:**
```
Api-Key: your_subscription_key
SiteId: -99
Authorization: Bearer eyJh...
Content-Type: application/json
```

> Replace `-99` with the real Site ID of the business. `-99` is the Mindbody sandbox.

## Base URL

```
https://api.mindbodyonline.com/public/v6
```

## Key Endpoints

### Get Bookable Services
**GET /appointment/bookableitems?locationId={id}**

**Response:**
```json
{
  "StaffMembers": [
    {
      "Id": 100000287,
      "Name": "Sarah Levi",
      "FirstName": "Sarah",
      "LastName": "Levi"
    }
  ],
  "Services": [
    {
      "Id": "service_001",
      "Name": "Deep Tissue Massage – 60 min",
      "Duration": 60,
      "CategoryId": 12,
      "Category": "Massage"
    }
  ],
  "Locations": [
    {
      "Id": 1,
      "Name": "Tel Aviv Studio"
    }
  ]
}
```

Cache the `Services` and `StaffMembers` arrays — they change rarely and IDs are needed for availability queries.

---

### Get Available Appointment Times
**GET /appointment/availabletimes**

**Query params:**
```
serviceId={id}&staffId={id}&startDateTime={iso}&endDateTime={iso}&locationId={id}
```

**Request URL example:**
```
GET /appointment/availabletimes?serviceId=service_001&startDateTime=2026-04-14T00:00:00&endDateTime=2026-04-14T23:59:59&locationId=1
```

**Response:**
```json
{
  "AvailableTimes": [
    {
      "StartDateTime": "2026-04-14T10:00:00",
      "EndDateTime": "2026-04-14T11:00:00",
      "Staff": {
        "Id": 100000287,
        "Name": "Sarah Levi"
      }
    },
    {
      "StartDateTime": "2026-04-14T13:00:00",
      "EndDateTime": "2026-04-14T14:00:00",
      "Staff": {
        "Id": 100000287,
        "Name": "Sarah Levi"
      }
    }
  ]
}
```

---

### Find Client by Phone
**GET /client/clients?searchText={phone}&limit=5**

**Response:**
```json
{
  "Clients": [
    {
      "Id": "12345",
      "UniqueId": 9876543,
      "FirstName": "David",
      "LastName": "Cohen",
      "Email": "david@example.com",
      "MobilePhone": "+972501234567"
    }
  ],
  "TotalResults": 1
}
```

Run this before booking. If found, pass `ClientId` when creating the appointment. If not found, create the client first.

---

### Create Client
**POST /client/addclient**

**Request:**
```json
{
  "FirstName": "David",
  "LastName": "Cohen",
  "MobilePhone": "+972501234567",
  "Email": "david@example.com"
}
```

**Response:**
```json
{
  "Client": {
    "Id": "12345",
    "UniqueId": 9876543,
    "FirstName": "David",
    "LastName": "Cohen"
  }
}
```

---

### Add Appointment Booking
**POST /appointment/addbooking**

**Request:**
```json
{
  "ClientId": "12345",
  "StaffId": 100000287,
  "ServiceId": "service_001",
  "LocationId": 1,
  "StartDateTime": "2026-04-14T10:00:00",
  "EndDateTime": "2026-04-14T11:00:00",
  "Notes": "Booked via Yappr voice agent",
  "SendEmail": true
}
```

**Response:**
```json
{
  "Appointment": {
    "Id": 44556677,
    "StartDateTime": "2026-04-14T10:00:00",
    "EndDateTime": "2026-04-14T11:00:00",
    "Status": "Booked",
    "Client": { "Id": "12345", "FirstName": "David", "LastName": "Cohen" },
    "Staff": { "Id": 100000287, "Name": "Sarah Levi" },
    "Service": { "Name": "Deep Tissue Massage – 60 min" }
  }
}
```

---

### Cancel Appointment
**POST /appointment/cancelappointment**

**Request:**
```json
{
  "AppointmentId": 44556677,
  "SendEmail": true
}
```

**Response:**
```json
{
  "Appointment": {
    "Id": 44556677,
    "Status": "Cancelled"
  }
}
```

---

### Get Classes (Schedule View)
**GET /class/classes?locationIds={id}&startDateTime={iso}&endDateTime={iso}**

**Response (condensed):**
```json
{
  "Classes": [
    {
      "Id": 5556677,
      "ClassDescription": { "Name": "Vinyasa Flow", "Duration": 60 },
      "StartDateTime": "2026-04-14T08:00:00",
      "EndDateTime": "2026-04-14T09:00:00",
      "MaxCapacity": 15,
      "TotalBooked": 9,
      "Staff": { "Id": 100000287, "Name": "Sarah Levi" },
      "IsAvailable": true
    }
  ]
}
```

Use `ClassDescription.Name`, `StartDateTime`, and `TotalBooked` vs `MaxCapacity` to build the slots string.

## Common Patterns

### Pre-fetch availability for voice agent
```typescript
// Deno snippet: fetch appointment slots before call, inject as {{availableSlots}} variable
// This is the KEY pattern — pre-fetch to avoid tool calls during call,
// use bookAppointment tool as safeguard only when caller confirms a slot

const apiKey = Deno.env.get("MINDBODY_API_KEY");
const siteId = Deno.env.get("MINDBODY_SITE_ID");
const accessToken = Deno.env.get("MINDBODY_ACCESS_TOKEN"); // refresh separately
const serviceId = Deno.env.get("MINDBODY_SERVICE_ID");
const locationId = Deno.env.get("MINDBODY_LOCATION_ID") ?? "1";

const headers = {
  "Api-Key": apiKey,
  "SiteId": siteId,
  "Authorization": `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

const base = "https://api.mindbodyonline.com/public/v6";
const slots: string[] = [];

// Fetch today + next 2 days
for (let i = 0; i < 3; i++) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  const startIso = `${d.toISOString().slice(0, 10)}T00:00:00`;
  const endIso = `${d.toISOString().slice(0, 10)}T23:59:59`;

  const res = await fetch(
    `${base}/appointment/availabletimes?serviceId=${serviceId}&startDateTime=${startIso}&endDateTime=${endIso}&locationId=${locationId}`,
    { headers }
  );
  const data = await res.json();

  for (const slot of (data.AvailableTimes ?? []).slice(0, 3)) {
    const dt = new Date(slot.StartDateTime);
    const label = dt.toLocaleString("en-IL", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jerusalem",
    });
    slots.push(`${label} with ${slot.Staff.Name}`);
  }
}

const availableSlots = slots.join(", ");
// Inject as {{availableSlots}} → "Mon 10:00 with Sarah Levi, Mon 13:00 with Sarah Levi, Tue 09:00 with Sarah Levi"
```

### Book from tool call
```typescript
// Deno snippet: handle bookAppointment tool webhook from Yappr agent
// Tool definition should expose: startDateTime (ISO), callerName, callerPhone, staffId

const body = await req.json();
const { startDateTime, callerName, callerPhone, staffId } = body.tool_call.arguments;

const apiKey = Deno.env.get("MINDBODY_API_KEY");
const siteId = Deno.env.get("MINDBODY_SITE_ID");
const accessToken = Deno.env.get("MINDBODY_ACCESS_TOKEN");
const serviceId = Deno.env.get("MINDBODY_SERVICE_ID");
const locationId = Deno.env.get("MINDBODY_LOCATION_ID") ?? "1";
const serviceDurationMin = 60;

const headers = {
  "Api-Key": apiKey,
  "SiteId": siteId,
  "Authorization": `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};
const base = "https://api.mindbodyonline.com/public/v6";

// 1. Find or create client
const searchRes = await fetch(
  `${base}/client/clients?searchText=${encodeURIComponent(callerPhone)}&limit=1`,
  { headers }
).then(r => r.json());

let clientId: string;
if (searchRes.Clients?.length > 0) {
  clientId = searchRes.Clients[0].Id;
} else {
  const [firstName, ...rest] = callerName.split(" ");
  const newClient = await fetch(`${base}/client/addclient`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      FirstName: firstName,
      LastName: rest.join(" ") || "—",
      MobilePhone: callerPhone,
    }),
  }).then(r => r.json());
  clientId = newClient.Client.Id;
}

// 2. Book
const start = new Date(startDateTime);
const end = new Date(start.getTime() + serviceDurationMin * 60 * 1000);

const appt = await fetch(`${base}/appointment/addbooking`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    ClientId: clientId,
    StaffId: Number(staffId),
    ServiceId: serviceId,
    LocationId: Number(locationId),
    StartDateTime: start.toISOString().replace("Z", ""),
    EndDateTime: end.toISOString().replace("Z", ""),
    Notes: "Booked via Yappr voice agent",
    SendEmail: true,
  }),
}).then(r => r.json());

return new Response(
  JSON.stringify({
    result: `Appointment booked! ID ${appt.Appointment.Id} on ${appt.Appointment.StartDateTime}`,
  }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);
```

## Gotchas & Rate Limits

- **API access requires approval**: Mindbody must approve your developer account before you can call a live site. Sandbox (`SiteId: -99`) is available immediately for testing.
- **Two-token system**: The `Api-Key` is your app's key; the `Authorization: Bearer` token is site-specific and expires (typically 24 hours). Build a token refresh flow — re-issue by calling `/usertoken/issue` with staff credentials.
- **Site ID is required on every request**: It must be set in the `SiteId` header, not just during authentication. Store per business.
- **`ServiceId` is a string, `StaffId` is a number**: Mindbody mixes types. The booking call will fail with a type mismatch if you pass them wrong.
- **Appointments vs. Classes**: These are different booking flows. `/appointment/addbooking` is for 1:1 service appointments. Class enrollment uses `POST /class/addbooking` with a `ClassId`.
- **`IsAvailable` on classes**: Always check `IsAvailable: true` before presenting a class as bookable. `MaxCapacity - TotalBooked > 0` is a secondary check but `IsAvailable` accounts for waitlists.
- **Timestamps have no timezone suffix**: Mindbody returns and accepts datetimes without a `Z` or offset. They are always in the site's local timezone. Strip the `Z` when sending.
- **Rate limits**: 1,000 requests/hour per API key for production. Cache bookable items and staff lists aggressively.
