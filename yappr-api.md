# Yappr API Reference

---

## Authentication

All requests require:
```
Authorization: Bearer ypr_live_<your_api_key>
Content-Type: application/json
```

API keys are created in the Yappr dashboard under Settings > API Keys. Each key is scoped to specific resources (see Scope Map).

---

## Base URL & Headers

```
Base URL: https://api.goyappr.com
```

All API calls use JSON request/response bodies. Parse responses with `jq` where available.

**Curl pattern:**
```bash
curl -s -X {METHOD} \
  "https://api.goyappr.com/{resource}" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

**File-based payload pattern (required for Hebrew/special chars):**
```bash
python3 -c "
import json
payload = { ... }
with open('/tmp/payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False)
"
curl -s -X POST "https://api.goyappr.com/resource" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/payload.json
```

**Discovery:** `GET https://api.goyappr.com` (no auth) returns all available endpoints.

---

## Rate Limits

- 60 requests per minute per API key
- 10 concurrent active calls per company

---

## Error Format & Codes

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Status | Meaning | Action |
|--------|---------|--------|
| 400 | Bad request — field missing or invalid | Check error message |
| 401 | Auth failed — invalid or missing key, or missing scope | Verify key and scopes |
| 402 | Billing — insufficient balance or no payment method | Guide to billing setup |
| 403 | Forbidden — resource not found or wrong company | Check resource IDs |
| 429 | Rate limit or concurrent call limit | Wait and retry |
| 500 | Server error | Retry once; if persistent, report |

---

## Agents

### GET /agents

List all agents for the authenticated company.

**Scopes:** `agents:read`

**Query params:** none

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "voice": "string",
      "language": "he" | "en",
      "is_active": true,
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ]
}
```

---

### GET /agents/:id

Fetch complete config of a single agent.

**Scopes:** `agents:read`

**Response — all fields:**
```json
{
  "id": "uuid",
  "name": "string",
  "system_prompt": "string",
  "voice": "string",
  "language": "he" | "en",
  "temperature": 0.0 - 2.0,
  "agent_speaks_first": true | false,
  "greeting_message": "string | null",
  "webhook_url": "string | null",
  "webhook_events": ["call.started", "call.answered", "call.ended", "call.failed", "call.no_answer", "transcript.ready", "call.analyzed"],
  "vad_stop_secs": 0.5,
  "vad_start_secs": 0.2,
  "vad_confidence": 0.7,
  "silence_timeout_secs": 60,
  "max_continuous_speech_secs": 120,
  "max_call_duration_secs": 600,
  "lead_memory_enabled": true,
  "is_active": true,
  "tools": [
    {
      "id": "uuid",
      "name": "string",
      "type": "webhook" | "system",
      "description": "string",
      "config": { ... },
      "execution_order": 0
    }
  ],
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

---

### POST /agents

Create a new agent.

**Scopes:** `agents:create`

**Request body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | Non-empty |
| `system_prompt` | string | yes | Non-empty |
| `voice` | string | yes | Must be a valid voice name from Voice Catalog |
| `language` | string | yes | `"he"` or `"en"` |
| `temperature` | float | no | 0.0–2.0, default 0.5 |
| `agent_speaks_first` | boolean | no | default `true` |
| `greeting_message` | string | no | Required if `agent_speaks_first: true` |
| `webhook_url` | string | no | Valid HTTPS URL |
| `webhook_events` | string[] | no | Array of valid event names |
| `vad_stop_secs` | float | no | 0.05–5.0, default 0.5 |
| `vad_start_secs` | float | no | 0.05–2.0, default 0.2 |
| `vad_confidence` | float | no | 0.0–1.0, default 0.7 |
| `silence_timeout_secs` | int | no | 10–900, default 60 |
| `max_continuous_speech_secs` | int | no | 0–300, default 120 (0 = disabled) |
| `max_call_duration_secs` | int | no | 0–3600, default 600 (0 = disabled) |
| `lead_memory_enabled` | boolean | no | default `true` |
| `idempotency_key` | string | no | UUID for safe retries |

**Response:** `201` — full agent object (same shape as GET /agents/:id, minus `tools[]`)

---

### PATCH /agents/:id

Update any subset of agent fields. Only include fields that should change.

**Scopes:** `agents:update`

**Request body:** Any subset of POST fields above.

**Response:** `200` — full updated agent object

---

### DELETE /agents/:id

Deactivate (soft-delete) an agent. Sets `is_active: false`.

**Scopes:** `agents:update`

**Response:** `200` — `{ "success": true }`

---

## Tools

### GET /tools

List all tools. Optionally filter to a specific agent.

**Scopes:** `tools:read`

**Query params:**
- `agent_id` (uuid, optional) — filter to tools attached to this agent

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "type": "webhook" | "system",
      "description": "string",
      "is_active": true,
      "created_at": "ISO8601"
    }
  ]
}
```

---

### GET /tools/:id

Fetch full config of a single tool.

**Scopes:** `tools:read`

**Response:**
```json
{
  "id": "uuid",
  "name": "string",
  "type": "webhook" | "system",
  "description": "string",
  "config": {
    "url": "https://...",
    "method": "POST",
    "headers": {},
    "payload_config": {
      "include_standard_metadata": true,
      "static_parameters": [
        { "name": "camelCaseName", "value": "string" }
      ],
      "extraction_parameters": [
        { "name": "camelCaseName", "description": "string" }
      ]
    }
  },
  "is_active": true,
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

---

### POST /tools

Create a new webhook tool.

**Scopes:** `tools:create`

**Request body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | camelCase English (e.g. `crmLogger`, `bookAppointment`) |
| `description` | string | yes | What the tool does — the AI uses this to decide when to call it |
| `type` | string | yes | Must be `"webhook"` for user-created tools |
| `config.url` | string | yes | Valid HTTPS URL |
| `config.method` | string | no | `"POST"` (default) |
| `config.headers` | object | no | Key-value pairs, e.g. `{"Authorization": "Bearer secret"}` |
| `config.payload_config.include_standard_metadata` | boolean | no | default `true` — includes `call_id`, `agent_id`, `duration_seconds` |
| `config.payload_config.static_parameters` | array | no | Each item: `{ "name": "camelCase", "value": "string" }` |
| `config.payload_config.extraction_parameters` | array | no | Each item: `{ "name": "camelCase", "description": "string" }` |
| `idempotency_key` | string | no | UUID for safe retries |

**Important constraints:**
- `name` MUST be camelCase English. No snake_case, no spaces, no Hebrew.
- `extraction_parameters` and `static_parameters` MUST be nested inside `payload_config` inside `config`. NOT at the top level.
- All parameter names are normalized to camelCase automatically.
- `description` fields for extraction parameters can be in any language including Hebrew.

**Response:** `201` — full tool object

---

### PATCH /tools/:id

Update a webhook tool. Only include fields that should change.

**Scopes:** `tools:update`

**Request body:** Any subset of POST fields above. Nested paths like `config.url` require sending the full `config` object.

**Response:** `200` — full updated tool object

---

### DELETE /tools/:id

Deactivate (soft-delete) a tool.

**Scopes:** `tools:update`

**Response:** `200` — `{ "success": true }`

---

### POST /tools/attach

Attach a tool to an agent.

**Scopes:** `tools:update`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent_id` | uuid | yes | |
| `tool_id` | uuid | yes | |
| `execution_order` | int | yes | 0-based. Use 999 for `end_call` system tool to ensure it's last |

One tool per call — no arrays. For multiple tools, call this endpoint once per tool.

**Response:** `200` — `{ "success": true }`

---

### POST /tools/detach

Detach a tool from an agent.

**Scopes:** `tools:update`

| Field | Type | Required |
|-------|------|----------|
| `agent_id` | uuid | yes |
| `tool_id` | uuid | yes |

**Response:** `200` — `{ "success": true }`

---

### POST /tools/:id/test

Send a test delivery to the tool's webhook URL. Uses sample data built from the tool's `extraction_parameters`.

**Scopes:** `tools:read`

**Request body:** none

**Response:**
```json
{
  "success": true | false,
  "status_code": 200,
  "payload_sent": { ... },
  "error": "string | null"
}
```

---

## Phone Numbers

### GET /phone-numbers

List all phone numbers owned by the company.

**Scopes:** `phone_numbers:read`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "number": "+972XXXXXXXXX",
      "status": "active" | "pending_requirements",
      "inbound_agent_id": "uuid | null",
      "outbound_agent_id": "uuid | null",
      "created_at": "ISO8601"
    }
  ]
}
```

---

### POST /phone-numbers/search

Search available Israeli numbers to purchase.

**Scopes:** `phone_numbers:search`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `limit` | int | no | default 10 |
| `areaCode` | string | no | Omit for all available numbers |

**Response:**
```json
{
  "numbers": [
    {
      "phoneNumber": "+972XXXXXXXXX",
      "pricing": {
        "priceDisplay": "$10/month"
      }
    }
  ]
}
```

---

### POST /phone-numbers/purchase

Purchase a phone number. Starts a $10/month Stripe subscription on the user's saved card.

**Scopes:** `phone_numbers:purchase`

| Field | Type | Required |
|-------|------|----------|
| `phone_number` | string | yes — E.164 format |

**Notes:**
- If the selected number is taken between search and purchase, the system automatically substitutes an alternative with the same prefix. Always read `phoneNumber` from the response — it may differ from what was requested.
- Status `"pending_requirements"`: regulatory approval needed (Israeli numbers, typically 1–3 business days). Number is reserved and subscription is active.

**Response:**
```json
{
  "phoneNumber": "+972XXXXXXXXX",
  "status": "active" | "pending_requirements"
}
```

---

### POST /phone-numbers/configure

Assign inbound and/or outbound agents to a phone number.

**Scopes:** `phone_numbers:configure`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `phone_number_id` | uuid | yes | The number's internal UUID (from GET /phone-numbers) |
| `inbound_agent_id` | uuid | no | Agent to handle inbound calls |
| `outbound_agent_id` | uuid | no | Agent to use for outbound calls |

**CRITICAL:** All fields use `snake_case`. Using camelCase returns a 400 error.

**Response:** `200` — updated phone number object

---

## Calls

### GET /calls

List calls with optional filters and pagination.

**Scopes:** `calls:read`

**Query params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | int | 20 | max 100 |
| `offset` | int | 0 | pagination |
| `agent_id` | uuid | — | filter by agent |
| `status` | string | — | `ringing`, `in-progress`, `completed`, `failed` |
| `direction` | string | — | `inbound`, `outbound` |
| `from` | ISO8601 | — | calls created on or after |
| `to` | ISO8601 | — | calls created on or before |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "agent_id": "uuid",
      "from": "+972...",
      "to": "+972...",
      "direction": "inbound",
      "status": "completed",
      "started_at": "ISO8601",
      "ended_at": "ISO8601",
      "duration_seconds": 120,
      "created_at": "ISO8601",
      "tool_calls_count": 2,
      "recording_url": "string | null",
      "disposition": { "id": "uuid", "label": "string", "color": "#hex" },
      "lead": { "...full lead object with tags..." }
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

---

### GET /calls/:id

Get full details of a single call, including resolved lead and disposition objects.

**Scopes:** `calls:read`

**Response:**
```json
{
  "id": "uuid",
  "agent_id": "uuid",
  "from": "+972...",
  "to": "+972...",
  "direction": "inbound" | "outbound" | "web_call",
  "status": "ringing" | "in-progress" | "completed" | "failed",
  "started_at": "ISO8601 | null",
  "ended_at": "ISO8601 | null",
  "duration_seconds": 0,
  "transcript": [ { "role": "agent|user", "text": "string", "start": 0, "end": 0 } ],
  "summary": "string | null",
  "recording_url": "string | null",
  "metadata": {},
  "disposition": {
    "id": "uuid",
    "label": "string",
    "color": "#hex",
    "position": 0,
    "is_protected": false,
    "created_at": "ISO8601"
  },
  "lead": {
    "id": "uuid",
    "phone_number": "+972...",
    "name": "string | null",
    "email": "string | null",
    "source": "string | null",
    "tags": [ { LeadTag } ],
    "long_term_context": "string | null",
    "metadata": {},
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  },
  "tool_calls": [
    {
      "tool_name": "string",
      "timestamp": "ISO8601",
      "request": {
        "method": "POST",
        "url": "https://...",
        "headers": { "Content-Type": "application/json" },
        "body": {}
      },
      "response": {
        "success": true,
        "response_preview": "string",
        "error": "string | null",
        "duration_ms": 845
      }
    }
  ],
  "events": [
    {
      "type": "tool_called | tool_response | call_initiated | call_ended | error | ...",
      "timestamp": "ISO8601",
      "data": {}
    }
  ],
  "created_at": "ISO8601"
}
```

**`tool_calls`** — Paired request/response objects for each tool invocation during the call. Easy to consume. Auth-related headers (Authorization, tokens, keys) are redacted as `"[REDACTED]"`.

**`events`** — Full chronological timeline of all call events (tool calls, transcriptions, LLM events, errors, termination). For advanced use cases. Auth headers are also redacted.

**Recording URL notes:**
- `recording_url` is a permanent signed URL (contains `?sig=...` — do not modify)
- Opening it redirects (302) to the audio file — no Authorization header needed
- Redirect target is short-lived (~10 min); re-fetch `recording_url` if expired

---

### POST /calls

Initiate an outbound call.

**Scopes:** `calls:create`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent_id` | uuid | yes | Agent to use for the call |
| `to` | string | yes | Destination phone number — E.164 format |
| `from` | string | yes | Caller phone number — E.164, must be a company-owned Telnyx number |
| `metadata` | object | no | JSONB stored in `call_logs.metadata` — arbitrary key-value pairs, not injected into prompt |
| `variables` | object | no | `Record<string, string>` — substituted into system prompt using `{{VariableName}}` syntax |

**CRITICAL:** `to` and `from` MUST NOT be the same number. This creates an infinite call loop. The API returns 400 but always verify before calling.

**`variables` vs `metadata` distinction:**
- `variables` → injected into the system prompt before the call starts (use for per-call context the agent should know)
- `metadata` → stored on the call record, not injected into the prompt (use for tracking data — CRM IDs, source, etc.)

**Response:** `201`
```json
{
  "id": "uuid",
  "status": "ringing",
  "agent_id": "uuid",
  "from": "+972...",
  "to": "+972...",
  "direction": "outbound",
  "created_at": "ISO8601",
  "metadata": {}
}
```

---

### GET /calls/:id/recording

Redirect to a call recording. Returns 302 to a short-lived signed audio URL.

**Scopes:** `calls:read`

---

## Dispositions

Disposition labels are applied to calls as outcomes (e.g. "Interested", "Appointment Set"). Protected dispositions cannot be deleted.

### GET /dispositions

List all dispositions for the company.

**Scopes:** `dispositions:read`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "label": "string",
      "color": "#hex",
      "position": 0,
      "is_protected": false,
      "created_at": "ISO8601"
    }
  ]
}
```

---

### GET /dispositions/:id

Get a single disposition.

**Scopes:** `dispositions:read`

---

### POST /dispositions

Create a disposition.

**Scopes:** `dispositions:manage`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `label` | string | yes | Display name |
| `color` | string | no | Hex color e.g. `"#22c55e"` |

**Response:** `201` — full disposition object

---

### PATCH /dispositions/:id

Update a disposition.

**Scopes:** `dispositions:manage`

| Field | Type | Required |
|-------|------|----------|
| `label` | string | no |
| `color` | string | no |

**Response:** `200` — full updated disposition object

---

### DELETE /dispositions/:id

Delete a disposition. Returns 403 if disposition is protected.

**Scopes:** `dispositions:manage`

**Response:** `200` — `{ "success": true }`

---

## Leads

### GET /leads

List leads with optional search and pagination.

**Scopes:** `leads:read`

**Query params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | int | 20 | max 100 |
| `offset` | int | 0 | pagination |
| `search` | string | — | search by name, phone, or email |

**Response:**
```json
{
  "data": [ { LeadSummary } ],
  "pagination": { "total": 0, "limit": 20, "offset": 0, "has_more": false }
}
```

---

### GET /leads/:id

Get a single lead with full details including tags.

**Scopes:** `leads:read`

**Response:**
```json
{
  "id": "uuid",
  "phone_number": "+972...",
  "name": "string | null",
  "email": "string | null",
  "source": "string | null",
  "tags": [ { "id": "uuid", "name": "string", "color": "#hex" } ],
  "long_term_context": "string | null",
  "metadata": {},
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

---

### POST /leads

Create a lead.

**Scopes:** `leads:manage`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `phone_number` | string | yes | E.164 format |
| `name` | string | no | |
| `email` | string | no | |
| `source` | string | no | e.g. `"facebook"`, `"website"` |
| `tags` | string[] | no | Tag names — resolved to IDs server-side |
| `tag_ids` | uuid[] | no | Alternative to `tags` — pass UUIDs directly |
| `long_term_context` | string | no | AI memory injected into system prompt at call time |
| `metadata` | object | no | Arbitrary JSONB |

**Response:** `201` — full lead object

---

### PATCH /leads/:id

Update a lead.

**Scopes:** `leads:manage`

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | |
| `email` | string | |
| `tags` | string[] | Replaces all existing tags |
| `tag_ids` | uuid[] | Replaces all existing tags |
| `long_term_context` | string | |
| `metadata` | object | |

**Response:** `200` — full updated lead object

---

### DELETE /leads/:id

Soft-delete a lead.

**Scopes:** `leads:manage`

**Response:** `200` — `{ "success": true }`

---

## Lead Tags

### GET /lead-tags

List all lead tags.

**Scopes:** `lead_tags:read`

**Response:**
```json
{
  "data": [
    { "id": "uuid", "name": "string", "color": "#hex", "description": "string | null" }
  ]
}
```

---

### POST /lead-tags

Create a tag.

**Scopes:** `lead_tags:manage`

| Field | Type | Required |
|-------|------|----------|
| `name` | string | yes |
| `color` | string | no |
| `description` | string | no |

---

### PATCH /lead-tags/:id

Update a tag.

**Scopes:** `lead_tags:manage`

---

### DELETE /lead-tags/:id

Delete a tag.

**Scopes:** `lead_tags:manage`

---

## Shared Links

Shareable URLs for browser-based agent testing without login. Calls billed to the link creator's company.

**URL format:** `https://app.goyappr.com/share/{token}`

### GET /shared-links

List shared links. Optional `?agent_id=` filter.

**Scopes:** `shared_links:read`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "token": "string",
      "url": "https://app.goyappr.com/share/...",
      "agent_id": "uuid",
      "expires_at": "ISO8601 | null",
      "is_revoked": false,
      "status": "active" | "expired" | "revoked",
      "created_at": "ISO8601"
    }
  ]
}
```

---

### POST /shared-links

Create a shared link.

**Scopes:** `shared_links:manage`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent_id` | uuid | yes | |
| `expires_at` | ISO8601 | no | Omit for never-expiring link |

