# Make.com

> **Use in Yappr context**: Connect Yappr to any tool via Make.com scenarios — trigger calls from any lead source, and route call outcome webhooks to CRMs, spreadsheets, and messaging tools.

## Authentication

No API key needed for most patterns — Make.com's **Custom Webhook** module receives HTTP and the **HTTP module** sends HTTP with headers you configure.

If you need the Make.com API to manage scenarios programmatically:
- Make.com → Profile → API → Generate token
- Base URL: `https://eu2.make.com/api/v2` (or `us2` depending on your region)

## Base URL

```
N/A — Make.com is a visual platform; patterns below describe module configuration
```

## Patterns

### Pattern 1: Trigger Yappr call from any source

**Scenario structure:**
```
[Any Trigger] → [HTTP - Make a Request]
```

**HTTP module config:**
- Method: `POST`
- URL: `https://api.goyappr.com/calls`
- Headers:
  ```
  Authorization: Bearer {your_yappr_api_key}
  Content-Type: application/json
  ```
- Body type: `Raw`
- Content type: `application/json`
- Request content:
  ```json
  {
    "to": "{{phone_from_trigger}}",
    "from": "{{your_outbound_number}}",
    "agent_id": "your-agent-id",
    "metadata": {
      "source": "make-scenario",
      "name": "{{name_from_trigger}}"
    }
  }
  ```

**Use case**: Any trigger (Google Sheets new row, Tally webhook, Facebook Lead Ad, etc.) → immediately call the lead.

---

### Pattern 2: Receive Yappr call outcome webhook

**Scenario structure:**
```
[Webhooks - Custom Webhook] → [Router] → [Branch by disposition]
```

**Step 1**: Add "Webhooks → Custom Webhook" module → Copy the generated URL.

**Step 2**: In Yappr, configure the webhook URL for the `call.analyzed` event.

**Incoming data structure from Yappr:**
```json
{
  "event": "call.analyzed",
  "timestamp": "2026-04-11T...",
  "agent_id": "uuid",
  "company_id": "uuid",
  "call_id": "uuid",
  "data": {
    "direction": "outbound",
    "status": "completed",
    "from_number": "+972501234567",
    "to_number": "+972521234567",
    "duration_seconds": 180,
    "disposition": "Appointment Set",
    "summary": "Customer interested in Business plan...",
    "transcript": [...]
  }
}
```

**Step 3**: Add a **Router** module. Create branches:
- Branch 1: Filter `data.disposition = "Appointment Set"` → HTTP POST to HubSpot create deal
- Branch 2: Filter `data.disposition = "Not Interested"` → HTTP POST to mark contact in CRM
- Branch 3: Filter `data.disposition = "Callback Requested"` → Add row to Google Sheets

---

### Pattern 3: Form lead → call with delay

**Scenario structure:**
```
[Webhooks - Custom Webhook (from Tally/Typeform)] → [Sleep] → [HTTP - Call Yappr API]
```

**Sleep module**: Set delay to 2–5 minutes to avoid calling immediately (better answer rates).

---

### Pattern 4: Google Sheets new row → Yappr call

**Scenario structure:**
```
[Google Sheets - Watch Rows] → [HTTP - Make a Request → Yappr calls API]
```

**Google Sheets trigger config:**
- Spreadsheet: select your sheet
- Sheet name: `Leads`
- Column containing limit: select a "processed" flag column

After calling, use another HTTP module to update a "Called" column to `YES`.

---

### Pattern 5: Batch call a list

**Scenario structure:**
```
[Google Sheets - Get Rows] → [Iterator] → [HTTP - Yappr call] → [Google Sheets - Update Row]
```

**Iterator**: Splits the rows array into individual items processed one by one.

**Important**: Add a **Sleep module** (5–10 seconds) between the HTTP call and the next iteration to avoid rate-limit errors.

## HTTP Module Configuration Reference

When configuring Make.com's **HTTP - Make a Request** module to call Yappr:

| Field | Value |
|---|---|
| URL | `https://api.goyappr.com/{endpoint}` |
| Method | `POST` |
| Headers | Add header: `Authorization` = `Bearer {your_key}` |
| Body type | `Raw` |
| Content type | `application/json` |
| Request content | JSON string with `{{mapped_fields}}` |
| Parse response | `Yes` (to use response data in later modules) |

## Gotchas & Rate Limits

- **Webhook URL security**: Make.com webhook URLs are public. Add a secret query param and validate it in your edge function (e.g. `?secret=abc123`).
- **Data structure mapping**: Make.com auto-detects the structure from the first webhook hit. Send a test payload first to build the data map before building the rest of the scenario.
- **Error handling**: Add an error handler route to every HTTP module — if the Yappr API returns 429 or 5xx, log it to a Google Sheet for manual retry.
- **Scenario scheduling**: "Instant" triggers (webhooks) fire immediately. Scheduled scenarios run on the Make.com cron schedule (minimum every 15 min on free plans).
- **Operations quota**: Each module execution = 1 operation. A 5-module scenario called 100 times = 500 operations. Free plan = 1,000 ops/month.
- **Region**: Make.com has EU and US regions. Webhook URLs will differ (`eu2.make.com` vs `us2.make.com`). Your Supabase functions don't care.
