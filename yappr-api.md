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

**Response envelope:** every JSON response includes a `company_id` field naming the workspace the response belongs to — useful when a key or script spans multiple companies.

---

## Rate Limits

- Calls API (`/calls` operations): 60 requests per minute per API key in a fixed window. Other API resources use a separate general 60-request-per-minute admission limit.
- Up to your company's `max_concurrent_calls` (default 10) active calls. Company or platform call-capacity pressure returns `202` with `status: "queued"` (or `"scheduled"` for a call-window defer), not `429`; inspect both HTTP status and response `status`.

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
| 429 | API-key request rate limit | Wait for `Retry-After`, then retry |
| 500 | Server error | Retry once; if persistent, report |

---

## Agents

### GET /agents

List all agents for the authenticated company.

**Scopes:** `agents:read`

**Query params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | int | 20 | max 100 |
| `offset` | int | 0 | pagination |

**Response:** Each list item is the **full agent object** — same shape as `GET /agents/:id`, including `system_prompt`, `temperature`, all `vad_*`, silence/max timeouts, `background_sound`, `type`, `flow_config`, `webhook_url`, `webhook_events`, `extraction_parameters`, AND a nested `tools[]` array. The result is wrapped in a `pagination` envelope — without `limit`/`offset` only the first 20 agents are returned (silent truncation for larger fleets).

```json
{
  "data": [
    { /* full agent object — same shape as GET /agents/:id, including tools[] */ }
  ],
  "pagination": {
    "total": 0,
    "limit": 20,
    "offset": 0,
    "has_more": false
  }
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
  "webhook_events": ["call.started", "call.answered", "call.ended", "call.failed", "call.no_answer", "call.dnc_blocked", "transcript.ready", "call.analyzed"],
  "extraction_parameters": [{"name": "camelCaseName", "description": "AI instruction for what to extract from the call"}],
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
| `voice` | string | no | A valid voice name from the Voice Catalog. **Omitting it defaults to Rachel** (not Michal) — to get the Michal default recommended elsewhere, pass `"voice": "Michal"` explicitly. |
| `language` | string | yes | `"he"` or `"en"` |
| `temperature` | float | no | 0.0–2.0, default 0.5 |
| `agent_speaks_first` | boolean | no | default `true` |
| `greeting_message` | string | no | Required if `agent_speaks_first: true` |
| `webhook_url` | string | no | Valid HTTPS URL |
| `webhook_events` | string[] | no | Array of valid event names |
| `extraction_parameters` | array | no | Each item: `{ "name": "camelCase", "description": "what to extract" }`. Values extracted from call transcript and included in `call.analyzed` webhook + stored on call log. |
| `vad_stop_secs` | float | no | 0.05–5.0, default 0.5 |
| `vad_start_secs` | float | no | 0.05–2.0, default 0.2 |
| `vad_confidence` | float | no | 0.0–1.0, default 0.7 |
| `silence_timeout_secs` | int | no | 10–900, default 60 |
| `max_continuous_speech_secs` | int | no | 0–300, default 120 (0 = disabled) |
| `max_call_duration_secs` | int | no | 0–3600, default 600 (0 = disabled) |
| `lead_memory_enabled` | boolean | no | default `true` |
| `background_sound` | string \| null | no | One of: `call_center`, `open_office`, `cafe`, `outdoor`. Plays under the agent voice during calls. Null = silent. |
| `background_sound_volume` | number | no | 0.0–0.6 (default 0.3). Capped to protect turn-taking. |
| `idempotency_key` | string | no | UUID for safe retries. **Dedup returns the ALREADY-STORED record with HTTP 200 — it does NOT apply the new body.** Re-POSTing the same key with changed fields is a silent no-op (you get stale data + a 200, no error). To change an existing agent use `PATCH /agents/:id`, not a repeat POST. |

**Response:** `201` — full agent object (same shape as GET /agents/:id, minus `tools[]`)

> **Editing an existing one?** See `PATCH /agents/:id` below — do not POST again.

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

**Tool & agent schema propagation timing**

Tool and agent config (system prompt, tools list, extraction parameters, voice/language/model
settings) is read from the database **once per call, at call start**. Once a call is
connected, the LLM session holds that schema for the lifetime of the call — there is no
mid-call refresh.

What this means in practice:

- After `POST /tools`, `PATCH /tools/:id`, `POST /tools/attach`, or any change to an agent
  via `PATCH /agents/:id`, **the next call placed (or received) by that agent uses the new
  config**. In-flight calls finish with whatever they started with.
- There is no separate "publish" or "resync" step. The PATCH/POST is the publish.
- If you maintain tool configs in your own codebase and push them via the API, the
  effective state in Yappr is whatever your last successful `PATCH /tools/:id` set —
  changes to your local source of truth that you haven't PATCHed have **not** reached
  Yappr.
- For testing during development: place a fresh call after every tool/agent edit to
  verify the change took effect. Re-using an in-flight call to test a new schema will
  not work.

This is the expected design — swapping function declarations mid-call would break the
LLM's mental model of available tools. But it does mean a "ship a fix locally, expect
it to work on the next call" workflow requires an explicit PATCH between the two.

---

### GET /tools

List all tools. Optionally filter to a specific agent.

**Scopes:** `tools:read`

**Query params:**
- `agent_id` (uuid, optional) — filter to tools attached to this agent

**Response:** Each list item carries the **full** tool record — including the complete `config` object, `idempotency_key`, and `updated_at` (not the thin shape below). Same field set as `GET /tools/:id`.

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "type": "webhook" | "function",
      "description": "string",
      "config": { ... },
      "is_active": true,
      "idempotency_key": "string | null",
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
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
        { "name": "camelCaseName", "description": "string", "required": true }
      ]
    }
  },
  "is_active": true,
  "idempotency_key": "string | null",
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
| `description` | string | webhook only | What the tool does — the AI uses this to decide when to call it |
| `type` | string | yes | `"webhook"` for user-created tools (the documented happy path — only `webhook` runs config URL/method validation + normalization). The handler also accepts `"function"`, inserted as-is. Any other value returns `400 type must be 'webhook' or 'function'`. |
| `config.url` | string | webhook only | Final public HTTP(S) URL. Localhost, cloud-metadata hosts, non-global literal or DNS-resolved addresses, mixed public/private DNS answers, and redirects are rejected; configure the final destination directly. |
| `config.method` | string | webhook only | One of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. |
| `config.headers` | object | no | String-valued request headers, e.g. `{"Authorization": "Bearer secret"}`. Routing/framing headers (`Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Expect`, `Keep-Alive`, `Proxy-*`, `TE`, `Trailer`, `Upgrade`) are rejected. |
| `config.timeout_seconds` | number | no | 1–60 seconds; default `30`. |
| `config.payload_config.include_standard_metadata` | boolean | no | Default `true` — includes `company_id`, `agent_id`, `agent_name`, `call_id`, `call_direction`, `caller_number`, `callee_number`, `call_metadata`, and `call_variables`. |
| `config.payload_config.static_parameters` | array | no | Each item: `{ "name": "camelCase", "value": "string" }` |
| `config.payload_config.extraction_parameters` | array | no | Each item: `{ "name": "camelCase", "description": "string", "required": true }`. `required` is optional and defaults to `true`; set it to `false` when a missing value must not block dispatch. |
| `idempotency_key` | string | no | UUID for safe retries. **Dedup returns the ALREADY-STORED record with HTTP 200 — it does NOT apply the new body.** Re-POSTing the same key with changed fields is a silent no-op (stale data + 200, no error). To change an existing tool use `PATCH /tools/:id`, not a repeat POST. |

**Important constraints:**
- `name` MUST be camelCase English. No snake_case, no spaces, no Hebrew.
- `extraction_parameters` and `static_parameters` MUST be nested inside `payload_config` inside `config`. NOT at the top level.
- All parameter names are normalized to camelCase automatically.
- `description` fields for extraction parameters can be in any language including Hebrew.
- `required` must be a boolean when provided. Required values are collected before dispatch; optional values are sent only when available.
- Webhook actions are dispatched once. `retry_count` is unsupported because an automatic replay could duplicate a non-idempotent operation.

**Response:** `201` — full tool object

> **Editing an existing one?** See `PATCH /tools/:id` below — do not POST again.

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

Send a test delivery to the saved tool's configured URL. The request follows the same payload contract and HTTP semantics used during a live call, including static parameters, optional standard metadata, the configured HTTP method, and `timeout_seconds`.

**Scopes:** `tools:update`

**Request body:** optional

```json
{
  "agent_id": "optional-company-owned-agent-uuid",
  "arguments": {
    "callerName": "Test Caller"
  },
  "context": {
    "call_id": null,
    "call_direction": "outbound",
    "caller_number": "+972500000000",
    "callee_number": "+972500000001",
    "call_metadata": { "contact_id": "test-contact" },
    "call_variables": { "LeadName": "Test Caller" }
  }
}
```

- `agent_id`, when supplied, must identify an agent in the API key's company. It supplies `agent_id` and `agent_name` in the standard envelope.
- `arguments` may contain only names configured in `payload_config.extraction_parameters`, and every supplied value must be a string. Any omitted configured argument receives a `<test_name>` placeholder.
- `context` is optional. Its accepted keys are exactly `call_id`, `call_direction`, `caller_number`, `callee_number`, `call_metadata`, and `call_variables`; `call_direction` is `inbound`, `outbound`, `web_call`, or `null`.

**Success (`200`):**
```json
{
  "success": true,
  "status_code": 200,
  "response_body": "downstream response preview",
  "payload_sent": { ... },
  "delivery_id": "uuid | null"
}
```

`payload_sent` is the exact object delivered. `delivery_id` is null only when delivery logging failed; logging failure never changes a successful downstream result.

**Downstream failure (`502`) or timeout (`504`):**

```json
{
  "error": "Webhook delivery failed",
  "code": "DOWNSTREAM_HTTP_ERROR | WEBHOOK_NETWORK_ERROR | WEBHOOK_TIMEOUT",
  "details": "Webhook returned HTTP 500",
  "status_code": 500,
  "downstream_response": "sanitized response preview",
  "payload_sent": { ... },
  "delivery_id": "uuid | null"
}
```

The response preview is capped and sanitized, and configured request headers are never echoed. Request validation failures return `400`; an unknown tool or supplied agent returns `404`; an invalid internal test-service response returns `500`.

Webhook targets must be final public HTTP(S) URLs. Localhost, cloud-metadata hosts, and non-global IP literals fail validation. Redirects are not followed and fail delivery; configure the final destination directly.

---

### Tool Webhook Payload

This is the exact flat payload Yappr sends to a webhook tool's `config.url` when the agent invokes the tool during a call. For `POST`, `PUT`, `PATCH`, and `DELETE`, it is sent as JSON. For `GET`, the same fields are encoded as query parameters (object/array values are compact JSON strings) and no request body is sent. It is NOT the same as the event-webhook payload (`call.analyzed` etc.) — see [Webhook Events](#webhook-events) for that.

**Payload shape (when `config.payload_config.include_standard_metadata` is `true`, the default):**

```json
{
  "company_id": "uuid",
  "agent_id": "uuid",
  "agent_name": "string",
  "call_id": "uuid",
  "call_direction": "inbound | outbound | web_call",
  "caller_number": "+972...",
  "callee_number": "+972...",
  "call_metadata": { "...": "whatever you passed to POST /calls body.metadata" },
  "call_variables": { "LeadName": "...", "AppointmentDate": "..." },

  // Static parameters from the tool's config (set at tool creation)
  "<static_param_name>": "<static_param_value>",

  // Extraction parameters — values the AI extracted from the conversation
  "<extraction_param_name>": "<extracted_value>"
}
```

**Field reference:**

| Field | Source | Notes |
|-------|--------|-------|
| `company_id`, `agent_id`, `agent_name` | Agent config | Identifies which company/agent made the call |
| `call_id` | Platform | Yappr's internal UUID for the call (use to query `GET /calls/:id` if you need the transcript or disposition later) |
| `call_direction` | Platform | `inbound`, `outbound`, or `web_call` |
| `caller_number`, `callee_number` | PSTN / WebRTC | E.164 |
| `call_metadata` | `POST /calls body.metadata` | **The exact object you passed at call creation.** Use this to carry CRM IDs (appointment_id, contact_id, calendar_id, etc.) that tool receivers need to route updates back to the right record. Empty object `{}` if you didn't pass any. |
| `call_variables` | `POST /calls body.variables` | The same `{{VariableName}}` values that were injected into the system prompt. Available here for tool receivers that want to echo context (e.g. Slack alerts: "Noa booked an appointment for {{LeadName}}"). |
| `<static_params>` | Tool `config.payload_config.static_parameters` | Fixed values set when the tool was created — the same for every call |
| `<extraction_params>` | AI (during the call) | Values the agent extracted from the conversation (e.g. `requestedDateTime`, `cancellationReason`). Configured in `config.payload_config.extraction_parameters` |

**Setting `include_standard_metadata: false`** strips the 9 standard-envelope fields (company_id through call_variables) and sends only static + extraction params. Rare — only useful for integrating with a target that rejects unexpected fields.

**Why `call_metadata` matters:** it closes the real-time gap. Before this was forwarded, tool webhooks only received 7 envelope fields and had to `GET /calls/:id` to retrieve any custom metadata — adding 100-300ms per tool fire. Now receivers have everything they need in one HTTP in-flight.

**Pattern — appointment reminder agent with GHL multi-calendar:**
```bash
# POST /calls
-d '{
  "agent_id": "...",
  "to": "+972...",
  "from": "+972...",
  "variables": {
    "LeadName": "דני",
    "AppointmentDate": "יום ראשון, 21 באפריל",
    "AppointmentTime": "14:00"
  },
  "metadata": {
    "appointment_id": "ghl-apt-abc123",
    "calendar_id": "ghl-cal-xyz789",
    "contact_id": "ghl-contact-def456"
  }
}'
```
When the agent fires `rescheduleAppointment`, the Make.com (or n8n) scenario receives `call_metadata.appointment_id` directly in the tool webhook body — no follow-up fetch required.

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
      "friendly_name": "string | null",
      "provider": "string",
      "status": "active" | "pending_requirements",
      "is_active": true,
      "inbound_agent_id": "uuid | null",
      "outbound_agent_id": "uuid | null",
      "sip_inbound_configured": false,
      "sip_outbound_configured": false,
      "country_code": "string",
      "monthly_cost": 0,
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

**Response:** Israeli mobile numbers available to purchase. The camelCase fields below are the internal proxy response, surfaced as-is.
```json
{
  "numbers": [
    {
      "phoneNumber": "+972XXXXXXXXX",
      "friendlyName": "+972XXXXXXXXX",
      "locality": "string",
      "region": "IL",
      "capabilities": { "voice": true, "sms": false },
      "pricing": {
        "basePriceCents": 1000,
        "finalPriceCents": 1000,
        "priceDisplay": "$10/month",
        "currency": "USD",
        "markupPercentage": 0
      }
    }
  ],
  "numberType": "string",
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalNumbers": 0,
    "limit": 10
  }
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
- **Only Israeli numbers are supported.** A non-IL `phone_number` returns `400 {"error":"Only Israeli phone numbers are supported"}`.
- If the selected number is taken between search and purchase, the system automatically substitutes an alternative with the same prefix. Always read `phoneNumber` from the response — it may differ from what was requested.
- `status` is **always `"pending_requirements"` at purchase time** — an IL number is never `"active"` immediately. Regulatory approval is required (typically 1–3 business days); the number is reserved and the subscription is active, and a background job promotes it to `"active"` once carrier requirements clear. Do not branch on `status === "active"` right after purchase — it will never be true.