**Response:** `201` — shared link object with `url` field

---

### GET /shared-links/:id

Get a specific shared link.

**Scopes:** `shared_links:read`

---

### PATCH /shared-links/:id

Revoke a shared link.

**Scopes:** `shared_links:manage`

**Request body:** `{ "is_revoked": true }`

---

## Billing

### GET /billing

Get billing status and balance.

**Scopes:** `billing:read`

**Response:**
```json
{
  "balance_cents": 2500,
  "has_payment_method": true,
  "subscription_status": "active" | "inactive" | null
}
```

---

### POST /billing/topup

Add credits to the account. Charges the saved payment method.

**Scopes:** `billing:manage`

**ALWAYS require explicit user confirmation before calling this endpoint.**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `amount_cents` | int | yes | Amount in cents — e.g. `2000` = $20.00 |

**Response:** `200` — updated billing object

---

### POST /billing/setup

Generate a Stripe Checkout link for adding a payment method.

**Scopes:** `billing:manage`

**Request body:** `{}`

**Response:**
```json
{ "checkoutUrl": "https://checkout.stripe.com/..." }
```

---

## Webhook Events

Events sent to the agent's configured `webhook_url` as calls progress.

Configure on agent: `webhook_url` (HTTPS URL) + `webhook_events` (array of event names).

