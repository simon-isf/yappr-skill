# Square Appointments

> **Use in Yappr context**: Check availability and book service appointments for businesses using Square as their POS and booking system — common in barber shops, hair salons, and massage studios.

## Authentication

- Create an app: [developer.squareup.com](https://developer.squareup.com) → New Application
- Get your **Access Token** from the app's credentials page (use Production token for live bookings, Sandbox token for testing)
- Pass as `Authorization: Bearer {access_token}` header on every request

## Base URL

```
https://connect.squareup.com/v2
```

Sandbox base URL: `https://connect.squareupsandbox.com/v2`

## Key Endpoints

### Search Availability
**POST /bookings/availability/search**

Despite checking availability, this uses POST with a query body.

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
Square-Version: 2024-01-18
```

**Request:**
```json
{
  "query": {
    "filter": {
      "start_at_range": {
        "start_at": "2026-04-14T00:00:00+03:00",
        "end_at": "2026-04-16T23:59:59+03:00"
      },
      "location_id": "LOCATION_ID_HERE",
      "segment_filters": [
        {
          "service_variation_id": "SERVICE_VARIATION_ID_HERE"
        }
      ]
    }
  }
}
```

**Response:**
```json
{
  "availabilities": [
    {
      "start_at": "2026-04-14T09:00:00+03:00",
      "location_id": "LOCATION_ID_HERE",
      "appointment_segments": [
        {
          "duration_minutes": 45,
          "service_variation_id": "SERVICE_VARIATION_ID_HERE",
          "service_variation_version": 1712345678,
          "team_member_id": "TEAM_MEMBER_ID_HERE"
        }
      ]
    }
  ]
}
```

All IDs from the availability response must be passed verbatim when creating the booking.

---

### Create Booking
**POST /bookings**

**Request:**
```json
{
  "booking": {
    "start_at": "2026-04-14T09:00:00+03:00",
    "location_id": "LOCATION_ID_HERE",
    "customer_id": "CUSTOMER_ID_HERE",
    "customer_note": "Booked via Yappr voice agent",
    "appointment_segments": [
      {
        "duration_minutes": 45,
        "service_variation_id": "SERVICE_VARIATION_ID_HERE",
        "service_variation_version": 1712345678,
        "team_member_id": "TEAM_MEMBER_ID_HERE"
      }
    ]
  },
  "idempotency_key": "unique-key-per-booking-attempt"
}
```

**Response:**
```json
{
  "booking": {
    "id": "TStzTfdBSbA-X3ZecjTDcw",
    "version": 1,
    "status": "ACCEPTED",
    "created_at": "2026-04-11T08:00:00Z",
    "start_at": "2026-04-14T09:00:00+03:00",
    "location_id": "LOCATION_ID_HERE",
    "customer_id": "CUSTOMER_ID_HERE",
    "appointment_segments": [
      {
        "duration_minutes": 45,
        "service_variation_id": "SERVICE_VARIATION_ID_HERE",
        "team_member_id": "TEAM_MEMBER_ID_HERE"
      }
    ]
  }
}
```

Store `booking.id` for cancellations.

---

### Get Booking
**GET /bookings/{booking_id}**

**Response:** Full booking object as above.

---

### Cancel Booking
**POST /bookings/{booking_id}/cancel**

**Request:**
```json
{
  "booking_version": 1,
  "idempotency_key": "unique-cancel-key"
}
```

**Response:**
```json
{
  "booking": {
    "id": "TStzTfdBSbA-X3ZecjTDcw",
    "status": "CANCELLED_BY_SELLER"
  }
}
```

`booking_version` must match the current version to prevent stale cancellations.

---

### Search Customers by Phone
**POST /customers/search**

**Request:**
```json
{
  "query": {
    "filter": {
      "phone_number": {
        "exact": "+972501234567"
      }
    }
  }
}
```

**Response:**
```json
{
  "customers": [
    {
      "id": "JDKYHBWT1D4F8MFH63DBMEN8Y4",
      "given_name": "David",
      "family_name": "Cohen",
      "phone_number": "+972501234567",
      "email_address": "david@example.com"
    }
  ]
}
```

---

### Create Customer
**POST /customers**

**Request:**
```json
{
  "given_name": "David",
  "family_name": "Cohen",
  "phone_number": "+972501234567",
  "email_address": "david@example.com",
  "reference_id": "yappr-call-abc123"
}
```

**Response:**
```json
{
  "customer": {
    "id": "JDKYHBWT1D4F8MFH63DBMEN8Y4",
    "created_at": "2026-04-11T08:00:00Z",
    "given_name": "David",
    "family_name": "Cohen",
    "phone_number": "+972501234567"
  }
}
```

---

### List Catalog Items (Services)
**GET /catalog/list?types=ITEM**

Use this once to discover your `service_variation_id` values. Each ITEM has `item_data.variations[]` — the `id` of each variation is the `service_variation_id` used in bookings.

**Filtered approach:**
```
GET /catalog/search
```
**Request:**
```json
{
  "object_types": ["ITEM"],
  "include_related_objects": true
}
```

---

### List Team Members
**GET /team-members?location_ids={id}**

Returns staff who can be assigned to appointments. Use `member.id` as `team_member_id`.

## Common Patterns

### Pre-fetch availability for voice agent
```typescript
// Deno snippet: fetch slots before call dispatch, inject as {{availableSlots}} variable
// This is the KEY pattern — pre-fetch to avoid tool calls during call,
// use bookAppointment tool as safeguard only when caller confirms a slot

const accessToken = Deno.env.get("SQUARE_ACCESS_TOKEN");
const locationId = Deno.env.get("SQUARE_LOCATION_ID");
const serviceVariationId = Deno.env.get("SQUARE_SERVICE_VARIATION_ID");
const base = "https://connect.squareup.com/v2";

const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
  "Square-Version": "2024-01-18",
};

