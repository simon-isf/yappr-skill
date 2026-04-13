# Zoho Bookings

> **Use in Yappr context**: Book appointments for businesses already on Zoho CRM — bookings sync bidirectionally with CRM contacts and deals, making Zoho Bookings ideal when the client wants every voice-captured lead to appear automatically in their CRM pipeline.

## Authentication

Zoho uses OAuth2. The same token works for Zoho Bookings and Zoho CRM — a single credential grants access to both.

**Step 1 — Register your app:**
- Go to [api-console.zoho.com](https://api-console.zoho.com)
- Create a "Server-based Application"
- Note the `Client ID` and `Client Secret`

**Step 2 — Get an authorization code:**
```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoBookings.manage.all,ZohoBookings.appointments.ALL&client_id={CLIENT_ID}&response_type=code&redirect_uri={REDIRECT_URI}&access_type=offline
```

**Step 3 — Exchange for tokens:**
```
POST https://accounts.zoho.com/oauth/v2/token
```
**Request (form-encoded):**
```
code={AUTH_CODE}
grant_type=authorization_code
client_id={CLIENT_ID}
client_secret={CLIENT_SECRET}
redirect_uri={REDIRECT_URI}
```

**Response:**
```json
{
  "access_token": "1000.xyz...",
  "refresh_token": "1000.abc...",
  "expires_in": 3600,
  "api_domain": "https://www.zohoapis.com",
  "token_type": "Bearer"
}
```

**Step 4 — Refresh when expired:**
```
POST https://accounts.zoho.com/oauth/v2/token
```
**Request (form-encoded):**
```
refresh_token={REFRESH_TOKEN}
grant_type=refresh_token
client_id={CLIENT_ID}
client_secret={CLIENT_SECRET}
```

Store the `access_token` in Supabase Vault and refresh before it expires. Access tokens expire in 1 hour.

> **Data center**: Zoho has separate data centers (US `.com`, EU `.eu`, IN `.in`, AU `.au`). Use the domain matching the customer's Zoho account. Israeli businesses typically use `.com` (US data center). Adjust `accounts.zoho.com` and `www.zohoapis.com` to match.

## Base URL

```
https://www.zohoapis.com/bookings/v1/json
```

All Zoho Bookings endpoints are prefixed with `/json/`.

## Key Endpoints

### List Workspaces
**GET /json/workspaces**

**Headers:**
```
Authorization: Zoho-oauthtoken 1000.xyz...
Content-Type: application/json
```

**Response:**
```json
{
  "response": {
    "returnvalue": {
      "data": [
        {
          "id": "ws_001",
          "name": "Consultation",
          "description": "30-minute consultation call",
          "type": "1",
          "duration": 30,
          "status": "ACTIVE"
        },
        {
          "id": "ws_002",
          "name": "Full Assessment",
          "duration": 60,
          "status": "ACTIVE"
        }
      ]
    },
    "status": "success"
  }
}
```

A "workspace" in Zoho Bookings is roughly equivalent to a service type. Store `id` for availability queries.

---

### List Services
**GET /json/services?workspace_id={id}**

**Response:**
```json
{
  "response": {
    "returnvalue": {
      "data": [
        {
          "id": "svc_abc",
          "name": "30-min Consultation",
          "duration": 30,
          "workspace_id": "ws_001"
        }
      ]
    },
    "status": "success"
  }
}
```

---

### List Staff
**GET /json/staffmembers**

**Response:**
```json
{
  "response": {
    "returnvalue": {
      "data": [
        {
          "id": "staff_101",
          "name": "Sarah Levi",
          "email": "sarah@company.com"
        }
      ]
    },
    "status": "success"
  }
}
```

---

### Get Available Slots
**POST /json/availableslots**

**Request:**
```json
{
  "workspace_id": "ws_001",
  "service_id": "svc_abc",
  "staff_id": "staff_101",
  "from_time": "14042026 00:00",
  "to_time": "14042026 23:59"
}
```

> Zoho uses a non-standard datetime format: `ddMMYYYY HH:mm`. Note the day-month-year order.

**Response:**
```json
{
  "response": {
    "returnvalue": {
      "data": [
        {
          "start_time": "14042026 09:00",
          "end_time": "14042026 09:30",
          "staff_id": "staff_101"
        },
        {
          "start_time": "14042026 10:00",
          "end_time": "14042026 10:30",
          "staff_id": "staff_101"
        }
      ]
    },
    "status": "success"
  }
}
```

---

### Create Appointment
**POST /json/appointment**

**Request:**
```json
{
  "workspace_id": "ws_001",
  "service_id": "svc_abc",
  "staff_id": "staff_101",
  "start_time": "14042026 09:00",
  "customer_details": {
    "name": "David Cohen",
    "email": "david@example.com",
    "phone_number": "+972501234567",
    "comments": "Booked via Yappr voice agent"
  },
  "additional_fields": {
    "source": "Yappr Voice Agent"
  }
}
```

**Response:**
```json
{
  "response": {
    "returnvalue": {
      "data": {
        "booking_id": "appt_bk001",
        "workspace_name": "Consultation",
        "service_name": "30-min Consultation",
        "staff_name": "Sarah Levi",
        "start_time": "14042026 09:00",
        "end_time": "14042026 09:30",
        "customer_details": {
          "name": "David Cohen",
          "email": "david@example.com",
          "phone_number": "+972501234567"
        },
        "status": "Booked"
      }
    },
    "status": "success"
  }
}
```

---

### Reschedule Appointment
**PATCH /json/appointment?bookingId={id}**

**Request:**
```json
{
  "start_time": "16042026 11:00",
  "staff_id": "staff_101"
}
```

**Response:**
```json
{
  "response": {
    "returnvalue": {
      "data": {
        "booking_id": "appt_bk001",
        "start_time": "16042026 11:00",
        "status": "Rescheduled"
      }
    },
    "status": "success"
  }
}
```

---

### Cancel Appointment
**DELETE /json/appointment?bookingId={id}**

**Response:**
```json
{
  "response": {
    "returnvalue": {
      "data": {
        "booking_id": "appt_bk001",
        "status": "Cancelled"
      }
    },
    "status": "success"
  }
}
```

---

### Get Appointment Details
**GET /json/appointment?bookingId={id}**

**Response:** Full appointment object as above.

## Common Patterns

### Pre-fetch availability for voice agent
```typescript
// Deno snippet: fetch slots for next 3 days, inject as {{availableSlots}} variable
// This is the KEY pattern — pre-fetch to avoid tool calls during call,
// use bookAppointment tool as safeguard only when caller confirms a slot

const accessToken = Deno.env.get("ZOHO_ACCESS_TOKEN");
const workspaceId = Deno.env.get("ZOHO_WORKSPACE_ID");
const serviceId = Deno.env.get("ZOHO_SERVICE_ID");
const staffId = Deno.env.get("ZOHO_STAFF_ID");
const base = "https://www.zohoapis.com/bookings/v1";

const headers = {
  Authorization: `Zoho-oauthtoken ${accessToken}`,
  "Content-Type": "application/json",
};

// Zoho datetime format: ddMMYYYY HH:mm
function toZohoDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function parseZohoSlot(zohoStr: string): Date {
  // "14042026 09:00" → parse as ddMMYYYY HH:mm
  const [datePart, timePart] = zohoStr.split(" ");
  const dd = datePart.slice(0, 2);
  const mm = datePart.slice(2, 4);
  const yyyy = datePart.slice(4, 8);
  return new Date(`${yyyy}-${mm}-${dd}T${timePart}:00`);
}

const slots: string[] = [];

for (let i = 0; i < 3; i++) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  const dateStr = toZohoDate(d);

  const res = await fetch(`${base}/json/availableslots`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      workspace_id: workspaceId,
      service_id: serviceId,
      staff_id: staffId,
      from_time: `${dateStr} 00:00`,
      to_time: `${dateStr} 23:59`,
    }),
  });

  const data = await res.json();
  const daySlots = data.response?.returnvalue?.data ?? [];

  for (const slot of daySlots.slice(0, 3)) {
    const dt = parseZohoSlot(slot.start_time);
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
// Inject as {{availableSlots}} → "Monday 9:00 AM, Monday 10:00 AM, Tuesday 9:30 AM"
```

### Book from tool call
```typescript
// Deno snippet: handle bookAppointment tool webhook from Yappr agent
// Tool definition should expose: zohoStartTime ("ddMMYYYY HH:mm"), callerName, callerPhone, callerEmail

const body = await req.json();
const { zohoStartTime, callerName, callerPhone, callerEmail } = body.tool_call.arguments;

const accessToken = Deno.env.get("ZOHO_ACCESS_TOKEN");
const workspaceId = Deno.env.get("ZOHO_WORKSPACE_ID");
const serviceId = Deno.env.get("ZOHO_SERVICE_ID");
const staffId = Deno.env.get("ZOHO_STAFF_ID");
const base = "https://www.zohoapis.com/bookings/v1";

const res = await fetch(`${base}/json/appointment`, {
  method: "POST",
  headers: {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    workspace_id: workspaceId,
    service_id: serviceId,
    staff_id: staffId,
    start_time: zohoStartTime,
    customer_details: {
      name: callerName,
      email: callerEmail ?? "noemail@yappr.ai",
      phone_number: callerPhone,
      comments: "Booked via Yappr voice agent",
    },
  }),
}).then(r => r.json());

if (res.response?.status !== "success") {
  return new Response(
    JSON.stringify({ result: `Booking failed: ${JSON.stringify(res.response)}` }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

const appt = res.response.returnvalue.data;
return new Response(
  JSON.stringify({
    result: `Appointment confirmed. ID: ${appt.booking_id}, time: ${appt.start_time}, status: ${appt.status}`,
  }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);
```

## Gotchas & Rate Limits

- **Non-standard datetime format**: Zoho Bookings uses `ddMMYYYY HH:mm` (e.g. `14042026 09:00`), not ISO 8601. This is day-first, unlike most APIs. Parsing and formatting helpers are essential — see `toZohoDate` and `parseZohoSlot` above.
- **Authorization header format**: Zoho uses `Zoho-oauthtoken {token}`, not the standard `Bearer {token}`. Wrong format silently returns 401.
- **Data center matters**: Tokens from `accounts.zoho.com` only work against `www.zohoapis.com`. If the customer's account is on `zoho.eu`, they need tokens from `accounts.zoho.eu` and must call `www.zohoapis.eu`. Always ask which data center the business uses.
- **CRM sync is automatic**: When you create a Zoho Booking, a contact and activity are automatically created or updated in Zoho CRM (if the business has CRM). This is a feature, not a side effect — explicitly mention it when pitching the integration.
- **Workspace vs. Service vs. Staff**: All three IDs are required for availability queries. A workspace is a booking type (e.g. "Consultation"); a service is a sub-type within a workspace; staff is the assigned person. Run the list endpoints once and cache the IDs.
- **`response.status` always returns HTTP 200**: Zoho returns HTTP 200 even for errors. Always check `res.response.status === "success"` before treating a response as valid. Error details are in `res.response.returnvalue.message`.
- **Rate limits**: 200 requests/minute per OAuth token for Zoho APIs. No special limit for Bookings specifically.
- **Token expiry**: Access tokens expire in exactly 3600 seconds. Implement a proactive refresh (e.g. refresh when less than 5 minutes remain) rather than reactive refresh on 401 to avoid dropped bookings mid-call.
