# Airtable

> **Use in Yappr context**: Use Airtable as a lightweight CRM or call log database — append call records, update contact rows, and trigger calls when new rows are added.

## Authentication

- Get Personal Access Token: Airtable account → Developer Hub → Personal access tokens → Create token
- Required scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
- Pass as: `Authorization: Bearer {token}`

## Base URL

```
https://api.airtable.com/v0/{baseId}/{tableName}
```

**Base ID**: Found in the Airtable URL: `https://airtable.com/{BASE_ID}/...`
**Table name**: URL-encoded table name or table ID (e.g. `tblXXXXXXXXXXXXXX`)

## Key Endpoints

**Headers for all requests:**
```
Authorization: Bearer pat_xxx...
Content-Type: application/json
```

### List Records
**GET /v0/{baseId}/{tableName}?maxRecords=50&view=Grid%20view**

**Query params:**
- `maxRecords` — limit results
- `view` — filter by a saved view
- `filterByFormula` — Airtable formula for filtering
- `fields[]` — specific fields to return
- `sort[0][field]` & `sort[0][direction]` — sort

**URL example (filter by phone):**
```
GET /v0/{baseId}/Leads?filterByFormula=({Phone}="%2B972501234567")
```

**Response:**
```json
{
  "records": [
    {
      "id": "recXXXXXXXXXXXXXX",
      "createdTime": "2026-04-11T10:00:00.000Z",
      "fields": {
        "Name": "David Cohen",
        "Phone": "+972501234567",
        "Email": "david@example.com",
        "Status": "New Lead"
      }
    }
  ],
  "offset": "rec_next_page_cursor"
}
```

If `offset` is present, pass it as `?offset={value}` to get the next page.

---

### Create Record
**POST /v0/{baseId}/{tableName}**

**Request:**
```json
{
  "records": [
    {
      "fields": {
        "Name": "David Cohen",
        "Phone": "+972501234567",
        "Email": "david@example.com",
        "Status": "Appointment Set",
        "Call Date": "2026-04-11",
        "Call Summary": "Customer interested in Business plan."
      }
    }
  ]
}
```

**Response:**
```json
{
  "records": [
    {
      "id": "recXXXXXXXXXXXXXX",
      "createdTime": "2026-04-11T10:00:00.000Z",
      "fields": { ... }
    }
  ]
}
```

Up to 10 records per request.

---

### Update Record (Partial)
**PATCH /v0/{baseId}/{tableName}/{recordId}**

```json
{
  "fields": {
    "Status": "Contacted",
    "Last Call": "2026-04-11"
  }
}
```

---

### Update Record (Full Replace)
**PUT /v0/{baseId}/{tableName}/{recordId}**

Replaces all fields — unspecified fields become null.

---

### Batch Create Records
**POST /v0/{baseId}/{tableName}**

```json
{
  "records": [
    { "fields": { "Name": "David Cohen", "Phone": "+972501234567" } },
    { "fields": { "Name": "Sarah Levi", "Phone": "+972521234567" } }
  ]
}
```

Max 10 records per request.

---

### Delete Record
**DELETE /v0/{baseId}/{tableName}/{recordId}**

**Response:**
```json
{ "deleted": true, "id": "recXXXXXXXXXXXXXX" }
```

---

### Search by Field (via filterByFormula)
```
GET /v0/{baseId}/Leads?filterByFormula=({Phone}="{phone}")
```

For a phone number with `+`, URL-encode the formula:
```
filterByFormula=({Phone}="%2B972501234567")
```

Or use `FIND()` for partial match:
```
filterByFormula=(FIND("{prefix}",{Phone})>0)
```

---

### Get Base Schema (Field Names and Types)
**GET https://api.airtable.com/v0/meta/bases/{baseId}/tables**

**Response:**
```json
{
  "tables": [
    {
      "id": "tblXXXXXXXXXXXXXX",
      "name": "Leads",
      "fields": [
        { "id": "fldXXX", "name": "Name", "type": "singleLineText" },
        { "id": "fldYYY", "name": "Phone", "type": "phoneNumber" },
        { "id": "fldZZZ", "name": "Status", "type": "singleSelect",
          "options": { "choices": [
            { "name": "New Lead" },
            { "name": "Contacted" }
          ]}
        }
      ]
    }
  ]
}
```

## Common Patterns

### Upsert call record
```typescript
const base = `https://api.airtable.com/v0/${BASE_ID}/Leads`;
const headers = {
  Authorization: `Bearer ${Deno.env.get("AIRTABLE_TOKEN")}`,
  "Content-Type": "application/json",
};

// 1. Search for existing record
const search = await fetch(
  `${base}?filterByFormula=({Phone}="${callerPhone.replace("+", "%2B")}")&maxRecords=1`,
  { headers }
).then(r => r.json());

const existing = search.records?.[0];

if (existing) {
  // Update existing
  await fetch(`${base}/${existing.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      fields: {
        Status: disposition,
        "Last Call Date": new Date().toISOString().split("T")[0],
        Notes: callSummary,
      },
    }),
  });
} else {
  // Create new
  await fetch(base, {
    method: "POST",
    headers,
    body: JSON.stringify({
      records: [{
        fields: {
          Name: callerName,
          Phone: callerPhone,
          Status: disposition,
          "Call Date": new Date().toISOString().split("T")[0],
          Notes: callSummary,
        },
      }],
    }),
  });
}
```

## Gotchas & Rate Limits

- **Rate limits**: 5 requests/second per base. Use exponential backoff on 429 responses.
- **`filterByFormula` encoding**: The formula string must be URL-encoded. The `+` in phone numbers must be `%2B` inside the formula string.
- **Field names are case-sensitive**: `"Status"` and `"status"` are different fields. Match exactly.
- **Date format**: Airtable expects `YYYY-MM-DD` for Date fields, ISO 8601 for DateTime fields.
- **Single select**: Pass the exact option string. Passing a value not in the options list creates a new option (or errors depending on field config).
- **Linked record fields**: To link records, pass an array of record IDs: `"Related Contact": ["recXXXX"]`.
- **Personal Access Tokens vs API keys**: Old API keys are deprecated. Use PAT (Personal Access Token) from Developer Hub.
- **Pagination**: Use the `offset` cursor returned in responses. Pass as `?offset={cursor}` in next request.
