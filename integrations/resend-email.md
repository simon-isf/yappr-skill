# Resend

> **Use in Yappr context**: Send transactional follow-up emails after calls — appointment confirmations, call summaries, or meeting invites to both the customer and the internal team.

## Authentication

- Sign up at [resend.com](https://resend.com)
- API Keys → Create API Key
- Pass as `Authorization: Bearer re_xxxxxxxxxxxxxxxxxx`

## Base URL

```
https://api.resend.com
```

## Key Endpoints

### Send Email
**POST /emails**

**Headers:**
```
Authorization: Bearer re_xxxxxxxxxx
Content-Type: application/json
```

**Request:**
```json
{
  "from": "Yappr <no-reply@mail.yourcompany.com>",
  "to": ["david@example.com"],
  "subject": "Summary of your call with us",
  "html": "<h2>Thanks for your time, David!</h2><p>Here's what we discussed...</p>",
  "text": "Thanks for your time, David! Here's what we discussed...",
  "reply_to": "sales@yourcompany.com",
  "tags": [
    { "name": "source", "value": "yappr-call" },
    { "name": "disposition", "value": "appointment-set" }
  ]
}
```

**Response:**
```json
{
  "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
}
```

---

### Send to Multiple Recipients
**POST /emails**

```json
{
  "from": "Yappr <no-reply@mail.yourcompany.com>",
  "to": ["david@example.com", "sales@yourcompany.com"],
  "subject": "New appointment booked",
  "html": "<p>A new appointment has been booked via Yappr AI call.</p><p><strong>Customer:</strong> David Cohen<br><strong>Time:</strong> April 15, 2026 at 10:00 AM</p>"
}
```

---

### Batch Send (Multiple Separate Emails)
**POST /emails/batch**

**Request:**
```json
[
  {
    "from": "Yappr <no-reply@mail.yourcompany.com>",
    "to": ["customer1@example.com"],
    "subject": "Your appointment confirmation",
    "html": "<p>Your appointment is confirmed for April 15 at 10:00 AM.</p>"
  },
  {
    "from": "Yappr <no-reply@mail.yourcompany.com>",
    "to": ["sales@yourcompany.com"],
    "subject": "New lead: David Cohen",
    "html": "<p>A new lead was captured: David Cohen (+972501234567)</p>"
  }
]
```

**Response:**
```json
{
  "data": [
    { "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" },
    { "id": "7c66f7b3-1c6d-4a45-9c6f-a3b3f5e2a1c0" }
  ]
}
```

---

### Get Email Status
**GET /emails/:id**

**Response:**
```json
{
  "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794",
  "object": "email",
  "to": ["david@example.com"],
  "from": "Yappr <no-reply@mail.yourcompany.com>",
  "subject": "Summary of your call",
  "created_at": "2026-04-11T10:00:00.000Z",
  "last_event": "delivered"
}
```

Events: `queued` | `sent` | `delivered` | `opened` | `clicked` | `bounced` | `complained`

---

### Cancel Scheduled Email
**POST /emails/:id/cancel**

Only works if email was scheduled and not yet sent.

## Common Patterns

### Post-call summary email to customer
```typescript
const emailId = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "Yappr AI <no-reply@mail.yourcompany.com>",
    to: [callerEmail],
    subject: `תודה על שיחתנו, ${callerFirstName}!`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2>שלום ${callerFirstName},</h2>
        <p>תודה שדיברת איתנו היום.</p>
        <h3>סיכום השיחה:</h3>
        <p>${callSummaryHtml}</p>
        ${appointmentTime ? `<p><strong>הפגישה שנקבעה:</strong> ${appointmentTime}</p>` : ""}
        <p>לשאלות, ניתן לפנות אלינו בכל עת.</p>
      </div>
    `,
    tags: [{ name: "call_id", value: callId }],
  }),
}).then(r => r.json());
```

### Internal notification to sales team
```typescript
await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "Yappr Alerts <alerts@mail.yourcompany.com>",
    to: ["sales@yourcompany.com"],
    subject: `[${disposition}] ${callerName} — ${callerPhone}`,
    html: `
      <h3>Call Result: ${disposition}</h3>
      <p><strong>Name:</strong> ${callerName}<br>
      <strong>Phone:</strong> ${callerPhone}<br>
      <strong>Duration:</strong> ${durationSeconds}s<br>
      <strong>Time:</strong> ${new Date().toLocaleString("en-IL", { timeZone: "Asia/Jerusalem" })}</p>
      <h4>Summary</h4>
      <p>${callSummary}</p>
    `,
  }),
});
```

## Gotchas & Rate Limits

- **Domain verification required**: `from` email domain must be verified in Resend (add DNS records). Unverified domains → emails go to spam or are rejected.
- **Rate limits**: 100 emails/second, no daily limit on paid plans. Free plan: 100 emails/day, 3,000/month.
- **`from` format**: Can be `"Name <email@domain.com>"` or just `"email@domain.com"`. The display name format is recommended.
- **`to` is an array**: Always pass as an array even for a single recipient.
- **Hebrew emails**: Set `<div dir="rtl">` in the HTML body for right-to-left rendering. Subject line supports Hebrew natively.
- **Tags**: Up to 10 tags per email. Tag names and values must be 1–128 characters, no spaces. Use for analytics filtering.
- **Batch limit**: Maximum 100 emails per batch request.
- **No scheduled send in the basic API**: Use `scheduled_at` parameter (ISO 8601) to schedule emails.
