# Wix CRM / Wix Contacts

> **Use in Yappr context**: When a caller is an existing Wix site visitor or form submitter, look them up by phone and update their contact record with call outcome; after a lead qualification call, create a new Wix contact and trigger a Wix Automation to start a nurture flow.

## Authentication

Wix REST API uses **API Keys** (site-level or account-level).

1. In the Wix dashboard: Settings → Advanced Settings → API Keys
2. Create a key, assign permissions: `Contacts.Read`, `Contacts.Write`
3. Pass the key in the `Authorization` header

All site-level calls also require the **`wix-site-id`** header (your site's ID, found in the Wix dashboard URL: `manage.wix.com/dashboard/{site-id}/...`).

**Headers for all requests:**
```
Authorization: {your-api-key}
wix-site-id: {your-site-id}
Content-Type: application/json
```

Note: The `Authorization` header contains the raw API key, not `Bearer {key}`.

## Base URL

```
https://www.wixapis.com/contacts/v4
```

## Key Endpoints

### Query Contacts by Phone
**POST /contacts/query**

**Headers:**
```
Authorization: {api-key}
wix-site-id: {site-id}
Content-Type: application/json
```

**Request:**
```json
{
  "query": {
    "filter": {
      "phones.phone": { "$eq": "+972501234567" }
    },
    "fieldsets": ["FULL"],
    "paging": { "limit": 1 }
  }
}
```

Also try searching with local format as fallback:
```json
{
  "query": {
    "filter": {
      "phones.phone": { "$contains": "501234567" }
    },
    "fieldsets": ["FULL"],
    "paging": { "limit": 5 }
  }
}
```

**Response:**
```json
{
  "contacts": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "info": {
        "name": {
          "first": "דוד",
          "last": "כהן"
        },
        "emails": {
          "items": [
            { "tag": "MAIN", "email": "david@example.com" }
          ]
        },
        "phones": {
          "items": [
            { "tag": "MOBILE", "phone": "+972501234567" }
          ]
        },
        "labelKeys": {
          "items": ["custom.lead", "custom.yappr-called"]
        }
      },
      "primaryInfo": {
        "email": "david@example.com",
        "phone": "+972501234567"
      },
      "createdDate": "2026-03-01T10:00:00.000Z",
      "updatedDate": "2026-04-10T08:30:00.000Z"
    }
  ],
  "pagingMetadata": {
    "count": 1,
    "total": 1
  }
}
```

---

### Get Contact by ID
**GET /contacts/{contactId}**

```
GET /contacts/a1b2c3d4-e5f6-7890-abcd-ef1234567890?fieldsets=FULL
```

**Response:** Single contact object (same structure as above).

---

### Create Contact
**POST /contacts**

**Request:**
```json
{
  "info": {
    "name": {
      "first": "דוד",
      "last": "כהן"
    },
    "phones": {
      "items": [
        {
          "tag": "MOBILE",
          "phone": "+972501234567",
          "primary": true
        }
      ]
    },
    "emails": {
      "items": [
        {
          "tag": "MAIN",
          "email": "david@example.com",
          "primary": true
        }
      ]
    },
    "extendedFields": {
      "items": [
        {
          "key": "custom.yappr-call-date",
          "value": "2026-04-11"
        },
        {
          "key": "custom.yappr-disposition",
          "value": "interested"
        }
      ]
    }
  }
}
```

**Response:**
```json
{
  "contact": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "info": {
      "name": { "first": "דוד", "last": "כהן" }
    },
    "createdDate": "2026-04-11T10:00:00.000Z"
  }
}
```

At least one of `name`, `phone`, or `email` is required.

---

### Update Contact
**PATCH /contacts/{contactId}**

**Request:**
```json
{
  "info": {
    "extendedFields": {
      "items": [
        {
          "key": "custom.yappr-last-call",
          "value": "2026-04-11"
        },
        {
          "key": "custom.yappr-disposition",
          "value": "callback-requested"
        }
      ]
    },
    "labelKeys": {
      "items": ["custom.yappr-contacted"]
    }
  },
  "revision": "2"
}
```

`revision` is required and must match the current revision number from the GET response. This prevents lost-update races.

**Response:** Updated contact object.

---

### List Contacts (with search)
**GET /contacts?search={term}&fieldsets=FULL**

```
GET /contacts?search=דוד&fieldsets=FULL&paging.limit=20
```

---

### Add Label to Contact
**POST /contacts/{contactId}/labels**

```json
{
  "labelKeys": ["custom.yappr-hot-lead"]
}
```

Labels must exist in the Wix CRM before assigning. Create them in the dashboard: Contacts → Labels.

---

## Common Patterns

### Upsert contact after call + set custom fields
```typescript
// Deno edge function snippet

const WIX_API_KEY = Deno.env.get("WIX_API_KEY")!;
const WIX_SITE_ID = Deno.env.get("WIX_SITE_ID")!;
const BASE = "https://www.wixapis.com/contacts/v4";

const wixHeaders = {
  Authorization: WIX_API_KEY,
  "wix-site-id": WIX_SITE_ID,
  "Content-Type": "application/json",
};

async function wixRequest(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: wixHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Wix API ${method} ${path} ${res.status}: ${err}`);
  }
  return res.json();
}

