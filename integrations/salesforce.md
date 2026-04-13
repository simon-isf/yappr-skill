# Salesforce

> **Use in Yappr context**: Create or update Salesforce Leads and Contacts after calls, log call activities, and update opportunity stages based on call outcomes.

## Authentication

**Recommended: OAuth2 Client Credentials (server-to-server)**

1. Salesforce Setup → Apps → App Manager → New Connected App
2. Enable OAuth settings → Add scopes: `api`, `refresh_token`
3. Enable "Enable Client Credentials Flow"
4. Get `client_id` (Consumer Key) and `client_secret` (Consumer Secret)

**Get access token:**
```typescript
async function getSalesforceToken(): Promise<{ token: string; instanceUrl: string }> {
  const res = await fetch("https://login.salesforce.com/services/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: Deno.env.get("SF_CLIENT_ID")!,
      client_secret: Deno.env.get("SF_CLIENT_SECRET")!,
    }),
  }).then(r => r.json());
  return { token: res.access_token, instanceUrl: res.instance_url };
}
```

**Sandbox**: Replace `login.salesforce.com` with `test.salesforce.com`

**Important**: Always use `instance_url` from the token response as your base URL — it's org-specific (e.g. `https://myorg.my.salesforce.com`).

## Base URL

```
{instance_url}/services/data/v59.0
```

## Key Endpoints

**Headers for all requests:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Create Lead
**POST /services/data/v59.0/sobjects/Lead**

**Request:**
```json
{
  "FirstName": "David",
  "LastName": "Cohen",
  "Phone": "+972501234567",
  "Email": "david@example.com",
  "Company": "Self-employed",
  "LeadSource": "Web",
  "Status": "New",
  "Description": "Called via Yappr AI. Interested in Business plan."
}
```

**Response:**
```json
{
  "id": "00Q5f00000ABCDEABC",
  "success": true,
  "errors": []
}
```

---

### Find Lead by Phone (SOQL Query)
**GET /services/data/v59.0/query?q=SELECT+Id,FirstName,LastName,Phone+FROM+Lead+WHERE+Phone='%2B972501234567'+LIMIT+1**

**Response:**
```json
{
  "totalSize": 1,
  "done": true,
  "records": [
    {
      "Id": "00Q5f00000ABCDEABC",
      "FirstName": "David",
      "LastName": "Cohen",
      "Phone": "+972501234567"
    }
  ]
}
```

---

### Update Lead
**PATCH /services/data/v59.0/sobjects/Lead/{id}**

**Request:**
```json
{
  "Status": "Working",
  "Description": "Appointment booked for April 15 at 10:00 AM."
}
```

Response: `204 No Content`

---

### Upsert by External ID
**PATCH /services/data/v59.0/sobjects/Lead/{ExternalIdField}/{external_id}**

If you have a custom external ID field (e.g. `Phone__c`):
```
PATCH /services/data/v59.0/sobjects/Lead/Phone__c/%2B972501234567
```

Creates if not found, updates if found. Most reliable upsert method.

---

### Create Task (Call Log)
**POST /services/data/v59.0/sobjects/Task**

**Request:**
```json
{
  "WhoId": "00Q5f00000ABCDEABC",
  "Subject": "Yappr AI Call — Outbound",
  "Status": "Completed",
  "Priority": "Normal",
  "Type": "Call",
  "CallType": "Outbound",
  "CallDurationInSeconds": 180,
  "Description": "Call summary: customer interested in Business plan. Disposition: Appointment Set.",
  "ActivityDate": "2026-04-11"
}
```

---

### Create Contact
**POST /services/data/v59.0/sobjects/Contact**

```json
{
  "FirstName": "David",
  "LastName": "Cohen",
  "Phone": "+972501234567",
  "Email": "david@example.com",
  "AccountId": "001XXXXXXXXXXXXXXX"
}
```

---

### Create Opportunity
**POST /services/data/v59.0/sobjects/Opportunity**

```json
{
  "Name": "David Cohen — Yappr Demo",
  "StageName": "Prospecting",
  "CloseDate": "2026-05-31",
  "AccountId": "001XXXXXXXXXXXXXXX",
  "Description": "Lead captured via Yappr AI voice call."
}
```

---

### Describe Object (Get Field List)
**GET /services/data/v59.0/sobjects/Lead/describe**

Returns all fields with names, types, and picklist values. Use to discover custom field API names.

## Common Patterns

### Upsert lead after call
```typescript
const { token, instanceUrl } = await getSalesforceToken();
const base = `${instanceUrl}/services/data/v59.0`;

// Search for existing lead
const encoded = encodeURIComponent(`+972501234567`);
const query = await fetch(
  `${base}/query?q=SELECT+Id+FROM+Lead+WHERE+Phone='${encoded}'+LIMIT+1`,
  { headers: { Authorization: `Bearer ${token}` } }
).then(r => r.json());

const leadId = query.records?.[0]?.Id;

if (leadId) {
  // Update
  await fetch(`${base}/sobjects/Lead/${leadId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ Status: "Working", Description: callSummary }),
  });
} else {
  // Create
  const created = await fetch(`${base}/sobjects/Lead`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      LastName: callerLastName || callerName,
      FirstName: callerFirstName || "",
      Phone: callerPhone,
      Company: "Unknown",
      LeadSource: "Voice AI",
    }),
  }).then(r => r.json());
  leadId = created.id;
}

// Log call task
await fetch(`${base}/sobjects/Task`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    WhoId: leadId,
    Subject: "Yappr AI Call",
    Status: "Completed",
    Type: "Call",
    CallDurationInSeconds: durationSeconds,
    Description: callSummary,
    ActivityDate: new Date().toISOString().split("T")[0],
  }),
});
```

## Gotchas & Rate Limits

- **API version**: Always specify a version (e.g. `/v59.0/`). Use the latest available.
- **`instance_url` is per-org**: Never hardcode it. Always extract from the token response.
- **`Company` is required on Lead**: The `Company` field is required even if you don't have it. Use `"Unknown"` as fallback.
- **Phone format in SOQL**: Phone values in SOQL must match exactly as stored. If SF stores `+972-50-123-4567`, searching for `+972501234567` won't match. Normalize before storing.
- **Rate limits**: 100,000 API calls/24 hours for most orgs. Per-second limit: varies by edition.
- **Sandbox vs production**: `test.salesforce.com` for sandbox, `login.salesforce.com` for production. Connected App must be created in the same org.
- **SOQL injection**: Always encode user-provided values in SOQL queries. Use `encodeURIComponent` for phone numbers (the `+` becomes `%2B`).
- **Custom fields**: Custom field API names end in `__c` (e.g. `Call_Disposition__c`). Access via describe endpoint.
