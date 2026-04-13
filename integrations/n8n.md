# n8n

> **Use in Yappr context**: Connect Yappr to any tool via n8n workflows — trigger calls from form submissions or CRM events, and process call outcome webhooks with conditional routing and retries.

## Authentication

No API key needed for most patterns — n8n's **Webhook** node receives HTTP and the **HTTP Request** node sends HTTP.

For managing n8n workflows via API:
- n8n instance settings → API → Enable Public API → Copy API Key
- Base URL: `http://your-n8n-instance/api/v1`

## Base URL

```
N/A — n8n is a workflow platform; patterns below describe node configuration
```

## Patterns

### Pattern 1: Trigger Yappr call from any source

**Workflow structure:**
```
[Trigger Node] → [HTTP Request Node → Yappr API]
```

**HTTP Request node config:**
- Method: `POST`
- URL: `https://api.goyappr.com/calls`
- Authentication: `Header Auth` → Name: `Authorization`, Value: `Bearer {your_yappr_api_key}`
- Body Content Type: `JSON`
- Body:
  ```json
  {
    "to": "={{ $json.phone }}",
    "from": "={{ $env.YAPPR_FROM_NUMBER }}",
    "agent_id": "your-agent-id",
    "metadata": {
      "source": "n8n",
      "name": "={{ $json.name }}"
    }
  }
  ```
- Options → Retry on Fail: `Yes`, Max tries: `3`, Wait between tries: `5000ms`

---

### Pattern 2: Receive Yappr call outcome webhook

**Workflow structure:**
```
[Webhook Node] → [Switch Node (by disposition)] → [branches...]
```

**Webhook node config:**
- HTTP Method: `POST`
- Path: `/yappr-call-outcome`
- Authentication: `Header Auth` (validate `Authorization` header)
- Response Mode: `Respond Immediately` → Response Code: `200`

**Incoming Yappr webhook payload:**
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
    "summary": "Customer interested in Business plan.",
    "transcript": [...]
  }
}
```

**Switch node config:**
- Mode: `Rules`
- Rule 1: `{{ $json.data.disposition }}` = `"Appointment Set"` → Output 1
- Rule 2: `{{ $json.data.disposition }}` = `"Not Interested"` → Output 2
- Rule 3: `{{ $json.data.disposition }}` = `"Callback Requested"` → Output 3
- Default: Output 4

---

### Pattern 3: Form webhook → call with delay

**Workflow structure:**
```
[Webhook Node (receive Tally/Typeform)] → [Wait Node (5 min)] → [HTTP Request → Yappr]
```

**Wait node config:**
- Resume: `After time interval`
- Amount: `5`
- Unit: `Minutes`

---

### Pattern 4: Google Sheets new row → call

**Workflow structure:**
```
[Schedule Trigger (every 5 min)] → [Google Sheets - Get Rows] → [If: already_called = ""] → [HTTP Request → Yappr] → [Google Sheets - Update Row]
```

**Google Sheets Read node:**
- Operation: `Read Rows`
- Range: `A:G`
- Options → Return All: checked

**If node:**
- Condition: `{{ $json.called_at }}` → `Is empty`

**Google Sheets Update node** (after calling):
- Operation: `Update`
- Row number: `{{ $json.row_number }}`
- Values: `called_at` = `{{ new Date().toISOString() }}`

---

### Pattern 5: CRM trigger → follow-up call

**Workflow structure:**
```
[HubSpot Trigger - Contact Updated] → [If: stage changed to "Needs Follow-up"] → [HTTP Request → Yappr]
```

---

### HTTP Request Node Reference

When calling Yappr or Supabase edge functions from n8n:

| Setting | Value |
|---|---|
| Method | `POST` |
| URL | Full edge function URL |
| Authentication | `Header Auth` |
| Header Name | `Authorization` |
| Header Value | `Bearer {{$env.YAPPR_API_KEY}}` |
| Body Content Type | `JSON` |
| JSON Body | Map fields using `={{ $json.fieldName }}` expressions |
| Retry on Fail | Enable with 3 retries, 5s wait |
| Continue on Fail | Enable if you want the workflow to continue even on error |

## Gotchas & Rate Limits

- **Webhook URL security**: n8n webhook URLs contain a random path segment. Optionally add a secret query param and validate with a code node.
- **Expressions syntax**: n8n uses `={{ }}` for expressions. Access previous node data with `$json.field` or `$node["NodeName"].json.field`.
- **Error handling**: Add an error workflow in workflow settings → `Error Workflow`. This runs when any node throws an unhandled error.
- **Self-hosted vs cloud**: Webhook URLs differ. Self-hosted: `http://your-server:5678/webhook/...`. n8n Cloud: `https://yourname.app.n8n.cloud/webhook/...`.
- **Retry on fail**: Built into the HTTP Request node via Options → Retry on Fail. Very useful for transient Yappr API errors.
- **Environment variables**: In self-hosted n8n, set env vars in the `.env` file. Access in nodes with `{{ $env.MY_VAR }}`.
- **Queue mode for production**: Self-hosted n8n should run in queue mode (Redis) for reliable webhook handling under load.
- **Respond to webhook immediately**: Always set the Webhook node to "Respond Immediately" so the webhook sender (Yappr, Meta, Tally) doesn't timeout waiting.
