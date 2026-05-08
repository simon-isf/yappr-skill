# SimplyBook.me

> **Use in Yappr context**: Check available appointment slots and book appointments during voice calls — fetch available times before the call starts and inject them as context, then confirm and book the chosen slot in real time.

## Authentication

SimplyBook.me uses a **JSON-RPC token** system. You need:

1. **Company login** — your SimplyBook.me subdomain (e.g., `mycompany` from `mycompany.simplybook.me`)
2. **API key** — found in SimplyBook.me admin panel: Manage → Plugins → API → Settings

Authentication is a two-step process:
1. Call `getToken` on the login service → receive `token`
2. Pass `token` in the `X-Token` header (and `company_login` in `X-Company-Login`) for all subsequent API calls

Tokens expire after a period of inactivity (~24 hours). Call `refreshToken` to extend without re-authenticating, or just call `getToken` again at the start of each edge function invocation.

## Base URL

**Login service** (for `getToken` only):
```
https://user-api.simplybook.me/login
```

**Main API service** (all other methods):
```
https://user-api.simplybook.me
```

All requests are **POST** with `Content-Type: application/json` using JSON-RPC 2.0 format.

### JSON-RPC Request Structure

```json
{
  "jsonrpc": "2.0",
  "method": "methodName",
  "params": ["param1", "param2"],
  "id": 1
}
```

Always increment `id` per request (or use any unique integer). The `id` in the response matches the request for correlation.

## Key Endpoints

### Get Auth Token
**POST https://user-api.simplybook.me/login**

**Headers:**
```
Content-Type: application/json
```

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "getToken",
  "params": ["mycompany", "your-api-key-here"],
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "abc123def456token"
}
```

The `result` is the token string. All subsequent calls use:

```
X-Company-Login: mycompany
X-Token: abc123def456token
```

---

### Refresh Token
**POST https://user-api.simplybook.me/login**

```json
{
  "jsonrpc": "2.0",
  "method": "refreshToken",
  "params": ["mycompany", "abc123def456token"],
  "id": 2
}
```

Returns a new token or `false` if the token has fully expired (requiring a fresh `getToken`).

---

### Get Services (Event Types)
**POST https://user-api.simplybook.me**

**Headers:**
```
X-Company-Login: mycompany
X-Token: abc123def456token
Content-Type: application/json
```

```json
{
  "jsonrpc": "2.0",
  "method": "getEventList",
  "params": [],
  "id": 3
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "1": {
      "id": "1",
      "name": "תספורת גברים",
      "duration": 30,
      "price": "80.00",
      "currency": "ILS"
    },
    "2": {
      "id": "2",
      "name": "צביעת שיער",
      "duration": 90,
      "price": "250.00"
    }
  }
}
```

`id` values are the `$eventId` used in booking calls.

---

### Get Providers (Staff / Units)
**POST https://user-api.simplybook.me**

```json
{
  "jsonrpc": "2.0",
  "method": "getUnitList",
  "params": [],
  "id": 4
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "1": { "id": "1", "name": "מיכל" },
    "2": { "id": "2", "name": "אורית" }
  }
}
```

Pass `null` for `$unitId` in booking calls to allow any available provider.

---

### Get Available Slots for a Date Range
**POST https://user-api.simplybook.me**

```json
{
  "jsonrpc": "2.0",
  "method": "getStartTimeMatrix",
  "params": ["2026-04-14", "2026-04-18", "1", null, 1],
  "id": 5
}
```

Params: `[$from, $to, $eventId, $unitId, $count]`
- `$from` / `$to`: date strings in `YYYY-MM-DD` format
- `$eventId`: service ID (from `getEventList`)
- `$unitId`: provider ID or `null` for any
- `$count`: number of participants (usually `1`)

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "2026-04-14": ["09:00:00", "09:30:00", "10:00:00", "11:00:00"],
    "2026-04-15": ["09:00:00", "10:30:00", "14:00:00"],
    "2026-04-16": [],
    "2026-04-17": ["09:00:00", "09:30:00"]
  }
}
```

Days with empty arrays are fully booked or non-working days.

---

### Book Appointment
**POST https://user-api.simplybook.me**

```json
{
  "jsonrpc": "2.0",
  "method": "book",
  "params": [
    "1",
    null,
    "2026-04-15",
    "10:30:00",
    {
      "name": "דוד כהן",
      "email": "david@example.com",
      "phone": "0501234567"
    },
    null,
    1,
    null,
    null
  ],
  "id": 6
}
```

