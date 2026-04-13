# Priority Software ERP/CRM

> **Use in Yappr context**: When an inbound call comes in, look up the caller in Priority CUSTOMERS or PHONEBOOK to personalize the conversation; after a qualifying call, create a new LEADS record or add a service note to an existing customer.

## Authentication

Priority REST API supports three auth methods. **Basic Auth** is the most common for server-to-server integrations:

- Encode `username:password` as Base64
- Pass as `Authorization: Basic {base64}` header
- The user must have API access enabled in Priority by a system administrator

**Personal Access Token (PAT)** is available in Priority 22.0+ and is preferred for production:
- Generate in Priority: User menu → API Tokens
- Pass as `Authorization: Bearer {token}`

**Application auth** requires additional headers for licensed ISV integrations:
```
X-App-Id: {app_id}
X-App-Key: {app_key}
```

Your Priority **server address** and **company/database name** are provided by your Priority system administrator. The service root varies per installation.

## Base URL

Priority uses an OData service root URL. The format is:

```
https://{your-priority-server}/odata/Priority/{tabula.ini}/{company}
```

**Example (Priority cloud / demo environment):**
```
https://www.eshbelsaas.com/ui/odata/Priority/tabula.ini/demo
```

**Self-hosted example:**
```
https://priority.yourcompany.co.il/odata/Priority/tabula.ini/MAIN
```

Replace `tabula.ini` with your actual INI file name, and `demo`/`MAIN` with your company database name. Ask your Priority administrator for the exact values.

## Key Endpoints

### Find Customer by Phone
**GET /PHONEBOOK?$filter=PHONE eq '{phone}'&$select=CUSTNAME,NAME,PHONE,EMAIL**

**Headers:**
```
Authorization: Basic {base64(user:pass)}
Accept: application/json
```

**Request:**
```
GET /odata/Priority/tabula.ini/MAIN/PHONEBOOK?$filter=PHONE eq '0501234567'&$select=CUSTNAME,NAME,PHONE,EMAIL&$top=1
```

**Response:**
```json
{
  "value": [
    {
      "CUSTNAME": "1011",
      "NAME": "דוד כהן",
      "PHONE": "0501234567",
      "EMAIL": "david@example.com"
    }
  ]
}
```

`CUSTNAME` is the customer account code used to link to the `CUSTOMERS` table. Returns empty `value: []` if not found.

---

### Get Customer by Account Code
**GET /CUSTOMERS('{custname}')**

**Request:**
```
GET /odata/Priority/tabula.ini/MAIN/CUSTOMERS('1011')
```

**Response:**
```json
{
  "CUSTNAME": "1011",
  "CUSTDES": "דוד כהן בע\"מ",
  "PHONE": "0501234567",
  "EMAIL": "david@example.com",
  "ADDRESS": "רחוב הרצל 10",
  "CITY": "תל אביב",
  "BALANCE": 1500.00,
  "WTAX": "N"
}
```

---

### Search Leads by Phone
**GET /LEADS?$filter=contains(CELLPHONE, '0501234567')&$select=LEADNUM,LEADDES,CELLPHONE,EMAIL,STATUSDES**

**Response:**
```json
{
  "value": [
    {
      "LEADNUM": 4215,
      "LEADDES": "דוד כהן",
      "CELLPHONE": "0501234567",
      "EMAIL": "david@example.com",
      "STATUSDES": "ליד חדש"
    }
  ]
}
```

---

### Create a Lead
**POST /LEADS**

**Headers:**
```
Authorization: Basic {base64(user:pass)}
Content-Type: application/json
```

**Request:**
```json
{
  "LEADDES": "דוד כהן",
  "CELLPHONE": "0501234567",
  "EMAIL": "david@example.com",
  "DETAILS": "התקשר דרך מערכת Yappr. מעוניין במוצר X. שיחה הוקלטה.",
  "LEADSTATUS": "10"
}
```

**Response:**
```json
{
  "LEADNUM": 4301,
  "LEADDES": "דוד כהן",
  "CELLPHONE": "0501234567",
  "LEADSTATUS": "10",
  "STATUSDES": "ליד חדש"
}
```

`LEADNUM` is the auto-generated lead ID. `LEADSTATUS` values are configured per company — query `GET /LEADSTATUS` to see available statuses.

---

### Add Activity / Note to a Lead
**POST /LEADS({leadnum})/LEADACTIVITIES_SUBFORM**

