# Twilio SMS

> **Use in Yappr context**: Send SMS follow-up messages after calls to customers who don't use WhatsApp, or as a fallback when WhatsApp delivery fails.

## Authentication

- Get Account SID and Auth Token: Twilio Console → Account → API Keys & Tokens
- Auth: HTTP Basic — `Account SID` as username, `Auth Token` as password

## Base URL

```
https://api.twilio.com/2010-04-01/Accounts/{AccountSid}
```

## Key Endpoints

**Authentication for all requests:**
```
Authorization: Basic base64(AccountSid:AuthToken)
Content-Type: application/x-www-form-urlencoded
```

Note: Twilio API uses **form-encoded** bodies, not JSON.

### Send SMS
**POST /Accounts/{AccountSid}/Messages.json**

**Request (form-encoded):**
```
From=+12015551234
To=+972501234567
Body=Thanks for speaking with us, David! Your appointment is confirmed for April 15 at 10AM. Reply STOP to unsubscribe.
```

**Response (JSON):**
```json
{
  "account_sid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "body": "Thanks for speaking with us, David!...",
  "date_created": "Fri, 11 Apr 2026 10:00:00 +0000",
  "date_sent": null,
  "direction": "outbound-api",
  "error_code": null,
  "error_message": null,
  "from": "+12015551234",
  "num_segments": "1",
  "price": null,
  "sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "queued",
  "to": "+972501234567"
}
```

`sid` = message SID for status lookups.

---

### Get Message Status
**GET /Accounts/{AccountSid}/Messages/{MessageSid}.json**

**Response:**
```json
{
  "sid": "SMxxxxxx",
  "status": "delivered",
  "error_code": null,
  "to": "+972501234567"
}
```

Statuses: `queued` → `sent` → `delivered` (or `failed` / `undelivered`)

---

### List Messages
**GET /Accounts/{AccountSid}/Messages.json?To=%2B972501234567&PageSize=20**

---

### Send WhatsApp Message via Twilio
**POST /Accounts/{AccountSid}/Messages.json**

```
From=whatsapp:+14155238886
To=whatsapp:+972501234567
Body=Hello! Here is your appointment summary.
```

Requires Twilio WhatsApp Sandbox (dev) or approved WhatsApp Business number (prod).

---

### Buy Phone Number (setup, not runtime)
**POST /Accounts/{AccountSid}/IncomingPhoneNumbers.json**

```
PhoneNumber=+15005550006
```

---

### Lookup Phone Number (validate + carrier info)
**GET https://lookups.twilio.com/v2/PhoneNumbers/{phone_number}?Fields=line_type_intelligence**

**Response:**
```json
{
  "phone_number": "+972501234567",
  "national_format": "050-123-4567",
  "country_code": "IL",
  "line_type_intelligence": {
    "type": "mobile",
    "carrier_name": "Cellcom"
  }
}
```

Use this to validate numbers before sending.

## Common Patterns

### Post-call SMS follow-up
```typescript
const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER")!; // Your Twilio number

const credentials = btoa(`${accountSid}:${authToken}`);

const body = new URLSearchParams({
  From: fromNumber,
  To: callerPhone,  // Must be E.164: +972501234567
  Body: `Hi ${callerFirstName}! Thanks for speaking with us. ${
    disposition === "Appointment Set"
      ? `Your appointment is confirmed: ${appointmentTime}.`
      : "We'll be in touch soon."
  }`,
});

const res = await fetch(
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
  {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  }
).then(r => r.json());

if (res.error_code) {
  console.error("Twilio error:", res.error_code, res.error_message);
}

return res.sid; // Store for delivery tracking
```

### Check if number is mobile (before sending)
```typescript
const lookup = await fetch(
  `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}?Fields=line_type_intelligence`,
  { headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` } }
).then(r => r.json());

if (lookup.line_type_intelligence?.type !== "mobile") {
  console.log("Not a mobile number, skipping SMS");
  return;
}
```

## Gotchas & Rate Limits

- **Phone format**: Must be E.164 (`+972501234567`). Twilio will reject numbers without country code.
- **`From` number**: Must be a Twilio phone number you own or a verified sender ID. Cannot use any arbitrary number.
- **Israel SMS**: Twilio supports Israeli numbers. You need a Twilio number or approved sender ID for IL. Check local regulations — Israel requires opt-out support.
- **SMS character limits**: 1 SMS = 160 GSM-7 characters or 70 UCS-2 (Unicode/Hebrew) characters. Longer messages are split into segments and billed per segment.
- **Hebrew SMS**: Hebrew text uses UCS-2 encoding — 70 chars per segment, not 160. Keep messages short.
- **Rate limits**: 1 message/second per phone number by default. Increase by purchasing a messaging service with multiple numbers.
- **Opt-out compliance**: Always include "Reply STOP to unsubscribe" in Israel to comply with SPAM regulations. Twilio auto-handles STOP keywords.
- **Delivery receipts**: Set a `StatusCallback` URL to receive delivery status updates via webhook.
- **Cost**: SMS to Israel is approximately $0.05–0.10 per message (varies). Lookups API has separate per-request cost (~$0.005).
