# Slack

> **Use in Yappr context**: Send real-time notifications to a sales team Slack channel when calls complete — including disposition, customer name, and summary.

## Authentication

**Option A: Incoming Webhook (simplest)**
1. Slack API → Your Apps → Create New App → From scratch
2. Incoming Webhooks → Activate → Add to Workspace → Select channel
3. Copy webhook URL: `https://hooks.slack.com/services/T.../B.../...`
- No token needed, just POST to the URL

**Option B: Bot Token (more control)**
1. Create Slack App → OAuth & Permissions → Add Bot Token Scopes: `chat:write`, `chat:write.public`
2. Install to workspace → Copy Bot User OAuth Token: `xoxb-...`
3. Pass as `Authorization: Bearer xoxb-...`

## Base URL

```
https://slack.com/api
```

For incoming webhooks:
```
https://hooks.slack.com/services/{T...}/{B...}/{token}
```

## Key Endpoints

### Send Message via Incoming Webhook
**POST https://hooks.slack.com/services/{T}/{B}/{token}**

**Headers:**
```
Content-Type: application/json
```

**Request (simple text):**
```json
{
  "text": "New call completed: David Cohen | Appointment Set | 3 minutes"
}
```

**Request (rich blocks):**
```json
{
  "text": "New Yappr call result",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📞 Appointment Set"
      }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Name:*\nDavid Cohen" },
        { "type": "mrkdwn", "text": "*Phone:*\n+972501234567" },
        { "type": "mrkdwn", "text": "*Duration:*\n3 min 12 sec" },
        { "type": "mrkdwn", "text": "*Appointment:*\nApril 15 at 10:00 AM" }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Summary:*\nCustomer is interested in the Business plan and has questions about pricing."
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "View in CRM" },
          "url": "https://app.hubspot.com/contacts/12345",
          "style": "primary"
        }
      ]
    }
  ]
}
```

**Response:** `ok` (plain text, not JSON)

---

### Send Message via Bot Token
**POST /chat.postMessage**

**Headers:**
```
Authorization: Bearer xoxb-...
Content-Type: application/json
```

**Request:**
```json
{
  "channel": "#sales-calls",
  "text": "New call result",
  "blocks": [ ... same blocks as above ... ],
  "unfurl_links": false
}
```

**Response:**
```json
{
  "ok": true,
  "channel": "C1234567890",
  "ts": "1712829600.123456",
  "message": { "text": "New call result", ... }
}
```

`ts` is the message timestamp — used to thread replies.

---

### Post Thread Reply
**POST /chat.postMessage**

```json
{
  "channel": "C1234567890",
  "thread_ts": "1712829600.123456",
  "text": "Full transcript attached to this thread."
}
```

---

### Update Message
**POST /chat.update**

```json
{
  "channel": "C1234567890",
  "ts": "1712829600.123456",
  "text": "Updated status: Customer confirmed appointment."
}
```

---

### Upload File (e.g. transcript)
**POST /files.uploadV2**

```json
{
  "channel_id": "C1234567890",
  "filename": "transcript-david-cohen.txt",
  "content": "Agent: Hello! ...\nCustomer: Hi, yes I'm interested..."
}
```

---

### List Channels
**GET /conversations.list?types=public_channel,private_channel**

**Response:**
```json
{
  "ok": true,
  "channels": [
    { "id": "C1234567890", "name": "sales-calls", "is_member": true }
  ]
}
```

## Common Patterns

### Post-call Slack alert with disposition color coding
```typescript
const dispositionColors: Record<string, string> = {
  "Appointment Set": "#36a64f",       // green
  "Callback Requested": "#f0ad4e",    // orange
  "Not Interested": "#cc0000",        // red
  "No Answer": "#cccccc",             // grey
};

async function notifySlack(callData: CallResult) {
  const color = dispositionColors[callData.disposition] ?? "#cccccc";

  await fetch(Deno.env.get("SLACK_WEBHOOK_URL")!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attachments: [
        {
          color,
          fallback: `${callData.disposition} — ${callData.callerName}`,
          blocks: [
            {
              type: "section",
              fields: [
                { type: "mrkdwn", text: `*Disposition:*\n${callData.disposition}` },
                { type: "mrkdwn", text: `*Name:*\n${callData.callerName}` },
                { type: "mrkdwn", text: `*Phone:*\n${callData.callerPhone}` },
                { type: "mrkdwn", text: `*Duration:*\n${Math.floor(callData.duration / 60)}m ${callData.duration % 60}s` },
              ],
            },
            {
              type: "section",
              text: { type: "mrkdwn", text: `*Summary:*\n${callData.summary}` },
            },
          ],
        },
      ],
    }),
  });
}
```

## Gotchas & Rate Limits

- **Incoming webhooks are per-channel**: One webhook URL = one channel. For multiple channels, create multiple webhooks or use a bot token.
- **Rate limits (bot token)**: 1 message/second per channel. Tier 3 methods (postMessage): 50+ calls/minute.
- **Block Kit Builder**: Use [app.slack.com/block-kit-builder](https://app.slack.com/block-kit-builder) to visually design message layouts.
- **`text` is required even with blocks**: Slack uses `text` as fallback for notifications and accessibility. Always include it.
- **Mrkdwn**: Slack uses its own markdown variant. Use `*bold*`, `_italic_`, `` `code` ``, `~strikethrough~`. Regular `**bold**` won't work.
- **Channel ID vs name**: Bot token API requires channel ID (`C1234567890`) not name. Incoming webhooks are pre-configured to a channel.
- **Webhook URL is a secret**: Anyone with the URL can post to your channel. Don't commit it to code — store in environment variables.
- **`attachments` vs `blocks`**: `attachments` (legacy) support `color`. Modern `blocks` don't have a color bar. Use `attachments` wrapping `blocks` for color-coded messages.
