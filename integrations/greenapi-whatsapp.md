# Green API — WhatsApp

> **Use in Yappr context**: Send post-call WhatsApp messages to Israeli customers using their phone number, primarily for follow-ups, appointment confirmations, and summaries.

## Authentication

- Sign up at [console.green-api.com](https://console.green-api.com)
- Create an instance and scan the QR code with your WhatsApp
- Credentials: `idInstance` (numeric) and `apiTokenInstance` (string)
- Both are passed directly in the URL path — no Authorization header needed

## Base URL

```
https://api.green-api.com
```

## Key Endpoints

### Send Text Message
**POST /waInstance{idInstance}/sendMessage/{apiTokenInstance}**

**Headers:**
```
Content-Type: application/json
```

**Request:**
```json
{
  "chatId": "972501234567@c.us",
  "message": "Hello! Here is a summary of our call...",
  "quotedMessageId": null
}
```

**Response:**
```json
{
  "idMessage": "3EB0C767D097F7"
}
```

`idMessage` is the WhatsApp message ID. Store it if you need to track delivery status.

---

### Send File by URL
**POST /waInstance{idInstance}/sendFileByUrl/{apiTokenInstance}**

**Headers:**
```
Content-Type: application/json
```

**Request:**
```json
{
  "chatId": "972501234567@c.us",
  "urlFile": "https://example.com/summary.pdf",
  "fileName": "call-summary.pdf",
  "caption": "Here is your call summary"
}
```

**Response:**
```json
{
  "idMessage": "3EB0C767D097F7"
}
```

---

### Send Link Preview
**POST /waInstance{idInstance}/sendLinkPreview/{apiTokenInstance}**

**Request:**
```json
{
  "chatId": "972501234567@c.us",
  "urlLink": "https://calendly.com/your-link",
  "quotedMessageId": null
}
```

Sends a message with a rich link preview card.

---

### Get Instance State
**GET /waInstance{idInstance}/getStateInstance/{apiTokenInstance}**

**Response:**
```json
{
  "stateInstance": "authorized"
}
```

States: `authorized` | `notAuthorized` | `blocked`. Check this before sending to validate the instance is connected.

---

### Get Message Status
**GET /waInstance{idInstance}/getMessageStatus/{apiTokenInstance}**

**Request (query params):**
```
idMessage=3EB0C767D097F7
```

**Response:**
```json
{
  "status": "delivered"
}
```

Statuses: `sent` | `delivered` | `read` | `failed`

---

### Check WhatsApp Number Exists
**POST /waInstance{idInstance}/checkWhatsapp/{apiTokenInstance}**

**Request:**
```json
{
  "phoneNumber": "972501234567"
}
```

**Response:**
```json
{
  "existsWhatsapp": true
}
```

Call this before sending to avoid errors on non-WhatsApp numbers.

## Common Patterns

### Post-call WhatsApp follow-up (Israeli numbers)
```typescript
// Normalize Israeli phone to Green API format
function toGreenApiChatId(phone: string): string {
  // Remove all non-digits
  let digits = phone.replace(/\D/g, "");
  // 05X → 9725X
  if (digits.startsWith("05")) {
    digits = "972" + digits.slice(1);
  }
  // +972 → 972
  if (digits.startsWith("972")) {
    return digits + "@c.us";
  }
  throw new Error("Unrecognized Israeli phone format: " + phone);
}

const chatId = toGreenApiChatId(callerPhone); // "972501234567@c.us"

await fetch(
  `https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiTokenInstance}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId,
      message: `שלום ${callerName}! תודה על שיחתנו. ${summaryText}`,
    }),
  }
);
```

### Check before send
```typescript
const check = await fetch(
  `https://api.green-api.com/waInstance${idInstance}/checkWhatsapp/${apiTokenInstance}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: digits }),
  }
).then(r => r.json());

if (!check.existsWhatsapp) {
  // Fall back to SMS or skip
  return;
}
```

## Gotchas & Rate Limits

- **Phone format**: Always `972XXXXXXXXX@c.us` — no `+`, no spaces, no dashes. The `@c.us` suffix is required.
- **Instance must be authorized**: QR code scan needed. Instances expire if WhatsApp is not opened on the linked phone for 14 days.
- **Rate limits**: Green API doesn't publish hard limits but recommends max 1 message/second per instance to avoid WhatsApp bans.
- **Message templates not required**: Unlike Meta's official API, Green API uses the linked personal/business WhatsApp number — no template approval needed. However, this means it's against WhatsApp ToS for bulk messaging.
- **For production use**: Use `whatsapp-business.md` (Meta Cloud API) for template-based approved messages if compliance matters.
- **Media size limit**: Files sent by URL must be under 100MB.
