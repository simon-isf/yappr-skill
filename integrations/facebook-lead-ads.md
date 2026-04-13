# Facebook Lead Ads

> **Use in Yappr context**: Receive new leads from Facebook Lead Ad forms via webhook and immediately trigger an outbound call to the lead.

## Authentication

- **Page Access Token**: Meta Business Manager → select Page → Page Settings → Page Access Tokens
- For long-lived tokens: exchange a short-lived token using `GET /oauth/access_token?grant_type=fb_exchange_token`
- Page Access Token must have `leads_retrieval` permission

## Base URL

```
https://graph.facebook.com/v19.0
```

## Key Endpoints

### Fetch Lead Data by Lead ID
**GET /{leadgen_id}?access_token={page_access_token}**

**Response:**
```json
{
  "id": "1234567890123456",
  "created_time": "2026-04-11T10:00:00+0000",
  "form_id": "9876543210987654",
  "field_data": [
    { "name": "full_name", "values": ["David Cohen"] },
    { "name": "phone_number", "values": ["05-012-34567"] },
    { "name": "email", "values": ["david@example.com"] },
    { "name": "what_service_interests_you", "values": ["Business Plan"] }
  ]
}
```

`field_data` array order is not guaranteed — always find by `name`.

---

### Subscribe Page to Lead Ad Webhook
**POST /{page_id}/subscribed_apps**

**Request (form-encoded):**
```
subscribed_fields=leadgen&access_token={page_access_token}
```

**Response:**
```json
{ "success": true }
```

Must also register the webhook URL in Meta for Developers app settings.

---

### Webhook Verification (GET)
Meta sends a GET to your webhook URL when you register it:

**Query params Meta sends:**
```
?hub.mode=subscribe&hub.challenge=123456789&hub.verify_token=your_verify_token
```

**Your response:** Return the `hub.challenge` value as plain text with status 200.

---

### Webhook Payload (POST — new lead)

**Incoming POST body:**
```json
{
  "object": "page",
  "entry": [
    {
      "id": "PAGE_ID",
      "time": 1712829600,
      "changes": [
        {
          "field": "leadgen",
          "value": {
            "leadgen_id": "1234567890123456",
            "page_id": "PAGE_ID",
            "form_id": "9876543210987654",
            "created_time": 1712829600,
            "ad_id": "111222333444",
            "adset_id": "555666777888"
          }
        }
      ]
    }
  ]
}
```

Use `value.leadgen_id` to fetch the actual lead data.

---

### List Form Fields (to know field names)
**GET /{form_id}/leads?access_token={token}&fields=field_data**

Or check the form schema:
**GET /{form_id}?fields=questions&access_token={token}**

**Response:**
```json
{
  "questions": [
    { "type": "FULL_NAME", "key": "full_name", "label": "Full Name" },
    { "type": "PHONE", "key": "phone_number", "label": "Phone Number" },
    { "type": "EMAIL", "key": "email", "label": "Email Address" },
    { "type": "CUSTOM", "key": "what_service_interests_you", "label": "What service interests you?" }
  ]
}
```

---

### Get All Leads for a Form
**GET /{form_id}/leads?access_token={token}&fields=field_data,created_time**

**Response:**
```json
{
  "data": [
    {
      "id": "1234567890123456",
      "created_time": "2026-04-11T10:00:00+0000",
      "field_data": [
        { "name": "full_name", "values": ["David Cohen"] },
        { "name": "phone_number", "values": ["05-012-34567"] }
      ]
    }
  ],
  "paging": {
    "cursors": { "before": "...", "after": "..." },
    "next": "https://graph.facebook.com/..."
  }
}
```

---

### Long-Lived Token Exchange
**GET /oauth/access_token?grant_type=fb_exchange_token&client_id={app_id}&client_secret={app_secret}&fb_exchange_token={short_lived_token}**

**Response:**
```json
{
  "access_token": "EAAxxxxxxxx...",
  "token_type": "bearer",
  "expires_in": 5183944
}
```

Long-lived tokens last ~60 days. Store securely.

## Common Patterns

### Webhook handler → trigger Yappr call
```typescript
// Edge function handler
export async function handleFacebookLead(req: Request) {
  // Verification challenge
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge"), { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // New lead notification
  const body = await req.json();
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen") {
        const leadId = change.value.leadgen_id;

        // Fetch lead details
        const lead = await fetch(
          `https://graph.facebook.com/v19.0/${leadId}?access_token=${PAGE_ACCESS_TOKEN}`
        ).then(r => r.json());

        // Extract fields
        const fields = Object.fromEntries(
          lead.field_data.map((f: any) => [f.name, f.values[0]])
        );

        const rawPhone = fields.phone_number ?? "";
        const phone = normalizeIsraeliPhone(rawPhone);

        // Trigger Yappr call
        await fetch("https://api.goyappr.com/calls", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${YAPPR_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: phone,
            from: FROM_NUMBER,
            agent_id: AGENT_ID,
            metadata: { source: "facebook-lead-ads", leadId, name: fields.full_name },
          }),
        });
      }
    }
  }
  return new Response("ok", { status: 200 });
}

function normalizeIsraeliPhone(raw: string): string {
  // Remove dashes, spaces, parentheses
  let digits = raw.replace(/[\s\-().+]/g, "");
  // 05X → +9725X
  if (digits.startsWith("05")) return "+972" + digits.slice(1);
  // 972... → +972...
  if (digits.startsWith("972")) return "+" + digits;
  return raw;
}
```

## Gotchas & Rate Limits

- **Respond immediately**: Meta webhooks require a 200 response within 20 seconds. Do async processing after responding.
- **Phone format**: Israeli leads from Facebook forms come in various formats: `05-012-34567`, `0501234567`, `+972-50-123-4567`. Always normalize.
- **Token expiry**: Page Access Tokens from the short-lived flow expire in ~1 hour. Exchange for a long-lived token (~60 days). For permanent access, use a System User token in Business Manager.
- **Webhook signature verification**: Meta signs POST payloads with `X-Hub-Signature-256: sha256=...` using your app secret. Always verify in production.
- **Duplicate events**: Meta may deliver the same webhook event multiple times. Deduplicate on `leadgen_id`.
- **API versioning**: Always specify a Graph API version (e.g. `/v19.0/`). Versionless calls use the oldest version.
- **Test leads**: In Meta for Developers → Lead Ads Testing Tool, you can submit test leads that trigger real webhooks.
