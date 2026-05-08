# ActiveCampaign

> **Use in Yappr context**: Add leads to ActiveCampaign after calls, tag them based on disposition, and trigger email automation sequences for follow-up.

## Authentication

- Get API URL and key: ActiveCampaign account → Settings → Developer → API Access
- API URL format: `https://{account}.api-us1.com`
- Pass key as header: `Api-Token: {key}` (NOT Bearer)

## Base URL

```
https://{account}.api-us1.com/api/3
```

## Key Endpoints

**Headers for all requests:**
```
Api-Token: {your_api_key}
Content-Type: application/json
```

### Create or Update Contact (Sync)
**POST /api/3/contact/sync**

This is the recommended upsert endpoint — creates if not found by email, updates if found.

**Request:**
```json
{
  "contact": {
    "email": "david@example.com",
    "firstName": "David",
    "lastName": "Cohen",
    "phone": "+972501234567",
    "fieldValues": [
      { "field": "1", "value": "Business" },
      { "field": "2", "value": "Appointment Set" }
    ]
  }
}
```

`fieldValues` use field IDs (fetch from `/api/3/fields` to get IDs).

**Response:**
```json
{
  "contact": {
    "id": "42",
    "email": "david@example.com",
    "firstName": "David",
    "lastName": "Cohen",
    "phone": "+972501234567"
  }
}
```

---

### Search Contact by Email
**GET /api/3/contacts?email={email}**

**Response:**
```json
{
  "contacts": [
    {
      "id": "42",
      "email": "david@example.com",
      "firstName": "David",
      "phone": "+972501234567"
    }
  ]
}
```

---

### Search Contact by Phone
**GET /api/3/contacts?search={phone}**

`search` does a broad search across name, email, phone fields.

---

### Add Tag to Contact
**POST /api/3/contactTags**

**Request:**
```json
{
  "contactTag": {
    "contact": "42",
    "tag": "15"
  }
}
```

Get tag IDs via `GET /api/3/tags?search=appointment-set`.

**Response:**
```json
{
  "contactTag": {
    "id": "100",
    "contact": "42",
    "tag": "15"
  }
}
```

---

### Get Tags
**GET /api/3/tags?search=yappr**

**Response:**
```json
{
  "tags": [
    { "id": "15", "tag": "yappr-appointment-set", "tagType": "contact" },
    { "id": "16", "tag": "yappr-not-interested", "tagType": "contact" }
  ]
}
```

---

### Create Tag
**POST /api/3/tags**

```json
{
  "tag": {
    "tag": "yappr-callback-requested",
    "tagType": "contact",
    "description": "Lead requested callback via Yappr AI"
  }
}
```

---

### Set Custom Field Value
**POST /api/3/fieldValues**

```json
{
  "fieldValue": {
    "contact": "42",
    "field": "5",
    "value": "Appointment Set"
  }
}
```

Get field IDs via `GET /api/3/fields`.

---

### Add Contact to List
**POST /api/3/contactLists**

```json
{
  "contactList": {
    "list": "3",
    "contact": "42",
    "status": "1"
  }
}
```

Status: `1` = subscribed, `2` = unsubscribed

---

### Trigger Automation for Contact
**POST /api/3/contactAutomations**

```json
{
  "contactAutomation": {
    "contact": "42",
    "automation": "7"
  }
}
```

Get automation IDs via `GET /api/3/automations`.

---

### Get Custom Fields
**GET /api/3/fields**

**Response:**
```json
{
  "fields": [
    { "id": "1", "title": "Product Interest", "perstag": "PRODUCT_INTEREST", "type": "text" },
    { "id": "2", "title": "Last Call Disposition", "perstag": "LAST_CALL_DISPOSITION", "type": "text" }
  ]
}
```

## Common Patterns

### Post-call contact sync with tags
```typescript
const base = `https://${account}.api-us1.com/api/3`;
const headers = { "Api-Token": apiKey, "Content-Type": "application/json" };

// 1. Sync contact
const syncRes = await fetch(`${base}/contact/sync`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    contact: {
      email: callerEmail,
      firstName: callerFirstName,
      phone: callerPhone,
      fieldValues: [
        { field: LAST_DISPOSITION_FIELD_ID, value: disposition },
      ],
    },
  }),
}).then(r => r.json());

const contactId = syncRes.contact.id;

// 2. Get or create tag for disposition
const tagSearch = await fetch(
  `${base}/tags?search=${encodeURIComponent("yappr-" + disposition.toLowerCase().replace(/\s+/g, "-"))}`,
  { headers }
).then(r => r.json());

let tagId = tagSearch.tags?.[0]?.id;
if (!tagId) {
  const newTag = await fetch(`${base}/tags`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tag: { tag: `yappr-${disposition.toLowerCase().replace(/\s+/g, "-")}`, tagType: "contact" } }),
  }).then(r => r.json());
  tagId = newTag.tag.id;
}

// 3. Tag contact
await fetch(`${base}/contactTags`, {
  method: "POST",
  headers,
  body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }),
});

// 4. Trigger follow-up automation
if (disposition === "Appointment Set") {
  await fetch(`${base}/contactAutomations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contactAutomation: { contact: contactId, automation: APPOINTMENT_AUTOMATION_ID } }),
  });
}
```

## Gotchas & Rate Limits

- **Rate limits**: 5 requests/second. Burst allowed but sustained high rate triggers 429.
- **`contact/sync` vs `POST /contacts`**: Use `/contact/sync` for upsert by email. The plain POST `/contacts` always creates (even duplicates).
- **`Api-Token` header**: Not `Authorization: Bearer`. The exact header name is `Api-Token`.
- **Field IDs are numeric strings**: Custom field references are `"1"`, `"2"` etc. Fetch field list and cache.
- **List vs tag**: Tags are freeform labels. Lists are subscription-based (needed for email marketing). Use both: tag for segmentation, list for email sends.
- **Phone format**: ActiveCampaign accepts any phone format but E.164 (`+972501234567`) is best for consistency.
- **Automation entry**: Adding a contact to an automation via API only works if the automation is set to allow re-entry or the contact hasn't already gone through it.
- **Account subdomain**: The `{account}` in the URL is your specific subdomain shown in the API access settings page.