Params order: `[$eventId, $unitId, $date, $startTime, $clientData, $additional, $count, $batchId, $recurringData]`

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "id": "78901",
    "code": "XY89Z",
    "start_date_time": "2026-04-15 10:30:00",
    "end_date_time": "2026-04-15 11:00:00",
    "event_name": "תספורת גברים",
    "unit_name": "מיכל",
    "client_name": "דוד כהן"
  }
}
```

`code` is the booking reference shown to the customer.

---

### Cancel Booking
**POST https://user-api.simplybook.me**

```json
{
  "jsonrpc": "2.0",
  "method": "cancelBooking",
  "params": ["78901"],
  "id": 7
}
```

Returns `true` on success.

---

### Get Booking Details
**POST https://user-api.simplybook.me**

```json
{
  "jsonrpc": "2.0",
  "method": "getBooking",
  "params": ["78901"],
  "id": 8
}
```

---

## Common Patterns

### Pre-fetch slots before call, inject as context
```typescript
// Run this in the Yappr pre-call webhook or on-demand tool handler

const COMPANY = Deno.env.get("SIMPLYBOOK_COMPANY")!;
const API_KEY = Deno.env.get("SIMPLYBOOK_API_KEY")!;
const EVENT_ID = Deno.env.get("SIMPLYBOOK_EVENT_ID") ?? "1";

async function sbPost(url: string, method: string, params: unknown[], token?: string, id = 1) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["X-Company-Login"] = COMPANY;
    headers["X-Token"] = token;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`SimplyBook error: ${JSON.stringify(data.error)}`);
  return data.result;
}

export async function getAvailableSlots(): Promise<string[]> {
  // 1. Authenticate
  const token = await sbPost("https://user-api.simplybook.me/login", "getToken", [COMPANY, API_KEY]);

  // 2. Get slots for next 7 days
  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const from = today.toISOString().split("T")[0];
  const to = nextWeek.toISOString().split("T")[0];

  const matrix = await sbPost(
    "https://user-api.simplybook.me",
    "getStartTimeMatrix",
    [from, to, EVENT_ID, null, 1],
    token,
    2
  );

  // 3. Flatten to human-readable slot strings
  const slots: string[] = [];
  for (const [date, times] of Object.entries(matrix as Record<string, string[]>)) {
    for (const time of times.slice(0, 3)) { // max 3 per day
      const dt = new Date(`${date}T${time}`);
      slots.push(dt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }));
    }
    if (slots.length >= 6) break; // return max 6 options to inject into agent context
  }
  return slots;
}

export async function bookAppointment(
  date: string,
  time: string,
  clientName: string,
  clientPhone: string,
  clientEmail?: string
) {
  const token = await sbPost("https://user-api.simplybook.me/login", "getToken", [COMPANY, API_KEY]);

  return await sbPost(
    "https://user-api.simplybook.me",
    "book",
    [EVENT_ID, null, date, time, { name: clientName, phone: clientPhone, email: clientEmail ?? "" }, null, 1, null, null],
    token,
    2
  );
}
```

## Gotchas & Rate Limits

- **JSON-RPC vs REST**: SimplyBook.me uses JSON-RPC 2.0, not standard REST. There are no path-based endpoints — all calls go to the same URL with different `method` values.
- **Params are positional arrays**: The order of values in `params` matters. A `null` in the middle still needs to be present to maintain position.
- **Token per invocation**: In Deno edge functions (stateless), call `getToken` at the start of each invocation. It's fast (<100ms) and avoids issues with expired tokens.
- **Pre-fetch slots pattern**: The recommended Yappr pattern is to fetch available slots ~1 minute before calling the customer and inject them as `{{availableSlots}}` in the agent system prompt. This avoids real-time API calls during the voice conversation.
- **`getStartTimeMatrix` date range**: Keep the date range ≤14 days. Larger ranges are slow and return excessive data.
- **Booking failures**: If the slot was taken between fetching and booking, the API throws an exception. Catch this and offer the next available slot.
- **Rate limits**: Not publicly documented. Safe for normal conversational usage (a few calls per booking flow).
- **Timezone**: SimplyBook.me stores times in the business's configured timezone. If the business is in Israel, times are `Asia/Jerusalem`. Confirm with the client — never assume UTC.
- **API plugin required**: The API only works if the business has enabled the "API" plugin in their SimplyBook.me plan. It's available on paid plans.
