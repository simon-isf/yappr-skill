# Zoho CRM

> **Use in Yappr context**: Create or update Zoho CRM leads and contacts after calls, and log call activities to the CRM timeline.

## Authentication

Zoho CRM uses **OAuth2 with refresh tokens**. Access tokens expire after 1 hour.

**Setup steps:**
1. Zoho API Console (accounts.zoho.com) → Add Client → Server-based Application
2. Add authorized redirect URI
3. Get initial tokens via authorization code flow (one-time)
4. Store `refresh_token` in Supabase vault — never expires until revoked

**Token refresh:**
```typescript
async function getZohoAccessToken(): Promise<string> {
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("ZOHO_CLIENT_ID")!,
      client_secret: Deno.env.get("ZOHO_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("ZOHO_REFRESH_TOKEN")!,
    }),
  }).then(r => r.json());
  return res.access_token;
}
```

**Required scopes:** `ZohoCRM.modules.leads.ALL`, `ZohoCRM.modules.contacts.ALL`, `ZohoCRM.modules.activities.ALL`

## Base URL

```
https://www.zohoapis.com/crm/v3
```

**Important**: Base URL varies by data center:
- US: `https://www.zohoapis.com`
- EU: `https://www.zohoapis.eu`
- India: `https://www.zohoapis.in`
- Australia: `https://www.zohoapis.com.au`

Check the user's Zoho domain to determine which to use.

## Key Endpoints

**Headers for all requests:**
```
Authorization: Zoho-oauthtoken {access_token}
Content-Type: application/json
```

### Create Lead
**POST /crm/v3/Leads**

**Request:**
```json
{
  "data": [
    {
      "First_Name": "David",
      "Last_Name": "Cohen",
      "Phone": "+972501234567",
      "Email": "david@example.com",
      "Lead_Source": "Voice AI",
      "Description": "Called via Yappr AI. Interested in Business plan.",
      "Lead_Status": "Not Contacted"
    }
  ]
}
```

**Response:**
```json
{
  "data": [
    {
      "code": "SUCCESS",
      "details": {
        "id": "5149262000001234567",
        "Modified_Time": "2026-04-11T10:00:00+05:30",
        "Created_Time": "2026-04-11T10:00:00+05:30"
      },
      "message": "record added",
      "status": "success"
    }
  ]
}
```

---

### Search Leads by Phone
**GET /crm/v3/Leads/search?criteria=(Phone:equals:+972501234567)**

**Response:**
```json
{
  "data": [
    {
      "id": "5149262000001234567",
      "First_Name": "David",
      "Last_Name": "Cohen",
      "Phone": "+972501234567",
      "Lead_Status": "Not Contacted"
    }
  ]
}
```

Returns empty `data` array (not an error) if no match.

---

### Update Lead
**PUT /crm/v3/Leads/{record_id}**

**Request:**
```json
{
  "data": [
    {
      "Lead_Status": "Contacted",
      "Description": "Appointment set for April 15 at 10:00 AM via Yappr call."
    }
  ]
}
```

---

### Upsert Lead (Create or Update)
**POST /crm/v3/Leads/upsert**

**Request:**
```json
{
  "data": [
    {
      "Phone": "+972501234567",
      "First_Name": "David",
      "Last_Name": "Cohen",
      "Lead_Source": "Voice AI"
    }
  ],
  "duplicate_check_fields": ["Phone"]
}
```

Inserts if no match on `Phone`; updates the matching record if found.

---

### Create Activity (Call Log)
**POST /crm/v3/Calls**

**Request:**
```json
{
  "data": [
    {
      "Subject": "Yappr AI Call — David Cohen",
      "Call_Type": "Outbound",
      "Call_Start_Time": "2026-04-11T10:00:00+03:00",
      "Duration_in_seconds": "180",
      "Description": "Call summary: customer interested in Business plan.",
      "Who_Id": {
        "name": "David Cohen",
        "id": "5149262000001234567"
      }
    }
  ]
}
```

---

### Get Lead Fields (to know custom field API names)
**GET /crm/v3/settings/fields?module=Leads**

**Response:**
```json
{
  "fields": [
    { "api_name": "First_Name", "field_label": "First Name", "data_type": "text" },
    { "api_name": "Phone", "field_label": "Phone", "data_type": "phone" },
    { "api_name": "Custom_Field_1", "field_label": "Product Interest", "data_type": "picklist" }
  ]
}
```

Custom fields always have `api_name` with a prefix like `Custom_Field_1` or a human-readable label like `Product_Interest_c`.

## Common Patterns

### Upsert lead after call
```typescript
const token = await getZohoAccessToken();
const base = "https://www.zohoapis.com/crm/v3";

const res = await fetch(`${base}/Leads/upsert`, {
  method: "POST",
  headers: {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    data: [{
      Phone: callerPhone,
      First_Name: callerFirstName,
      Last_Name: callerLastName,
      Email: callerEmail,
      Lead_Source: "Voice AI",
      Lead_Status: disposition === "Appointment Set" ? "Contacted" : "Not Contacted",
      Description: callSummary,
    }],
    duplicate_check_fields: ["Phone"],
  }),
}).then(r => r.json());

const leadId = res.data[0].details.id;
```

## Gotchas & Rate Limits

- **Rate limits**: 100 API calls/minute per org (Standard). 150/min for Professional/Enterprise. Daily limit: 25,000 calls/day for Standard.
- **Access token caching**: Tokens last 1 hour. Cache the token (e.g. in Supabase) and refresh only when expired to avoid hitting OAuth endpoints on every call.
- **Data center mismatch**: Using the wrong base URL returns a 403. Always check the user's Zoho domain (`.com`, `.eu`, `.in`, `.com.au`).
- **Phone search**: Search criteria format is `(Phone:equals:+972501234567)`. The `+` needs to be URL-encoded: `%2B972501234567`.
- **Bulk operations**: API accepts up to 100 records per request in the `data` array.
- **Module names are case-sensitive**: `Leads`, `Contacts`, `Deals`, `Calls` — capital first letter.
- **Custom fields**: Custom field API names often look like `LEADCF1` or have your org's naming. Fetch field metadata once and cache.
- **Self-client tokens**: For generating the initial refresh token without a redirect URI, use Zoho's Self-Client in the API console.