**Response:**
```json
{
  "success": true,
  "phoneNumber": "+972XXXXXXXXX",
  "monthlyPrice": 1000,
  "currency": "USD",
  "status": "pending_requirements",
  "message": "string"
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
| `friendly_name` | string | no | Optional human-readable label for the number |

**CRITICAL:** All fields use `snake_case`. Using camelCase returns a 400 error.

**Response:** `200` — confirmation object (NOT the full phone-number record; the assigned agent IDs and `number` are not echoed back):
```json
{
  "success": true,
  "phone_number_id": "uuid",
  "sip_inbound_configured": false,
  "sip_outbound_configured": false
}
```

---

## SIP Endpoints

BYOC (Bring Your Own Carrier) SIP endpoints let a customer route inbound
calls from their own telephony system to a Yappr agent **without**
purchasing a Yappr-managed phone number. Each endpoint is a SIP URI of
the form `sip:{slug}@yappr-byoc.sip.telnyx.com`.

There is **no SIP digest auth** at the protocol layer. The slug embedded
in the URI is the bearer credential — server-generated with ~120 bits of
random entropy in its 24-char suffix, so unguessable. Treat the full URI
like an API key: anyone who has it can dial the agent.

Use SIP Endpoints when the customer already has a business line and
wants Yappr to answer specific calls (overflow, after-hours, escalations)
while keeping their existing telephony in place. Use phone numbers when
they want Yappr to own a new DID outright. The two coexist — a single
agent can answer calls from both.

**Caller-ID trust:** for calls arriving via SIP endpoints, the
calling-party number is whatever the customer's upstream sends —
attacker-controlled if the upstream is compromised. By default Yappr
does **not** use that number for lead-context lookups or returning-caller
recognition. Agents must opt in via the dashboard if their upstream is
trustworthy.

### GET /sip-endpoints

List the company's SIP endpoints.

**Scopes:** `sip_endpoints:read`

**Query params:**
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | int | 50 | max 200 |
| `offset` | int | 0 | for pagination |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "After-hours",
      "slug": "after-hours-bz3r3mtypuwuw8tpdw3x392s",
      "sip_uri": "sip:after-hours-bz3r3mtypuwuw8tpdw3x392s@yappr-byoc.sip.telnyx.com",
      "inbound_agent_id": "uuid",
      "is_active": true,
      "allowed_source_ips": null,
      "last_call_at": "ISO8601 | null",
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### POST /sip-endpoints

Create a new SIP endpoint. Returns the URI the customer pastes into their
PBX/CPaaS. No authentication setup required at the SIP layer.

**Scopes:** `sip_endpoints:manage`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Human-readable label, shown in the dashboard |
| `inbound_agent_id` | uuid | yes | Agent that answers calls routed to this endpoint |
| `slug` | string | no | Optional human-readable prefix (max 12 chars). Server appends a hyphen and a 24-char random suffix |
| `allowed_source_ips` | string[] | no | Optional CIDRs/IPs that may dial this endpoint. `null` (default) accepts any source |

Slug constraints (enforced server-side): 4–64 chars total, lowercase
letters / digits / single hyphens, no consecutive hyphens, must not start
with a reserved prefix.

**Rate limit:** 20 creates per company per day.

**Response:** `201`
```json
{
  "data": {
    "id": "uuid",
    "name": "After-hours",
    "slug": "after-hours-bz3r3mtypuwuw8tpdw3x392s",
    "sip_uri": "sip:after-hours-bz3r3mtypuwuw8tpdw3x392s@yappr-byoc.sip.telnyx.com",
    "inbound_agent_id": "uuid",
    "is_active": true,
    "allowed_source_ips": null,
    "created_at": "ISO8601"
  }
}
```

The customer pastes the value of `sip_uri` into their telephony platform's
outbound SIP route. UDP, TCP, and TLS are all supported. No username,
no password.

---

### GET /sip-endpoints/{id}

Get one endpoint. Same fields as the list response.

**Scopes:** `sip_endpoints:read`

---

### PATCH /sip-endpoints/{id}

Update name, inbound agent, active state, or allowlist. The slug is
immutable — delete and recreate if a different URI is needed.

**Scopes:** `sip_endpoints:manage`

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | new label |
| `inbound_agent_id` | uuid | agent must belong to this company |
| `is_active` | bool | toggle to disable temporarily without deleting |
| `allowed_source_ips` | string[] \| null | replace the source-IP allowlist; `null` removes it |

**Response:** `200` — updated endpoint object.

---

### DELETE /sip-endpoints/{id}

Hard-deletes the endpoint. New calls dialing the slug get rejected
pre-answer; in-flight calls finish. To rotate access, delete + create a
new endpoint with a fresh slug.

**Scopes:** `sip_endpoints:manage`

**Response:** `200` `{ "ok": true }`

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
| `status` | string | — | `ringing`, `in-progress`, `completed`, `failed`, `no_answer`, `dnc_blocked` (destination on the company DNC list — no carrier leg, no charge) |
| `direction` | string | — | `inbound`, `outbound`, `web_call` |
| `callee` | string | — | filter by callee phone (E.164). Useful for counting prior attempts to the same lead within a retry window. |
| `caller` | string | — | filter by caller phone (E.164) |
| `from` | ISO8601 | — | `created_at` lower bound |
| `to` | ISO8601 | — | `created_at` upper bound |

**Common pattern — "has this lead already been tried today?"**

```
GET /calls?agent_id=...&callee=+972XXXXXXXXX&from=2026-04-19T00:00:00Z
```
Response's `data.length` gives you the prior-attempt count. Use in retry-throttle logic (automation platforms like Make.com/n8n get clean counting without iterating the response).

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
  "ended_by": "caller" | "agent" | "system" | "unknown" | null,
  "disconnect_reason": "string | null",
  "transferred_at": "ISO8601 | null",
  "transfer_target": "string | null",
  "extracted_data": { /* object of the agent's extraction-parameter values — present ONLY when the agent extracted something (omitted when empty) */ },
  "metadata": { /* ONLY keys you passed at POST /calls — see note below */ },
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
    // Three row shapes, discriminated by `kind`. All carry the same
    // outer fields (tool_name, timestamp, request, response); the
    // sibling identity fields differ.
    {
      "tool_name": "string",
      "timestamp": "ISO8601",
      "kind": "webhook_tool",   // prompt-mode agent firing a custom webhook
      "node": null,
      "tool_id": "uuid",
      "provider": null,
      "action": null,
      "integration_id": null,
      "arg_sources": null,
      "request": {
        "method": "POST",
        "url": "https://...",
        "headers": { "Content-Type": "application/json" },
        "body": {}
      },
      "response": { "success": true, "response_preview": "string", "error": null, "duration_ms": 845 }
    },
    {
      "tool_name": "string",
      "timestamp": "ISO8601",
      "kind": "tool_call",      // flow-mode tool_call node — references a tool by id
      "node": { "id": "book", "name": "Book appointment", "type": "tool_call" },
      "tool_id": "uuid",
      "provider": null,
      "action": null,
      "integration_id": null,
      "arg_sources": { "appointmentDateTime": "ai_extract", "email": "ai_extract" },
      // No method/url/headers — flow tools fire via the dispatcher, not raw HTTP.
      // For webhook tools, body is the exact delivered payload: standard metadata,
      // then static parameters, then extracted values (later values win collisions).
      "request": {
        "body": {
          "company_id": "uuid",
          "agent_id": "uuid",
          "agent_name": "Scheduling Agent",
          "call_id": "uuid",
          "call_direction": "outbound",
          "caller_number": "+972...",
          "callee_number": "+972...",
          "call_metadata": {},
          "call_variables": {},
          "source": "voice-agent",
          "appointmentDateTime": "...",
          "email": "..."
        }
      },
      "response": { "success": true, "response_preview": "string", "error": null, "duration_ms": 412 }
    },
    {
      "tool_name": "Check availability",
      "timestamp": "ISO8601",
      "kind": "integration_call",  // flow-mode integration_call (Calendar/Gmail/...)
      "node": { "id": "check", "name": "Check availability", "type": "integration_call" },
      "tool_id": null,
      "provider": "google_calendar",
      "action": "check_availability",
      "integration_id": "uuid",
      "arg_sources": { "start_time": "ai_extract", "end_time": "ai_extract" },
      "request": { "body": { "start_time": "2026-05-11T09:00:00+03:00", "end_time": "2026-05-11T10:00:00+03:00" } },
      "response": { "success": true, "response_preview": "{\"busy\":[],...}", "error": null, "duration_ms": 651 }
    }
  ],
  "events": [
    {
      "type": "tool_called | tool_response | call_initiated | call_ended | error | flow_started | flow_node_entered | flow_eval_decision | flow_tool_result | ...",
      "timestamp": "ISO8601",
      "data": {}
    }
  ],
  "created_at": "ISO8601"
}
```

**`metadata`** — The metadata object you attached at `POST /calls`. Empty object `{}` if no metadata was provided at call creation.

**`ended_by`** — Who ended the call. One of:

| Value | Meaning |
|-------|---------|
| `"caller"` | The human on the line hung up. |
| `"agent"` | The bot ended the call (e.g. it timed out, finished its goal, or invoked the end-call action). |
| `"system"` | The platform ended the call (e.g. voicemail detection, max duration cap, hard error). |
| `"unknown"` | Hangup cause could not be determined. |
| `null` | Call has not yet ended, or ended too early to attribute. |

**First-write-wins**: once `ended_by` is set, it isn't overwritten by later updates. So a specific attribution (e.g. `"system"` from voicemail detection) is preserved even when a generic hangup event lands afterward.

Useful for retry / analytics decisions — e.g. don't auto-retry a call that the caller intentionally ended (`ended_by === "caller"`) but do retry when the platform aborted it (`ended_by === "system"`).

**`disconnect_reason`** — Optional human-readable termination reason (e.g. `"Voicemail detected"`, `"Completed"`). Also first-write-wins. May be `null` for short or atypical hangups.

**`transferred_at` / `transfer_target`** — Populated when the call was handed off via SIP transfer: `transferred_at` is the handoff timestamp, `transfer_target` is the destination it was transferred to. Both `null` when no transfer occurred.

**`extracted_data`** — Object of the agent's extraction-parameter values (keyed by the `name`s from `extraction_parameters`). This is where the values surfaced in the `call.analyzed` webhook are stored on the call log. Present only when the agent extracted at least one value; the key is omitted entirely when empty.

**`tool_calls`** — One row per tool / integration invocation that fired during the call, in firing order. The `kind` field is the discriminator:

- `webhook_tool` — prompt-mode agent with a tool list. `request` carries the full HTTP envelope (method/url/headers/body). Auth-related headers are redacted as `"[REDACTED]"`.
- `tool_call` — flow-mode `tool_call` node fired. For webhook tools, `request.body` is the exact flat payload delivered to the customer endpoint: optional standard metadata, then configured static parameters, then resolved extraction values (later layers win collisions). System/transfer tool nodes retain their resolved action args. `tool_id` and `node` identify which tool and flow node ran. `arg_sources` maps only resolved tool arguments to their mode (`literal` or `ai_extract`).
- `integration_call` — flow-mode `integration_call` node fired. Same `request.body`-only shape; `provider`, `action`, `integration_id` identify which connected credential and method ran.

For flow-agent calls, prefer reading `flow_trace.steps[].tool_call` — same per-fire data, inlined per visited step in graph order.

**`events`** — Full chronological timeline of all call events (tool calls, transcriptions, LLM events, errors, termination). For advanced use cases / low-level analysis. For flow agents, prefer `flow_trace` (below) — `events` carries the same data more verbosely. Auth headers are also redacted.

**`flow_trace`** — *Present only on flow-agent calls*. Structured view of the path through the graph during the call. This is the recommended observability surface for flow agents.

### `flow_trace` shape

```json
{
  "started_at": "ISO8601",
  "agent_speaks_first": true,
  "first_step_id": "start",
  "steps": [
    {
      "step_id": "hook",
      "step_type": "conversation",
      "step_name": "Human or AI hook",
      "entered_at": "ISO8601",
      "reason": "start",
      "tool_call": null,
      "eval_decisions": [
        {
          "turn_id": 1,
          "decision": "stay",
          "reasoning": "User just said 'one second'",
          "decided_at": "ISO8601"
        },
        {
          "turn_id": 2,
          "decision": "guessed_ai",
          "reasoning": "User said 'AI obviously' — clear match for user_says_AI",
          "decided_at": "ISO8601"
        }
      ]
    },
    {
      "step_id": "book_appointment",
      "step_type": "tool_call",          // also: integration_call, start, conversation, transfer, end
      "step_name": "Book appointment",
      "entered_at": "ISO8601",
      "reason": "eval: confirmed_book",
      "tool_call": {
        "kind": "tool_call",             // discriminator — "tool_call" | "integration_call"
        "tool_name": "Book appointment",
        "status": "success",
        "args": {"appointmentDateTime": "Sunday at 12pm", "email": "..."},
        "arg_sources": {"appointmentDateTime": "ai_extract", "email": "ai_extract"},
        "response_preview": "{\"event_id\": \"abc\", \"duplicate\": false}",
        "error": null,
        "duration_ms": 412,
        "tool_id": "uuid",
        "provider": null,                // set only when kind="integration_call"
        "action": null,
        "integration_id": null
      },
      "eval_decisions": []
    },
    {
      "step_id": "check_availability",
      "step_type": "integration_call",
      "step_name": "Check availability",
      "entered_at": "ISO8601",
      "reason": "eval: ready",
      "tool_call": {
        "kind": "integration_call",
        "tool_name": "Check availability",
        "status": "success",
        "args": {"start_time": "2026-05-11T09:00:00+03:00", "end_time": "2026-05-11T10:00:00+03:00"},
        "arg_sources": {"start_time": "ai_extract", "end_time": "ai_extract"},
        "response_preview": "{\"busy\": [], \"available\": true, ...}",
        "error": null,
        "duration_ms": 651,
        "tool_id": null,
        "provider": "google_calendar",
        "action": "check_availability",
        "integration_id": "uuid"
      },
      "eval_decisions": []
    },
    {
      "step_id": "confirmation_success",
      "step_type": "conversation",
      "step_name": "Booking confirmed",
      "entered_at": "ISO8601",
      "reason": "tool success",
      "tool_call": null,
      "eval_decisions": [...]
    }
  ]
}
```

### Reading `flow_trace` for debugging

- **"Which branch did the call take?"** — read `steps[].step_id` in order.
- **"Why did the bot transition from conversation node X?"** — find that step's `eval_decisions[]`. The last entry's `decision` is the transition that fired (its label maps to `flow_config.nodes[].transitions[].id`); its `reasoning` is the model's justification for the choice.
- **"What did the bot send to / receive from a tool?"** — find the tool_call step; `tool_call.args` is what was sent, `tool_call.response_preview` is what came back (JSON-stringified, truncated to ~2KB).
- **"Why did a tool route to error / a custom branch instead of success?"** — read the *next* step's `reason`: `"tool success"` / `"tool custom: <label>"` / `"tool error: <msg>"`.

### List endpoint counters

`GET /calls` adds three integer counters per row so you can filter / sort flow-agent activity without fetching events:
- `tool_calls_count` — LLM-decided tools (prompt agents). Always 0 for flow agents.
- `flow_steps_count` — total node visits. 0 for prompt agents. Loops count each visit.
- `flow_tool_fires_count` — tool_call nodes that fired. 0 for prompt agents.

### Underlying flow event types (for advanced consumers)

`flow_trace` is built from these raw events in `events[]`. Read them directly only if you need finer-grained timing or custom aggregation:

| `event_type` | `data` shape |
|---|---|
| `flow_started` | `{agent_id, first_step_id, agent_speaks_first}` |
| `flow_node_entered` | `{step_id, node_kind, name, reason, via_transition_id?}` — `node_kind` is one of `start`, `conversation`, `tool_call`, `integration_call`, `transfer`, `end`. |
| `flow_eval_decision` | `{step_id, decision, reasoning?, turn_id?, target_step_id?, valid}` |
| `flow_tool_result` | `{step_id, kind, status, tool_name, tool_id?, provider?, action?, integration_id?, args, arg_sources, response_preview, raw_response_preview?, error, duration_ms}` — `kind` is `tool_call` or `integration_call`; integration-specific fields populated for the latter. `raw_response_preview` is a nullable legacy field for historical rows; new Google events retain only the user-facing result in `response_preview`. |

