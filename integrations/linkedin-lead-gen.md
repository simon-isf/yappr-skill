# LinkedIn Lead Gen Forms

> **Use in Yappr context**: Receive a B2B lead from a LinkedIn Lead Gen Form and queue an immediate outbound qualification call while the lead is engaged.

## Overview

LinkedIn Lead Gen Forms capture contact info directly within LinkedIn ads (Sponsored Content, Message Ads, Conversation Ads). This is the primary B2B lead source for enterprise and professional-services companies.

Lead delivery options:
1. **Webhook** — LinkedIn POSTs to your endpoint on each form submission (near-real-time)
2. **Marketing API pull** — Poll the Leads API for new responses (requires OAuth, more complex)
3. **CRM integrations** — LinkedIn has native integrations with HubSpot, Salesforce, etc. (use those instead if already set up)

## Authentication

### Webhook (inbound — no auth needed from you)

LinkedIn does not sign webhook payloads. Instead, you must compare the `leadId` against your allowlist or simply process all incoming leads from known form URNs.

### Marketing API (pull mode)

OAuth2 Bearer token:
```
Authorization: Bearer {access_token}
```

Required scopes: `r_marketing_lead_gen`, `r_organization_social`

Get tokens via LinkedIn OAuth2: `https://www.linkedin.com/oauth/v2/accessToken`

## Base URL (Marketing API)

```
https://api.linkedin.com/rest
```

Required header for all REST API calls:
```
LinkedIn-Version: 202402
```

## Key Endpoints

### Webhook payload (when configured)

LinkedIn POSTs to your endpoint when a lead submits. The payload structure:

```json
{
  "owner": "urn:li:organization:12345678",
  "leadId": "urn:li:leadFormResponse:AaBbCcDdEeFf",
  "submittedAt": 1714000000000,
  "formResponse": {
    "answers": [
      {
        "questionType": "PHONE_NUMBER",
        "phoneAnswer": {
          "number": "501234567",
          "countryCode": "IL"
        }
      },
      {
        "questionType": "FULL_NAME",
        "stringAnswer": "David Cohen"
      },
      {
        "questionType": "EMAIL",
        "stringAnswer": "david@company.co.il"
      },
      {
        "questionType": "COMPANY",
        "stringAnswer": "Acme Technologies"
      },
      {
        "questionType": "JOB_TITLE",
        "stringAnswer": "VP Sales"
      }
    ]
  }
}
```

`submittedAt` is a Unix timestamp in **milliseconds**.

### GET /leadFormResponses — Fetch lead responses (pull mode)

```
GET https://api.linkedin.com/rest/leadFormResponses?q=owner&owner=urn%3Ali%3AorganizationBrand%3A12345&submittedAfter=1714000000000
```

Required headers:
```
Authorization: Bearer {access_token}
LinkedIn-Version: 202402
```

Response:

```json
{
  "elements": [
    {
      "id": "urn:li:leadFormResponse:AaBbCcDdEeFf",
      "submittedAt": 1714000000000,
      "owner": "urn:li:organization:12345678",
      "formResponse": {
        "answers": [...]
      }
    }
  ],
  "paging": {
    "start": 0,
    "count": 10,
    "total": 42
  }
}
```

### GET /leadForms/{formUrn}/leadFormResponses — Fetch per form

```
GET https://api.linkedin.com/rest/leadForms/urn%3Ali%3AleadForm%3A12345/leadFormResponses
```

### POST /leads/markAsConverted — Mark lead as converted (optional)

```json
{
  "leadId": "urn:li:leadFormResponse:AaBbCcDdEeFf",
  "conversionType": "MEETING_SCHEDULED"
}
```

Use this after a successful call to close the attribution loop in LinkedIn Campaign Manager.

## Common Patterns

### Webhook receiver: validate, normalize phone, queue call

