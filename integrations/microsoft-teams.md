# Microsoft Teams

> **Use in Yappr context**: Send call outcome notifications to a Teams channel for enterprise customers whose teams use Microsoft 365.

## Authentication

**Option A: Incoming Webhook (simplest)**
1. Teams channel → ··· → Connectors → Incoming Webhook → Configure
2. Name it "Yappr" → Create → Copy webhook URL
3. Webhook URL: `https://{org}.webhook.office.com/webhookb2/{id}/IncomingWebhook/{hash}`

**Option B: Azure Bot / Microsoft Graph (more control)**
- Requires Azure App Registration + Graph API permissions
- Much more complex — use webhook unless you need bidirectional communication

## Base URL

```
{webhook_url} — the full Office connector URL
```

For Graph API:
```
https://graph.microsoft.com/v1.0
```

## Key Endpoints

### Send Message via Incoming Webhook
**POST {webhook_url}**

**Headers:**
```
Content-Type: application/json
```

**Request (simple text):**
```json
{
  "text": "New Yappr call: David Cohen | Appointment Set | 3 minutes"
}
```

**Request (Adaptive Card — rich formatted):**
```json
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
          {
            "type": "TextBlock",
            "text": "Yappr Call Result",
            "weight": "Bolder",
            "size": "Large"
          },
          {
            "type": "FactSet",
            "facts": [
              { "title": "Disposition", "value": "Appointment Set" },
              { "title": "Name", "value": "David Cohen" },
              { "title": "Phone", "value": "+972501234567" },
              { "title": "Duration", "value": "3m 12s" }
            ]
          },
          {
            "type": "TextBlock",
            "text": "Customer interested in Business plan. Appointment booked April 15.",
            "wrap": true
          }
        ],
        "actions": [
          {
            "type": "Action.OpenUrl",
            "title": "View in CRM",
            "url": "https://app.hubspot.com/contacts/12345"
          }
        ]
      }
    }
  ]
}
```

**Response:** `1` (plain text "1" on success)

---

### MessageCard Format (Legacy — simpler than Adaptive Card)
```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "Yappr call result",
  "themeColor": "2ECC71",
  "title": "Appointment Set — David Cohen",
  "sections": [
    {
      "facts": [
        { "name": "Phone", "value": "+972501234567" },
        { "name": "Duration", "value": "3m 12s" },
        { "name": "Disposition", "value": "Appointment Set" }
      ],
      "text": "Customer interested in Business plan."
    }
  ],
  "potentialAction": [
    {
      "@type": "OpenUri",
      "name": "View in CRM",
      "targets": [{ "os": "default", "uri": "https://app.hubspot.com/" }]
    }
  ]
}
```

---

### Send via Microsoft Graph API
**POST /teams/{team_id}/channels/{channel_id}/messages**

Requires `ChannelMessage.Send` app permission.

**Headers:**
```
Authorization: Bearer {graph_token}
Content-Type: application/json
```

**Request:**
```json
{
  "body": {
    "contentType": "html",
    "content": "<b>Yappr Call Result</b><br>Name: David Cohen<br>Disposition: Appointment Set"
  }
}
```

## Common Patterns

### Post-call Teams notification
```typescript
const webhookUrl = Deno.env.get("TEAMS_WEBHOOK_URL");

const colorMap: Record<string, string> = {
  "Appointment Set": "2ECC71",
  "Callback Requested": "F39C12",
  "Not Interested": "E74C3C",
  "No Answer": "95A5A6",
};

await fetch(webhookUrl!, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": `Yappr: ${disposition}`,
    "themeColor": colorMap[disposition] ?? "95A5A6",
    "title": `${disposition} — ${callerName}`,
    "sections": [{
      "facts": [
        { "name": "Phone", "value": callerPhone },
        { "name": "Duration", "value": `${Math.floor(duration / 60)}m ${duration % 60}s` },
        { "name": "Time", "value": new Date().toLocaleString("en-IL", { timeZone: "Asia/Jerusalem" }) },
      ],
      "text": callSummary.slice(0, 1000),
    }],
  }),
});
```

## Gotchas & Rate Limits

- **Rate limits**: Incoming Webhooks: ~4 requests/second per connector. No official daily limit documented.
- **Webhook URL is sensitive**: The URL contains auth tokens. Store as a secret environment variable.
- **Adaptive Cards vs MessageCard**: Adaptive Cards are the modern format but more complex. MessageCard is legacy but simpler. Both work with Incoming Webhooks.
- **Response is plain `1`**: Unlike Slack or Discord which return JSON, Teams webhooks return the string `"1"` on success. Don't parse as JSON.
- **`themeColor` is hex without `#`**: `"2ECC71"` not `"#2ECC71"`.
- **Text length limits**: Section text max ~28KB. In practice, keep summaries under 1,000 characters.
- **Graph API complexity**: Sending via Graph API requires full Azure AD App Registration, consent flow, and token management. Only use it if webhook doesn't meet your needs (e.g. need to read messages).
- **Channel management**: For enterprise Teams deployment, IT admin may need to approve the webhook connector.
