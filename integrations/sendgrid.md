# SendGrid

> **Use in Yappr context**: Send transactional post-call emails — summaries, appointment confirmations, and sales team notifications — using dynamic templates or inline HTML.

## Authentication

- Get API key: SendGrid Dashboard → Settings → API Keys → Create API Key
- Minimum permission: `Mail Send` (full access or restricted to Mail Send)
- Pass as: `Authorization: Bearer SG.xxx...`

## Base URL

```
https://api.sendgrid.com/v3
```

## Key Endpoints

**Headers for all requests:**
```
Authorization: Bearer SG.xxx...
Content-Type: application/json
```

### Send Email (Inline)
**POST /mail/send**

**Request:**
```json
{
  "personalizations": [
    {
      "to": [{ "email": "david@example.com", "name": "David Cohen" }],
      "subject": "Summary of your call with us"
    }
  ],
  "from": { "email": "no-reply@yourcompany.com", "name": "Yappr AI" },
  "reply_to": { "email": "sales@yourcompany.com" },
  "content": [
    {
      "type": "text/plain",
      "value": "Thanks for your time, David! Here's a summary of our call."
    },
    {
      "type": "text/html",
      "value": "<h2>Thanks, David!</h2><p>Here's what we discussed...</p>"
    }
  ],
  "categories": ["yappr-call", "appointment-set"],
  "custom_args": {
    "call_id": "call_abc123",
    "disposition": "Appointment Set"
  }
}
```

**Response:** `202 Accepted` (no body)

---

### Send Email with Dynamic Template
**POST /mail/send**

Dynamic templates support Handlebars syntax. Create templates in SendGrid Dashboard → Email API → Dynamic Templates.

**Request:**
```json
{
  "personalizations": [
    {
      "to": [{ "email": "david@example.com", "name": "David Cohen" }],
      "dynamic_template_data": {
        "first_name": "David",
        "disposition": "Appointment Set",
        "appointment_time": "April 15, 2026 at 10:00 AM",
        "call_summary": "Customer interested in Business plan.",
        "company_name": "Your Company"
      }
    }
  ],
  "from": { "email": "no-reply@yourcompany.com", "name": "Yappr AI" },
  "template_id": "d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

---

### Send to Multiple Recipients (Single Email)
**POST /mail/send**

```json
{
  "personalizations": [
    {
      "to": [
        { "email": "customer@example.com" },
        { "email": "sales@yourcompany.com" }
      ],
      "subject": "New appointment booked"
    }
  ],
  "from": { "email": "no-reply@yourcompany.com" },
  "content": [{ "type": "text/html", "value": "<p>New appointment booked!</p>" }]
}
```

---

### Send Batch (Multiple Separate Emails)
**POST /mail/send**

Use multiple `personalizations` objects — each gets its own email:

```json
{
  "personalizations": [
    {
      "to": [{ "email": "customer1@example.com" }],
      "dynamic_template_data": { "first_name": "David" }
    },
    {
      "to": [{ "email": "customer2@example.com" }],
      "dynamic_template_data": { "first_name": "Sarah" }
    }
  ],
  "from": { "email": "no-reply@yourcompany.com" },
  "template_id": "d-xxx"
}
```

Max 1,000 personalizations per request.

---

### Get Email Activity (Stats)
**GET /v3/stats?start_date=2026-04-01&end_date=2026-04-11&aggregated_by=day**

**Response:**
```json
[
  {
    "date": "2026-04-11",
    "stats": [
      {
        "metrics": {
          "delivers": 45,
          "opens": 12,
          "clicks": 3,
          "bounces": 1,
          "spam_reports": 0
        }
      }
    ]
  }
]
```

---

### Validate Email Address
**POST /v3/validations/email**

Requires Email Validation add-on.

```json
{ "email": "david@example.com", "source": "yappr" }
```

**Response:**
```json
{
  "result": {
    "email": "david@example.com",
    "verdict": "Valid",
    "score": 0.98
  }
}
```

## Common Patterns

### Post-call summary email
```typescript
await fetch("https://api.sendgrid.com/v3/mail/send", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${Deno.env.get("SENDGRID_API_KEY")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    personalizations: [{
      to: [{ email: callerEmail, name: callerName }],
      dynamic_template_data: {
        first_name: callerFirstName,
        disposition,
        summary: callSummary,
        call_date: new Date().toLocaleDateString("en-IL"),
      },
    }],
    from: { email: "no-reply@yourcompany.com", name: "Yappr AI" },
    template_id: Deno.env.get("SENDGRID_TEMPLATE_ID"),
  }),
});
```

## Gotchas & Rate Limits

- **Rate limits**: 100 emails/second by default. Very high daily send limits (plan-dependent).
- **Domain authentication**: Verify sender domain (SPF, DKIM) in SendGrid settings. Without verification, emails land in spam.
- **`from` must be verified**: The sender email or domain must be authenticated. Can't send from arbitrary domains.
- **202 response**: Success is `202 Accepted` with no body. Errors return JSON with `errors` array.
- **Template version**: A dynamic template can have multiple versions. The API uses the "active" version automatically.
- **`categories` limit**: Max 10 categories per email. Used for filtering in the activity feed.
- **Unsubscribe tracking**: SendGrid auto-adds unsubscribe headers. For transactional emails (not marketing), set `tracking_settings.subscription_tracking.enable: false` to avoid the unsubscribe footer.
- **Hebrew emails**: Set `charset` in the HTML content type if needed, and use `dir="rtl"` in the HTML body.