**Recording URL notes:**
- `recording_url` is a permanent signed URL (contains `?sig=...` — do not modify)
- Opening it redirects (302) to the audio file — no Authorization header needed
- Redirect target is short-lived (~10 min); re-fetch `recording_url` if expired

---

### POST /calls

Initiate an outbound call.

**Scopes:** `calls:create`

**Body limit:** the complete UTF-8 JSON request must be no larger than 65,536 bytes. Larger fixed-length or streamed bodies return `413 REQUEST_BODY_TOO_LARGE` before an idempotency claim, database write, capacity reservation, or carrier request.

| Header | Required | Notes |
|--------|----------|-------|
| `Idempotency-Key` | no | 1–255 visible ASCII characters without spaces. Generate once per intended call and reuse only for retries of that same request. |

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent_id` | uuid | yes | Agent to use for the call |
| `to` | string | yes | Destination phone number — strict E.164 format (see Phone validation below) |
| `from` | string | yes | Caller phone number — strict E.164, must be an active number owned by the company |
| `metadata` | object or null | no | Null is treated as `{}`. Otherwise stored in `call_logs.metadata` as arbitrary JSONB, including nested null values, and not injected into the prompt. **Forwarded in real-time to every tool webhook as `call_metadata`** (see [Tool Webhook Payload](#tool-webhook-payload)) — ideal for carrying internal IDs (appointment_id, contact_id, calendar_id) that tool receivers need without requiring a `GET /calls/:id` round-trip. |
| `variables` | object or null | no | Null is treated as `{}`. Values may be strings or null; an individual null becomes an empty string before `{{VariableName}}` substitution. Also forwarded to tool webhooks as `call_variables`. |

**`from` is a per-call override, not a fixed binding.** Any active number in the company can be paired with any agent on any outbound call. The `outbound_agent_id` configured on a phone number (via `POST /phone-numbers/configure`) only sets the dashboard's default and does not constrain the API — callers choose `agent_id` + `from` independently per request. This means one number can serve many agents; purchasing a separate number per agent is unnecessary for outbound.

**CRITICAL:** `to` and `from` MUST NOT be the same number. This creates an infinite call loop. The API returns 400 but always verify before calling.

**Phone validation (enforced at API and DB layers):**
- Both numbers must match `^\+[1-9][0-9]{7,14}$` — leading `+`, 8–15 digits, no spaces or dashes.
- Israeli numbers (`+972…`) must be exactly 12 or 13 characters total (`+972` followed by an 8-digit landline or 9-digit mobile). Anything longer or shorter is rejected.
- Malformed `to` → `400 INVALID_TO_NUMBER`. Malformed `from` → `400 INVALID_FROM_NUMBER`. Bad numbers never reach the carrier and never create a `call_log` row.

**`variables` vs `metadata` distinction:**
- `variables` → injected into the system prompt before the call starts (use for per-call context the agent should know)
- `metadata` → stored on the call record, not injected into the prompt (use for tracking data — CRM IDs, source, etc.)

**Reserved keys (400 on collision).** The five built-in tokens (`id`, `direction`, `agent_number`, `user_number`, `agent_name`) are platform-supplied — the bot emits them itself at call start. Using any of them as a key in `metadata` is rejected with `400 INVALID_METADATA_RESERVED_KEY`. Pick a different name for your custom field (e.g. `customer_id` instead of `id`, `caller_phone` instead of `user_number`).

**Calling a flow agent? Check its metadata contract first.** Flow agents can reference `{{metadata.<key>}}` inside `args_template` values, so a missing key silently renders as an empty string at runtime — the carrier never warns you, the carrier never knows. Before dispatching, fetch the agent and read `flow_config.metadata.custom_metadata_keys`:

```bash
curl -s -H "Authorization: Bearer $YAPPR_API_KEY" \
  "https://api.goyappr.com/agents/<agent_id>" \
  | jq '.flow_config.metadata.custom_metadata_keys'
# → ["customer_email", "appointment_id"]
```

Every key in that array must be present in your `metadata` body. The five **built-in** tokens (`id`, `direction`, `agent_number`, `user_number`, `agent_name`) are platform-supplied — you don't need to pass them. Anything else is a contract the flow author chose and the dispatcher (you) must honor. Skip a required key → the dependent node fires with an empty arg → integration validation routes the flow to its `error` branch (assuming the author wired one).

**Response:** `201` — call placed (status `ringing`). Note: there is **no** `direction` and **no** `metadata` key on this response.
```json
{
  "id": "uuid",
  "status": "ringing",
  "agent_id": "uuid",
  "from": "+972...",
  "to": "+972...",
  "created_at": "ISO8601"
}
```

POST /calls has several non-201 success-ish outcomes. The `status` enum across them is: `ringing` | `dnc_blocked` | `queued` | `scheduled` | `provider_confirmation_pending` | `already_accepted`. Handle each — a dispatcher that only checks for 201/`ringing` will mis-handle blocked, queued, scheduled, and carrier-reconciliation outcomes.

**Blocked response (`200`) — destination on the company DNC list.** No carrier leg, no charge. **The id key is `call_id`, not `id`** — don't mistake this for a placed call.
```json
{
  "call_id": "uuid",
  "agent_id": "uuid",
  "to": "+972...",
  "from": "+972...",
  "status": "dnc_blocked",
  "message": "Phone number is on this company's DNC list — call was not placed.",
  "dnc_reason": "string | null",
  "started_at": "ISO8601",
  "ended_at": "ISO8601"
}
```

**Queued response (`202 Accepted`) — at server capacity.** All agents are busy; the call is queued and placed automatically when a slot frees up. Distinct from the `scheduled` outcome below (which is about call windows).
```json
{
  "id": "queue-entry-uuid",
  "status": "queued",
  "agent_id": "uuid",
  "to": "+972...",
  "from": "+972...",
  "queue_position": 1,
  "queued_at": "2026-05-26T21:14:02.123Z",
  "expires_at": "2026-05-27T10:00:00.000Z",
  "message": "All agents are busy. Your call has been queued and will be placed automatically when an agent becomes available."
}
```

**Deferred response (`202 Accepted`) — outside call window.** When the workspace has outbound enforcement on (see `Call Windows` section) and the request lands outside any allowed window, the API does not dial immediately. Instead it returns a queue entry with `status: "scheduled"` and a `scheduled_for` ISO timestamp marking the next opening; the platform places the call automatically at that time.

```json
{
  "id": "queue-entry-uuid",
  "status": "scheduled",
  "agent_id": "uuid",
  "to": "+972...",
  "from": "+972...",
  "scheduled_for": "2026-05-27T06:00:00.000Z",
  "queued_at": "2026-05-26T21:14:02.123Z",
  "expires_at": "2026-05-27T10:00:00.000Z",
  "message": "Call is outside your configured call window. It has been scheduled and will be placed at the next opening."
}
```

If outbound enforcement is on and no future window is configured, the API returns `422 OUTSIDE_CALL_WINDOW` instead of queueing indefinitely.

**Idempotent retry behavior.** With `Idempotency-Key`, the workspace keeps the request result for eight days:

- Same key + same request → returns the original HTTP status and JSON body without creating another call or queue entry. `Idempotency-Replayed: true` marks a replay.
- Same key + different request → `409 IDEMPOTENCY_KEY_CONFLICT`. Do not reuse that key for a new call.
- Same key while the first request is still running → `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`; wait for `Retry-After` (1–30 seconds), then send the identical key and body again.
- Temporary idempotency failure → `503`; the outcome may be uncertain and a call or queue resource may already exist. Do not infer failure or switch keys. Retry the identical key and body so Yappr can replay or recover the one durable request.
- After eight days, reusing the key begins a new request and can create a new call.
- `413 REQUEST_BODY_TOO_LARGE` means the request had no call-side effect; reduce `metadata` or `variables` and resend a body of at most 65,536 bytes.

The key is scoped to the workspace and `POST /calls`, not to one API credential. Rotating the API key does not invalidate retry keys. Keys are opaque and case-sensitive; use a UUID or your own non-sensitive request ID.

---

### GET /calls/:id/recording

Redirect to a call recording. Returns 302 to a short-lived signed audio URL.

**Scopes:** `calls:read`

---

## Do Not Call

Per-company DNC list. Outbound call placement (`POST /calls`) and the queue dispatcher both consult this list before dialing — matched destinations get a `call_logs` row written with `status: "dnc_blocked"` and no carrier leg / no charge.

Phone numbers are normalized to E.164 (+countrycode + digits) before storage, so any common input format works (`+972501234567`, `0501234567`, `972501234567` all collide on the unique constraint).

**Scope** — every entry is either:
- **Global** (`agent_ids: []` or omitted): every agent in the company is blocked from calling this number.
- **Scoped** (`agent_ids: [<uuid>, ...]`): only listed agents are blocked. Other agents can still place outbound calls to this number.

GET responses include `agents` (full agent objects, expanded so you don't have to round-trip to `/agents/{id}`). On POST/PATCH the input field is `agent_ids: string[]`.

### GET /do-not-call

List all DNC entries (most recent first), or look up by phone with `?phone=…`.

```bash
# List
curl -H "Authorization: Bearer $YAPPR_API_KEY" \
  "https://api.goyappr.com/do-not-call"

# Lookup
curl -H "Authorization: Bearer $YAPPR_API_KEY" \
  "https://api.goyappr.com/do-not-call?phone=+972501234567"
```

Returns `{ data: [...] }` for the list path, or a single entry object for the lookup path. Lookup returns 404 when the number isn't on the list.

**Scopes:** `do_not_call:read`

### POST /do-not-call

Add a phone number. Idempotent — re-adding an existing number returns the existing entry with HTTP 200 instead of erroring.

```bash
# Global block — every agent
curl -X POST -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "0501234567", "reason": "Customer requested removal"}' \
  "https://api.goyappr.com/do-not-call"

# Scoped block — only specific agents are blocked
curl -X POST -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "0501234567",
    "reason": "Don't pitch this lead from the sales agent — they only want renewals",
    "agent_ids": ["7e8a91c1-...sales-agent-uuid", "..."]
  }' \
  "https://api.goyappr.com/do-not-call"
```

`expires_at` is optional — omit for a permanent block. The API rejects past timestamps.

`agent_ids` is optional — omit or pass `[]` for a global block; pass agent UUIDs to scope to those agents only. All UUIDs must reference agents in the same company.

**Scopes:** `do_not_call:manage`

### GET /do-not-call/:id

Fetch a single entry by ID.

**Scopes:** `do_not_call:read`

### PATCH /do-not-call/:id

Update `reason`, `expires_at`, and/or `agent_ids`. `phone_number` is immutable — delete + re-add to change the number. To switch a scoped block to global, pass `agent_ids: []`; to narrow a global block, pass a non-empty array.

**Scopes:** `do_not_call:manage`

### DELETE /do-not-call/:id

Remove from the list. Future outbound calls to this number proceed normally.

**Scopes:** `do_not_call:manage`

---

## Call Windows

Company-level business hours that gate inbound and outbound calls. The window is evaluated in the workspace's timezone (`companies.timezone`, editable in the Company settings tab).

Behaviour when a call falls outside any allowed window:

- **Outbound** (when `outbound_enabled` is true) — `POST /calls` returns `202 Accepted` with `status: "scheduled"` and a `scheduled_for` timestamp. The platform places the call automatically at the next window opening.
- **Inbound** (when `inbound_enabled` is true) — the call is hung up before being answered. No `call_logs` row is created and no minutes are charged.

A day with zero windows is a closed day for whichever directions are enforced. The default schedule (seeded on company creation) is Sun–Thu 09:00–19:00 + Fri 09:00–11:30; Saturday is closed. `inbound_enabled` defaults to `false`, `outbound_enabled` defaults to `true`.

### GET /call-windows

Returns the full configuration.

**Scopes:** none — any authenticated API key for the workspace can call this.

**Response:**
```json
{
  "timezone": "Asia/Jerusalem",
  "inbound_enabled": false,
  "outbound_enabled": true,
  "windows": [
    { "day_of_week": 0, "start_time": "09:00", "end_time": "19:00" },
    { "day_of_week": 1, "start_time": "09:00", "end_time": "19:00" },
    { "day_of_week": 5, "start_time": "09:00", "end_time": "11:30" }
  ]
}
```

`day_of_week`: 0=Sunday … 6=Saturday. Times are `HH:MM` (24h).

### PUT /call-windows

Atomically replaces the configuration. Any combination of `inbound_enabled`, `outbound_enabled`, and `windows` can be sent. Omitting `windows` keeps the existing schedule; including it (even as `[]`) replaces it entirely.

**Scopes:** none — any authenticated API key for the workspace can call this.

| Field | Type | Notes |
|-------|------|-------|
| `inbound_enabled` | boolean | When true, inbound calls outside the window are hung up before answering. |
| `outbound_enabled` | boolean | When true, outbound calls outside the window are scheduled for the next opening. |
| `windows` | `CallWindow[]` | Full replacement set. Each entry needs `day_of_week` (0–6), `start_time`, `end_time`. |

Validation:
- `start_time` must be strictly before `end_time` (no overnight wrap — model as two entries on consecutive days).
- Multiple windows per day are allowed but must not overlap (`400 INVALID_CALL_WINDOWS`).

**Response:** `200` — the post-update configuration (same shape as GET).

```bash
curl -X PUT "https://api.goyappr.com/call-windows" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "outbound_enabled": true,
    "windows": [
      { "day_of_week": 0, "start_time": "09:00", "end_time": "13:00" },
      { "day_of_week": 0, "start_time": "14:00", "end_time": "18:00" }
    ]
  }'