**Payload shape:**
```json
{
  "event": "call.analyzed",
  "timestamp": "ISO8601",
  "agent_id": "uuid",
  "company_id": "uuid",
  "call_id": "uuid",
  "data": { ... }
}
```

**Event reference:**

| Event | When it fires | `data` contents |
|-------|---------------|-----------------|
| `call.started` | Call begins (inbound ring or outbound dial) | `direction`, `from_number`, `to_number` |
| `call.answered` | Caller connects, AI starts talking | `direction`, `from_number`, `to_number` |
| `call.ended` | Call finishes | `direction`, `from_number`, `to_number`, `duration_seconds`, `status` |
| `call.no_answer` | Call rings but nobody picks up | `direction`, `from_number`, `to_number` |
| `call.failed` | Call fails to connect or errors | `direction`, `from_number`, `to_number`, `error` |
| `transcript.ready` | Transcript saved after call ends (legacy — prefer `call.analyzed`) | `transcript` |
| `call.analyzed` | Full AI pipeline complete: transcript + disposition + summary | `direction`, `status`, `from_number`, `to_number`, `duration_seconds`, `disposition` (label string or null), `summary`, `transcript` |

**Default recommended set:** `call.no_answer`, `call.failed`, `call.analyzed`

**WARNING — Webhook payloads are minimal.** The `call.analyzed` payload does NOT include:
- The lead object (name, phone, tags, history)
- `metadata` from call creation
- Cost data
- The full disposition object (only the label string is included, and it may be `null` if classification failed)

