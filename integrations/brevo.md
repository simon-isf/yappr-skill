# Brevo (formerly Sendinblue)

> **Use in Yappr context**: Add a contact after a call and send a transactional confirmation email or SMS immediately.

## Authentication

```
api-key: {api_key}
Content-Type: application/json
Accept: application/json
```

Get your API key from Brevo → Settings → API Keys → Generate a new API key. Unlike most platforms, Brevo uses a custom `api-key` header, not `Authorization: Bearer`.

## Base URL

```
https://api.brevo.com/v3
```

## Key Endpoints

### GET /contacts/{identifier} — Get contact by email or phone

```
GET /contacts/david%40example.com
GET /contacts/%2B972501234567
```

Response:

```json
{
  "id": 42,
  "email": "david@example.com",
  "emailBlacklisted": false,
  "smsBlacklisted": false,
  "attributes": {
    "FIRSTNAME": "David",
    "LASTNAME": "Cohen",
    "PHONE": "+972501234567",
    "LAST_CALL_DISPOSITION": "appointment_set"
  },
  "listIds": [3, 7]
}
```

Returns `404` if not found.

### POST /contacts — Create contact

```json
{
  "email": "david@example.com",
  "smsBlacklisted": false,
  "emailBlacklisted": false,
  "attributes": {
    "FIRSTNAME": "David",
    "LASTNAME": "Cohen",
    "PHONE": "+972501234567",
    "LAST_CALL_DISPOSITION": "appointment_set",
    "LAST_CALL_AT": "2024-02-15T10:30:00+00:00"
  },
  "listIds": [3],
  "updateEnabled": true
}
```

Setting `updateEnabled: true` makes this an upsert — updates if contact exists, creates if not. Response: `201 Created`.

### PUT /contacts/{identifier} — Update existing contact

```json
{
  "attributes": {
    "LAST_CALL_DISPOSITION": "appointment_set",
    "LAST_CALL_AT": "2024-02-15T10:30:00+00:00"
  },
  "listIds": [7],
  "unlinkListIds": [3]
}
```

Use `listIds` to add to lists and `unlinkListIds` to remove from lists simultaneously.

### POST /smtp/email — Send transactional email

```json
{
  "to": [
    { "email": "david@example.com", "name": "David Cohen" }
  ],
  "sender": {
    "email": "noreply@yourbusiness.com",
    "name": "Your Business"
  },
  "subject": "Your appointment is confirmed",
  "htmlContent": "<p>Hi David, your appointment is confirmed for <strong>tomorrow at 10:00</strong>.</p>",
  "textContent": "Hi David, your appointment is confirmed for tomorrow at 10:00.",
  "params": {
    "NAME": "David",
    "APPOINTMENT_TIME": "tomorrow at 10:00"
  }
}
```

Or use a template by ID instead of inline content:

```json
{
  "to": [{ "email": "david@example.com", "name": "David Cohen" }],
  "templateId": 12,
  "params": {
    "NAME": "David",
    "APPOINTMENT_TIME": "tomorrow at 10:00"
  }
}
```

Response: `201 Created` with `{ "messageId": "<...@smtp-relay.brevo.com>" }`.

### POST /transactionalSMS/sms — Send SMS

```json
{
  "sender": "YourBiz",
  "recipient": "+972501234567",
  "content": "Hi David, your appointment is confirmed for tomorrow at 10:00. Reply STOP to unsubscribe.",
  "type": "transactional"
}
```

`sender` must be 3–11 alphanumeric characters or a phone number. In Israel, alphanumeric sender IDs are supported but not always displayed depending on carrier.

### GET /contacts/lists — List all contact lists

```
GET /contacts/lists
```

Use to look up list IDs for disposition routing.

## Common Patterns

### Post-call: upsert contact and send confirmation

```typescript
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const BREVO_BASE = "https://api.brevo.com/v3";

const headers = {
  "api-key": BREVO_API_KEY,
  "Content-Type": "application/json",
  "Accept": "application/json",
};

const DISPOSITION_LIST_IDS: Record<string, number> = {
  appointment_set: parseInt(Deno.env.get("BREVO_LIST_APPOINTMENT")!),
  interested: parseInt(Deno.env.get("BREVO_LIST_INTERESTED")!),
  callback_requested: parseInt(Deno.env.get("BREVO_LIST_CALLBACK")!),
};

async function handleCallCompleted(params: {
  phone: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  disposition: string;
  confirmationTemplateId?: number;
}) {
  const { phone, email, firstName, lastName, disposition, confirmationTemplateId } = params;

  if (!email) {
    console.warn("No email — skipping Brevo contact upsert");
    return;
  }

  const listIds = DISPOSITION_LIST_IDS[disposition]
    ? [DISPOSITION_LIST_IDS[disposition]]
    : [];

  // 1. Upsert contact
  const contactRes = await fetch(`${BREVO_BASE}/contacts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      updateEnabled: true,
      smsBlacklisted: false,
      attributes: {
        ...(firstName && { FIRSTNAME: firstName }),
        ...(lastName && { LASTNAME: lastName }),
        PHONE: phone,
        LAST_CALL_DISPOSITION: disposition,
        LAST_CALL_AT: new Date().toISOString(),
      },
      ...(listIds.length && { listIds }),
    }),
  });

  if (!contactRes.ok) {
    throw new Error(`Brevo contact upsert failed: ${contactRes.status}`);
  }

  // 2. Send confirmation email/SMS if appointment set
  if (disposition === "appointment_set") {
    if (confirmationTemplateId) {
      await fetch(`${BREVO_BASE}/smtp/email`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: [{ email, name: [firstName, lastName].filter(Boolean).join(" ") }],
          templateId: confirmationTemplateId,
          params: { NAME: firstName ?? email },
        }),
      });
    }

    await fetch(`${BREVO_BASE}/transactionalSMS/sms`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sender: "YourBiz",
        recipient: phone,
        content: `Hi ${firstName ?? "there"}, your appointment is confirmed. Reply STOP to unsubscribe.`,
        type: "transactional",
      }),
    });
  }
}
```

## Gotchas & Rate Limits

- **Custom attributes must be created first**: `LAST_CALL_DISPOSITION`, `LAST_CALL_AT` etc. must exist in Brevo → Contacts → Settings → Contact attributes before you can write to them. Writing to an unknown attribute silently fails.
- **Attribute names are uppercase by convention** in Brevo (e.g. `FIRSTNAME`, `LASTNAME`, `PHONE`). The API is case-sensitive here — use uppercase to match Brevo's defaults.
- **`updateEnabled: true`** on POST /contacts is what makes it an upsert. Without it, creating a duplicate email throws `400 Contact already exist`.
- **SMS sender ID restrictions**: Israel requires the sender ID to be a registered number or approved alphanumeric. Test with your actual Israeli number before going live.
- **Transactional vs. marketing SMS**: Use `type: "transactional"` for post-call confirmations — it bypasses marketing unsubscribe lists. Use `type: "marketing"` only for promotional content.
- **Rate limits**: 400 requests/second on most endpoints. Transactional email has no daily limit on paid plans; SMS limits depend on your plan balance.
- **Phone lookup**: GET /contacts/+972... works but the `+` must be URL-encoded as `%2B`. Some clients forget this and get a 400.
- **WhatsApp**: Brevo has a WhatsApp Business API integration for sending approved templates. Requires a separate WhatsApp account setup in Brevo — not available on free plans.