```typescript
import { createClient } from "npm:@supabase/supabase-js";

const LINKEDIN_ALLOWED_ORGS = new Set(
  (Deno.env.get("LINKEDIN_ALLOWED_ORG_URNS") ?? "").split(",")
);

// Map LinkedIn country codes to dial codes
const COUNTRY_DIAL_CODES: Record<string, string> = {
  IL: "972",
  US: "1",
  GB: "44",
  DE: "49",
  FR: "33",
  // Add more as needed
};

interface LinkedInAnswer {
  questionType: string;
  stringAnswer?: string;
  phoneAnswer?: { number: string; countryCode: string };
}

function extractAnswers(answers: LinkedInAnswer[]) {
  const result: Record<string, string> = {};

  for (const answer of answers) {
    if (answer.phoneAnswer) {
      const { number, countryCode } = answer.phoneAnswer;
      const dialCode = COUNTRY_DIAL_CODES[countryCode];
      if (dialCode) {
        // Strip leading zero from local number if present
        const local = number.startsWith("0") ? number.slice(1) : number;
        result.phone = `+${dialCode}${local}`;
      } else {
        result.phone = number; // Fallback — may need manual normalization
      }
      result.phoneCountryCode = countryCode;
    } else if (answer.stringAnswer) {
      const typeMap: Record<string, string> = {
        FULL_NAME: "fullName",
        EMAIL: "email",
        COMPANY: "company",
        JOB_TITLE: "jobTitle",
        COMPANY_SIZE: "companySize",
        INDUSTRY: "industry",
      };
      const key = typeMap[answer.questionType];
      if (key) result[key] = answer.stringAnswer;
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload = await req.json();

  // Validate org ownership (basic guard against spoofed payloads)
  if (LINKEDIN_ALLOWED_ORGS.size > 0 && !LINKEDIN_ALLOWED_ORGS.has(payload.owner)) {
    console.warn("LinkedIn webhook from unexpected org:", payload.owner);
    return new Response("OK", { status: 200 }); // Don't expose rejection
  }

  const extracted = extractAnswers(payload.formResponse?.answers ?? []);

  if (!extracted.phone) {
    console.error("LinkedIn lead missing phone:", payload.leadId);
    return new Response("OK", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error } = await supabase.from("call_queue").insert({
    phone: extracted.phone,
    email: extracted.email,
    full_name: extracted.fullName,
    company: extracted.company,
    job_title: extracted.jobTitle,
    source: "linkedin_lead_gen",
    source_lead_id: payload.leadId,
    source_org_urn: payload.owner,
    priority: "high",
    submitted_at: new Date(payload.submittedAt).toISOString(),
  });

  if (error) {
    console.error("Failed to queue LinkedIn lead:", error);
  }

  return new Response("OK", { status: 200 });
});
```

### Pull mode: fetch leads submitted in last N minutes

```typescript
async function fetchRecentLeads(accessToken: string, sinceMs: number) {
  const res = await fetch(
    `https://api.linkedin.com/rest/leadFormResponses?q=owner&owner=${encodeURIComponent(
      "urn:li:organization:" + Deno.env.get("LINKEDIN_ORG_ID")!
    )}&submittedAfter=${sinceMs}`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "LinkedIn-Version": "202402",
      },
    }
  );

  if (!res.ok) throw new Error(`LinkedIn API error: ${res.status}`);
  const { elements } = await res.json();
  return elements;
}
```

## Gotchas & Rate Limits

- **Phone numbers include `countryCode` separately**: The `phoneAnswer` object gives you `number` (local format) and `countryCode` (ISO 3166 alpha-2, e.g. `"IL"`). You must combine them to get E.164. Israeli numbers: `countryCode: "IL"` + `number: "501234567"` → `+972501234567`.
- **Webhook has no signature verification**: LinkedIn does not sign payloads. Validate by checking `owner` against your known organization URNs. For extra security, put the webhook endpoint behind a secret path component.
- **`submittedAt` is milliseconds**: Unlike most APIs that use seconds, LinkedIn uses milliseconds. Divide by 1000 before passing to `new Date()` or use `new Date(submittedAt)` directly (JS Date constructor accepts ms).
- **Lead form must be enabled for webhook**: Not all campaigns have webhook delivery. Enable it per form asset in Campaign Manager → Lead Gen Form → Lead delivery.
- **API rate limits (pull mode)**: LinkedIn Marketing API is limited to 100 requests/day for `/leadFormResponses` on developer apps. Production access requires submitting a Marketing Developer Program application.
- **OAuth token expiry**: Access tokens expire in 60 days; refresh tokens in 365 days. Implement token refresh before expiry or you will lose pull access silently.
- **Data retention**: LinkedIn retains lead form response data for 90 days. Pull and store in your own DB promptly.
- **GDPR / data residency**: LinkedIn leads from EU users come with implicit consent (they submitted the form). Still ensure your CRM/DB meets data residency requirements before storing EU leads.
- **Job title quality**: LinkedIn pre-fills from the member's profile. It's usually accurate for B2B targeting — a significant advantage over other lead sources.