```

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
| `position` | int | no | Display order. Auto-assigned to the end if omitted. |

**Response:** `201` — full disposition object

---

### PATCH /dispositions/:id

Update a disposition.

**Scopes:** `dispositions:manage`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `label` | string | no | |
| `color` | string | no | |
| `position` | int | no | Display order. |

**Response:** `200` — full updated disposition object

---

### DELETE /dispositions/:id

Delete a disposition. Returns 403 if disposition is protected.

**Scopes:** `dispositions:manage`

**Response:** `200` — `{ "success": true }`

---

## Campaigns

Bulk outbound dialing over your leads. A campaign holds a list of enrolled contacts, a set of **stop rules**, and **pacing** limits; once launched, the platform keeps handing eligible contacts to the ordinary outbound call queue until every contact has stopped or run out of attempts.

**A campaign call is an ordinary outbound call.** Same queue, same weight, same billing as one placed by `POST /calls`. Pacing controls only *how fast* a campaign hands calls to the queue — it never gets priority over anything, and it never bypasses the do-not-call list, the workspace call windows, the credit floor, or the concurrency cap.

**Ownership split.** You own the *config* (name, agent, from-number, stop rules, pacing, budget, compliance basis) and the *contact list*. The platform owns *state* — status transitions, per-contact progress, spend, and pacing counters. Every engine-owned field is rejected on write (see [Read-only fields](#read-only-engine-owned-fields)).

| Method | Path | Purpose |
|---|---|---|
| GET | `/campaigns` | List campaigns |
| POST | `/campaigns` | Create (always lands as `draft`) |
| GET | `/campaigns/:id` | Get one |
| PATCH | `/campaigns/:id` | Update config |
| DELETE | `/campaigns/:id` | Archive (soft) and retire live contacts |
| GET | `/campaigns/:id/stats` | Progress counters + `last_tick_result` |
| GET | `/campaigns/:id/leads` | List enrolled contacts |
| POST | `/campaigns/:id/leads` | Enroll contacts |
| DELETE | `/campaigns/:id/leads/:leadId` | Exclude one contact (terminal) |
| POST | `/campaigns/:id/launch` | → `running` |
| POST | `/campaigns/:id/pause` | → `paused` (manual) |
| POST | `/campaigns/:id/resume` | → `running` |
| POST | `/campaigns/:id/stop` | → `stopped` (terminal) |

**Scopes:** `campaigns:read` for every `GET`; `campaigns:manage` for `POST`, `PATCH`, and `DELETE` — including the four status transitions, which are POST sub-actions on a resource the key can already manage rather than separate scopes.

---

### GET /campaigns

List campaigns for the authenticated workspace, newest first. Archived (soft-deleted) campaigns are excluded.

**Scopes:** `campaigns:read`

**Query params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `status` | string | — | Comma-separated status filter, e.g. `status=running,paused` |
| `limit` | int | 50 | max 200 (note: higher than the 20/100 used by most other resources) |
| `offset` | int | 0 | pagination |

**Response:**
```json
{
  "data": [ { /* full campaign object — see GET /campaigns/:id */ } ],
  "pagination": { "total": 3, "limit": 50, "offset": 0 },
  "company_id": "uuid"
}
```

---

### GET /campaigns/:id

**Scopes:** `campaigns:read`

Foreign keys are expanded to **full objects**, per the API's FK convention — `agent`, `from_phone_number`, and `stop_dispositions` (one full disposition object per id in `stop_disposition_ids`).

```jsonc
{
  "id": "uuid",
  "company_id": "uuid",
  "name": "March renewals",
  "description": "string | null",
  "status": "draft",

  "agent_id": "uuid | null",
  "from_phone_number_id": "uuid | null",
  "from_number": "+972... | null",      // audit snapshot, taken at launch

  "calling_window": {},

  "stop_disposition_ids": ["uuid"],
  "stop_on_no_answer": false,
  "stop_on_voicemail": false,
  "randomize_retry_time": true,
  "stop_on_unclassified": false,

  "max_attempts": 3,
  "max_infra_retries": 5,
  "disposition_timeout_seconds": 1800,
  "retry_no_answer_seconds": 60,
  "retry_completed_seconds": 14400,
  "double_dial_enabled": false,
  "double_dial_gap_seconds": 90,

  "max_calls_per_day": 200,
  "min_seconds_between_calls": 30,
  "max_in_flight": 2,
  "daily_admitted_count": 0,
  "daily_window_date": "2026-07-28 | null",
  "last_admitted_at": "ISO8601 | null",

  "budget_cents": null,
  "estimate_cents": null,
  "spent_cents": 0,
  "reserved_cents": 0,

  "regulatory_basis": "consent | existing_customer | non_marketing | registry_screened | null",

  "last_tick_at": "ISO8601 | null",
  "last_tick_result": "string | null",
  "last_error": "string | null",

  "starts_at": null, "ends_at": null,
  "started_at": null, "completed_at": null,
  "total_leads": 0,
  "stats": {},
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "created_by": "uuid | null",

  "agent": { /* full agent object, or null */ },
  "from_phone_number": { /* full phone-number object, or null */ },
  "stop_dispositions": [ { /* full disposition object */ } ]
}
```

404 when the id does not belong to the workspace or has been archived.

---

### POST /campaigns

Create a campaign. **It always lands as `draft`** — `status` is not writable, and creating never starts dialing. Launching is a separate, explicit call.

**Scopes:** `campaigns:manage`

**Response:** `201` — full campaign object.

#### Client-writable fields

This exact allowlist applies to both `POST` and `PATCH`. **Any other key — including a typo or a read-only field — is rejected with `400`** and a message listing the writable set. This is deliberate: silently ignoring a misspelled `stop_dispositions` would leave you believing you armed a kill switch when you did not.

**No configuration field has a default.** A field you never send stays `null`, and `launch` returns `422 CAMPAIGN_NOT_READY` naming it. The *Suggested* column is what the dashboard prefills for a human — visible and editable there, never substituted here. How many times to call someone, and when to stop, are not decisions the platform makes on your behalf.

| Field | Type | Suggested | Validation / notes |
|-------|------|-----------|--------------------|
| `name` | string | — | **Required on create.** Trimmed. Must be unique among the workspace's non-archived campaigns → `409 DUPLICATE_NAME` |
| `description` | string | null | Free text |
| `agent_id` | uuid | — | Required before launch |
| `from_phone_number_id` | uuid | — | Required before launch; must be an active number the workspace owns |
| `calling_window` | object | `{}` | JSON object. **Not the gate that decides when a campaign dials** — see [calling_window](#calling_window) |
| `variables` | object | `{}` | `{{Placeholder}}` values shared by every call in the campaign. Flat string map; reserved built-in names are rejected |
| `stop_disposition_ids` | uuid[] | `[]` | Array of **disposition ids**, never labels. Every id must belong to this workspace, or `400` |
| `stop_on_no_answer` | boolean | `false` | Retire a contact the first time nobody picks up |
| `stop_on_voicemail` | boolean | `false` | Retire a contact on a voicemail-class outcome |
| `stop_on_unclassified` | boolean | `false` | `true` retires a contact whose call was never classified before `disposition_timeout_seconds`; `false` retries it |
| `max_attempts` | int | 3 | 1–10. Per-contact dial cap |
| `max_infra_retries` | int | 3 | 0–20. Separate budget for platform-side failures, which never count against `max_attempts` |
| `disposition_timeout_seconds` | int | 900 | 60–86400. How long to wait for the outcome classifier before deciding without it |
| `retry_no_answer_seconds` | int | 3600 | 30–604800. Wait before redialing an unanswered contact. Also covers voicemail and busy |
| `retry_completed_seconds` | int | 86400 | 60–604800. Wait before redialing a contact whose call connected but landed a non-stop outcome |
| `randomize_retry_time` | boolean | `false` | Which time of day the retry lands on. `false` keeps the wait exact — a one-week wait retries at the same hour a week later. `true` picks a different hour inside the calling window. The wait length is unchanged either way; a randomized retry is never *earlier* than the configured wait |
| `double_dial_enabled` | boolean | `false` | Ring a second time shortly after an unanswered first ring. The pair counts as one attempt |
| `double_dial_gap_seconds` | int | 90 | 10–3600. Required before launch even when `double_dial_enabled` is `false` |
| `max_calls_per_day` | int | 200 | 1–100000. Resets on the workspace's own calendar day |
| `min_seconds_between_calls` | int | 30 | 0–86400. Minimum spacing between two admissions |
| `max_in_flight` | int | 2 | 1–8. How many attempts *this* campaign may have outstanding. Self-restraint, not a capacity grant — the platform's shared outbound lanes are the real ceiling |
| `budget_cents` | int \| null | null | Positive integer, or `null` for no cap. Enforced against `spent_cents + reserved_cents` |
| `regulatory_basis` | string | — | One of `consent`, `existing_customer`, `non_marketing`, `registry_screened`. **Required before launch** |
| `starts_at` | ISO8601 | null | Do not admit before this instant |
| `ends_at` | ISO8601 | null | Do not admit after this instant |

`retry_rules` is **not** writable. It was an earlier structured retry matrix that the dialer never evaluated; the scalar fields above are the whole retry configuration.

To stop calling people you have already spoken to, create a disposition for that outcome (`POST /dispositions`) and put its id in `stop_disposition_ids`. There is no built-in "reached a human" rule — what counts as a real conversation differs per workspace, so it lives in your own outcome list where it is visible and changeable.

```bash
curl -s -X POST "https://api.goyappr.com/campaigns" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "March renewals",
    "agent_id": "AGENT_ID",
    "from_phone_number_id": "PHONE_NUMBER_ID",
    "regulatory_basis": "existing_customer",
    "stop_disposition_ids": ["NOT_INTERESTED_DISPOSITION_ID", "BOOKED_DISPOSITION_ID"],
    "stop_on_no_answer": false,
    "stop_on_voicemail": true,
    "stop_on_unclassified": false,
    "max_attempts": 3,
    "max_infra_retries": 3,
    "disposition_timeout_seconds": 900,
    "retry_no_answer_seconds": 3600,
    "retry_completed_seconds": 86400,
    "randomize_retry_time": true,
    "double_dial_enabled": false,
    "double_dial_gap_seconds": 90,
    "max_calls_per_day": 150,
    "min_seconds_between_calls": 45,
    "max_in_flight": 2,
    "budget_cents": 5000
  }' | jq '{id, status, name}'
```

#### Read-only (engine-owned) fields

Never writable; sending any of them returns `400`. Read them from `GET /campaigns/:id` or `GET /campaigns/:id/stats`:

`status`, `daily_admitted_count`, `daily_window_date`, `last_admitted_at`, `spent_cents`, `reserved_cents`, `estimate_cents`, `last_tick_at`, `last_tick_result`, `last_error`, `started_at`, `completed_at`, `total_leads`, `stats`, `from_number`, `company_id`, `created_by`, `created_at`, `updated_at`.

#### calling_window

`{tz, days:[0..6], start:"HH:MM", end:"HH:MM"}`, stored as-is and echoed back. It can only ever *narrow* the workspace calling hours — the gate the pacer actually evaluates is the **workspace** call windows (`GET`/`PUT /call-windows`). A campaign with no reachable workspace window refuses to launch and pauses itself as `paused_config`.

Leave it at `{}` to follow the workspace hours.

---

### PATCH /campaigns/:id

Update any subset of the writable fields above. Safe while a campaign is `running` — the next tick picks the new values up.

**Scopes:** `campaigns:manage`

- `400` when the campaign is `completed`, `stopped`, or `archived` (no longer editable)
- `400` when the body contains no writable field
- `400` on an unknown/read-only key, an out-of-range value, or a `stop_disposition_ids` entry from another workspace
- `409 DUPLICATE_NAME` on a name collision

**Response:** `200` — full updated campaign object.

```bash
# Arm the stop set by id, and turn on the two non-connect booleans
curl -s -X PATCH "https://api.goyappr.com/campaigns/CAMPAIGN_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "stop_disposition_ids": ["DO_NOT_CALL_ID", "NOT_INTERESTED_ID", "APPOINTMENT_SET_ID"],
    "stop_on_no_answer": false,
    "stop_on_voicemail": true
  }' | jq '{status, stop_disposition_ids, stop_on_voicemail}'
```

---

### DELETE /campaigns/:id

Archive. Sets `status: "archived"`, soft-deletes the row, retires every live contact (`pending`, `scheduled`, `dialing`, `awaiting_disposition` → `excluded`), and expires the campaign's not-yet-claimed queue rows. Calls already in flight complete normally and still bill.

**Scopes:** `campaigns:manage`

**Response:** `200` — `{ "id": "uuid", "status": "archived", "company_id": "uuid" }`

Archiving is not reversible, and an archived campaign disappears from `GET /campaigns`. To stop dialing while keeping the record readable, use `pause` or `stop`.

---

### GET /campaigns/:id/stats

The "what is this campaign doing right now" endpoint. Poll this, not the list endpoint.

**Scopes:** `campaigns:read`

```json
{
  "campaign_id": "uuid",
  "status": "running",
  "leads_by_status": { "pending": 812, "dialing": 2, "awaiting_disposition": 3, "completed_success": 180, "exhausted": 41, "dnc": 4 },
  "leads_total": 1042,
  "attempts_total": 386,
  "attempts_in_flight": 5,
  "calls_today": 137,
  "max_calls_per_day": 200,
  "spent_cents": 4310,
  "reserved_cents": 240,
  "estimate_cents": 9800,
  "budget_cents": 20000,
  "last_tick_at": "ISO8601 | null",
  "last_tick_result": "string | null",
  "last_error": "string | null",
  "company_id": "uuid"
}
```

The pacer ticks **once a minute**, so polling faster than every 30–60s tells you nothing new. `last_tick_result` is the machine-readable answer to "why is nothing happening" — see [Reading last_tick_result](#reading-last_tick_result).

---

### GET /campaigns/:id/leads

The enrolled contacts and their per-contact state, oldest enrollment first.

**Scopes:** `campaigns:read`

**Query params:** `status` (comma-separated), `limit` (default 50, max 200), `offset`.

```jsonc
{
  "data": [
    {
      "id": "uuid",                          // enrollment id
      "lead_id": "uuid",
      "to_number_e164": "+972...",           // snapshotted at enroll
      "status": "pending",
      "stop_hit": false,
      "stop_reason": "string | null",
      "stopped_by_disposition_id": "uuid | null",
      "attempt_count": 1,
      "infra_retries_used": 0,
      "next_attempt_at": "ISO8601 | null",
      "last_disposition_id": "uuid | null",
      "last_disconnect_reason": "string | null",
      "last_status_at": "ISO8601 | null",
      "completed_at": "ISO8601 | null",
      "created_at": "ISO8601",
      "lead": { /* full lead object */ },
      "last_disposition": { /* full disposition object, or null */ }
    }
  ],
  "pagination": { "total": 1042, "limit": 50, "offset": 0 },
  "campaign_id": "uuid",
  "company_id": "uuid"
}
```

**Contact statuses:**

| Status | Meaning |
|---|---|
| `pending` | Eligible; waiting for `next_attempt_at` and a pacing slot |
| `scheduled` | Held for a future instant |
| `dialing` | An attempt is live |
| `awaiting_disposition` | The call ended; the outcome classifier hasn't landed yet. **Do not redial** — the platform won't either |
| `completed_success` | A stop rule fired. Terminal |
| `completed_failed` | Terminal failure for this contact |
| `exhausted` | `max_attempts` consumed without a stop rule firing. Terminal |
| `excluded` | Removed by you, by `stop`, or by archive. Terminal |
| `dnc` | On the do-not-call list. Terminal |

`stop_reason` (and the attempt ledger's settle reason) is one of: `stop_disposition`, `non_stop_disposition`, `disposition_timeout`, `no_answer`, `voicemail`, `dial_failed`, `infra_failure`, `insufficient_credit`, `queue_expired`, `never_dialed`, `dnc_blocked`, `orphan_reaped`, `cancelled`, `lead_removed`, `manual`.

---

### POST /campaigns/:id/leads

Enroll contacts. Two interchangeable inputs, usable together in one request:

**Scopes:** `campaigns:manage`

| Field | Type | Notes |
|-------|------|-------|
| `lead_ids` | uuid[] | Existing leads in this workspace |
| `phone_numbers` | array | Raw numbers. Each item is `{ "phone": "...", "name"?, "email"?, "notes"? }` or a bare string |

At least one of the two is required, and **at most 1,000 contacts per request** (`400` above that — send several requests). Enrollment is allowed on a `draft` campaign **and on a running one**; only terminal campaigns (`completed`, `stopped`, `archived`) refuse.

What happens to `phone_numbers`:
- every number is canonicalized to E.164 first, so `0501234567` and `+972501234567` are the same contact
- an existing lead with that number (canonical **or** local `0…` form) is matched and reused
- otherwise a lead is created, with `notes` stored as that lead's long-term memory (capped at 2,000 chars) and `source: "api"`

**Response:** `200` — an itemized report, never a bare success:

```json
{
  "campaign_id": "uuid",
  "enrolled": 412,
  "already_enrolled": 3,
  "leads_created": 380,
  "leads_matched": 35,
  "invalid_phone": [ { "phone": "05012" }, { "lead_id": "uuid", "phone": "n/a" } ],
  "on_do_not_call": ["+972501234567"],
  "not_found": ["uuid"],
  "total_leads": 1042,
  "company_id": "uuid"
}
```

- `already_enrolled` — re-enrolling the same contact is idempotent, not an error, so a sync script can be written naively
- `on_do_not_call` — filtered out at enroll time and reported up front; the dispatcher re-checks at dial time regardless
- `not_found` — ids in `lead_ids` that are not leads of this workspace
- `invalid_phone` — unparseable numbers, and existing leads whose stored number cannot be canonicalized

**`409 ALREADY_IN_ACTIVE_CAMPAIGN`** — one or more numbers are live in another active campaign. A number can only be dialed by one campaign at a time, workspace-wide. The response still carries the full report so you can see what did land.

```bash
# Existing leads
curl -s -X POST "https://api.goyappr.com/campaigns/CAMPAIGN_ID/leads" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"lead_ids": ["LEAD_ID_1", "LEAD_ID_2"]}' | jq .

