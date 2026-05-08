# Kommo CRM (formerly amoCRM)

> **Use in Yappr context**: Create a CRM lead in the correct pipeline stage after a qualification call, update the lead status based on call disposition (interested, not interested, callback), and log a call note with the conversation summary.

## Authentication

Kommo uses **OAuth 2.0**. Access tokens expire after **24 hours**. Refresh tokens are long-lived (3 months) and must be exchanged for new access tokens before they expire.

### OAuth2 Flow

1. Register your integration at `https://www.kommo.com/developers/` → Create Integration
2. Get `client_id`, `client_secret`, and set your `redirect_uri`
3. Direct the user to authorize:
   ```
   https://{subdomain}.kommo.com/oauth?client_id={client_id}&state=random&mode=popup
   ```
4. Receive `authorization_code` at your `redirect_uri`
5. Exchange for tokens:

**POST https://{subdomain}.kommo.com/oauth2/access_token**

```json
{
  "client_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "client_secret": "your_client_secret",
  "grant_type": "authorization_code",
  "code": "def50200...",
  "redirect_uri": "https://your-app.com/kommo/callback"
}
```

**Response:**
```json
{
  "token_type": "Bearer",
  "expires_in": 86400,
  "access_token": "eyJ0eXAiOiJKV1Q...",
  "refresh_token": "def50200..."
}
```

### Refresh Tokens

**POST https://{subdomain}.kommo.com/oauth2/access_token**

```json
{
  "client_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "client_secret": "your_client_secret",
  "grant_type": "refresh_token",
  "refresh_token": "def50200...",
  "redirect_uri": "https://your-app.com/kommo/callback"
}
```

Store `access_token` and `refresh_token` in your database. Refresh proactively (e.g., every 23 hours via cron).

## Base URL

```
https://{subdomain}.kommo.com/api/v4
```

Replace `{subdomain}` with the account's subdomain (e.g., `mycompany.kommo.com` → subdomain is `mycompany`).

## Key Endpoints

### Get Pipelines and Stages
**GET /pipelines**

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "_embedded": {
    "pipelines": [
      {
        "id": 100,
        "name": "מכירות",
        "_embedded": {
          "statuses": [
            { "id": 1001, "name": "ליד חדש", "sort": 10 },
            { "id": 1002, "name": "בטיפול", "sort": 20 },
            { "id": 1003, "name": "הצעת מחיר נשלחה", "sort": 30 },
            { "id": 142, "name": "Closed Won", "sort": 10000 },
            { "id": 143, "name": "Closed Lost", "sort": 10001 }
          ]
        }
      }
    ]
  }
}
```

Fetch this once during setup and store pipeline/status IDs as configuration. `status_id: 142` = won, `143` = lost (these are global constants in Kommo).

---

### Create Contact
**POST /contacts**

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request:**
```json
[
  {
    "name": "דוד כהן",
    "custom_fields_values": [
      {
        "field_code": "PHONE",
        "values": [{ "value": "+972501234567", "enum_code": "WORK" }]
      },
      {
        "field_code": "EMAIL",
        "values": [{ "value": "david@example.com", "enum_code": "WORK" }]
      }
    ]
  }
]
```

Note: Contacts are created as an **array** (batch). Always wrap in `[]`.

**Response:**
```json
{
  "_embedded": {
    "contacts": [
      {
        "id": 55001,
        "name": "דוד כהן",
        "created_at": 1744300000
      }
    ]
  }
}
```

---

### Create Lead
**POST /leads**

**Request:**
```json
[
  {
    "name": "דוד כהן — Yappr שיחה 11.4.26",
    "pipeline_id": 100,
    "status_id": 1001,
    "price": 1500,
    "responsible_user_id": 12345,
    "_embedded": {
      "contacts": [{ "id": 55001 }]
    }
  }
]
```

**Response:**
```json
{
  "_embedded": {
    "leads": [
      {
        "id": 88001,
        "name": "דוד כהן — Yappr שיחה 11.4.26",
        "status_id": 1001,
        "pipeline_id": 100
      }
    ]
  }
}
```

---

### Update Lead Stage (Disposition)
**PATCH /leads**

**Request:**
```json
[
  {
    "id": 88001,
    "status_id": 1002
  }
]
```

For bulk updates, include multiple objects in the array. Up to 50 per request.

**Response:** Updated lead array.

To mark a lead as won: `"status_id": 142`. To mark as lost: `"status_id": 143`.

---

### Create Lead + Contact in One Call (Complex Add)
**POST /leads/complex**

Creates a lead, contact, and company simultaneously. Useful when you have all details from the call.

**Request:**
```json
[
  {
    "name": "דוד כהן — Yappr שיחה",
    "pipeline_id": 100,
    "status_id": 1001,
    "_embedded": {
      "contacts": [
        {
          "name": "דוד כהן",
          "custom_fields_values": [
            {
              "field_code": "PHONE",
              "values": [{ "value": "+972501234567", "enum_code": "WORK" }]
            }
          ]
        }
      ]
    }
  }
]
```

---

### Search Leads by Phone (via Contact)
**GET /contacts?query={phone}**

**Request:**
```
GET /api/v4/contacts?query=+972501234567&with=leads
```

**Response:**
```json
{
  "_embedded": {
    "contacts": [
      {
        "id": 55001,
        "name": "דוד כהן",
        "_embedded": {
          "leads": [{ "id": 88001 }]
        }
      }
    ]
  }
}
```

Use `with=leads` to include associated leads in the response.

---

### Add Note to Lead
**POST /leads/{lead_id}/notes**

**Request:**
```json
[
  {
    "note_type": "common",
    "params": {
      "text": "שיחה עם לקוח:\n- מעוניין בחבילת עסקים\n- מבקש הצעת מחיר\n- זמן מועדף: בוקר\n\nסיכום שיחת Yappr AI"
    }
  }
]
```

For call log notes: `"note_type": "call_in"` (inbound) or `"call_out"` (outbound):
```json
[
  {
    "note_type": "call_in",
    "params": {
      "uniq": "unique-call-id-123",
      "duration": 142,
      "source": "Yappr AI",
      "link": "https://your-recording-url.com/call.mp3",
      "phone": "+972501234567"
    }
  }
]
```

---

## Common Patterns

### Post-call upsert: find contact, create lead, log note
```typescript
// Deno edge function snippet

