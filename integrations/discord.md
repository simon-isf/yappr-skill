# Discord

> **Use in Yappr context**: Send call outcome notifications to a Discord server channel — useful for small teams using Discord as their primary communication tool.

## Authentication

**Option A: Webhook (simplest, no bot needed)**
1. Discord server → channel settings → Integrations → Webhooks → New Webhook
2. Copy webhook URL: `https://discord.com/api/webhooks/{id}/{token}`

**Option B: Bot Token**
1. Discord Developer Portal → New Application → Bot → Add Bot → Copy Token
2. Add bot to server with `Send Messages` permission
3. Pass as: `Authorization: Bot {token}`

## Base URL

```
https://discord.com/api/v10
```

For webhooks: use the full webhook URL directly.

## Key Endpoints

### Send Message via Webhook
**POST https://discord.com/api/webhooks/{id}/{token}**

**Headers:**
```
Content-Type: application/json
```

**Request (simple text):**
```json
{
  "content": "New call completed: David Cohen | Appointment Set | 3 minutes"
}
```

**Request (embed — rich formatted):**
```json
{
  "content": null,
  "embeds": [
    {
      "title": "Yappr Call Result",
      "color": 3066993,
      "fields": [
        { "name": "Disposition", "value": "Appointment Set", "inline": true },
        { "name": "Duration", "value": "3m 12s", "inline": true },
        { "name": "Name", "value": "David Cohen", "inline": true },
        { "name": "Phone", "value": "+972501234567", "inline": true }
      ],
      "description": "Customer interested in Business plan. Appointment booked for April 15.",
      "footer": { "text": "Yappr AI Voice Platform" },
      "timestamp": "2026-04-11T10:00:00.000Z"
    }
  ]
}
```

Discord embed colors are decimal integers. Common colors:
- Green (success): `3066993` (`#2ECC71`)
- Red (failure): `15158332` (`#E74C3C`)
- Yellow (warning): `16776960` (`#FFFF00`)
- Blue (info): `3447003` (`#3498DB`)
- Grey (neutral): `9807270` (`#95A5A6`)

**Response:** `204 No Content` (success)

---

### Send Message via Bot Token
**POST /channels/{channel_id}/messages**

**Headers:**
```
Authorization: Bot {token}
Content-Type: application/json
```

**Request:**
```json
{
  "content": "New call result!",
  "embeds": [ ... same embed format ... ]
}
```

**Response:**
```json
{
  "id": "message-snowflake-id",
  "channel_id": "channel-snowflake-id",
  "content": "New call result!",
  "timestamp": "2026-04-11T10:00:00+00:00"
}
```

---

### Edit Message
**PATCH /channels/{channel_id}/messages/{message_id}**

```json
{
  "content": "Updated status: Customer confirmed."
}
```

---

### Get Channel ID
Get channel ID from Discord: Enable Developer Mode (User Settings → Advanced → Developer Mode), then right-click channel → Copy ID.

---

### Send File with Message
**POST https://discord.com/api/webhooks/{id}/{token}**

Use `multipart/form-data`:
```
payload_json: {"content": "Transcript attached"}
file1: [file binary data]
```

---

### Thread Reply
**POST /channels/{channel_id}/messages**

```json
{
  "content": "Follow-up note: Appointment confirmed.",
  "message_reference": {
    "message_id": "original-message-snowflake-id"
  }
}
```

## Common Patterns

### Post-call Discord notification
```typescript
const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");

const colorMap: Record<string, number> = {
  "Appointment Set": 3066993,    // green
  "Callback Requested": 16776960, // yellow
  "Not Interested": 15158332,     // red
  "No Answer": 9807270,           // grey
};

await fetch(webhookUrl!, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    embeds: [{
      title: `${disposition}`,
      color: colorMap[disposition] ?? 9807270,
      fields: [
        { name: "Name", value: callerName || "Unknown", inline: true },
        { name: "Phone", value: callerPhone, inline: true },
        { name: "Duration", value: `${Math.floor(duration / 60)}m ${duration % 60}s`, inline: true },
      ],
      description: callSummary.slice(0, 4096),
      timestamp: new Date().toISOString(),
      footer: { text: "Yappr AI" },
    }],
  }),
});
```

## Gotchas & Rate Limits

- **Rate limits**: 5 requests/second per webhook. Global: 50 requests/second. Embeds count as one request per message.
- **Webhook vs Bot**: Webhooks are simpler but can't read messages or react. Use a bot token if you need two-way interaction.
- **Channel ID is not channel name**: Discord uses "snowflake" IDs (large integers). Channel names are human-readable but IDs are what the API uses.
- **Embed field limit**: Max 25 fields per embed, 1,024 chars per field value, 4,096 chars for `description`.
- **Color format**: Discord uses decimal integer for embed colors, not hex strings. Convert hex: `parseInt("2ECC71", 16)` = `3066993`.
- **`204 No Content`**: Webhook success returns no body. Don't try to parse the response as JSON.
- **Webhook deletion**: If someone deletes the webhook in Discord, all future posts will return `404`. Handle gracefully and alert the admin.
