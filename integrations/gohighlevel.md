# GoHighLevel (GHL)

> **Use in Yappr context**: After a voice call, create or update the caller's contact, log the call as a note, move them through a sales pipeline opportunity, and trigger automated SMS/email follow-up workflows.

## Authentication

GHL v2 uses OAuth2 bearer tokens scoped to a **Location** (sub-account). Pass two headers on every request:

```
Authorization: Bearer {access_token}
Version: 2021-07-28
```

Obtain credentials:
- **Agency API key (v1 — legacy)**: Agency Settings → API Keys.
- **OAuth2 token (v2 — current)**: Create a Private Integration App in the Agency dashboard → Apps → Private Integrations. Copy the access token for your location. Tokens do not expire for private integrations unless rotated manually.

Store as `GHL_ACCESS_TOKEN` and `GHL_LOCATION_ID` in Supabase Vault / edge function secrets.

## Base URL

`https://services.leadconnectorhq.com`

> Do **not** use `https://rest.gohighlevel.com/v1` for new integrations — that is the deprecated v1 API.

## Key Endpoints

### Search Contact by Phone
**GET /contacts/search**

```http
GET /contacts/search?locationId={locationId}&query=%2B972501234567
Authorization: Bearer {token}
Version: 2021-07-28
```

Response:
```json
{
  "contacts": [
    {
      "id": "abc123",
      "firstName": "Yonatan",
      "lastName": "Cohen",
      "phone": "+972501234567",
      "email": "yonatan@example.com",
      "locationId": "loc_xyz"
    }
  ],
  "total": 1
}
```

---

