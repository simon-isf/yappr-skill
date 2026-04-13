# Pipedrive

> **Use in Yappr context**: Create persons and deals in Pipedrive after a qualifying call, log call activities, and update deal stages based on call outcomes.

## Authentication

- Get API token: Settings → Personal preferences → API
- Pass as query param: `?api_token=<token>` on every request
- Alternatively: `Authorization: Bearer <token>` header also works

## Base URL

```
https://{your-subdomain}.pipedrive.com/v1
```

Your subdomain is in the Pipedrive URL when logged in (e.g. `mycompany.pipedrive.com`).

## Key Endpoints

### Search Persons by Phone
**GET /v1/persons/search?term={phone}&fields=phone&exact_match=true**

**Headers:**
```
Content-Type: application/json
```

**URL example:**
```
GET /v1/persons/search?term=%2B972501234567&fields=phone&exact_match=true&api_token=abc123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "result_score": 1.0,
        "item": {
          "id": 42,
          "type": "person",
          "name": "David Cohen",
          "phones": ["+972501234567"],
          "emails": ["david@example.com"]
        }
      }
    ]
  }
}
```

---

### Create Person
**POST /v1/persons**

**Request:**
```json
{
  "name": "David Cohen",
  "phone": [
    { "value": "+972501234567", "primary": true, "label": "mobile" }
  ],
  "email": [
    { "value": "david@example.com", "primary": true, "label": "work" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "name": "David Cohen",
    "phone": [{ "value": "+972501234567", "primary": true }],
    "add_time": "2026-04-11 10:00:00"
  }
}
```

---

### Update Person
**PATCH /v1/persons/:id**

**Request:**
```json
{
  "name": "David Cohen",
  "phone": [{ "value": "+972501234567", "primary": true }]
}
```

---

### Create Deal
**POST /v1/deals**

**Request:**
```json
{
  "title": "David Cohen — Yappr Lead",
  "person_id": 42,
  "stage_id": 1,
  "status": "open",
  "expected_close_date": "2026-05-01"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 101,
    "title": "David Cohen — Yappr Lead",
    "stage_id": 1,
    "status": "open",
    "person_id": { "name": "David Cohen", "value": 42 }
  }
}
```

Get stage IDs via `GET /v1/stages`.

---

### Update Deal Stage
**PATCH /v1/deals/:id**

**Request:**
```json
{
  "stage_id": 3,
  "status": "open"
}
```

---

### Create Activity (Follow-up)
**POST /v1/activities**

**Request:**
```json
{
  "subject": "Follow up call — David Cohen",
  "type": "call",
  "due_date": "2026-04-15",
  "due_time": "10:00",
  "duration": "00:30",
  "person_id": 42,
  "deal_id": 101,
  "note": "Customer asked to be called back after reviewing the offer.",
  "assigned_to_user_id": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 55,
    "subject": "Follow up call — David Cohen",
    "type": "call",
    "due_date": "2026-04-15",
    "done": false
  }
}
```

Activity types: `call`, `meeting`, `task`, `deadline`, `email`, `lunch`

---

### Add Note to Deal
**POST /v1/notes**

**Request:**
```json
{
  "content": "Call summary: Customer is interested. Disposition: Appointment Set.",
  "deal_id": 101,
  "person_id": 42,
  "pinned_to_deal_flag": true
}
```

---

### Get Stages
**GET /v1/stages?pipeline_id=1**

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Lead In", "pipeline_id": 1, "order_nr": 0 },
    { "id": 2, "name": "Contact Made", "pipeline_id": 1, "order_nr": 1 },
    { "id": 3, "name": "Demo Scheduled", "pipeline_id": 1, "order_nr": 2 }
  ]
}
```

## Common Patterns

### Create person + deal after qualifying call
```typescript
const baseUrl = `https://${subdomain}.pipedrive.com/v1`;
const qs = `api_token=${apiToken}`;

// 1. Search for existing person
const search = await fetch(
  `${baseUrl}/persons/search?term=${encodeURIComponent(callerPhone)}&fields=phone&exact_match=true&${qs}`
).then(r => r.json());

let personId = search.data?.items?.[0]?.item?.id;

// 2. Create person if not found
if (!personId) {
  const person = await fetch(`${baseUrl}/persons?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: callerName,
      phone: [{ value: callerPhone, primary: true }],
    }),
  }).then(r => r.json());
  personId = person.data.id;
}

// 3. Create deal
const deal = await fetch(`${baseUrl}/deals?${qs}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: `${callerName} — Yappr Lead`,
    person_id: personId,
    stage_id: firstStageId,
  }),
}).then(r => r.json());
```

## Gotchas & Rate Limits

- **Rate limits**: 100 requests/10 seconds per user token. Burst to 200/10s allowed briefly.
- **Subdomain required**: Base URL is per-company. Store as a credential field.
- **Phone search**: Use E.164 format (`+972501234567`) for `exact_match=true`. Without exact match, Pipedrive does fuzzy search which can return wrong results.
- **Person phone/email arrays**: Always pass as arrays of objects, not plain strings.
- **Stage IDs**: Fetch and cache stage IDs at setup time — they don't change often.
- **Custom fields**: Custom field keys are hashes (e.g. `"abc123def456"`). Fetch field definitions via `GET /v1/personFields` to get keys.
- **Activity types**: Fetch valid types via `GET /v1/activityTypes` — custom types may exist.
