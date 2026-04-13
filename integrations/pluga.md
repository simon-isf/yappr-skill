# Pluga

> **Use in Yappr context**: Trigger Israeli-native automations (iCount invoices, Priority leads, Green Invoice documents) when a call completes, or let Pluga dispatch an outbound Yappr call when a CRM/form event fires.

## Authentication
`X-Pluga-Token: {api_key}` header on all requests. Retrieve your API key from Pluga account settings (dashboard → Account → API).

## Base URL
`https://pluga.co/api/v1`

## Key Endpoints

### List Active Automations
**GET /automations**

Returns all active automations with their trigger webhook URLs.

**Headers**
```json
{
  "X-Pluga-Token": "your_api_key"
}
```

**Response**
```json
{
  "automations": [
    {
      "id": "auto_abc123",
      "name": "Call Completed → iCount Invoice",
      "status": "active",
      "trigger_webhook_url": "https://pluga.co/webhooks/trigger/abc123xyz",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

### Trigger an Automation Manually
**POST /automations/{automation_id}/trigger**

Manually fire an automation with a custom data payload. Field names in `data` must match the trigger fields configured in the Pluga dashboard for that automation.

**Headers**
```json
{
  "X-Pluga-Token": "your_api_key",
  "Content-Type": "application/json"
}
```

**Request**
```json
{
  "data": {
    "phone": "+972501234567",
    "name": "David Levi",
    "disposition": "Appointment Set",
    "call_duration_seconds": 183,
    "agent_name": "Liron",
    "notes": "Customer interested in premium plan, scheduled for Thursday 10am"
  }
}
```

**Response**
```json
{
  "success": true,
  "automation_id": "auto_abc123",
  "execution_id": "exec_xyz789",
  "triggered_at": "2025-01-20T14:32:00Z"
}
```

### Trigger via Webhook URL (Alternative)
**POST {trigger_webhook_url}**

Post directly to the webhook URL returned in the automation listing. No auth header required — the URL itself is the secret.

**Request**
```json
{
  "phone": "+972501234567",
  "name": "David Levi",
  "disposition": "No Answer",
  "callback_requested": true
}
```

**Response**
```json
{
  "status": "received",
  "execution_id": "exec_def456"
}
```

### Receive Inbound Webhook from Pluga
**POST {your_edge_function_url}**

Pluga POSTs to your edge function URL when an automation's trigger fires (e.g., new CRM lead, form submission). Set up in the Pluga dashboard under the automation's "Action" step.

**Inbound payload shape**
```json
{
  "event": "new_lead",
  "automation_id": "auto_abc123",
  "payload": {
    "contact_name": "Yael Cohen",
    "phone": "+972541234567",
    "email": "yael@example.com",
    "source": "website_form",
    "product_interest": "enterprise"
  },
  "timestamp": "2025-01-20T14:32:00Z"
}
```

To verify authenticity, check the `X-Pluga-Signature` header against an HMAC-SHA256 of the raw body using your shared secret (configured per-automation in the Pluga dashboard).

**Signature verification**
```typescript
import { createHmac } from "node:crypto";

function verifyPlugaSignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}
```

### Get Automation Execution Status
**GET /automations/{automation_id}/executions/{execution_id}**

**Response**
```json
{
  "execution_id": "exec_xyz789",
  "automation_id": "auto_abc123",
  "status": "success",
  "started_at": "2025-01-20T14:32:00Z",
  "completed_at": "2025-01-20T14:32:04Z",
  "steps": [
    {
      "step": "trigger",
      "status": "success"
    },
    {
      "step": "create_icount_document",
      "status": "success",
      "result": { "document_id": "12345" }
    }
  ]
}
```

## Common Patterns

### Post-call workflow
```typescript
// supabase/functions/call-analyzed/index.ts
// Triggered by Yappr call.analyzed webhook — forwards disposition to Pluga

import { serve } from "npm:@hono/node-server";

const PLUGA_AUTOMATION_ID = Deno.env.get("PLUGA_CALL_COMPLETE_AUTOMATION_ID")!;
const PLUGA_API_KEY = Deno.env.get("PLUGA_API_KEY")!;

async function triggerPlugaCallComplete(callData: {
  phone: string;
  name: string;
  disposition: string;
  duration: number;
  notes: string;
}) {
  const response = await fetch(
    `https://pluga.co/api/v1/automations/${PLUGA_AUTOMATION_ID}/trigger`,
    {
      method: "POST",
      headers: {
        "X-Pluga-Token": PLUGA_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: callData }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pluga trigger failed: ${response.status} — ${error}`);
  }

  return response.json();
}
```

### Inbound Pluga → dispatch Yappr call
```typescript
// supabase/functions/pluga-inbound/index.ts
// Receives a Pluga webhook (e.g., new CRM lead) and dispatches an outbound call

import { createClient } from "npm:@supabase/supabase-js";
import { createHmac } from "node:crypto";

Deno.serve(async (req) => {
  const body = await req.text();
  const signature = req.headers.get("X-Pluga-Signature") ?? "";
  const secret = Deno.env.get("PLUGA_WEBHOOK_SECRET")!;

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (expected !== signature) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { payload } = JSON.parse(body);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Enqueue outbound call
  await supabase.from("call_queue").insert({
    phone: payload.phone,
    contact_name: payload.contact_name,
    agent_id: Deno.env.get("DEFAULT_AGENT_ID"),
    metadata: { source: "pluga", product_interest: payload.product_interest },
  });

  return new Response(JSON.stringify({ queued: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

## Gotchas & Rate Limits

- Pluga has no universal REST API for arbitrary integration actions. All downstream work (iCount, Priority, etc.) is configured as automation steps in the Pluga dashboard — your code only triggers the automation.
- Payload field names in `data` must exactly match the trigger field keys configured on the automation in the Pluga dashboard. Mismatched keys are silently ignored, not errored.
- Webhook trigger URLs (from `trigger_webhook_url`) do not require auth headers — treat the URL itself as a secret. Rotate by recreating the automation.
- Inbound webhooks from Pluga: always validate `X-Pluga-Signature` — Pluga will retry failed webhooks up to 3 times with exponential backoff.
- Primary documentation and customer support are in Hebrew at [pluga.co/he](https://pluga.co/he). English docs exist but are less complete.
- No official rate limit is published; observed safe rate is ~60 trigger calls/minute per API key. Burst beyond that may result in 429 responses.
- Automation execution is asynchronous — `trigger` returning `success` means Pluga accepted it, not that the downstream action completed. Use the executions endpoint to confirm.