// Search availability for next 3 days
const now = new Date();
const end = new Date(now);
end.setDate(now.getDate() + 3);

const res = await fetch(`${base}/bookings/availability/search`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    query: {
      filter: {
        start_at_range: {
          start_at: now.toISOString(),
          end_at: end.toISOString(),
        },
        location_id: locationId,
        segment_filters: [{ service_variation_id: serviceVariationId }],
      },
    },
  }),
});

const data = await res.json();
const slots = (data.availabilities ?? []).slice(0, 6);

// Format for voice: "Monday 9:00 AM (45 min), Monday 10:00 AM (45 min)"
const availableSlots = slots
  .map((avail: { start_at: string; appointment_segments: Array<{ duration_minutes: number }> }) => {
    const dt = new Date(avail.start_at);
    const label = dt.toLocaleString("en-IL", {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jerusalem",
    });
    const dur = avail.appointment_segments[0]?.duration_minutes;
    return `${label} (${dur} min)`;
  })
  .join(", ");

// Inject as {{availableSlots}}
```

### Book from tool call
```typescript
// Deno snippet: handle bookAppointment tool webhook from Yappr agent
// Tool definition should expose: startAt (ISO), callerName, callerPhone

const body = await req.json();
const { startAt, callerName, callerPhone } = body.tool_call.arguments;

const accessToken = Deno.env.get("SQUARE_ACCESS_TOKEN");
const locationId = Deno.env.get("SQUARE_LOCATION_ID");
const serviceVariationId = Deno.env.get("SQUARE_SERVICE_VARIATION_ID");
const serviceVariationVersion = Number(Deno.env.get("SQUARE_SERVICE_VARIATION_VERSION"));
const teamMemberId = Deno.env.get("SQUARE_TEAM_MEMBER_ID"); // default staff
const durationMinutes = Number(Deno.env.get("SQUARE_SERVICE_DURATION_MIN") ?? "45");
const base = "https://connect.squareup.com/v2";

const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
  "Square-Version": "2024-01-18",
};

// 1. Find or create customer
const searchRes = await fetch(`${base}/customers/search`, {
  method: "POST",
  headers,
  body: JSON.stringify({ query: { filter: { phone_number: { exact: callerPhone } } } }),
}).then(r => r.json());

let customerId: string;
if (searchRes.customers?.length > 0) {
  customerId = searchRes.customers[0].id;
} else {
  const [given, ...rest] = callerName.split(" ");
  const created = await fetch(`${base}/customers`, {
    method: "POST",
    headers,
    body: JSON.stringify({ given_name: given, family_name: rest.join(" ") || "—", phone_number: callerPhone }),
  }).then(r => r.json());
  customerId = created.customer.id;
}

// 2. Book
const booking = await fetch(`${base}/bookings`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    booking: {
      start_at: startAt,
      location_id: locationId,
      customer_id: customerId,
      customer_note: "Booked via Yappr voice agent",
      appointment_segments: [{
        duration_minutes: durationMinutes,
        service_variation_id: serviceVariationId,
        service_variation_version: serviceVariationVersion,
        team_member_id: teamMemberId,
      }],
    },
    idempotency_key: crypto.randomUUID(),
  }),
}).then(r => r.json());

return new Response(
  JSON.stringify({
    result: `Booking confirmed. ID: ${booking.booking.id}, status: ${booking.booking.status}`,
  }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);
```

## Gotchas & Rate Limits

- **`service_variation_id`, not `service_id`**: Square's catalog model has Items → Variations. The booking API requires the variation ID, not the item ID. Fetch the catalog once and store the variation ID as an env var.
- **`service_variation_version` is required**: This field must match the current version of the catalog object or the booking will be rejected with `VERSION_MISMATCH`. Re-fetch the catalog if you start seeing these errors.
- **`idempotency_key`**: Required on create and cancel. Use `crypto.randomUUID()`. Retrying with the same key safely returns the original result without creating a duplicate.
- **Availability search is POST, not GET**: Counter-intuitive but correct — availability filtering requires a request body.
- **Square-Version header**: Always pin to a specific date version (e.g. `2024-01-18`). Without it, Square uses your app's default version which may differ from what you tested against.
- **Phone number format**: Square requires E.164 format for customer search. `+972501234567` works; `0501234567` does not.
- **Location IDs**: Businesses with multiple locations (e.g. two salon branches) have separate `location_id` values. Always store the specific location you're booking for.
- **Sandbox vs. Production**: Sandbox and Production have completely separate customer and catalog data. Sandbox access tokens have the prefix `EAAAl`.
- **Rate limits**: 500 requests/minute per access token. Each booking flow (search + find/create customer + create booking) is 3 requests — well within limits.