To get the complete call record including resolved lead + disposition object: `GET /calls/:id`.

**Pattern for getting lead name in post-call automation:**
- Option A: pass lead name in `metadata` when creating the call → read from webhook payload's `data.metadata`
- Option B: fetch `GET /calls/:id` after receiving the webhook

---

## Voice Catalog (30 voices)

Use the friendly name in API calls (e.g. `"voice": "Maya"`). The platform resolves internally — never use raw voice IDs.

**Female voices (14):**
Michal, Rachel, Noa, Maya, Shira, Avigail, Liat, Tamar, Yael, Dvora, Shir, Anat, Dana, Ruth

**Male voices (16):**
Yonatan, David, Gil, Adam, Amir, Omer, Tom, Benny, Nir, Natan, Yosef, Ariel, Roi, Shlomo, Alon, Yuval

**Use-case mapping:**

| Use case | Female | Male |
|----------|--------|------|
| Professional / corporate | Maya, Anat | Adam, Ariel |
| Warm / friendly service | Michal, Liat | Omer, Tom |
| Young / energetic brand | Rachel, Shir | Yonatan, Roi |
| Authoritative / serious | Dvora, Ruth | David, Natan |
| Calm / reassuring | Noa, Tamar | Alon, Yuval |
| Sales / outbound | Yael, Anat | Gil, Nir |
| Medical / professional | Avigail, Tamar | Yosef, Shlomo |

