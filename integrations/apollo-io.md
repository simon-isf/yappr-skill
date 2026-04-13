# Apollo.io

> **Use in Yappr context**: Enrich lead data by phone number after a call (company, title, LinkedIn), convert enriched people to tracked contacts, and update contact pipeline stages based on call outcomes.

## Authentication

- Go to Apollo Settings → Integrations → API → copy your API key
- Pass as a header: `X-Api-Key: YOUR_API_KEY`
- For POST requests, you can alternatively pass `"api_key": "..."` in the request body — but header is preferred

## Base URL

```
https://api.apollo.io/api/v1
```

## Key Endpoints

### Enrich Person by Phone (People Match)
**POST /people/match**

Apollo's enrichment endpoint — looks up a person by phone, email, name, or combination. More fields = higher match confidence.

**Headers:**
```
X-Api-Key: YOUR_API_KEY
Content-Type: application/json
```

**Request:**
```json
{
  "phone_numbers": ["+972501234567"],
  "reveal_personal_emails": false,
  "reveal_phone_number": true
}
```

**Response:**
```json
{
  "person": {
    "id": "person_apollo_abc123",
    "first_name": "Yael",
    "last_name": "Ben-David",
    "name": "Yael Ben-David",
    "title": "Head of Operations",
    "email": "yael@acme.com",
    "linkedin_url": "https://www.linkedin.com/in/yael-ben-david",
    "city": "Tel Aviv",
    "country": "Israel",
    "organization": {
      "name": "Acme Ltd",
      "website_url": "https://acme.com",
      "industry": "Software",
      "num_employees_range": "51-200"
    },
    "phone_numbers": [
      { "raw_number": "+972501234567", "type": "mobile" }
    ]
  }
}
```

Returns `null` for `person` if no match is found.

---

### Create Contact
**POST /contacts**

Converts enriched person data (or raw data) into a persistent contact in your Apollo account. Does not consume enrichment credits.

**Request:**
```json
{
  "first_name": "Yael",
  "last_name": "Ben-David",
  "title": "Head of Operations",
  "organization_name": "Acme Ltd",
  "email": "yael@acme.com",
  "direct_phone": "+972501234567",
  "label_names": ["Qualified", "Voice AI Lead"]
}
```

**Response:**
```json
{
  "contact": {
    "id": "contact_apollo_xyz789",
    "first_name": "Yael",
    "last_name": "Ben-David",
    "title": "Head of Operations",
    "email": "yael@acme.com",
    "label_names": ["Qualified", "Voice AI Lead"],
    "contact_stage": { "id": "stage_new", "name": "New" }
  }
}
```

---

### Update Contact
**PATCH /contacts/{id}**

**Request:**
```json
{
  "label_names": ["Qualified", "Demo Scheduled"],
  "direct_phone": "+972501234567"
}
```

---

### List Contact Stages
**GET /contact_stages**

Retrieve stage IDs for use in stage updates.

**Response:**
```json
{
  "contact_stages": [
    { "id": "stage_new", "name": "New" },
    { "id": "stage_contacted", "name": "Contacted" },
    { "id": "stage_qualified", "name": "Qualified" },
    { "id": "stage_demo_scheduled", "name": "Demo Scheduled" }
  ]
}
```

---

### Update Contact Stage
**POST /contacts/update_stages**

Moves one or more contacts to a new stage.

**Request:**
```json
{
  "contact_ids": ["contact_apollo_xyz789"],
  "contact_stage_id": "stage_qualified"
}
```

**Response:**
```json
{
  "contacts": [
    {
      "id": "contact_apollo_xyz789",
      "contact_stage": { "id": "stage_qualified", "name": "Qualified" }
    }
  ]
}
```

## Common Patterns

### Post-call enrichment pipeline
```typescript
const API_KEY = Deno.env.get("APOLLO_API_KEY")!;
const BASE = "https://api.apollo.io/api/v1";

const headers = {
  "X-Api-Key": API_KEY,
  "Content-Type": "application/json",
};

// 1. Enrich by phone to get company + title data
async function enrichByPhone(phone: string) {
  const res = await fetch(`${BASE}/people/match`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phone_numbers: [phone],
      reveal_phone_number: true,
    }),
  });
  const data = await res.json();
  return data.person ?? null;
}

// 2. Create contact in Apollo from enriched data
async function createContact(person: {
  first_name: string;
  last_name: string;
  title?: string;
  organization?: { name: string };
  email?: string;
}, phone: string): Promise<string> {
  const res = await fetch(`${BASE}/contacts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      first_name: person.first_name,
      last_name: person.last_name,
      title: person.title,
      organization_name: person.organization?.name,
      email: person.email,
      direct_phone: phone,
      label_names: ["Voice AI Lead"],
    }),
  });
  const data = await res.json();
  return data.contact.id;
}

// 3. Move contact to qualified stage after successful call
async function markQualified(contactId: string, stageId: string) {
  await fetch(`${BASE}/contacts/update_stages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contact_ids: [contactId],
      contact_stage_id: stageId,
    }),
  });
}

// Full flow
async function postCallEnrichAndQualify(phone: string) {
  const person = await enrichByPhone(phone);
  if (!person) return null;
  const contactId = await createContact(person, phone);

  // Fetch stages once (cache in production)
  const stagesRes = await fetch(`${BASE}/contact_stages`, { headers });
  const stagesData = await stagesRes.json();
  const qualifiedStage = stagesData.contact_stages?.find(
    (s: { name: string }) => s.name === "Qualified"
  );
  if (qualifiedStage) await markQualified(contactId, qualifiedStage.id);

  return { contactId, person };
}
```

## Gotchas & Rate Limits

- **Credit consumption**: `POST /people/match` and people search consume enrichment credits from your Apollo plan. Monitor usage to avoid overages. Use `reveal_phone_number: false` when you don't need phone numbers to save credits.
- **Rate limits**: Varies by plan tier. Standard plans: 200 requests/minute. 429 returned when exceeded with a `Retry-After` header.
- **No match ≠ error**: When Apollo can't find a person, the response is 200 OK with `"person": null` — always check for null before using the result.
- **`/people/match` vs search**: `/people/match` is for enrichment (single person by identifiers). `/people/search` is for prospecting queries (firmographic filters). They have different credit costs.
- **`label_names`**: Apollo's tagging system. Labels are created automatically if they don't exist — no pre-creation step needed.
- **`update_stages` is bulk**: Accepts an array of `contact_ids`. You can update multiple contacts in one call to save rate limit quota.
- **Stage IDs**: Must be fetched from `GET /contact_stages` — they are not predictable strings. Cache the label-to-ID map at startup.
