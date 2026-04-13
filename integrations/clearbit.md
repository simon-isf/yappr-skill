# Clearbit

> **Use in Yappr context**: Enrich contact data before or after a call — look up company information by domain and person data by email to pre-populate CRM fields.

## Authentication

- Get API key: clearbit.com → Dashboard → API Keys
- Pass as HTTP Basic Auth — API key as username, empty password:
  `Authorization: Basic base64({api_key}:)`

Or as Bearer:
  `Authorization: Bearer {api_key}`

## Base URL

```
https://api.clearbit.com
```

## Key Endpoints

**Headers for all requests:**
```
Authorization: Basic base64(sk_xxx:)
```

### Enrich Person by Email
**GET /v2/people/find?email={email}**

**Response:**
```json
{
  "id": "d1c3f63c-7b72-4edd-8895-7b8e0e3d7ab8",
  "name": {
    "fullName": "David Cohen",
    "givenName": "David",
    "familyName": "Cohen"
  },
  "email": "david@example.com",
  "location": "Tel Aviv, Israel",
  "employment": {
    "name": "Acme Corp",
    "title": "VP of Sales",
    "role": "sales",
    "seniority": "director"
  },
  "linkedin": { "handle": "in/davidcohen" },
  "phone": "+972501234567",
  "avatar": "https://person.clearbit.com/..."
}
```

Returns `null` on unknown email (with `404` status and `"type": "person_not_found"`).

---

### Enrich Company by Domain
**GET /v2/companies/find?domain={domain}**

**Request URL example:**
```
GET /v2/companies/find?domain=acmecorp.com
```

**Response:**
```json
{
  "id": "company-uuid",
  "name": "Acme Corp",
  "legalName": "Acme Corporation Ltd",
  "domain": "acmecorp.com",
  "description": "B2B software company...",
  "foundedYear": 2015,
  "location": "Tel Aviv, Israel",
  "country": "IL",
  "employees": 120,
  "employeesRange": "51-200",
  "estimatedAnnualRevenue": "$10M-$50M",
  "tags": ["SaaS", "B2B", "Software"],
  "category": {
    "industry": "Technology",
    "sector": "Technology",
    "industryGroup": "Software & Services"
  },
  "linkedin": { "handle": "company/acmecorp" },
  "facebook": { "handle": "acmecorp" },
  "phone": "+972-3-123-4567",
  "logo": "https://logo.clearbit.com/acmecorp.com"
}
```

---

### Combined Person + Company Enrichment
**GET /v2/combined/find?email={email}**

Returns both person and company enrichment in a single API call.

**Response:**
```json
{
  "person": { ... same as /people/find ... },
  "company": { ... same as /companies/find ... }
}
```

---

### Company Autocomplete (for UI dropdowns)
**GET /v1/companies/suggest?name={partial_company_name}**

**Response:**
```json
[
  {
    "name": "Acme Corp",
    "domain": "acmecorp.com",
    "logo": "https://logo.clearbit.com/acmecorp.com"
  }
]
```

---

### Person Streaming (Reveal — IP lookup)
**GET /v2/people/find?ip={ip_address}**

Identifies company from IP address (useful for web form visitors).

---

### Logo API (no auth required)
**GET https://logo.clearbit.com/{domain}**

Returns company logo image. Works without API key. Use in email templates:
```html
<img src="https://logo.clearbit.com/acmecorp.com" width="64" />
```

## Common Patterns

### Pre-call enrichment from email
```typescript
async function enrichContact(email: string) {
  const apiKey = Deno.env.get("CLEARBIT_API_KEY");
  const credentials = btoa(`${apiKey}:`);

  const res = await fetch(
    `https://api.clearbit.com/v2/combined/find?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  if (res.status === 404) return null; // Unknown person
  if (!res.ok) throw new Error(`Clearbit error: ${res.status}`);

  const data = await res.json();

  return {
    fullName: data.person?.name?.fullName,
    title: data.person?.employment?.title,
    company: data.person?.employment?.name ?? data.company?.name,
    employees: data.company?.employees,
    industry: data.company?.category?.industry,
    phone: data.person?.phone,
  };
}
```

### Enrich after call for CRM update
```typescript
// After call ends, enrich and update HubSpot
if (callerEmail) {
  const enriched = await enrichContact(callerEmail);
  if (enriched) {
    await updateHubSpotContact(contactId, {
      jobtitle: enriched.title,
      company: enriched.company,
    });
  }
}
```

## Gotchas & Rate Limits

- **Rate limits**: Depends on plan. Free/Startup: ~20 requests/minute, ~100 calls/month. Growth plans: higher. Check dashboard.
- **HTTP 202 (Async enrichment)**: If Clearbit doesn't have the data cached, it may return `202` with a webhook callback when enrichment completes. Handle both `200` (cached) and `202` (async) responses.
- **`404` vs empty**: Unknown person/company returns `404` with JSON error body, not an empty result.
- **Email quality**: Works best with business emails. Personal Gmail/Yahoo addresses rarely have enrichment data.
- **Deprecated**: Clearbit was acquired by HubSpot in 2023. The Clearbit API is being integrated into HubSpot Enrichment. For new integrations, check if HubSpot's native enrichment meets your needs.
- **Domain extraction from email**: For company lookup, extract domain from email: `email.split("@")[1]`. Skip common personal domains (gmail.com, yahoo.com, etc.).