# Raw numbers (creates or matches leads)
curl -s -X POST "https://api.goyappr.com/campaigns/CAMPAIGN_ID/leads" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_numbers": [
      { "phone": "0501234567", "name": "ישראל כהן", "notes": "Renewal due in April" },
      "+972521234567"
    ]
  }' | jq '{enrolled, leads_created, leads_matched, on_do_not_call, invalid_phone}'
```

---

### DELETE /campaigns/:id/leads/:leadId

Exclude one contact from this campaign. Addressed by **`lead_id`**, not by the enrollment id. Terminal — the contact is never resurrected by a later tick, and re-enrolling it is a no-op (`already_enrolled`).

**Scopes:** `campaigns:manage`

**Response:** `200` — `{ "campaign_id": "uuid", "lead_id": "uuid", "status": "excluded", "company_id": "uuid" }`
`404` when that lead is not enrolled in this campaign.

> Excluding a contact affects **this campaign only**. To suppress a person everywhere, add them to the do-not-call list (`POST /do-not-call`).

---

### POST /campaigns/:id/launch · pause · resume · stop

Four POST sub-actions, no body. All return the full campaign object (`200`).

**Scopes:** `campaigns:manage`

| Action | Allowed from | Result |
|---|---|---|
| `launch` | `draft`, `paused`, `paused_insufficient_credit`, `paused_budget`, `paused_infra`, `paused_config` | `running`, sets `started_at`, writes a `launched` audit event carrying `regulatory_basis` and the enrolled count |
| `resume` | same set | `running` (identical mechanics to `launch`; use whichever reads better) |
| `pause` | `running`, `scheduled`, any `paused_*` | `paused` — a **manual** pause, which deliberately does *not* auto-resume when the balance is topped up |
| `stop` | any non-terminal status | `stopped` (terminal) and every `pending`/`scheduled` contact → `excluded`. In-flight calls finish |

- Launching an already-`running` campaign is a no-op: `200` with `"message": "Already running"`.
- Launching from a terminal status, or stopping a terminal campaign, returns `400`.
- `launch`/`resume` run a **preflight**; a failure is `422 CAMPAIGN_NOT_READY` with a specific, actionable message and no state change.

```bash
curl -s -X POST "https://api.goyappr.com/campaigns/CAMPAIGN_ID/launch" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '{status, last_tick_result, error, message}'
```

#### Launch preflight — the nine causes of `422 CAMPAIGN_NOT_READY`

| Message | Fix |
|---|---|
| Assign an agent before launching | `PATCH` with `agent_id` |
| Assign a phone number to call from before launching | `PATCH` with `from_phone_number_id` |
| `regulatory_basis` is required before launching | `PATCH` with one of the four bases |
| Configure at least one stop rule before launching | Set `stop_disposition_ids`, or one of `stop_on_no_answer` / `stop_on_voicemail` |
| Finish configuring the campaign before launching. Not set: … | Every config field is `null` until you send it; the message names each one. `PATCH` them and launch again |
| The assigned agent no longer exists | Point `agent_id` at a live agent |
| The assigned agent has no maximum call duration set | `PATCH /agents/:id` with a positive `max_call_duration_secs` — `0` means unlimited, which makes the campaign's worst-case cost unbounded |
| The phone number assigned to this campaign is no longer active | Pick an `is_active` number with `status: "active"` |
| This workspace has no upcoming calling window | Fix `PUT /call-windows` (and the workspace timezone, which is dashboard-only) |
| Enroll at least one contact before launching | `POST /campaigns/:id/leads` |

---

### Campaign statuses

| Status | Meaning | Resumes by itself? |
|---|---|---|
| `draft` | Created, never launched | — |
| `scheduled` | Launched but waiting for `starts_at` | — |
| `running` | Admitting calls | — |
| `paused` | **You** paused it | **No** — a manual pause survives a top-up. Call `resume` |
| `paused_insufficient_credit` | Balance under the floor needed to place a call | **Yes** — the tick re-checks every minute and resumes from any funding path (checkout, auto-topup, admin credit) |
| `paused_budget` | `spent_cents + reserved_cents` would exceed `budget_cents` | No — raise `budget_cents`, then `resume` |
| `paused_infra` | Transient platform problem (e.g. the from-number went inactive, calls dispatched but never dialed) | No — fix the cause, then `resume` |
| `paused_config` | Permanent config problem (no reachable calling window, agent without a duration cap) | No — fix the config, then `resume` |
| `completed` | Nothing live left to dial. Terminal | — |
| `stopped` | You stopped it. Terminal | — |
| `archived` | Soft-deleted, hidden from list. Terminal | — |

### Reading `last_tick_result`

Written every tick on both the campaign object and `/stats`. A `running` campaign that isn't dialing always explains itself here.

| Value | Meaning |
|---|---|
| `admitted` | Calls were handed to the queue this tick |
| `no_eligible_leads` | Every contact is terminal or waiting on `next_attempt_at` |
| `spacing` | Held by `min_seconds_between_calls` |
| `max_in_flight` | This campaign already has `max_in_flight` attempts outstanding |
| `daily_cap_reached` | `max_calls_per_day` hit for the workspace's current day |
| `outside_call_window` | Inside the schedule, but not right now — dialing resumes at the next opening |
| `no_reachable_call_window` | No future window exists at all → status `paused_config` |
| `insufficient_credit` / `no_billing_account` | Under the credit floor → status `paused_insufficient_credit` |
| `credit_reserve_would_breach_floor` | Balance minus the worst-case reservation for the next call would drop under the floor |
| `budget_exhausted` | `budget_cents` reached → status `paused_budget` |
| `from_number_unavailable` | The from-number is no longer active → status `paused_infra` |
| `agent_has_no_duration_cap` | The agent's `max_call_duration_secs` was set to `0` mid-campaign → status `paused_config` |
| `platform_admission_disabled` | Platform-wide admission pause (operational kill switch). In-flight calls and reconciliation continue |
| `resumed_credit_ok` | Auto-resumed after funding |
| `completed` | Auto-completed: nothing live left |
| `error` | The tick raised; `last_error` carries the reason |

### How a contact stops

Two independent per-contact stop conditions, whichever fires first:

1. **`max_attempts`** — the dial cap. Platform-side failures use the separate `max_infra_retries` budget and never consume an attempt.
2. **The stop-disposition set** — landing an outcome in `stop_disposition_ids` retires the contact **permanently**. Any other outcome retries after `retry_completed_seconds` until the cap.

Rules that matter:

- **`stop_disposition_ids` holds disposition ids, never labels.** Labels are renameable per workspace; ids are stable. Read them from `GET /dispositions`.
- **Never put `No Answer`, `Failed`, or `Voicemail` in `stop_disposition_ids`.** Those three labels are *also* auto-assigned, and the classifier legitimately assigns them to real conversations — putting them in the stop set retires people you actually reached. Use `stop_on_no_answer` / `stop_on_voicemail` instead, which are evaluated on the call's outcome class rather than its label.
- **Outcomes are classified asynchronously after the call ends**, typically within seconds but occasionally much later. A contact sits in `awaiting_disposition` until it's classified or until `disposition_timeout_seconds` elapses; `stop_on_unclassified` decides what happens then. The platform will not redial a contact in `awaiting_disposition`, and neither should you.
- **A disposition that is a stop rule on a live campaign cannot be deleted.** `DELETE /dispositions/:id` is refused at the database layer (it surfaces as a `500`, not a clean error) rather than silently disarming your kill switch. Remove the id from every non-terminal campaign's `stop_disposition_ids` first. (The 10 seeded defaults are `403 PROTECTED` anyway, so this bites on custom outcomes.)

### Compliance

- `regulatory_basis` is a required attestation before launch, recorded on the launch audit event together with the enrolled count. It is the artefact that exists when someone asks why a person was called.
- **Enrollment excludes numbers on the do-not-call list** and reports them in `on_do_not_call`. The dispatcher re-checks at dial time.
- **A verbal opt-out is honoured automatically.** When a call is classified as `Do Not Call`, that number is added to the workspace's do-not-call list — workspace-wide, across every agent and campaign, not just this one. This fires even when the classification lands long after the call.
- A number can be dialed by only **one active campaign at a time** (`409 ALREADY_IN_ACTIVE_CAMPAIGN`), so the same person on two lists does not receive double the calls.

### Campaign error codes

| Status | Code / shape | Cause |
|---|---|---|
| 400 | message names the field | Unknown or read-only key, out-of-range value, non-object `calling_window`, stop-disposition id from another workspace, empty PATCH, editing a terminal campaign, enrolling into a terminal campaign, over 1,000 contacts in one enroll |
| 404 | — | Campaign not in this workspace (or archived); contact not enrolled |
| 409 | `DUPLICATE_NAME` | Another non-archived campaign already uses that name |
| 409 | `ALREADY_IN_ACTIVE_CAMPAIGN` | A number is live in another active campaign |
| 422 | `CAMPAIGN_NOT_READY` | Launch preflight failed; `message` names the single blocking cause |

> **Envelope note — campaigns invert the usual error shape on 409/422.** The three coded errors above return `{ "error": "<CODE>", "message": "<human text>" }` — the machine code is in `error`, not in `code`. Plain `400`/`404`/`500` responses use the standard `{ "error": "<human text>" }`. So parse defensively: read `code` first, then fall back to `error` when it matches `^[A-Z_]+$`.

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
| `tags` | string[] | no | Tag names — resolved to IDs server-side |
| `tag_ids` | uuid[] | no | Alternative to `tags` — pass UUIDs directly |
| `long_term_context` | string | no | AI memory injected into the agent's system prompt for this lead, at call time. Settable on create (and via PATCH). |
| `metadata` | object | no | Arbitrary JSONB. Use this to record provenance (e.g. `{"source":"facebook"}`) — `source` itself is not caller-settable (see note). |

> **`source` is not settable via the API.** API-created leads are always stored with `source: "api"` — any `source` you pass in the body is ignored. To track where a lead came from, put it in `metadata`.

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

**Response:** (the same field set is returned on every lead-tag GET/POST/PATCH response)
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "color": "#hex",
      "description": "string | null",
      "sort_order": 0,
      "created_at": "ISO8601"
    }
  ]
}
```

---

### POST /lead-tags

Create a tag.

**Scopes:** `lead_tags:manage`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | |
| `color` | string | no | |
| `description` | string | no | |

`sort_order` is auto-assigned (appended to the end) on create — set a specific order via PATCH.

---

### PATCH /lead-tags/:id

Update a tag.