**Request:**
```json
{
  "ACTDES": "שיחת טלפון יוצאת — Yappr AI",
  "DETAILS": "לקוח מעוניין בהצעת מחיר. מבקש לדבר עם נציג עד יום חמישי.",
  "ACTTYPE": "T"
}
```

`ACTTYPE: "T"` = Phone call. Other common types: `"M"` = Meeting, `"L"` = Letter/Email.

**Response:** The created activity record.

---

### Update Lead Status
**PATCH /LEADS({leadnum})**

**Request:**
```json
{
  "LEADSTATUS": "20"
}
```

Use OData key syntax: `LEADS(4301)` — integer, no quotes.

---

## Common Patterns

### Lookup caller and create lead if not found
```typescript
// Deno edge function snippet

const PRIORITY_BASE = Deno.env.get("PRIORITY_BASE_URL")!;
// e.g. "https://priority.yourcompany.co.il/odata/Priority/tabula.ini/MAIN"

const auth = "Basic " + btoa(
  `${Deno.env.get("PRIORITY_USER")}:${Deno.env.get("PRIORITY_PASS")}`
);

const headers = {
  Authorization: auth,
  Accept: "application/json",
  "Content-Type": "application/json",
};

export async function findOrCreateLead(callerPhone: string, callerName: string, callSummary: string) {
  const phone = callerPhone.replace("+972", "0"); // normalize to local format

  // 1. Search PHONEBOOK for existing customer
  const pbRes = await fetch(
    `${PRIORITY_BASE}/PHONEBOOK?$filter=PHONE eq '${phone}'&$select=CUSTNAME,NAME&$top=1`,
    { headers }
  );
  const pb = await pbRes.json();

  if (pb.value?.length > 0) {
    const custname = pb.value[0].CUSTNAME;
    // Customer exists — log an activity on their account
    await fetch(`${PRIORITY_BASE}/CUSTOMERS('${custname}')/CUSTACTIV_SUBFORM`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ACTDES: "שיחת Yappr",
        DETAILS: callSummary,
        ACTTYPE: "T",
      }),
    });
    return { type: "existing_customer", custname };
  }

  // 2. No customer found — check LEADS
  const leadsRes = await fetch(
    `${PRIORITY_BASE}/LEADS?$filter=contains(CELLPHONE,'${phone}')&$select=LEADNUM&$top=1`,
    { headers }
  );
  const leads = await leadsRes.json();

  if (leads.value?.length > 0) {
    return { type: "existing_lead", leadnum: leads.value[0].LEADNUM };
  }

  // 3. Create new lead
  const createRes = await fetch(`${PRIORITY_BASE}/LEADS`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      LEADDES: callerName,
      CELLPHONE: phone,
      DETAILS: callSummary,
      LEADSTATUS: "10", // "New Lead" — verify status code with your admin
    }),
  });
  const newLead = await createRes.json();
  return { type: "new_lead", leadnum: newLead.LEADNUM };
}
```

## Gotchas & Rate Limits

- **Service root URL**: There is no single universal URL. Each customer has a different server address, INI file, and company name. Always store these as environment variables and document them at setup time.
- **Phone format**: Priority stores phones in various formats (local, E.164, with/without dashes). Use `contains()` for searching instead of `eq` if exact matches fail: `$filter=contains(PHONE,'501234567')`.
- **OData key syntax**: String keys use single quotes — `CUSTOMERS('1011')`. Integer keys use no quotes — `LEADS(4301)`. Mixing these causes `400 Bad Request`.
- **`$top` default**: Priority caps responses at 2,000 records by default (v25.1+). Use `$top` and `$skip` for pagination.
- **LEADSTATUS codes**: These are company-configurable. Fetch `GET /LEADSTATUS` to get valid codes for the specific Priority installation before hardcoding.
- **Subforms**: Related records (activities, addresses, contacts) are accessed via subform endpoints: `/LEADS({id})/LEADACTIVITIES_SUBFORM`. These are not documented in a single list — consult the Priority SDK PDF or ask the administrator.
- **Rate limits**: Not publicly documented. Priority is self-hosted or on private cloud; limits depend on the server configuration. Safe default: <10 concurrent requests.
- **Hebrew in $filter**: URL-encode Hebrew characters in OData `$filter` strings when used in GET query parameters.
