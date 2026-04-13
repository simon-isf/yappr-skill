# WhatsApp Business (Meta Cloud API)

> **Use in Yappr context**: Send post-call WhatsApp messages using official Meta WhatsApp Business API — required for template-based messages at scale, compliant with WhatsApp ToS.

## Authentication

- Meta Business Manager → WhatsApp → API Setup
- Permanent token: System User (recommended) → Generate token with `whatsapp_business_messaging` permission
- Pass as `Authorization: Bearer {token}`

## Base URL

```
https://graph.facebook.com/v19.0
```

**Phone Number ID**: Each WhatsApp business number has a unique ID (not the number itself). Get from: WhatsApp Manager → Phone Numbers.

## Key Endpoints

**Headers for all requests:**
```
Authorization: Bearer {system_user_token}
Content-Type: application/json
```

### Send Template Message
**POST /{phone_number_id}/messages**

Template messages must be pre-approved in Meta Business Manager.

**Request:**
```json
{
  "messaging_product": "whatsapp",
  "to": "972501234567",
  "type": "template",
  "template": {
    "name": "appointment_confirmation",
    "language": { "code": "he" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "David Cohen" },
          { "type": "text", "text": "April 15 at 10:00 AM" }
        ]
      }
    ]
  }
}
```

**Response:**
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "972501234567", "wa_id": "972501234567" }],
  "messages": [{ "id": "wamid.HBgL...", "message_status": "accepted" }]
}
```

---

### Send Free-Form Text (within 24-hour window)
**POST /{phone_number_id}/messages**

Only allowed within 24 hours of customer-initiated message.

**Request:**
```json
{
  "messaging_product": "whatsapp",
  "to": "972501234567",
  "type": "text",
  "text": { "body": "Thanks for your call! Here is a summary..." }
}
```

---

### Send Document
**POST /{phone_number_id}/messages**

```json
{
  "messaging_product": "whatsapp",
  "to": "972501234567",
  "type": "document",
  "document": {
    "link": "https://example.com/summary.pdf",
    "caption": "Your call summary",
    "filename": "call-summary.pdf"
  }
}
```

---

### Send Interactive Button Message
**POST /{phone_number_id}/messages**

```json
{
  "messaging_product": "whatsapp",
  "to": "972501234567",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Would you like to confirm your appointment?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "confirm", "title": "Confirm" } },
        { "type": "reply", "reply": { "id": "cancel", "title": "Cancel" } }
      ]
    }
  }
}
```

---

### Get Message Status (Webhook)
Meta pushes delivery statuses to your webhook, not polled.

**Incoming webhook payload (status update):**
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "field": "messages",
      "value": {
        "statuses": [{
          "id": "wamid.HBgL...",
          "status": "delivered",
          "timestamp": "1712829600",
          "recipient_id": "972501234567"
        }]
      }
    }]
  }]
}
```

Statuses: `sent` | `delivered` | `read` | `failed`

---

### Incoming Message Webhook

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "field": "messages",
      "value": {
        "messages": [{
          "id": "wamid.abc",
          "from": "972501234567",
          "timestamp": "1712829600",
          "type": "text",
          "text": { "body": "Yes, I want to confirm" }
        }]
      }
    }]
  }]
}
```

---

### Get Templates
**GET /{waba_id}/message_templates**

**Response:**
```json
{
  "data": [
    {
      "name": "appointment_confirmation",
      "status": "APPROVED",
      "language": "he",
      "components": [
        {
          "type": "BODY",
          "text": "שלום {{1}}, הפגישה שלך מאושרת ל-{{2}}."
        }
      ]
    }
  ]
}
```

---

### Create Template
**POST /{waba_id}/message_templates**

```json
{
  "name": "call_summary_follow_up",
  "language": "he",
  "category": "MARKETING",
  "components": [
    {
      "type": "BODY",
      "text": "שלום {{1}}, תודה על שיחתנו! סיכום: {{2}}"
    },
    {
      "type": "FOOTER",
      "text": "Yappr AI"
    }
  ]
}
```

Templates take 1–24 hours to be approved by Meta.

## Common Patterns

### Send template after call
```typescript
const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const token = Deno.env.get("WHATSAPP_TOKEN");

// Format: no +, no spaces
const to = callerPhone.replace(/\D/g, "").replace(/^0/, "972");

await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "call_summary_follow_up",
      language: { code: "he" },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: callerFirstName },
          { type: "text", text: callSummary.slice(0, 200) },
        ],
      }],
    },
  }),
});
```

## Gotchas & Rate Limits

- **Phone format**: No `+`, no spaces. `972501234567` not `+972 50 123 4567`.
- **Templates required for outbound**: You can only send free-form messages within 24 hours of a customer-initiated message. For post-call messages, always use a pre-approved template.
- **Template approval takes time**: Submit templates in advance. `APPROVED` status required before use.
- **Template variables**: `{{1}}`, `{{2}}` etc. Parameters in API must match the number of variables in the template.
- **Rate limits**: 1,000 messages/second per phone number. Tier-based daily limits start at 1,000 unique recipients/day (Business Verified).
- **vs Green API**: Meta Cloud API = official, compliant, requires template approval. Green API = unofficial, no template approval needed but against ToS for bulk.
- **Webhook verification**: Same as Facebook Lead Ads — `hub.challenge` verification + `X-Hub-Signature-256` on payloads.
- **WABA ID vs Phone Number ID**: WABA (WhatsApp Business Account) ID is used for template management. Phone Number ID is used for sending messages.