**Scopes:** `lead_tags:manage`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | no | |
| `color` | string | no | |
| `description` | string | no | |
| `sort_order` | int | no | Reorder the tag. |

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
  "has_payment_method": true,
  "billing_email": "string | null",
  "balance_cents": 2500,
  "balance": 25.0,
  "currency": "usd",
  "is_suspended": false,
  "auto_topup_enabled": false,
  "auto_topup_amount_cents": null,
  "low_balance_threshold_cents": null
}
```

(`is_suspended` is useful to gate dispatch on; `balance` is `balance_cents / 100`. There is no `subscription_status` field.)

---

### POST /billing/topup

Add credits to the account. Charges the saved payment method.

**Scopes:** `billing:manage`

**ALWAYS require explicit user confirmation before calling this endpoint.**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `amount_cents` | int | yes | Amount in cents — e.g. `2000` = $20.00. Must be a **positive integer** — floats, zero, and negatives return `400 amount_cents must be a positive integer (e.g., 1000 for $10.00)`. |

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

## Report Issue

File a bug report or feature request to the Yappr team. Any authenticated API key for the workspace can call this — **no scope required**.

### POST /report-issue

**Scopes:** none

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | yes | Min 5 chars (capped at 200) |
| `description` | string | yes | Min 10 chars (capped at 5000) |
| `type` | string | yes | `"bug"` or `"feature"` |
| `source` | string | no | Where the report came from (default `"yappr-api"`) |
| `steps_to_reproduce` | string | no | For bugs |
| `error_message` | string | no | Any error text you captured |
| `call_ids` | string[] | no | Related call ids (up to 20) |
| `reporter_email` | string | no | Contact for follow-up |
| `reporter_context` | string | no | Free-form extra context |

**Response:** `{ "status": "created" }`

Deduplication against open tickets happens server-side and is **intentionally not surfaced** to the caller — every successful report returns `"created"`. There is no `"duplicate"` status; do not branch on one.

(If issue reporting is not configured on the environment, returns `503`.)

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
| `call.dnc_blocked` | Outbound call attempt blocked because the destination is on the company DNC list. No carrier leg, no charge. Fires for both fresh API calls and queued calls that hit DNC at dispatch time. | `direction`, `from_number`, `to_number`, `status`, plus `extra_data: { dnc_reason, dnc_entry_id, queued? }` |
| `transcript.ready` | Transcript saved after call ends (legacy — prefer `call.analyzed`) | `transcript` |
| `call.analyzed` | Full AI pipeline complete: transcript + disposition + summary + extraction | `direction`, `status`, `from_number`, `to_number`, `duration_seconds`, `disposition` (label string or null), `summary`, `transcript`, `extracted_data` (object with agent's extraction parameter values, or absent if none configured) |

**Default recommended set:** `call.no_answer`, `call.failed`, `call.analyzed`

**WARNING — Webhook payloads are minimal.** The `call.analyzed` payload does NOT include:
- The lead object (name, phone, tags, history)
- `metadata` from call creation
- Cost data
- The full disposition object (only the label string is included, and it may be `null` if classification failed)

To get the complete call record including resolved lead + disposition object: `GET /calls/:id`.

**Pattern for getting lead name or CRM IDs in post-call automation:**
- Event webhooks (`call.analyzed` etc.) do NOT include metadata — fetch `GET /calls/:id` after receiving the event to pull the full record including the `metadata` dict you passed at call creation.
- If you need the data in real-time (during the call, not after), use a **tool webhook** instead: it fires synchronously when the agent invokes a tool, and `call_metadata` + `call_variables` are both in the payload (see [Tool Webhook Payload](#tool-webhook-payload)).

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
| POST /tools/:id/test | `tools:update` |
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
| GET /campaigns (list/get/stats/leads) | `campaigns:read` |
| POST /campaigns | `campaigns:manage` |
| PATCH /campaigns/:id | `campaigns:manage` |
| DELETE /campaigns/:id | `campaigns:manage` |
| POST /campaigns/:id/leads | `campaigns:manage` |
| DELETE /campaigns/:id/leads/:leadId | `campaigns:manage` |
| POST /campaigns/:id/launch \| pause \| resume \| stop | `campaigns:manage` |
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
| GET /agents/:id/flow/versions | `flows:read` |
| POST /agents/:id/flow/test | `flows:test` |
| POST /agents/:id/flow/restore | `agents:update` |
| GET /integrations | `integrations:read` |
| DELETE /integrations/:id | `integrations:manage` |
| GET /do-not-call (list/get) | `do_not_call:read` |
| POST /do-not-call | `do_not_call:manage` |
| PATCH /do-not-call/:id | `do_not_call:manage` |
| DELETE /do-not-call/:id | `do_not_call:manage` |
| POST /report-issue | (none) |

---

# Flow agents

A flow agent (`type: "flow"`) is driven by `flow_config` — a graph of nodes — instead of a single `system_prompt`. Both fields are still required for flow agents (the `system_prompt` is the global persona; node `instructions` are per-step). See [`flow-composition-guide.md`](flow-composition-guide.md) for the conceptual guide.

## POST /agents (additive)

Existing endpoint, additive fields:

```jsonc
{
  "type": "flow",                       // 'prompt' (default) or 'flow'; immutable post-create
  "system_prompt": "Required (global persona for the flow)",
  "flow_config": {                      // required when type='flow'; rejected when type='prompt'
    "flow_config_version": "1",
    "nodes": [ /* see schema below */ ]
  },
  "name": "...", "language": "...", "voice": "...",
  /* all existing fields */
}
```

**Validation errors (400):**
- `type='flow'` with null/missing `flow_config` → `"flow_config_required_for_flow_agent"`
- `type='prompt'` with non-null `flow_config` → `"flow_config_only_for_flow_agent"`
- `flow_config` invalid (no start node, dangling next_step_id, duplicate node id) → `"flow_config_invalid"` + details

## PATCH /agents/:id (additive)

Same validation as POST. Plus:
- `type` field is **rejected** in PATCH body (immutable post-create — DB trigger enforces)
- Each `flow_config` change auto-creates a row in `flow_versions` (deduped by SHA-256 content hash)

## flow_config JSON schema

```jsonc
{
  "flow_config_version": "1",
  "nodes": [
    {
      "id": "start",
      "type": "start",
      // For flow agents these OVERRIDE agent.agent_speaks_first +
      // agent.greeting_message. Configure them here, not on the agent.
      "agent_speaks_first": true,
      "greeting": "Greet the caller warmly",
      "is_literal": false,
      "next_step_id": "first_conversation_node_id",
      // Default true (legacy). When false, the greeting is delivered in
      // start-node context only and the first conversation node is entered
      // automatically after the user's first reply — useful when you want
      // a neutral greeting that doesn't blend with node 1's instructions.
      "auto_advance": true
    },
    {
      "id": "ask_name",
      "type": "conversation",
      "name": "Ask for name",
      "instructions": "Politely ask the caller for their full name.",
      "transitions": [
        {
          "id": "got_name",
          "label": "Caller provided their name",
          // REQUIRED, non-empty. The natural-language trigger the voice agent
          // reads at runtime to decide whether to take this path. Phrase it as
          // a user-side signal — what the caller said or implied.
          "description": "Caller stated their full name (first and last) clearly enough to record.",
          "next_step_id": "ask_date"
        },
        {
          "id": "refused",
          "label": "Caller refused",
          "description": "Caller declined to give their name, said they don't want to share it, or asked why you're asking.",
          "next_step_id": "polite_end"
        }
      ]
    },
    {
      // Global conversation node — reachable from any conversation node
      // without an explicit transition edge. The model gets it as an extra
      // candidate transition on every user turn.
      "id": "transfer_to_human",
      "type": "conversation",
      "name": "User asked for a human",
      "instructions": "Acknowledge briefly, then say you're transferring.",
      "is_global": true,
      "global_jump_description": "User explicitly asks to speak to a human / agent / representative",
      "transitions": [
        {
          "id": "do_transfer",
          "label": "Acknowledged",
          "description": "Caller acknowledged the handoff (any short confirmation, e.g. 'okay', 'thanks', 'go ahead').",
          "next_step_id": "transfer_node"
        }
      ]
    },
    {
      "id": "create_event",
      "type": "tool_call",
      "name": "Book the calendar event",
      // tool_call nodes have NO args_template — tool args are owned by the
      // tool's payload_config (static_parameters + extraction_parameters).
      // At call start, the effective tool + config_override becomes a flat
      // model submission schema: one field per extraction parameter, with no
      // nested args wrapper or model-supplied node_id.
      "tool_id": "<tool uuid from /tools>",
      "config_override": {},
      "pre_fire_announcement": true,  // optional bool — plays a short platform-controlled hold tone while the webhook runs. Use for webhooks > ~500 ms.
      "timeout_secs": 30,             // optional number, >0 and ≤600 — hard cap. On timeout → error_next_step_id.
      "transitions": {
        "success_next_step_id": "confirm_node",
        "error_next_step_id": "apologize_node",
        "custom": [
          {
            "id": "no_avail",
            "label": "No availability",
            "jsonpath": "$.available",
            "equals": "false",
            "next_step_id": "suggest_alternatives"
          }
        ]
      }
    },
    {
      "id": "transfer_to_human",
      "type": "transfer",
      "transfer_to": "+972501234567",
      "transfer_message": "Connecting you to our team now."
    },
    {
      "id": "polite_end",
      "type": "end",
      "farewell": "Thanks for your time, goodbye.",
      "is_literal": false
    }
  ]
}
```

**Node types**: `start`, `conversation`, `tool_call`, `integration_call`, `transfer`, `end`. There are no `webhook` or `structured_output` flow nodes — for per-call extraction or webhook delivery, use the agent-level `extraction_parameters` and `webhook_url` / `webhook_events` fields. They apply uniformly to both prompt and flow agents.

**Flow tool schema inheritance:** when a call starts, each `tool_call` resolves its linked tool plus that node's `config_override`. The runtime registers the effective `payload_config.extraction_parameters` as flat named string fields. `required` defaults to `true` and controls which fields must be collected before dispatch. Optional fields do not block the action. Standard metadata and static parameters are runtime-assembled; the model-facing submitter exposes only extraction fields. Payload merge order is standard metadata → static parameters → extracted values, so an extracted value wins a deliberate name collision. Keep names unique unless that override is intentional. The schema is fixed for that live call; tool/config-override edits apply on the next call.

One flow may expose at most **127 unique typed extraction contracts** (the voice model's remaining declaration slots after `pick_transition`). Nodes that reference the same effective tool and extraction schema share a contract; integration arguments participate only when configured as `ai_extract`. A create/update over the limit returns `FLOW_INVALID` with `too_many_extraction_contracts`.

**Terminal rule**: only `end` and `transfer` nodes are allowed to be terminal. Every `conversation`, `tool_call`, and `integration_call` node must have at least one outgoing edge — for `conversation`, that's any transition; for `tool_call` / `integration_call`, the `success_next_step_id` must be wired. Saves that violate this return `terminal_not_allowed` (per offending node) or `no_terminal` (no `end` / `transfer` reachable in the flow at all) under the `FLOW_INVALID` 400 — see "Save validation" below.

**Global nodes**: any `conversation`, `transfer`, or `end` node can carry `is_global: true` + `global_jump_description: "<user-side signal>"`. Global nodes are reachable from any conversation node without explicit edges — the model gets them as extra candidates on every turn (with a "prefer labeled transitions" bias). Use for misclassification recovery and universal escape hatches (transfer-to-human, end-on-DNC). Recommended max ≤3 per flow. The API rejects (400) `is_global` on `start` / `tool_call`, and rejects globals without a non-empty `global_jump_description`. See the flow composition guide for full guidance.

**Tool-call routing (`success` vs `error` vs `custom`)** — deterministic, no LLM, exactly **one** out-edge per fire (mutually exclusive):

1. `error_next_step_id` fires only on hard failures: network timeout, redirect or other non-2xx status, integration disconnected, tool deleted/inactive, missing config.
2. Otherwise dispatcher walks `custom[]` top-to-bottom — first branch whose `jsonpath` extracts a value `==` `equals` (after stringification) wins, **loop returns**, success is NOT also taken.
3. If no custom matched → `success_next_step_id` fires.

Any 2xx is `success` — including soft-fail bodies like `{"available": false}`. The result is injected as a `<tool_result>` block into the next node's LLM context, so a single `success` → conversation node usually handles both "booked" and "no slots" gracefully via prompt instructions. **Reach for `custom[]` only when the next node should be structurally different** (different instructions, different downstream tools).

**JSONPath subset** (root `$` = tool's parsed response body):
- Supported: `$.foo.bar.baz`, `$.list[0].name`, `$.items[2]`
- NOT supported: recursive descent (`$..foo`), wildcards (`$.*`), filter expressions (`$[?(...)]`)
- Missing key / wrong type / out-of-bounds → branch silently does not match → falls through

**Stringification for `equals`** (must match exactly or branch never fires):
- boolean `true` → `"true"` (lowercase, NOT `"True"`)
- boolean `false` → `"false"`
- `null` → `"null"`
- number `42` → `"42"`
- string `"booked"` → `"booked"`

Constraints validated server-side: see "Save validation (`FLOW_INVALID`)" below.

## `integration_call` node

A flow node that calls an OAuth-backed integration directly (Google Calendar, Gmail) without going through the `tools` table. Unlike `tool_call`, the integration config — provider, account, action, args — lives **on the node itself**. The runtime resolves each entry in `args_template` per its declared mode and dispatches against the provider client. Routing semantics are identical to `tool_call`: `success` / `error` / `custom[]`, deterministic, exactly one out-edge per fire, no LLM involved.

**Use this when** the action is a first-class capability of a managed integration (book a calendar event, send an email). **Use `tool_call`** for anything that's a custom webhook, a system action, or a tool you already have in the `tools` table.

### `args_template` — the 2-mode `ArgValue` union

Every entry in `args_template` is an `ArgValue` — a discriminated union with two writable shapes plus a string shorthand for literals:

```jsonc
{
  "args_template": {
    // 1) literal — bare string is shorthand for {mode:'literal', value:...}
    //    Bare strings can also contain mustache tokens (see Token interpolation).
    "subject": "Your appointment is booked",

    // 2) literal — explicit form (use when you want to be unambiguous)
    "html": { "mode": "literal", "value": "false" },

    // 3) ai_extract — the live agent runtime extracts this arg from the
    //    conversation right before the action fires. The runtime decides
    //    which utterance the slot binds to using `description`.
    "to": { "mode": "ai_extract",
            "description": "Caller's email address as they spelled it out" },

    // Tokens work inside any string value:
    //   - {{node.arg}}       — value from an earlier integration_call node's
    //                          ai_extract slot
    //   - {{metadata.key}}   — built-in or user-declared per-call metadata
    "start_time": { "mode": "literal",
                    "value": "{{collect_slot.start_iso}}" },
    "body":       { "mode": "literal",
                    "value": "Thanks! We'll call you back at {{metadata.user_number}}." }
  }
}
```

**Mode rules:**
- `literal` — value is sent as-is after token interpolation. Bare-string shorthand is equivalent to `{mode:'literal', value:'<the string>'}`.
- `ai_extract` — runtime fills the slot from the conversation. `description` is required (used to guide extraction). The `description` itself is also token-interpolated, so you can splice prior context into the extraction prompt.

#### Token interpolation

Both `literal.value` and `ai_extract.description` strings are scanned for mustache tokens at dispatch time. Two namespaces:

- `{{<node_id>.<arg_name>}}` — value an earlier node AI-extracted from the conversation. Both `integration_call` AND `tool_call` source nodes are addressable:
  - **integration_call source** — the referenced arg must be declared in `ai_extract` mode in that node's `args_template`.
  - **tool_call source** — the referenced arg must be the `name` of an entry in the linked tool's `config.payload_config.extraction_parameters`. All extraction_parameters are AI-extracted at runtime by definition, so any of them can be referenced.

  The referenced node must exist in the same flow. Save-time validation doesn't double-check tool_call arg names (they live on the tool config, not on the flow_config visible to the save validator), so a typo renders to empty string at runtime — design an `error` branch on the downstream node.
- `{{metadata.<key>}}` — per-call metadata. Built-in keys (always available):

  | Key | Value |
  |-----|-------|
  | `id` | The call id (matches `GET /calls/:id`). |
  | `direction` | `"inbound"`, `"outbound"`, or `"web"`. |
  | `agent_number` | The platform's leg of the call (number we own). Direction-aware. |
  | `user_number` | The human's leg. Direction-aware. |
  | `agent_name` | Agent display name. |

  Plus any **user-declared custom keys** listed in `flow_config.metadata.custom_metadata_keys: string[]`. Custom keys are sourced from the `metadata` dict passed at call dispatch (`POST /calls body.metadata`).

Direction details: for inbound calls the caller is the user and the callee is the agent; for outbound the caller is the agent. The `agent_number` / `user_number` derivation hides this so you don't have to special-case direction.

**Missing metadata keys resolve to an empty string at runtime** — they are NOT a save-time error. The caller is responsible for passing the value at call time. Save-time validation only catches dangling `{{node.arg}}` references where the referenced node or arg doesn't exist or isn't in `ai_extract` mode (`args_template_dangling_reference`).

**Reserved metadata keys** — the five built-in tokens (`id`, `direction`, `agent_number`, `user_number`, `agent_name`) are platform-supplied. Callers cannot override them; supplying any reserved key in `POST /calls body.metadata` (or `web-call body.metadata`) returns `400 INVALID_METADATA_RESERVED_KEY`. Pick different names for custom keys (e.g. `customer_email`, `appointment_id`).

#### AI extraction at runtime

When a `tool_call` or `integration_call` node enters and one of its required args has no value yet (slot empty, or `description` references slots that resolve empty), the runtime pauses the action and asks the user for the missing piece — using each missing arg's `description` as guidance for what to ask. This is conversational, not a form: the agent phrases the question itself, listens for the answer, then fires the action automatically once it has everything. For webhook tools, `extraction_parameters[].required` defaults to `true`; set it to `false` for a field that may be omitted without blocking dispatch.

- **Up to 3 retry turns.** If the user dodges, the agent re-asks (in fresh language). After 3 failed attempts, the node routes to its `error_next_step_id` with `missing_required_args_after_3_attempts: <arg names>`.
- **Cached for the duration of the call.** Once extracted, an arg's value persists in slot storage and is available to any downstream `{{<node_id>.<arg_name>}}` token. Re-entering the same node (e.g. a loop) reuses the cached value rather than re-asking.
- **Always wire an `error` branch.** Even on simple flows. A stubborn caller, a misheard phrase, or an arg that the conversation never naturally surfaces will all route here.
- **Tip:** write `description` fields like prompts to the AI, not labels. `"Caller's email, spelled out one character at a time"` extracts more reliably than just `"email"`.

### Node shape

```jsonc
{
  "id": "book_event",
  "type": "integration_call",
  "name": "Book the calendar event",      // optional display label
  "position": { "x": 480, "y": 240 },     // optional UI-only

  "provider": "google_calendar",          // 'google_calendar' | 'gmail' — locked at creation
  "integration_id": "<uuid>",             // FK to integrations.id, must be active in caller's company
  "action": "create_event",               // provider-scoped — see catalog below
  "args_template": {                      // ArgValue union, see above
    "summary": "Consultation booking",
    "start_time": { "mode": "ai_extract",
                    "description": "ISO-8601 start time the caller agreed on" },
    "end_time":   { "mode": "ai_extract",
                    "description": "ISO-8601 end time, 30 minutes after start" }
  },
  "pre_fire_announcement": true,  // optional bool — plays a short platform-controlled hold tone the moment this node fires, so the caller doesn't sit in silence while the action runs. Stops automatically when the action returns. Recommended for create_event / send_email / network-bound actions; skip for check_availability (which is fast). Tone is NOT configurable.
  "timeout_secs": 30,             // optional number, >0 and ≤600 — explicit hard cap. On timeout the action is cancelled and the node routes to error_next_step_id with `tool_timeout_after_<N>s`. When omitted, webhook nodes use effective config.timeout_seconds + 1s dispatch overhead; other tool/integration nodes default to 30s.

  "transitions": {
    "success_next_step_id": "confirm_booked",
    "error_next_step_id":   "apologize_and_handoff",
    "custom": [
      { "id": "no_avail", "label": "No availability",
        "jsonpath": "$.available", "equals": "false",
        "next_step_id": "suggest_alternatives" }
    ]
  }
}
```

`is_global` is **not** allowed on `integration_call` (same rule as `tool_call`).

### Action catalog

**`google_calendar`:**

| Action | Required args | Optional args |
|---|---|---|
| `create_event` | `summary`, `start_time`, `end_time` | `attendees`, `description`, `location`, `calendar_id`, `time_zone` |
| `list_events` | — | `time_min`, `time_max`, `max_results`, `query`, `calendar_id`, `time_zone` |
| `check_availability` | `start_time`, `end_time` | `calendar_id`, `time_zone` |
| `cancel_event` | `event_id` | — |

`calendar_id` accepts a Google calendar id or `"primary"` (default). `cancel_event` does not expose `calendar_id` — the runtime auto-resolves which calendar a given event lives on (tries `primary` first, scans the user's other writable calendars on 404). `time_zone` is an IANA name (`"Asia/Jerusalem"`); when set, Google's response is pinned to that zone and the event being created is stamped with it. When blank, the calendar's default timezone is used.

#### Calendar response post-processing — what the agent sees

Calendar action responses (`create_event`, `list_events`, `check_availability`) are post-processed before the voice agent receives them, because the voice model's ISO 8601 parser handles timezone offsets unreliably. The runtime:

1. Strips the offset and seconds from each event's `start.dateTime` / `end.dateTime`, leaving wall-clock format (`"2026-05-10 16:30"`).
2. Removes the per-event `start.timeZone` / `end.timeZone` fields (otherwise Live can mis-read "16:30 Asia/Jerusalem" as a re-projection target and re-introduce the bug).
3. Adds a top-level `timeZone` + `timeZone_note` ("Event times below are wall-clock values in `<tz>` …") so Live has one explicit anchor.

The `<tz>` quoted in the note is whatever you passed in `time_zone`, or — if blank — whatever timezone Google returned (the calendar's primary). The agent never sees raw ISO offsets for these actions.

The flow agent sees only the sanitized version, and new call events retain that same user-facing view in `response_preview`. The untouched Google payload is not stored a second time. `raw_response_preview` remains nullable so historical rows created before this minimization stay readable.

**`gmail`:**

| Action | Required args | Optional args |
|---|---|---|
| `send_email` | `to`, `subject`, `body` | `html`, `cc`, `bcc` |

`start_time` / `end_time` are ISO-8601 strings. `attendees`, `to`, `cc`, `bcc` accept a single email or an array.

### Example — Calendar `create_event`

```jsonc
{
  "id": "create_event",
  "type": "integration_call",
  "name": "Book the calendar event",
  "provider": "google_calendar",
  "integration_id": "8c2b1e1a-7c4d-4e1f-9a2b-3c4d5e6f7a8b",
  "action": "create_event",
  "args_template": {
    "summary":     { "mode": "ai_extract",
                     "description": "Caller's full name plus 'consultation'" },
    "start_time":  { "mode": "ai_extract",
                     "description": "ISO-8601 start time the caller agreed on" },
    "end_time":    { "mode": "ai_extract",
                     "description": "ISO-8601 end time, 30 minutes after start" },
    "attendees":   { "mode": "ai_extract",
                     "description": "Caller's email address as a single-element array" },
    "description": "Booked via inbound call"
  },
  "pre_fire_announcement": true,
  "transitions": {
    "success_next_step_id": "confirm_booked",
    "error_next_step_id":   "apologize_and_handoff"
  }
}
```

### Example — Gmail `send_email` reusing values via tokens

The recipient was already extracted by an earlier `create_event` node — splice it through with a `{{create_event.attendees}}` token instead of asking the caller again. The `cc` field references the call's `user_number` via the `metadata` namespace (e.g. include the phone number in the support context line).

```jsonc
{
  "id": "send_confirmation",
  "type": "integration_call",
  "name": "Send confirmation email",
  "provider": "gmail",
  "integration_id": "1d4e2f3a-9c8b-4d6e-8f1a-7b2c3d4e5f6a",
  "action": "send_email",
  "args_template": {
    "to":      { "mode": "literal", "value": "{{create_event.attendees}}" },
    "subject": "Your appointment is booked",
    "body":    { "mode": "ai_extract",
                 "description": "Short confirmation paragraph including the agreed time and a thank-you" },
    "cc":      { "mode": "literal", "value": "{{metadata.user_number}}" }
  },
  "pre_fire_announcement": true,
  "transitions": {
    "success_next_step_id": "polite_end",
    "error_next_step_id":   "apologize_and_collect_email_manually"
  }
}
```

### Validation rules specific to `integration_call`

- `provider` must be `google_calendar` or `gmail`. Anything else fails at zod parse → `schema_invalid`.
- `action` must be in the catalog for the chosen `provider`. Missing or unknown → `action_invalid`.
- `integration_id` is required → `integration_id_missing` if absent.
- `integration_id` must reference an `active` row in the caller's company `integrations` table whose `provider` matches the node's `provider`. Otherwise → `integration_not_in_company`.
- `success_next_step_id` must be wired → `success_not_wired` if absent.
- `provider` is locked at creation. To switch from Calendar to Gmail, delete the node and recreate.
- Every required arg in the action's catalog must be present in `args_template` with a non-empty value, or in `ai_extract` mode → `args_template_missing_required` otherwise.
- Every `ai_extract` arg must have a non-empty `description` → `args_template_missing_description` otherwise.
- Every `{{node.arg}}` token in any `literal.value` or `ai_extract.description` must resolve to an existing node in the flow. If the source is an `integration_call` node, the referenced arg must be declared in `ai_extract` mode in that node's `args_template`; otherwise → `args_template_dangling_reference`. `tool_call` source nodes are also accepted but the validator doesn't verify the arg name (it lives on the tool config, not the flow_config). `{{metadata.key}}` tokens are likewise NOT validated at save time — missing values render to empty string at runtime in both cases.

The result of a successful action is injected as a `<tool_result>` block into the next node's LLM context — same as `tool_call`. So a single `success` → conversation node usually handles both happy-path and soft-fail outcomes naturally; reach for `custom[]` only when the **next node** needs to be structurally different.

## Save validation (`FLOW_INVALID`)

Saves to `POST /agents` (with `flow_config`) or `PATCH /agents/:id` (with `flow_config`) run a full graph validator. Any failure returns:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "FLOW_INVALID",
  "issues": [
    { "node_id": "create_event", "code": "integration_id_missing",
      "message": "integration_call node requires integration_id" },
    { "node_id": "ask_date",     "code": "terminal_not_allowed",
      "message": "conversation node has no outgoing transitions" }
  ]
}
```