### Create / Upsert Contact
**POST /contacts/**

```http
POST /contacts/
Authorization: Bearer {token}
Version: 2021-07-28
Content-Type: application/json

{
  "locationId": "loc_xyz",
  "firstName": "Yonatan",
  "lastName": "Cohen",
  "phone": "+972501234567",
  "email": "yonatan@example.com",
  "customFields": [
    { "id": "field_id_from_custom_fields_endpoint", "value": "some value" }
  ]
}
```

Response:
```json
{
  "contact": {
    "id": "abc123",
    "firstName": "Yonatan",
    "lastName": "Cohen",
    "phone": "+972501234567",
    "locationId": "loc_xyz"
  }
}
```

> Note: GHL does not auto-deduplicate on upsert. Always search by phone first (`GET /contacts/search`) and update if found, otherwise create.

---

### Add Call Note to Contact
**POST /contacts/{contactId}/notes**

```http
POST /contacts/abc123/notes
Authorization: Bearer {token}
Version: 2021-07-28
Content-Type: application/json

{
  "body": "Inbound call via Yappr — 3 min 22 sec. Customer asked about pricing for plan B.",
  "userId": "ghl_user_id_optional"
}
```

Response:
```json
{
  "note": {
    "id": "note_456",
    "body": "Inbound call via Yappr — 3 min 22 sec...",
    "contactId": "abc123",
    "dateAdded": "2025-04-12T10:30:00.000Z"
  }
}
```

---

### Fetch Pipelines and Stage IDs
**GET /opportunities/pipelines**

Run this once during setup to retrieve `pipelineId` and `pipelineStageId` values to store as config.

```http
GET /opportunities/pipelines?locationId=loc_xyz
Authorization: Bearer {token}
Version: 2021-07-28
```

Response:
```json
{
  "pipelines": [
    {
      "id": "pipeline_001",
      "name": "Sales Pipeline",
      "stages": [
        { "id": "stage_new", "name": "New Lead" },
        { "id": "stage_qualified", "name": "Qualified" },
        { "id": "stage_won", "name": "Won" }
      ]
    }
  ]
}
```

---

### Create Pipeline Opportunity
**POST /opportunities/**

```http
POST /opportunities/
Authorization: Bearer {token}
Version: 2021-07-28
Content-Type: application/json

{
  "locationId": "loc_xyz",
  "pipelineId": "pipeline_001",
  "pipelineStageId": "stage_new",
  "contactId": "abc123",
  "name": "Yonatan Cohen — Inbound Call",
  "status": "open",
  "monetaryValue": 0
}
```

Response:
```json
{
  "opportunity": {
    "id": "opp_789",
    "name": "Yonatan Cohen — Inbound Call",
    "status": "open",
    "pipelineId": "pipeline_001",
    "pipelineStageId": "stage_new",
    "contactId": "abc123"
  }
}
```

---

### Update Opportunity Stage
**PUT /opportunities/{opportunityId}**

```http
PUT /opportunities/opp_789
Authorization: Bearer {token}
Version: 2021-07-28
Content-Type: application/json

{
  "pipelineStageId": "stage_qualified",
  "status": "open"
}
```

Response:
```json
{
  "opportunity": {
    "id": "opp_789",
    "pipelineStageId": "stage_qualified",
    "status": "open"
  }
}
```

---

### Fetch Custom Field IDs
**GET /custom-fields**

Run once during setup — custom field `id` values are required in the `customFields` array on contact create/update.

```http
GET /custom-fields?locationId=loc_xyz
Authorization: Bearer {token}
Version: 2021-07-28
```

Response:
```json
{
  "customFields": [
    { "id": "cf_call_outcome", "name": "Call Outcome", "dataType": "TEXT" },
    { "id": "cf_source", "name": "Lead Source", "dataType": "TEXT" }
  ]
}
```

---

### Enroll Contact in Workflow
**POST /workflows/{workflowId}/subscribe**

Triggers a GHL automation (e.g., send SMS, assign task) for a contact.

```http
POST /workflows/wf_sms_followup/subscribe
Authorization: Bearer {token}
Version: 2021-07-28
Content-Type: application/json

{
  "contactId": "abc123",
  "locationId": "loc_xyz"
}
```

Response:
```json
{
  "success": true
}
```

To find `workflowId`: GHL dashboard → Automation → Workflows → open workflow → ID is in the URL.

## Common Patterns

### Post-call workflow

```typescript
// supabase/functions/_shared/gohighlevel.ts
// Deno edge function helper — runs after Yappr call webhook fires

import { createClient } from "npm:@supabase/supabase-js@2";

const GHL_TOKEN = Deno.env.get("GHL_ACCESS_TOKEN")!;
const GHL_LOCATION_ID = Deno.env.get("GHL_LOCATION_ID")!;
const BASE = "https://services.leadconnectorhq.com";

const headers = {
  "Authorization": `Bearer ${GHL_TOKEN}`,
  "Version": "2021-07-28",
  "Content-Type": "application/json",
};

async function upsertContact(phone: string, firstName: string, lastName: string) {
  // 1. Search by phone (E.164 format required)
  const searchRes = await fetch(
    `${BASE}/contacts/search?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(phone)}`,
    { headers }
  );
  const searchData = await searchRes.json();

  if (searchData.contacts?.length > 0) {
    return searchData.contacts[0].id as string;
  }

  // 2. Create if not found
  const createRes = await fetch(`${BASE}/contacts/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ locationId: GHL_LOCATION_ID, firstName, lastName, phone }),
  });
  const createData = await createRes.json();
  return createData.contact.id as string;
}

export async function handlePostCall(params: {
  phone: string;
  firstName: string;
  lastName: string;
  callSummary: string;
  triggerFollowUpWorkflow?: boolean;
  workflowId?: string;
}) {
  const contactId = await upsertContact(params.phone, params.firstName, params.lastName);

  // Log call note
  await fetch(`${BASE}/contacts/${contactId}/notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: params.callSummary }),
  });

  // Optionally enroll in follow-up workflow
  if (params.triggerFollowUpWorkflow && params.workflowId) {
    await fetch(`${BASE}/workflows/${params.workflowId}/subscribe`, {
      method: "POST",
      headers,
      body: JSON.stringify({ contactId, locationId: GHL_LOCATION_ID }),
    });
  }

  return { contactId };
}
```

## Gotchas & Rate Limits

- **Rate limit**: ~100 requests per 10 seconds per location. For high-volume post-call hooks, queue and batch if needed.
- **v1 vs v2**: Base URLs, auth headers, and response shapes differ. Never mix them. Use v2 (`services.leadconnectorhq.com`) for all new work.
- **Phone format**: Must be E.164 (`+972501234567`). Israeli local format (`0501234567`) will not match existing contacts.
- **Custom field IDs**: The `customFields` array on contact create/update requires the field's `id` (a UUID-like string), not its display name. Fetch and store these IDs at integration setup time.
- **Pipeline stage IDs**: Same rule — fetch `GET /opportunities/pipelines` once and store stage IDs in your config. They are stable unless the GHL user renames stages.
- **No native upsert**: GHL v2 does not provide a single upsert endpoint for contacts. Always search first.
- **Location ID scope**: Nearly every v2 endpoint requires `locationId`. A token scoped to the wrong location will return empty results, not an error.
- **Workflow IDs**: Not exposed in the GHL UI by default — find them in the browser URL bar when a workflow is open.
