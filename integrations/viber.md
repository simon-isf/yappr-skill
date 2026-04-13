# Viber

> **Use in Yappr context**: Send appointment confirmations and follow-up messages via Viber after a call, for customers who prefer Viber over WhatsApp — common with older demographics and B2C audiences in Israel.

## Authentication

**Bot Auth Token** from Viber Partners:

1. Go to [partners.viber.com](https://partners.viber.com) → Create Bot Account
2. Copy the **Auth Token** (a long string assigned to your bot)
3. All requests use: `X-Viber-Auth-Token: {token}` header

Each bot has one token. There is no OAuth flow — the token is permanent unless regenerated.

## Base URL

```
https://chatapi.viber.com/pa
```

## Key Endpoints

### Set Webhook
**POST /set_webhook**

Register your webhook URL to receive incoming messages and delivery events. Must be called once during setup (or any time the URL changes).

**Headers:**
```
X-Viber-Auth-Token: {token}
Content-Type: application/json
```

**Request:**
```json
{
  "url": "https://your-project.supabase.co/functions/v1/viber-webhook",
  "event_types": ["delivered", "seen", "failed", "conversation_started", "message"],
  "send_name": true,
  "send_photo": false
}
```

**Response:**
```json
{
  "status": 0,
  "status_message": "ok",
  "event_types": ["delivered", "seen", "failed", "conversation_started", "message"]
}
```

`status: 0` means success. Any non-zero status is an error.

---

### Send Text Message
**POST /send_message**

**Request:**
```json
{
  "receiver": "01234567890A=",
  "type": "text",
  "sender": {
    "name": "YourCompany",
    "avatar": "https://yourcompany.com/logo.png"
  },
  "text": "שלום יעל! הפגישה שלנו אושרה ל-15 באפריל בשעה 14:00. נשמח לראות אותך!"
}
```

**Response:**
```json
{
  "status": 0,
  "status_message": "ok",
  "message_token": 1234567890123456789,
  "billing_status": 1
}
```

`receiver` is the Viber User ID — an opaque string, not a phone number. You can only get this from an inbound message or `conversation_started` event.

---

### Send Rich Media (Button Card)
**POST /send_message**

Send a card with an appointment confirmation button — useful for "Confirm your appointment" CTAs.

**Request:**
```json
{
  "receiver": "01234567890A=",
  "type": "rich_media",
  "sender": { "name": "YourCompany" },
  "rich_media": {
    "Type": "rich_media",
    "ButtonsGroupColumns": 6,
    "ButtonsGroupRows": 4,
    "BgColor": "#FFFFFF",
    "Buttons": [
      {
        "Columns": 6,
        "Rows": 3,
        "ActionType": "none",
        "Text": "<font color='#000000'><b>פגישה אושרה</b></font><br>15 באפריל, 14:00",
        "TextHAlign": "center",
        "TextVAlign": "middle",
        "BgColor": "#f0f0f0"
      },
      {
        "Columns": 6,
        "Rows": 1,
        "ActionType": "open-url",
        "ActionBody": "https://zoom.us/j/87654321098",
        "Text": "<font color='#FFFFFF'>הצטרף לפגישה</font>",
        "BgColor": "#7360F2"
      }
    ]
  }
}
```

---

### Get Account Info
**POST /get_account_info**

**Request:** Empty body (only the auth token header is needed)

**Response:**
```json
{
  "status": 0,
  "status_message": "ok",
  "id": "bot_id_abc123",
  "name": "YourCompany Bot",
  "uri": "yourcompanybot",
  "icon": "https://...",
  "background": "https://...",
  "category": "Tech & Tools",
  "subcategory": "Tools & Utilities",
  "members_count": 1240,
  "online_members_count": 18
}
```

---

### Broadcast Message (Multiple Recipients)
**POST /broadcast_message**

Send the same message to up to 300 Viber User IDs at once.

**Request:**
```json
{
  "broadcast_list": ["01234567890A=", "09876543210B=", "05555555555C="],
  "type": "text",
  "sender": { "name": "YourCompany" },
  "text": "תזכורת: הפגישה שלנו מחר בשעה 14:00. להתראות!"
}
```

**Response:**
```json
{
  "status": 0,
  "status_message": "ok",
  "failed_list": []
}
```

---

### Incoming Webhook — Receive Message
Viber sends a `POST` to your registered webhook URL for every event.

**Incoming message payload:**
```json
{
  "event": "message",
  "timestamp": 1712912400000,
  "message_token": 1234567890123456789,
  "sender": {
    "id": "01234567890A=",
    "name": "Yael Cohen",
    "language": "he",
    "country": "IL"
  },
  "message": {
    "type": "text",
    "text": "אני מעוניינת בפגישה",
    "token": 1234567890123456789,
    "tracking_data": ""
  }
}
```

**`conversation_started` event** (user opens bot for first time — use this to capture user ID):
```json
{
  "event": "conversation_started",
  "timestamp": 1712912400000,
  "user": {
    "id": "01234567890A=",
    "name": "Yael Cohen",
    "language": "he",
    "country": "IL"
  },
  "subscribed": false
}
```

## Common Patterns

### Store Viber User ID on first contact, then message post-call
```typescript
// In your Viber webhook handler (edge function)
// Save the user ID when conversation starts or a message arrives

const viberId = payload.sender?.id ?? payload.user?.id;
const viberName = payload.sender?.name ?? payload.user?.name;

if (viberId) {
  // Store in your DB: { phone: normalizedPhone, viber_id: viberId }
  // Problem: Viber doesn't give phone number — match by name or ask user for phone
  await supabase.from("viber_subscribers").upsert({
    viber_id: viberId,
    name: viberName,
    updated_at: new Date().toISOString(),
  });
}

// Post-call: send confirmation if we have their viber_id
async function sendViberConfirmation(viberId: string, callerName: string, meetingDetails: string) {
  const token = Deno.env.get("VIBER_TOKEN")!;

  const res = await fetch("https://chatapi.viber.com/pa/send_message", {
    method: "POST",
    headers: {
      "X-Viber-Auth-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      receiver: viberId,
      type: "text",
      sender: { name: "YourCompany" },
      text: `שלום ${callerName}! ${meetingDetails}`,
    }),
  });

  const data = await res.json();
  if (data.status !== 0) {
    throw new Error(`Viber error ${data.status}: ${data.status_message}`);
  }
  return data.message_token;
}
```

### Fallback: try WhatsApp first, Viber if not available
```typescript
// Check if user has Viber ID on record
const { data: subscriber } = await supabase
  .from("viber_subscribers")
  .select("viber_id")
  .eq("phone", normalizedPhone)
  .single();

if (subscriber?.viber_id) {
  await sendViberConfirmation(subscriber.viber_id, callerName, message);
} else {
  // Fall back to WhatsApp or SMS
  await sendWhatsApp({ to: normalizedPhone, message });
}
```

## Gotchas & Rate Limits

- **Cannot initiate conversations cold**: Viber Business Messages only allows messaging users who have previously started a conversation with your bot (i.e., you have their Viber User ID from an inbound event). Unlike WhatsApp Business API, there is no way to send to an arbitrary phone number. This is the main limitation for post-call use.
- **`receiver` is not a phone number**: Viber User IDs are opaque strings (e.g. `01234567890A=`). You cannot look up a Viber ID by phone number through the API. You must capture it from an inbound message or `conversation_started` event.
- **`conversation_started` is not a subscription**: When `subscribed: false`, the user has opened the bot but not subscribed. You can still send one welcome message, but further messages require the user to actually send you a message first or subscribe.
- **Viber Promoted Messages**: Viber's paid product for initiating outbound messages to opted-in lists. Uses a separate API (`promotedmessages.viber.com`) and requires a commercial agreement with Viber. Suitable for high-volume B2C follow-up if the cold-messaging limitation is a blocker.
- **RTL / Hebrew text**: Viber renders Hebrew correctly on iOS and Android. No special encoding needed — use UTF-8 strings directly.
- **Rate limit**: 500 messages/minute per bot. Broadcast is limited to 300 recipients per request.
- **`status: 6` error**: "Not subscribed" — the receiver has blocked your bot or never interacted. Remove them from your active list.
- **`status: 7` error**: "No active subscription" — user must start a conversation with the bot first.
- **Webhook must be HTTPS**: Viber rejects HTTP webhook URLs. Your Supabase edge function URL is HTTPS by default.
- **Israel context**: Viber has significant penetration in Israel, especially among older adults (35+) and B2C segments. Younger demographics skew toward WhatsApp. For maximum reach, support both channels.
