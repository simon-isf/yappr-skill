# HubSpot

> **Use in Yappr context**: Create or update CRM contacts after calls, log call notes, and create deals when a lead qualifies during a voice conversation.

## Authentication

- Create a **Private App** in HubSpot: Settings → Integrations → Private Apps → Create
- Required scopes: `crm.objects.contacts.write`, `crm.objects.contacts.read`, `crm.objects.deals.write`, `crm.objects.notes.write`
- Token format: `pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Pass as `Authorization: Bearer <token>` header

## Base URL

```
https://api.hubapi.com
```

## Key Endpoints

### Search Contacts by Phone
**POST /crm/v3/objects/contacts/search**

**Headers:**
```
Authorization: Bearer pat-na1-...
Content-Type: application/json
```

**Request:**
```json
{
  "filterGroups": [
    {
      "filters": [
        {
          "propertyName": "phone",
          "operator": "EQ",
          "value": "+972501234567"
        }
      ]
    }
  ],
  "properties": ["firstname", "lastname", "phone", "email", "hs_object_id"],
  "limit": 1
}
```

**Response:**
```json
{
  "total": 1,
  "results": [
    {
      "id": "12345",
      "properties": {
        "firstname": "David",
        "lastname": "Cohen",
        "phone": "+972501234567",
        "email": "david@example.com",
        "hs_object_id": "12345"
      }
    }
  ]
}
```

Use `results[0].id` for subsequent updates.

---

### Create Contact
**POST /crm/v3/objects/contacts**

**Request:**
```json
{
  "properties": {
    "firstname": "David",
    "lastname": "Cohen",
    "phone": "+972501234567",
    "email": "david@example.com",
    "hs_lead_status": "NEW"
  }
}
```

**Response:**
```json
{
  "id": "12345",
  "properties": {
    "firstname": "David",
    "lastname": "Cohen",
    "hs_object_id": "12345",
    "createdate": "2026-04-11T10:00:00Z"
  }
}
```

---

### Update Contact
**PATCH /crm/v3/objects/contacts/:id**

**Request:**
```json
{
  "properties": {
    "hs_lead_status": "IN_PROGRESS",
    "notes_last_contacted": "2026-04-11T10:00:00Z"
  }
}
```

**Response:** Updated contact object with all properties.

---

### Create Note (Call Log)
**POST /crm/v3/objects/notes**

**Request:**
```json
{
  "properties": {
    "hs_note_body": "Call summary: customer interested in Plan B. Follow up by Friday.",
    "hs_timestamp": "2026-04-11T10:00:00.000Z"
  },
  "associations": [
    {
      "to": { "id": "12345" },
      "types": [
        {
          "associationCategory": "HUBSPOT_DEFINED",
          "associationTypeId": 202
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "id": "67890",
  "properties": {
    "hs_note_body": "Call summary: ...",
    "hs_object_id": "67890"
  }
}
```

`associationTypeId: 202` = note → contact. Use `201` for note → deal.

---

### Create Deal
**POST /crm/v3/objects/deals**

**Request:**
```json
{
  "properties": {
    "dealname": "David Cohen — Yappr Lead",
    "amount": "500",
    "dealstage": "appointmentscheduled",
    "pipeline": "default",
    "closedate": "2026-05-01T00:00:00Z"
  },
  "associations": [
    {
      "to": { "id": "12345" },
      "types": [
        {
          "associationCategory": "HUBSPOT_DEFINED",
          "associationTypeId": 3
        }
      ]
    }
  ]
}
```

`associationTypeId: 3` = deal → contact.

**Response:**
```json
{
  "id": "99999",
  "properties": {
    "dealname": "David Cohen — Yappr Lead",
    "dealstage": "appointmentscheduled"
  }
}
```

---

### Get Contact by ID
**GET /crm/v3/objects/contacts/:id?properties=firstname,lastname,phone,email**

**Response:**
```json
{
  "id": "12345",
  "properties": {
    "firstname": "David",
    "phone": "+972501234567"
  }
}
```

## Common Patterns

### Upsert contact after call
```typescript
// 1. Search by phone
const search = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: callerPhone }] }],
    properties: ["hs_object_id"],
    limit: 1,
  }),
}).then(r => r.json());

const contactId = search.results?.[0]?.id;

if (contactId) {
  // 2a. Update existing
  await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { hs_lead_status: "IN_PROGRESS" } }),
  });
} else {
  // 2b. Create new
  const created = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { phone: callerPhone, firstname: callerName } }),
  }).then(r => r.json());
  contactId = created.id;
}

// 3. Log call note
await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    properties: {
      hs_note_body: callSummary,
      hs_timestamp: new Date().toISOString(),
    },
    associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
  }),
});
```

## Gotchas & Rate Limits

- **Rate limits**: 100 requests/10 seconds per Private App; 200 for Enterprise. Use batch endpoints for bulk operations.
- **Phone search**: HubSpot stores phone in many formats. Search with `EQ` on exact E.164 format. If no match, try searching with the local format (e.g. `0501234567`) as a second attempt using `CONTAINS_TOKEN`.
- **Deal stages**: Stage IDs are pipeline-specific. Fetch pipeline stages via `GET /crm/v3/pipelines/deals` to get the right IDs.
- **Association type IDs**: `202` = note→contact, `201` = note→deal, `3` = deal→contact, `4` = contact→deal. Wrong IDs cause silent failures.
- **Timestamps**: `hs_timestamp` on notes must be an ISO 8601 string with milliseconds: `2026-04-11T10:00:00.000Z`
- **Pagination**: Search results max 100 per page; use `after` cursor for pagination.