**Default:** `Michal` when use case is unclear.

---

## Language Codes

| Code | Language | Notes |
|------|----------|-------|
| `he` | Hebrew | Most common; system prompt and greeting should also be in Hebrew |
| `en` | English | For English-language agents |

---

## Scope Map

| Resource + Action | Required Scope |
|---|---|
| GET /agents (list/get) | `agents:read` |
| POST /agents (create) | `agents:create` |
| PATCH /agents/:id | `agents:update` |
| DELETE /agents/:id | `agents:update` |
| GET /tools (list/get) | `tools:read` |
| POST /tools (create) | `tools:create` |
| PATCH /tools/:id | `tools:update` |
| DELETE /tools/:id | `tools:update` |
| POST /tools/attach | `tools:update` |
| POST /tools/detach | `tools:update` |
| POST /tools/:id/test | `tools:read` |
| GET /phone-numbers (list) | `phone_numbers:search` |
| POST /phone-numbers/search | `phone_numbers:search` |
| POST /phone-numbers/purchase | `phone_numbers:purchase` |
| POST /phone-numbers/configure | `phone_numbers:configure` |
| GET /billing | `billing:read` |
| POST /billing/setup | `billing:manage` |
| POST /billing/topup | `billing:manage` |
| GET /calls (list/get) | `calls:read` |
| POST /calls | `calls:create` |
| GET /dispositions (list/get) | `dispositions:read` |
| POST /dispositions | `dispositions:manage` |
| PATCH /dispositions/:id | `dispositions:manage` |
| DELETE /dispositions/:id | `dispositions:manage` |
| GET /leads (list/get) | `leads:read` |
| POST /leads | `leads:manage` |
| PATCH /leads/:id | `leads:manage` |
| DELETE /leads/:id | `leads:manage` |
| GET /lead-tags (list/get) | `lead_tags:read` |
| POST /lead-tags | `lead_tags:manage` |
| PATCH /lead-tags/:id | `lead_tags:manage` |
| DELETE /lead-tags/:id | `lead_tags:manage` |
| GET /shared-links (list/get) | `shared_links:read` |
| POST /shared-links | `shared_links:manage` |
| PATCH /shared-links/:id | `shared_links:manage` |