Fix every entry in `issues` and re-save — the API returns all problems at once, not just the first one.

| Code | Applies to | Meaning |
|------|-----------|---------|
| `no_start` | flow | No `start` node found. |
| `multiple_starts` | flow | More than one `start` node. |
| `start_unwired` | start | `start.next_step_id` missing. |
| `instructions_missing` | conversation | Empty/absent `instructions`. |
| `transition_description_missing` | conversation | A transition has an empty/absent `description`. Every transition needs a non-empty natural-language trigger so the voice agent can decide when to take this path. |
| `tool_id_missing` | tool_call | `tool_id` missing. |
| `integration_id_missing` | integration_call | `integration_id` missing. |
| `action_invalid` | integration_call | `action` is missing, empty, or not in the catalog for the chosen `provider`. |
| `success_not_wired` | tool_call, integration_call | No `success_next_step_id`. |
| `transfer_to_missing` | transfer | No `transfer_to` configured. |
| `terminal_not_allowed` | conversation, tool_call, integration_call | Node has no outgoing edge. **Only `end` and `transfer` nodes may be terminal.** |
| `no_terminal` | flow | No `end` or `transfer` node reachable from `start`. |
| `unreachable_node` | any | Node exists but no path from `start` reaches it. |
| `unknown_target_node` | any with edges | An edge's `next_step_id` doesn't match any node id. |
| `schema_invalid` | any | Zod parse failure (unknown enum value, wrong type, etc.) — applies to invalid `provider` and other shape errors. |
| `integration_not_in_company` | integration_call | `integration_id` doesn't exist, isn't `active`, belongs to another company, or its provider doesn't match the node's `provider`. |
| `args_template_missing_required` | integration_call | A required arg for the action is absent from `args_template` (or present but in literal mode with an empty value). |
| `args_template_missing_description` | integration_call | An arg in `ai_extract` mode is missing the `description` field. |
| `args_template_dangling_reference` | integration_call | A `{{node.arg}}` token references a node id that doesn't exist in the flow, an arg that doesn't exist on that node, or an arg that is not declared in `ai_extract` mode. (Note: `{{metadata.key}}` tokens are NOT validated at save time — missing metadata at runtime resolves to empty string.) |

## GET /agents/:id/flow/versions

Paginated list of flow snapshots (every save creates one, deduped by content hash).

```bash
curl "https://api.goyappr.com/agents/<agent_id>/flow/versions?limit=10" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

Response:
```jsonc
{
  "data": [
    {
      "id": "uuid",
      "agent_id": "uuid",
      "content_hash": "<sha-256>",
      "created_at": "...",
      "created_by_email": "user@example.com"
    }
  ],
  "next_cursor": "iso-timestamp"
}
```

## POST /agents/:id/flow/restore

Restore a flow agent's `flow_config` to a previously-saved version. Useful when a change broke the flow and you want to revert without rebuilding by hand.

```bash
curl -X POST "https://api.goyappr.com/agents/<agent_id>/flow/restore" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "version_id": "<id from /agents/:id/flow/versions>" }'
```

Required scope: `agents:update`.

Behavior:
- Replaces `agents.flow_config` with the version's stored content.
- Snapshots a new `flow_versions` row (deduped — restoring to the current head is a no-op).
- Returns the updated agent (same shape as `GET /agents/:id`).

Constraints:
- Agent must be a flow agent (`type='flow'`); restoring on a prompt agent returns 400.
- `version_id` must reference a row whose `agent_id` matches the URL — cross-agent ids return 404.

Workflow: list versions with `GET /agents/:id/flow/versions`, pick the `id` of the target version, POST it here.

## POST /agents/:id/flow/test

Hermetic simulator — does NOT write `call_logs`, does NOT call real tools. CI-safe.

```jsonc
// Request
{
  "transcript": [
    { "role": "agent", "text": "Hi, can you make it?" },
    { "role": "user",  "text": "Yes I'll be there with 4 guests" }
  ],
  "mock_tool_results": {
    "create_event": { "result": { "id": "evt_123" } }
  }
}
```

Response:
```jsonc
{
  "trace": [
    { "step_id": "ask_attendance", "kind": "enter" },
    { "step_id": "ask_attendance", "kind": "eval", "decision": "got_yes" },
    { "step_id": "create_event",   "kind": "tool_mock", "result": { "id": "evt_123" } },
    { "step_id": "polite_end",     "kind": "enter" }
  ],
  "named_results": { "summary": { "guest_count": 4 } },
  "slot_values": { /* whatever your flow accumulated */ },
  "ended_at_step_id": "polite_end"
}
```

v1 of the test simulator uses a deterministic keyword-overlap heuristic for transition selection (free, fast, CI-safe) — it does not invoke the production routing LLM. Use the simulator for smoke testing flow logic; for measuring real conversational behavior, run a live test call.

---

# Integrations (OAuth-backed)

OAuth-backed third-party integrations available to **flow agents only**. v1: Google Calendar, Gmail.

**Connecting credentials is dashboard-only.** The OAuth handshake (popup → Google consent → callback → token persistence) lives in the Yappr dashboard's Integrations page; the public API does not expose a connect endpoint. The customer connects each Google account once via the dashboard, then drives the rest of the lifecycle (listing, revoking, referencing in flows) through this API.

## GET /integrations

```bash
curl "https://api.goyappr.com/integrations?provider=google_calendar" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

Response:
```jsonc
{
  "data": [
    {
      "id": "uuid",
      "provider": "google_calendar",
      "account_label": "team@yourcompany.com",
      "scopes": ["https://www.googleapis.com/auth/calendar", "openid", "email"],
      "status": "active",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

The response includes ONLY the fields shown above. Encrypted access/refresh tokens are never returned. Internal operational metadata (last refresh diagnostics, error counts) is also withheld — if you need any of that surfaced, request a named field.

Filter by `?provider=google_calendar` or `?provider=gmail`. Soft-deleted rows are excluded.

## DELETE /integrations/:id

```bash
curl -X DELETE "https://api.goyappr.com/integrations/<id>" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

Best-effort revoke at Google + soft-delete row + erase encrypted tokens, token expiry, granted scopes, the connected-account label, and provider identity metadata. Generic provider/status/timestamps remain for audit. Returns 204.

The row is soft-deleted (not removed) because past `flow_versions` may still reference its `id`. Calls placed against active flow agents that reference a disconnected integration hit the integration-call node's `error` transition with a structured `integration_disconnected` result.

To connect a Google account again, complete the OAuth flow from the dashboard. Because the previous identity fields were erased, the new connection gets a new credential id; update active `integration_call` nodes that referenced the disconnected id.

---

# Agent Eval

Programmatic regression testing for voice agents. A test "caller" (persona LLM) talks to your agent (production agent LLM); the conversation is scored against assertions you wrote. No phone numbers, no carrier minutes — just LLM tokens.

Four pieces:
- **Persona** (`/agent-eval/personas`) — reusable caller archetype
- **Case** (`/agent-eval/cases`) — persona + agent + scenario + success criteria
- **Suite** (`/agent-eval/suites`) — bundle of cases run together
- **Run** (`/agent-eval/runs`) — execution result (transcript, score, cost)

For the conceptual deep-dive open [`agent-eval-guide.md`](agent-eval-guide.md). The endpoint reference below is the source of truth for request/response shapes.

**Pricing** (user-facing rate card, charged via the `eval_run_charge` transaction type):

| Role | Input | Output |
|---|---|---|
| Agent | $2 / 1M tokens | $10 / 1M tokens |
| Persona | $1 / 1M tokens | $4 / 1M tokens |

**Webhooks**: eval runs do **not** emit webhooks (`agent_eval.*` is not a valid `webhook_events` value — POST/PATCH /agents reject it with 400). Poll `GET /agent-eval/runs/:id`, or `GET /agent-eval/suites/:suite_id/runs/:suite_run_id` for suite aggregates.

---

## GET /agent-eval/personas

List non-deleted personas for the authenticated company.

**Scopes:** `agent_eval:read`

**Query params:** `limit`, `offset`

**Response:**
```jsonc
{
  "data": [
    {
      "id": "uuid",
      "company_id": "uuid",
      "name": "Frustrated tenant",
      "description": null,
      "identity_prompt": "You are a 38-year-old tenant calling about a leaking pipe...",
      "behavior_traits": {
        "patience": "low",
        "verbosity": "chatty",
        "cooperation": "cooperative",
        "interruption_tendency": "occasional",
        "goal": "Get a maintenance technician scheduled today"
      },
      "language": "en",
      "voice_config": {},
      "created_at": "2026-05-07T08:00:00Z",
      "updated_at": "2026-05-07T08:00:00Z",
      "deleted_at": null
    }
  ],
  "pagination": { "total": 1, "limit": 20, "offset": 0, "has_more": false }
}
```

---

## POST /agent-eval/personas

Create a persona.

**Scopes:** `agent_eval:create`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Short label |
| `description` | string | no | One-line summary |
| `identity_prompt` | string | yes | Second-person prompt ("You are…"). Keep under ~120 words. |
| `behavior_traits` | object | no | Free-form JSON. Common keys: `patience`, `verbosity`, `cooperation`, `interruption_tendency`, `goal`, `accent`. |
| `language` | "he" \| "en" | no (default "en") | Match the agent under test |
| `voice_config` | object | no | Forward-compat for v2 voice loopback. Ignored in text mode. |

**Returns:** `201` — full `EvalPersona` object.

---

## GET /agent-eval/personas/:id

**Scopes:** `agent_eval:read`. Returns the persona row or 404.

---

## PATCH /agent-eval/personas/:id

Send only the fields you want to change. **Scopes:** `agent_eval:update`. Returns the updated row.

---

## DELETE /agent-eval/personas/:id

Soft-delete (sets `deleted_at`). **Scopes:** `agent_eval:delete`. Existing cases referencing this persona keep working until you PATCH them onto a different persona.

---

## GET /agent-eval/cases