export async function upsertContactAfterCall(
  callerPhone: string,
  callerName: string,
  callerEmail: string | undefined,
  disposition: string,
  callDate: string
) {
  // 1. Search by E.164 phone
  const search = await wixRequest("/contacts/query", "POST", {
    query: {
      filter: { "phones.phone": { "$eq": callerPhone } },
      fieldsets: ["FULL"],
      paging: { limit: 1 },
    },
  });

  const [firstName, ...lastParts] = callerName.split(" ");
  const lastName = lastParts.join(" ");

  const customFields = [
    { key: "custom.yappr-last-call", value: callDate },
    { key: "custom.yappr-disposition", value: disposition },
  ];

  if (search.contacts?.length > 0) {
    // Update existing
    const contact = search.contacts[0];
    await wixRequest(`/contacts/${contact.id}`, "PATCH", {
      info: {
        extendedFields: { items: customFields },
      },
      revision: contact.revision ?? "1",
    });
    return { contactId: contact.id, action: "updated" };
  }

  // Create new
  const created = await wixRequest("/contacts", "POST", {
    info: {
      name: { first: firstName, last: lastName },
      phones: { items: [{ tag: "MOBILE", phone: callerPhone, primary: true }] },
      ...(callerEmail && {
        emails: { items: [{ tag: "MAIN", email: callerEmail, primary: true }] },
      }),
      extendedFields: { items: customFields },
    },
  });
  return { contactId: created.contact.id, action: "created" };
}
```

### Use Wix Automations as a lead intake trigger

Wix Automations can fire when a contact is created or a label is applied. Use this instead of building custom email/CRM flows:

1. In Wix dashboard: Automations → + New Automation
2. Trigger: "Contact label assigned" → label: `custom.yappr-hot-lead`
3. Action: Send email, assign to team member, create a task, etc.

This lets non-technical users configure post-call follow-up without code changes.

## Gotchas & Rate Limits

- **Authorization header format**: Unlike most APIs, Wix uses the raw API key in `Authorization` without a `Bearer ` prefix. `Authorization: sk-...` not `Authorization: Bearer sk-...`.
- **`wix-site-id` is required**: All contacts operations are site-scoped. Missing this header returns `400 Bad Request`.
- **`revision` on PATCH**: Required and must match the current value. Fetch the contact first if you don't have the revision. On conflict, re-fetch and retry.
- **Phone format**: Wix accepts E.164 (`+972501234567`) and local (`0501234567`). Use E.164 when creating for consistency. Searching with `$contains` on the last 9 digits is a reliable fallback.
- **Extended fields**: Custom fields (`extendedFields`) must be created in the Wix CRM settings before they can be set via API. You cannot create ad-hoc keys via the API.
- **Labels**: Labels also must be pre-created in the dashboard. The API can assign/remove labels but not create them.
- **Rate limits**: Wix API has a limit of ~200 requests/minute per API key. For high-call-volume scenarios, consider batching or using a queue.
- **Contacts v4 vs legacy**: Wix has a legacy contacts API (`/crm/v3/contacts`) and the newer v4 (`/contacts/v4`). Use v4 — v3 is deprecated.
- **Fieldsets**: `BASIC` fieldset returns only name, primary email, and primary phone. Use `FULL` to get all fields, labels, and extended fields.
