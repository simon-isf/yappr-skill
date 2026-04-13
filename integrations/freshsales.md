# Freshsales

> **Use in Yappr context**: Create or update leads and contacts after a call, log call activity with outcome, and look up existing contacts by phone number before the conversation starts.

## Authentication

- Go to your Freshsales profile → Settings → API Settings → copy your **API Key**
- Pass as: `Authorization: Token token=YOUR_API_KEY`
- The token header value is literally `Token token=<key>` — not `Bearer`

## Base URL

```
https://{domain}.myfreshworks.com/crm/sales/api
```

Replace `{domain}` with your Freshworks account subdomain (e.g. `acme.myfreshworks.com`).

## Key Endpoints

### Search Contacts by Phone (filtered_search)
**POST /filtered_search/contact**

> Note: The standard `lookup` endpoint does not reliably filter by phone. Use `filtered_search` with the `mobile_number` attribute instead.

**Headers:**
```
Authorization: Token token=YOUR_API_KEY
Content-Type: application/json
```

**Request:**
```json
{
  "filter_rule": [
    {
      "attribute": "mobile_number",
      "operator": "is_in",
      "value": "+972501234567"
    }
  ],
  "page": 1,
  "per_page": 1
}
```

**Response:**
```json
{
  "contacts": [
    {
      "id": 4501,
      "first_name": "Yael",
      "last_name": "Ben-David",
      "mobile_number": "+972501234567",
      "email": "yael@example.com",
      "owner_id": 101
    }
  ],
  "meta": {
    "total_pages": 1,
    "total_count": 1
  }
}
```

Use `contacts[0].id` for subsequent updates or activity logging.

---

### Create Contact
**POST /contacts**

**Headers:**
```
Authorization: Token token=YOUR_API_KEY
Content-Type: application/json
```

**Request:**
```json
{
  "contact": {
    "first_name": "Yael",
    "last_name": "Ben-David",
    "mobile_number": "+972501234567",
    "email": "yael@example.com"
  }
}
```

**Response:**
```json
{
  "contact": {
    "id": 4502,
    "first_name": "Yael",
    "last_name": "Ben-David",
    "mobile_number": "+972501234567",
    "email": "yael@example.com"
  }
}
```

---

### Update Contact
**PUT /contacts/{id}**

**Request:**
```json
{
  "contact": {
    "mobile_number": "+972501234567",
    "custom_field": {
      "call_outcome_cf": "Interested"
    }
  }
}
```

---

### Create Lead
**POST /leads**

**Request:**
```json
{
  "lead": {
    "first_name": "Yael",
    "last_name": "Ben-David",
    "mobile_number": "+972501234567",
    "email": "yael@example.com",
    "company": { "name": "Acme Ltd" }
  }
}
```

---

### Log Call Activity
**POST /sales_activities**

Requires `sales_activity_type_id` for the "Phone" activity type. Fetch your account's type IDs via `GET /selector/sales_activity_types` — look for the entry with `name: "Phone"`.

**Request:**
```json
{
  "sales_activity": {
    "sales_activity_type_id": 13000188112,
    "title": "Outbound call — qualification",
    "notes": "Caller expressed interest in the Pro plan. Wants a follow-up demo.",
    "start_date": 1712822400,
    "end_date": 1712822700,
    "targetable_type": "Contact",
    "targetable_id": 4501
  }
}
```

**Response:**
```json
{
  "sales_activity": {
    "id": 77001,
    "title": "Outbound call — qualification",
    "sales_activity_type_id": 13000188112,
    "targetable_type": "Contact",
    "targetable_id": 4501,
    "notes": "Caller expressed interest in the Pro plan. Wants a follow-up demo."
  }
}
```

`start_date` / `end_date` are Unix timestamps in seconds.

## Common Patterns

### Post-call upsert + activity log
```typescript
const DOMAIN = Deno.env.get("FRESHSALES_DOMAIN")!; // e.g. "acme"
const API_KEY = Deno.env.get("FRESHSALES_API_KEY")!;
const BASE = `https://${DOMAIN}.myfreshworks.com/crm/sales/api`;

const headers = {
  "Authorization": `Token token=${API_KEY}`,
  "Content-Type": "application/json",
};

async function findContactByPhone(phone: string): Promise<number | null> {
  const res = await fetch(`${BASE}/filtered_search/contact`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filter_rule: [{ attribute: "mobile_number", operator: "is_in", value: phone }],
      page: 1,
      per_page: 1,
    }),
  });
  const data = await res.json();
  return data.contacts?.[0]?.id ?? null;
}

async function logCall(contactId: number, notes: string, activityTypeId: number, durationSecs: number) {
  const now = Math.floor(Date.now() / 1000);
  await fetch(`${BASE}/sales_activities`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      sales_activity: {
        sales_activity_type_id: activityTypeId,
        title: "Voice AI call",
        notes,
        start_date: now - durationSecs,
        end_date: now,
        targetable_type: "Contact",
        targetable_id: contactId,
      },
    }),
  });
}

// Fetch the phone activity type ID once (cache it)
async function getPhoneActivityTypeId(): Promise<number> {
  const res = await fetch(`${BASE}/selector/sales_activity_types`, { headers });
  const data = await res.json();
  const phoneType = data.sales_activity_types?.find((t: { name: string }) => t.name === "Phone");
  return phoneType?.id;
}
```

## Gotchas & Rate Limits

- **Rate limit**: 1,000 requests/hour per API key by default. 429 response when exceeded.
- **Phone search**: The `lookup` endpoint does not support phone number searches — always use `filtered_search`. Phone filtering may still return unexpected results if numbers are stored in different formats; normalize to E.164 (`+972...`) before querying.
- **Activity type IDs**: IDs are account-specific. Always fetch from `GET /selector/sales_activity_types` rather than hardcoding.
- **`targetable_type`**: Accepts `"Contact"`, `"Lead"`, `"Deal"` — must match the `targetable_id` object type.
- **Date fields**: `start_date` and `end_date` in sales activities are Unix timestamps in **seconds**, not milliseconds.
- **Domain format**: The subdomain is your Freshworks bundle alias, not always the same as your company name.
