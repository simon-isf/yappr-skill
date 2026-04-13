# Mailchimp

> **Use in Yappr context**: Add leads to Mailchimp email lists after calls, tag them based on call disposition, and trigger automated email sequences.

## Authentication

- Get API key: Mailchimp account → Profile → Extras → API Keys → Create A Key
- API key format: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us21` (suffix indicates data center)
- Data center: last part after `-` (e.g. `us21`, `us6`)
- Pass as HTTP Basic Auth — any username, API key as password:
  `Authorization: Basic base64(anystring:{api_key})`

## Base URL

```
https://{dc}.api.mailchimp.com/3.0
```

Where `{dc}` is the data center suffix from your API key (e.g. `us21`).

## Key Endpoints

**Headers for all requests:**
```
Authorization: Basic base64(anystring:your-api-key-us21)
Content-Type: application/json
```

### Add/Update Contact (Member) to List
**PUT /lists/{list_id}/members/{subscriber_hash}**

`subscriber_hash` = MD5 hash of lowercased email address.

```typescript
const email = "david@example.com";
const hash = md5(email.toLowerCase()); // "5f4dcc3b5aa765d61d8327deb882cf99"
```

**Request:**
```json
{
  "email_address": "david@example.com",
  "status_if_new": "subscribed",
  "status": "subscribed",
  "merge_fields": {
    "FNAME": "David",
    "LNAME": "Cohen",
    "PHONE": "+972501234567"
  },
  "tags": ["yappr-lead", "appointment-set"]
}
```

`status_if_new` = what status to use if this is a new contact. `status` = update existing.

**Response:**
```json
{
  "id": "subscriber-hash",
  "email_address": "david@example.com",
  "status": "subscribed",
  "merge_fields": {
    "FNAME": "David",
    "FNAME": "Cohen"
  }
}
```

---

### Get Member by Email
**GET /lists/{list_id}/members/{subscriber_hash}**

**Response:**
```json
{
  "id": "subscriber-hash",
  "email_address": "david@example.com",
  "status": "subscribed",
  "tags": [{ "id": 1234, "name": "yappr-lead" }]
}
```

---

### Add Tags to Member
**POST /lists/{list_id}/members/{subscriber_hash}/tags**

```json
{
  "tags": [
    { "name": "appointment-set", "status": "active" },
    { "name": "yappr-called", "status": "active" }
  ]
}
```

To remove a tag: `"status": "inactive"`

Response: `204 No Content`

---

### Get Lists
**GET /lists?count=50&fields=lists.id,lists.name**

**Response:**
```json
{
  "lists": [
    { "id": "abc123def456", "name": "Main Audience" }
  ]
}
```

---

### Create List Segment
**POST /lists/{list_id}/segments**

```json
{
  "name": "Yappr Leads — Appointment Set",
  "options": {
    "match": "all",
    "conditions": [
      {
        "condition_type": "StaticSegment",
        "field": "static_segment",
        "op": "member",
        "value": "123456"
      }
    ]
  }
}
```

---

### Get Merge Fields (Custom Fields)
**GET /lists/{list_id}/merge-fields**

**Response:**
```json
{
  "merge_fields": [
    { "merge_id": 1, "tag": "FNAME", "name": "First Name", "type": "text" },
    { "merge_id": 2, "tag": "LNAME", "name": "Last Name", "type": "text" },
    { "merge_id": 3, "tag": "PHONE", "name": "Phone Number", "type": "phone" }
  ]
}
```

`tag` is what you use in `merge_fields` object when updating members.

---

### Trigger Automation Email (Customer Journey)
**POST /customer-journeys/journeys/{journey_id}/steps/{step_id}/actions/trigger**

```json
{ "email_address": "david@example.com" }
```

Get journey and step IDs from Mailchimp Dashboard → Customer Journeys.

## Common Patterns

### Upsert subscriber after call with tags
```typescript
import { createHash } from "node:crypto";

function getSubscriberHash(email: string): string {
  return createHash("md5").update(email.toLowerCase()).digest("hex");
}

const apiKey = Deno.env.get("MAILCHIMP_API_KEY")!;
const dc = apiKey.split("-").pop(); // "us21"
const listId = Deno.env.get("MAILCHIMP_LIST_ID")!;
const credentials = btoa(`anystring:${apiKey}`);

const hash = getSubscriberHash(callerEmail);

// Upsert contact
await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${hash}`, {
  method: "PUT",
  headers: {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email_address: callerEmail,
    status_if_new: "subscribed",
    status: "subscribed",
    merge_fields: {
      FNAME: callerFirstName,
      LNAME: callerLastName,
      PHONE: callerPhone,
    },
  }),
});

// Add tags
await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${hash}/tags`, {
  method: "POST",
  headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    tags: [
      { name: "yappr-called", status: "active" },
      { name: `yappr-${disposition.toLowerCase().replace(/\s+/g, "-")}`, status: "active" },
    ],
  }),
});
```

## Gotchas & Rate Limits

- **Rate limits**: 10 requests/second. Batch operations available for bulk updates.
- **Subscriber hash**: MD5 of the lowercased email address. Compute client-side. Wrong hash → 404.
- **Data center in URL**: Extract from API key suffix. `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us21` → `us21` → `https://us21.api.mailchimp.com/3.0/`.
- **`status` field**: Must be `subscribed`, `unsubscribed`, `cleaned`, or `pending`. Don't use `active`.
- **Tags are free-form**: Tag names are case-insensitive but stored as-entered. Use consistent naming.
- **PUT is upsert**: `PUT /lists/{id}/members/{hash}` creates or updates. Safe to call repeatedly.
- **Transactional vs marketing email**: Mailchimp is for marketing email. For transactional (post-call summaries), use Resend or SendGrid. Mailchimp has Mandrill for transactional but it's a separate product.
- **GDPR**: Mailchimp requires explicit consent for EU/IL subscribers. Set `status: "pending"` to send double opt-in confirmation.