const BASE = `https://${Deno.env.get("KOMMO_SUBDOMAIN")}.kommo.com/api/v4`;
const token = Deno.env.get("KOMMO_ACCESS_TOKEN")!;

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

export async function logCallToKommo(
  callerPhone: string,
  callerName: string,
  callSummary: string,
  disposition: "interested" | "not_interested" | "callback",
  pipelineId: number,
  statusMap: Record<string, number>
) {
  // 1. Search for existing contact by phone
  const searchRes = await fetch(
    `${BASE}/contacts?query=${encodeURIComponent(callerPhone)}&with=leads`,
    { headers }
  );
  const searchData = await searchRes.json();
  const existingContact = searchData._embedded?.contacts?.[0];

  let contactId: number;
  let leadId: number;

  if (existingContact) {
    contactId = existingContact.id;
    leadId = existingContact._embedded?.leads?.[0]?.id;
  } else {
    // 2. Create contact + lead in one call
    const createRes = await fetch(`${BASE}/leads/complex`, {
      method: "POST",
      headers,
      body: JSON.stringify([{
        name: `${callerName} — Yappr`,
        pipeline_id: pipelineId,
        status_id: statusMap["new"],
        _embedded: {
          contacts: [{
            name: callerName,
            custom_fields_values: [{
              field_code: "PHONE",
              values: [{ value: callerPhone, enum_code: "WORK" }],
            }],
          }],
        },
      }]),
    });
    const created = await createRes.json();
    leadId = created._embedded?.leads?.[0]?.id;
    contactId = created._embedded?.contacts?.[0]?.id;
  }

  // 3. Update lead status based on disposition
  const newStatusId = disposition === "interested"
    ? statusMap["qualified"]
    : disposition === "not_interested"
    ? 143 // Kommo global: Closed Lost
    : statusMap["callback"];

  await fetch(`${BASE}/leads`, {
    method: "PATCH",
    headers,
    body: JSON.stringify([{ id: leadId, status_id: newStatusId }]),
  });

  // 4. Add call note
  await fetch(`${BASE}/leads/${leadId}/notes`, {
    method: "POST",
    headers,
    body: JSON.stringify([{
      note_type: "call_in",
      params: {
        uniq: crypto.randomUUID(),
        duration: 0,
        source: "Yappr AI",
        phone: callerPhone,
        text: callSummary,
      },
    }]),
  });

  return { contactId, leadId };
}
```

## Gotchas & Rate Limits

- **Rate limits**: 7 requests/second per account. Batch operations (array requests) count as 1 request. Use arrays for bulk creates/updates.
- **Token refresh**: Access tokens expire in 24 hours. Store refresh tokens securely in Supabase and refresh before expiry. A refresh token can only be used once — using it invalidates it and returns a new pair.
- **Subdomain binding**: Tokens are bound to a specific subdomain. If a customer has multiple Kommo accounts, you need separate credentials per subdomain.
- **Array format**: All `POST` and `PATCH` operations require the body to be a JSON **array**, even for single items. `{ }` instead of `[{ }]` returns `400`.
- **`status_id: 142/143`**: These are Kommo-wide constants for "Won" and "Lost" — they exist in every account. All other status IDs are account-specific.
- **Custom fields**: Phone and email are built-in fields accessed via `field_code`. Other custom fields are accessed by `field_id` (numeric). Fetch field definitions via `GET /contacts/custom_fields`.
- **Pagination**: Default is 50 results per page. Use `page` query param: `?page=2&limit=50`. Max `limit` is 250.
- **`with` parameter**: Use `?with=contacts,leads,companies` to sideload related entities in a single request and reduce round trips.