List non-deleted cases for the company. Filterable by `agent_id`, `persona_id`, `suite_id`. The `agent` and `persona` are expanded inline (full objects, not summaries — same convention as `GET /calls/:id`'s `disposition` and `lead`).

**Scopes:** `agent_eval:read`

**Response shape:**
```jsonc
{
  "data": [
    {
      "id": "uuid",
      "company_id": "uuid",
      "agent_id": "uuid",
      "agent": { /* full agent object — same shape as GET /agents/:id */ },
      "persona_id": "uuid",
      "persona": { /* full persona object */ },
      "suite_id": "uuid|null",
      "name": "Yes path — agreement on first ask",
      "description": null,
      "scenario": "The persona is responding to a missed call from your business about their recent inquiry...",
      "success_criteria": [
        { "kind": "must_say", "phrase": "Tuesday at 3pm", "match_type": "substring", "case_sensitive": false, "weight": 1 },
        { "kind": "must_call_tool", "tool_name": "bookAppointment", "weight": 2 },
        { "kind": "must_not_say", "phrase": "guarantee", "weight": 1 }
      ],
      "max_turns": 20,
      "pass_threshold": 80,
      "agent_overrides": null,
      "tool_policy": "mock",
      "tool_allowlist": [],
      "created_at": "2026-05-07T08:10:00Z",
      "updated_at": "2026-05-07T08:10:00Z",
      "deleted_at": null
    }
  ],
  "pagination": { "total": 1, "limit": 20, "offset": 0, "has_more": false }
}
```

---

## POST /agent-eval/cases

Create a case.

**Scopes:** `agent_eval:create`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | |
| `description` | string | no | |
| `agent_id` | uuid | yes | Must reference a non-deleted agent in this company |
| `persona_id` | uuid | yes | Must reference a non-deleted persona |
| `suite_id` | uuid \| null | no | Omit / null for an ad-hoc case (still runnable) |
| `scenario` | string | yes | Free-form paragraph framing the persona's situation |
| `success_criteria` | Assertion[] | no | See "Assertion shapes" below |
| `max_turns` | int (1-100) | no (default 20) | Hard cap on turns; hitting it terminates with `termination_reason='max_turns'` |
| `pass_threshold` | number (0-100) | no (default 80) | Weighted-score threshold for `pass_fail=true` |
| `agent_overrides` | object \| null | no | Per-case overrides applied to the agent's saved config at run time |
| `tool_policy` | "mock" \| "real" \| "allowlist" | no (default "mock") | See "Tool policy" below |
| `tool_allowlist` | string[] | no | Tool names that fire for real when `tool_policy='allowlist'` |

### Assertion shapes

```jsonc
{ "kind": "must_say",          "phrase": "Tuesday at 3pm", "match_type": "substring", "case_sensitive": false, "weight": 1 }
{ "kind": "must_say",          "phrase": "^thanks for calling.+",  "match_type": "regex",     "case_sensitive": false, "weight": 1 }
{ "kind": "must_not_say",      "phrase": "guarantee",                                                                  "weight": 1 }
{ "kind": "must_call_tool",    "tool_name": "bookAppointment",                                                          "weight": 2 }
{ "kind": "must_reach_node",   "node_id": "confirm_booking",                                                            "weight": 1 }
{ "kind": "custom_llm_judge",  "rubric": "The agent must offer at least two alternative dates if the first is declined.","weight": 2 }
```

Score formula: `score = sum(weight * passed?1:0) / sum(weight) * 100`. `must_reach_node` is only meaningful for flow agents.

### Tool policy

| Policy | Behaviour |
|---|---|
| `mock` (default) | All tools return synthetic success results. Free, deterministic — the right choice for CI. |
| `real` | Tools fire for real. Charges real third-party costs (e.g. real calendar holds). |
| `allowlist` | Tools listed in `tool_allowlist` (camelCase names) fire for real, the rest mock. |

**Returns:** `201` — full `EvalCase` with expanded `agent` + `persona`.

---

## GET /agent-eval/cases/:id

**Scopes:** `agent_eval:read`. Returns the case with `agent` + `persona` expanded.

---

## PATCH /agent-eval/cases/:id

**Scopes:** `agent_eval:update`. Send only fields you want to change. `agent_id`, `persona_id`, and `suite_id` are all patchable — each is re-validated for company ownership when provided (a foreign id returns 404). Repointing a case keeps its existing run history.

---

## DELETE /agent-eval/cases/:id

**Scopes:** `agent_eval:delete`. Soft-delete. Past runs are preserved.

---

## GET /agent-eval/suites

**Scopes:** `agent_eval:read`. List non-deleted suites.

---

## POST /agent-eval/suites

**Scopes:** `agent_eval:create`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | |
| `description` | string | no | |
| `agent_id` | uuid \| null | no | Optional default agent for cases added to the suite (per-case `agent_id` always wins) |
| `parallelism` | int (1-16) | no (default 1) | Max concurrent cases when the suite runs |

**Returns:** `201` — full `EvalSuite`.

---

## GET /agent-eval/suites/:id, PATCH, DELETE

Standard CRUD — same scope conventions as cases. DELETE soft-deletes the suite (sets `deleted_at`). Contained cases keep their `suite_id` and are unaffected — they are NOT auto-converted to ad-hoc, and filtering cases by that `suite_id` still returns them. PATCH a case to `suite_id: null` if you want it to become ad-hoc.

---

## POST /agent-eval/suites/:id/run

Run every case under the suite. Returns immediately.

**Scopes:** `agent_eval:run`

**Body:**
```jsonc
{
  "agent_overrides": null  // optional — applied to every spawned run on top of each case's own overrides
}
```

**Response (202):**
```jsonc
{
  "suite_run_id": "uuid",   // groups the spawned runs
  "run_ids": ["uuid", "uuid", ...]
}
```

**Errors:**
- 400 — suite has no cases

There is no synchronous 402 here either — the run handler does not check balance before enqueueing. Insufficient balance surfaces asynchronously: the worker marks the affected run `status=failed` with a code in its `error` field. Discover it by polling.

To check progress, poll `GET /agent-eval/suites/:suite_id/runs/:suite_run_id` for the aggregate (recommended) or `GET /agent-eval/runs?suite_run_id=<value>` for the raw run rows. There are no webhooks for eval runs — polling is the only mechanism.

---

## GET /agent-eval/suites/:suite_id/runs

List past executions of one suite, newest-first. Each entry is an aggregate roll-up — fetch a single execution's per-run details with `GET /agent-eval/suites/:suite_id/runs/:suite_run_id`.

**Scopes:** `agent_eval:read`

**Response (200):** `{ "data": [SuiteRunSummary, ...] }` — each summary has the same shape as the per-execution endpoint below, minus the `runs` array.

---

## GET /agent-eval/suites/:suite_id/runs/:suite_run_id

Aggregate view of one suite execution. Computed on demand from the runs grouped by `suite_run_id`. Hit this every few seconds; once `in_flight === 0` the metrics are final.

**Scopes:** `agent_eval:read`

**Response (200):**
```jsonc
{
  "suite_run_id": "uuid",
  "suite_id": "uuid",
  "started_at": "ISO timestamp | null",  // earliest started_at across runs
  "ended_at": "ISO timestamp | null",    // latest ended_at — null until in_flight === 0
  "total_runs": 10,
  "completed": 8,                   // status = "completed"
  "in_flight": 2,                   // status in ("queued","running")
  "cancelled": 0,                   // status = "cancelled"
  "passed": 7,                      // completed and pass_fail = true
  "failed": 1,                      // completed and pass_fail = false
  "score_avg": 84.2,                // mean of completed.score (null if 0 completed)
  "pass_rate": 0.875,               // passed / completed (null if 0 completed)
  "total_cost_cents": 73,           // sum across all runs
  "runs": [EvalRun, ...]            // each individual run — FLAT columns only (case_id, agent_id, persona_id). case / agent / persona are NOT expanded here. To resolve a failing case's name, look it up via GET /agent-eval/cases or the run's own GET /agent-eval/runs/:id.
}
```

**Errors:** 400 (invalid uuid), 404 (no runs found for that suite_run_id).

---

## POST /agent-eval/cases/:case_id/run

Run a single case ad-hoc. Blocks up to 60 seconds waiting for the run to fully finish (worker assertions + billing complete).

**Scopes:** `agent_eval:run`

**Body** (all fields optional):
```jsonc
{
  "agent_overrides": null  // optional per-run overrides applied on top of the case's own overrides
}
```

**Response:** Both bodies carry the **flat** run row (RUN_SELECT columns including `score`, `pass_fail`, `evaluation`, and the cost columns) — `case_id` is present but `case` / `agent` / `persona` are **NOT** expanded on this endpoint. To get the expanded objects, `GET /agent-eval/runs/:id`.
- **`200`** — run finished within the 60s window. `score`, `pass_fail`, `evaluation`, and the cost columns are final.
- **`202`** — still running after 60s. Body is the latest non-terminal run row. Keep polling `GET /agent-eval/runs/:id` until both `status` is terminal AND `queue_status === "done"`.

**Errors:** 400 (validation), 404 (case not found). There is no synchronous 402 — insufficient balance surfaces asynchronously as `status=failed` with a code in the run's `error` field (discovered by polling).

---

## GET /agent-eval/runs

Cross-cutting list of past runs across all cases / suites. Newest-first. Filterable.

**Scopes:** `agent_eval:read`

**Query params:**

| Param | Type | Notes |
|---|---|---|
| `case_id` | uuid | Filter by parent case |
| `suite_id` | uuid | Filter by parent suite |
| `suite_run_id` | uuid | Filter by suite execution (the value returned from `POST /suites/:id/run`) |
| `status` | enum | `queued` \| `running` \| `completed` \| `failed` \| `cancelled` |
| `limit` | int | default 20, max 100 |
| `offset` | int | |

**Response shape:** `{ data: EvalRun[], pagination: {...} }`. `case` (and the nested `agent` + `persona`) is expanded inline on each run.

---

## GET /agent-eval/runs/:id

Returns the full run, with `case` (and nested `agent` + `persona`) expanded inline.

**Scopes:** `agent_eval:read`

**Run row:**
```jsonc
{
  "id": "uuid",
  "company_id": "uuid",
  "case_id": "uuid",
  "case": { /* full case with agent + persona */ },
  "suite_id": "uuid|null",
  "suite_run_id": "uuid|null",
  "status": "completed",
  "mode": "text",
  "agent_id": "uuid",
  "persona_id": "uuid",
  "started_at": "2026-05-07T08:11:00Z",
  "ended_at":   "2026-05-07T08:11:34Z",
  "duration_ms": 34200,
  "score": 87.5,
  "pass_fail": true,
  "termination_reason": "agent_ended",
  "evaluation": {
    "score": 87.5,
    "pass_fail": true,
    "results": [
      { "assertion": { "kind": "must_say", "phrase": "Tuesday at 3pm", "weight": 1 }, "passed": true, "weight": 1, "reason": "matched at turn 7" }
    ]
  },
  "agent_input_tokens": 4200,
  "agent_output_tokens": 1100,
  "persona_input_tokens": 3800,
  "persona_output_tokens": 900,
  "agent_cost_cents": 2,
  "persona_cost_cents": 1,
  "total_cost_cents": 3,
  "error": null,
  "agent_overrides": null,
  "created_at": "2026-05-07T08:10:55Z"
}
```

---

## GET /agent-eval/runs/:id/turns

Append-only ordered list of turns. **Scopes:** `agent_eval:read`.

```jsonc
{
  "data": [
    { "id": "uuid", "run_id": "uuid", "turn_number": 0, "role": "persona", "text": "Hi, I got a missed call from this number?", "input_tokens": 120, "output_tokens": 18, "cost_cents": 1, "latency_ms": 880, "created_at": "..." },
    { "id": "uuid", "run_id": "uuid", "turn_number": 1, "role": "agent",   "text": "Hi! Thanks for calling back...",            "input_tokens": 540, "output_tokens": 32, "cost_cents": 1, "latency_ms": 1100, "created_at": "..." },
    { "id": "uuid", "run_id": "uuid", "turn_number": 2, "role": "tool_result", "text": null, "tool_calls": null, "flow_event": null, "input_tokens": 0, "output_tokens": 0, "cost_cents": 0, "latency_ms": null, "created_at": "..." },
    { "id": "uuid", "run_id": "uuid", "turn_number": 3, "role": "flow_event", "text": null, "flow_event": { "type": "flow_eval_decision", "step_id": "ask_date", "decision": "got_date", "valid": true }, "created_at": "..." }
  ]
}
```

---

## GET /agent-eval/runs/:id/evaluation

Just the assertion roll-up (`evaluation`, `score`, `pass_fail`, `termination_reason`, `status`). **Scopes:** `agent_eval:read`.

This endpoint always returns `200` (or `404` if the run id is unknown) — there is **no** in-flight 422 guard. While the run is still running, `evaluation`/`score`/`pass_fail` come back `null`. Don't treat this call as a readiness signal: gate CI on `GET /agent-eval/runs/:id` reaching a terminal `status` AND `queue_status === "done"`, then read the values.

```bash
curl "https://api.goyappr.com/agent-eval/runs/$RUN_ID/evaluation" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '.pass_fail'   # null until the run is terminal
```

---

## POST /agent-eval/runs/:id/cancel

Best-effort cancel. **Scopes:** `agent_eval:run`.

If the worker has not yet claimed the run, it transitions to `cancelled` immediately and is never executed. If the worker already started it, the cancellation is signalled and the voice runtime terminates at the next turn boundary with `termination_reason='cancelled'`. Cancelled runs are still billed for any turns produced before the cancel signal landed.

Returns the updated run object. **400** if the run is already in a terminal state (status not `queued`/`running`) — message `Cannot cancel run in status "<status>". Only queued/running runs can be cancelled.`

---

# Billing Consumption

## GET /billing/consumption

Aggregated debits from your credit account, bucketed by date and product.

**Scopes:** `billing:read`

**Query params:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `from` | ISO8601 | now - 30d | Start of window |
| `to` | ISO8601 | now | End of window (exclusive) |
| `group_by` | "day" \| "month" \| "total" \| "agent" | "day" | Bucket granularity |
| `product` | enum | (all) | `voice_call` \| `eval_run` \| `phone_number` \| `topup` \| `refund` |
| `include_topups` | bool | false | Include positive credit purchases |

**Response:**
```jsonc
{
  "from": "2026-04-07T00:00:00Z",
  "to":   "2026-05-07T00:00:00Z",
  "group_by": "day",
  "data": [
    { "period": "2026-05-06", "product": "voice_call", "total_amount_cents": 1240, "count": 18 },
    { "period": "2026-05-06", "product": "eval_run",   "total_amount_cents": 12,   "count": 47 },
    { "period": "2026-05-07", "product": "voice_call", "total_amount_cents": 980,  "count": 14 }
  ]
}
```

When `group_by=agent`, each row carries an `agent_id` field. Agent grouping currently only populates for `voice_call`.

---

## Updated Scope Map (agent eval + billing)

| Resource + Action | Required Scope |
|---|---|
| GET /agent-eval/personas (list/get) | `agent_eval:read` |
| POST /agent-eval/personas | `agent_eval:create` |
| PATCH /agent-eval/personas/:id | `agent_eval:update` |
| DELETE /agent-eval/personas/:id | `agent_eval:delete` |
| GET /agent-eval/cases (list/get) | `agent_eval:read` |
| POST /agent-eval/cases | `agent_eval:create` |
| PATCH /agent-eval/cases/:id | `agent_eval:update` |
| DELETE /agent-eval/cases/:id | `agent_eval:delete` |
| GET /agent-eval/suites (list/get) | `agent_eval:read` |
| POST /agent-eval/suites | `agent_eval:create` |
| PATCH /agent-eval/suites/:id | `agent_eval:update` |
| DELETE /agent-eval/suites/:id | `agent_eval:delete` |
| POST /agent-eval/suites/:id/run | `agent_eval:run` |
| GET /agent-eval/suites/:id/runs | `agent_eval:read` |
| GET /agent-eval/suites/:id/runs/:exec_id | `agent_eval:read` |
| POST /agent-eval/cases/:id/run | `agent_eval:run` |
| GET /agent-eval/runs (list/get/turns/evaluation) | `agent_eval:read` |
| POST /agent-eval/runs/:id/cancel | `agent_eval:run` |
| GET /billing/consumption | `billing:read` |
