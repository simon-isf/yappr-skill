# Zapier

> **Use in Yappr context**: Trigger outbound Yappr calls from any source (CRM, forms, spreadsheets) via Zapier, and route call outcome webhooks from Yappr to any downstream tool without writing integration code.

## Authentication

**Yappr → Zapier (incoming)**: No auth needed — Zapier generates a unique, secret-by-design webhook URL per Zap.

**Zapier → Yappr (outgoing)**: Use the "Webhooks by Zapier" action with `Authorization: Bearer {your_yappr_api_key}`.

Yappr API keys are found in the Yappr dashboard under Settings → API Keys.

## Base URL

```
N/A — Zapier is a visual platform; patterns below describe Zap module configuration
```

Zapier Catch Hook URLs follow the pattern:
```
https://hooks.zapier.com/hooks/catch/{account_id}/{hook_id}/
```

## Key Patterns

### Pattern 1: Any source → trigger Yappr outbound call

**Zap structure:**
```
[Any Trigger] → [Webhooks by Zapier — POST]
```

**"Webhooks by Zapier" action config:**
| Field | Value |
|---|---|
| Method | `POST` |
| URL | `https://api.goyappr.com/calls` |
| Headers | `Authorization: Bearer ypr_live_...` |
| Payload Type | `json` |
| Data | see below |

**Data fields:**
```json
{
  "to": "{{contact_phone}}",
  "from": "+972XXXXXXXXX",
  "agent_id": "your-agent-uuid",
  "variables": {
    "callerName": "{{contact_first_name}} {{contact_last_name}}",
    "source": "zapier"
  }
}
```

**Common triggers for this pattern:**
- New row in Google Sheets → call the lead
- New contact in HubSpot/Salesforce → call immediately
- New Typeform / Tally submission → call the respondent
- New Facebook Lead Ad → call within minutes

---

### Pattern 2: Yappr call outcome → route to any tool

**Zap structure:**
```
[Webhooks by Zapier — Catch Hook] → [Router] → [Branch by disposition]
```

**Step 1**: Add "Webhooks by Zapier → Catch Hook" as the trigger → copy the generated webhook URL.

**Step 2**: In Yappr, go to the agent's settings → Webhooks → add the URL for the `call.analyzed` event.

**Incoming payload Zappr sends to Zapier:**
```json
{
  "event": "call.analyzed",
  "timestamp": "2026-04-12T10:30:00Z",
  "agent_id": "uuid",
  "company_id": "uuid",
  "call_id": "uuid",
  "data": {
    "direction": "outbound",
    "status": "completed",
    "from_number": "+972501234567",
    "to_number": "+972521234567",
    "duration_seconds": 187,
    "disposition": "Appointment Set",
    "summary": "Customer agreed to a demo on April 15...",
    "transcript": [...]
  }
}
```

**Step 3**: Add a **Paths** (Router) step. Create branches:
- Path A: Filter `data__disposition` exactly matches `Appointment Set` → create HubSpot deal
- Path B: Filter `data__disposition` exactly matches `Not Interested` → add tag in ActiveCampaign
- Path C: Filter `data__disposition` exactly matches `Callback Requested` → append row to Google Sheets with callback time

---

### Pattern 3: Delay call for better answer rates

**Zap structure:**
```
[Trigger] → [Delay by Zapier — Delay For] → [Webhooks by Zapier — POST to Yappr]
```

**Delay config**: Set to 5 minutes. Studies show calling back within 5 minutes of a form submission maximizes answer rates while avoiding the impression of being instantaneous/robotic.

---

### Pattern 4: Batch call from Google Sheets

**Zap structure:**
```
[Google Sheets — New or Updated Row] → [Filter: Status = "Ready to Call"] → [Webhooks by Zapier — POST to Yappr] → [Google Sheets — Update Row: set Status = "Called"]
```

Note: Zapier processes rows one at a time as they update. For bulk calling a pre-existing list, use Make.com's Iterator module instead (see `make-com.md`).

---

### Pattern 5: Zapier → Yappr with phone number normalization

Zapier Formatter can normalize phone numbers before sending to Yappr:

**Add "Formatter by Zapier → Numbers → Format Phone Number" step:**
- Input: `{{raw_phone_from_trigger}}`
- To Format: `International` (produces `+972 50 123 4567`)
- Then strip spaces in a second Formatter step: Text → Remove Whitespace

Yappr accepts E.164 format: `+972501234567`

## Webhook Security

Zapier Catch Hook URLs are publicly accessible. For light security, append a secret query param when configuring the URL in Yappr:

```
https://hooks.zapier.com/hooks/catch/12345/abcdef/?secret=your_random_secret
```

Then add a Filter step in Zapier: only continue if `query_string__secret` exactly matches `your_random_secret`.

## Gotchas & Rate Limits

- **Free plan polling**: Zapier Free plan polls triggers every 15 minutes — not suitable for real-time lead follow-up. Catch Hook triggers (webhooks) are instant on all plans.
- **Paid plan is near real-time**: Zapier Starter and above run webhook-triggered Zaps within seconds.
- **Operations quota**: Each step in a Zap = 1 task. A 4-step Zap that runs 100 times = 400 tasks. Free plan = 100 tasks/month. Starter = 750/month. Check quota before deploying high-volume call flows.
- **Phone number format**: Phones from CRMs and forms often come in local Israeli format (`050-123-4567` or `0501234567`). Always normalize to E.164 (`+972501234567`) before posting to Yappr. Use Formatter by Zapier or a Code step.
- **Zapier Code step**: If you need custom normalization, Zapier supports JavaScript and Python snippets in the "Code by Zapier" action — no external packages, but standard library works.
- **Paths vs Filter**: "Paths" (branching router) is a Premium Zapier feature. On free plans, use a single-branch Zap with Filter steps instead.
- **Israeli alternative**: Make.com (see `make-com.md`) is widely used in Israel as a lower-cost alternative. The webhook URL structure is different but the Yappr API call is identical.
- **Test payload**: Zapier must receive at least one real payload to map fields. Always send a test webhook from Yappr before building downstream steps.
