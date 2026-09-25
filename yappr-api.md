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

- 60 requests per minute per API key, counted atomically — every request counts once,
  including 4xx responses and requests sent in parallel; firing a batch concurrently no
  longer slips past the cap. The two refusals that take no slot are the ones decided
  before the key has a window at all: `401` and `403 WORKSPACE_MISMATCH`. Two keys are
  two windows.
- Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
  `X-RateLimit-Reset` (a Unix timestamp in seconds). Inside one window a key never hands back the same
  `Remaining` twice — a burst's answers race back out of order, but sorted they are
  consecutive. A repeated `Remaining` almost always means the burst went over more than
  one key, not a miscount; group by `X-RateLimit-Reset` to see the split (it is a whole
  second, so two keys whose windows opened in the same second share it).
- Over the limit: `429 RATE_LIMIT` with `Retry-After` — whole seconds, never zero.
  Nothing in a `429` was acted on: wait it out, then resend the same request, with the
  same `Idempotency-Key` where one was used. There is nothing to add on top of the wait.
- The dashboard shows this limit, the API base and the doc links under **Settings →
  Developers**.
- Up to your company's `max_concurrent_calls` (default 10) active calls. Capacity
  pressure returns `202` with `status: "queued"` (or `"scheduled"` for a call-window
  defer), not `429` — check both the HTTP status and the response `status`.

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
| 401 | `MISSING_KEY` (nothing sent), `INVALID_KEY` (a key was sent and is not ours, or is revoked), `EXPIRED_KEY` — the key itself was not accepted | Fix the key. Even a `401` carries `X-RateLimit-*` (`Remaining` = `Limit`: nothing was counted). |
| 402 | Billing — insufficient balance or no payment method (`BILLING_ERROR`), or the workspace's own monthly spending limit is reached (`SPEND_BUDGET_REACHED`, see **PATCH /billing**) | Guide to billing setup, or raise the limit |
| 403 | `INSUFFICIENT_SCOPE` — the key is fine but lacks a scope; the message names it. Also a resource in another workspace or a protected one | Widen the key in Settings → API keys, or use one that holds the scope. Never rotate on a `403`. |
| 404 | `AGENT_NOT_FOUND` — the agent in the path, or the `agent_id` a request names, is not in this workspace | The public API answers a missing agent this way. Another `404` code under `/agents/{id}` means the agent is there and something else is missing. Campaign, phone-number and carrier-number bodies answer it too, naming the field (a campaign's `agent_id` or `split.agent_id`; a number's `inbound_agent_id`, `outbound_agent_id`, `inbound_split.agent_id` or `outbound_split.agent_id`); call requests keep `404 WORKFLOW_AGENT_UNAVAILABLE` for an agent that is archived or switched off (below). |
| 429 | Rate limit or concurrent call limit | Wait and retry |
| 500 | Server error | Retry once; if persistent, report |

### Errors

Every error carries `error` (human) and `code` (machine). Branch on `code`. A refusal that
names nothing more specific carries its status's code: `BAD_REQUEST` 400, `BILLING_ERROR` 402,
`FORBIDDEN` 403, `NOT_FOUND` 404, `METHOD_NOT_ALLOWED` 405, `CONFLICT` 409, `GONE` 410,
`PAYLOAD_TOO_LARGE` 413, `UNSUPPORTED_MEDIA_TYPE` 415, `UNPROCESSABLE_REQUEST` 422,
`RATE_LIMIT` 429, `INTERNAL_ERROR` 500, `UPSTREAM_ERROR` 502, `SERVICE_UNAVAILABLE` 503;
anything else `REQUEST_FAILED`. `401` never falls back to a generic code — it is always one of
`MISSING_KEY`, `INVALID_KEY` or `EXPIRED_KEY`.

**A missing scope is `403 INSUFFICIENT_SCOPE`, on every route.** The key is valid for this
workspace but not allowed that one operation, and the message names the scope it lacks. It
used to be `401` on most routes and `403` on a few; it is `403` everywhere now, and `401`
means only that the key itself was not accepted. Never read a `403` as a dead key: rotating
it changes nothing — widen its scopes in the dashboard, or issue a key that holds the scope.

- `404 RESOURCE_ID_INVALID` — the id in the path is not a UUID, on every route and every
  verb, a second id in the path (`/tools/{id}/tests/{test_id}`,
  `/calls/{id}/recording/revoke`) included. A malformed id is a refusal, never the
  collection behind it; it stays `404`, not `400`.
- `404 ROUTE_NOT_FOUND` — the API serves no such path: a sub-path no route has
  (`DELETE /agents/{id}/nonsense`), a resource that does not exist, or a path with an
  empty segment — a doubled slash (`/agents//{id}`) is refused, never read as the
  collapsed path. It is answered before any scope or agent check, and nothing is read or
  changed. The message names what the API serves at the deepest part of the path it
  recognised.
- `400 invalid_destination` — the ONLY code for a `to` that cannot be dialled, malformed or
  unreachable. `INVALID_TO_NUMBER` no longer exists.
- `400 INVALID_FROM_NUMBER`, `400 SELF_CALL_NOT_ALLOWED` — the other two number refusals.
- `400 WORKFLOW_AGENT_REQUEST_INVALID` — `POST /agents` with something missing, a
  `template` other than `inbound`, `qualify` or `reminder`, or a template together with
  instructions; `error` names the field. `410 AGENT_LEGACY_CREATION_GONE` is only for a
  body that ASKS for the retired kind (`system_prompt`, `type`, `flow_config`, `tools`, `tool_ids`, `prompt`,
  `webhook_url`, `webhook_events`, `webhook_headers`).
- `422 WORKFLOW_TOOL_REQUEST_INVALID` / `422 WORKFLOW_TOOL_TEST_INVALID` — carry
  `issues[0].path`, a JSON pointer at the offending field.
- `409 WORKFLOW_AGENT_INACTIVE` — `POST /call-requests` (and `POST /calls`) on an agent
  that exists and may well be published, but is switched off. `POST /agents/{id}/duplicate`
  returns a copy with `is_active:false`, so on the duplicate → publish → call path this is
  the answer, not `404 WORKFLOW_AGENT_UNAVAILABLE`. Send
  `PATCH /agents/{id} {"is_active": true}` and retry.
- `404 WORKFLOW_AGENT_UNAVAILABLE` — no agent with that id is available in this workspace
  (archived, switched off, or the pinned workflow version is not this agent's own).
- `404 AGENT_NOT_FOUND` vs `422 INVALID_SPLIT` — an agent field on a campaign or a phone
  number that names no agent in this workspace (it does not exist, belongs to another
  workspace, or is archived) is `404 AGENT_NOT_FOUND`, and the message names the field
  (on a campaign `agent_id` or `split.agent_id`; on a number `inbound_agent_id`,
  `outbound_agent_id`, `inbound_split.agent_id` or `outbound_split.agent_id`). It used to be
  `422 INVALID_AGENT`. `422 INVALID_SPLIT` is only about the shape of an A/B split: a
  `percent` outside 1–99, the second agent the same as the first, or a split that is
  neither an object nor `null`.
- `422 WORKFLOW_VALIDATION_FAILED` with `binding_phase_unsupported` — a tool bound into a
  phase its contract excludes (a transfer in a Before or After step). Publish refuses; the
  issue carries `node_id` and `label`. A transfer on an agent that also answers on `web` is
  a *warning* (`binding_channel_unsupported`, also carrying `node_id`/`label` where a step
  uses it) and still publishes — web callers reaching that step simply cannot use it.
- `400 CALLS_QUERY_INVALID` — `GET /calls` (and `GET /calls/export`) with an unrecognised
  `status`, `direction` or `source` (`scheduled` is not a status), any unknown query
  parameter, a known filter sent with no value, an `agent_id` that is not a uuid, a
  `from`/`to`/`updated_since` that is not an ISO 8601 timestamp (`2026`, `Sep 1` and
  `2026-09-31` are all refused), or `cursor` together with `offset`. `GET /calls/export`
  also refuses `limit`, `offset`, `cursor` and `updated_since` outright. Used to answer
  `500` — and `?from=yesterday` used to answer `200` with a window nobody asked for.
- `400 CALLS_CURSOR_INVALID` — the `cursor` on `GET /calls` was not issued by that endpoint.
- `400 DELIVERIES_QUERY_INVALID` / `400 DELIVERY_CURSOR_INVALID` — the same two refusals on
  `GET /deliveries`.
- `400 SHARED_LINK_EXPIRY_INVALID` — `POST /shared-links` with an `expires_at` that does
  not parse as a date. Used to answer `500`.
- `400 AGENT_IDEMPOTENCY_DUPLICATED` — two `Idempotency-Key` headers arrived on the same
  request (a client or proxy bug). Naming how many arrived and whether they agreed — not
  `AGENT_IDEMPOTENCY_REQUIRED`, which is for a key that is genuinely missing or malformed.

### The API refuses what it does not read

A query parameter or body field an endpoint does not read is a `400` that names it and lists
what the endpoint does read — never silently ignored. That holds for **writes** too,
deletes included: `DELETE /agents/{id}?bogus=1` is refused and archives nothing, and
`POST /tools?dry_run=true` is refused rather than creating the tool. Send a write's
settings in its body. A few reads do not refuse one, so never rely on them to:
`GET /campaigns/{id}/leads` (which also takes a `limit` or `offset` that is not a number),
`GET /sip-endpoints` and `GET /sip-endpoints/{id}`, every read under `/carrier-accounts`,
and the signed `recording_url`, which audio players open with parameters of their own.
Codes: `AGENTS_QUERY_INVALID`, `TOOLS_QUERY_INVALID`, `CONSUMPTION_QUERY_INVALID`, `CAMPAIGNS_QUERY_INVALID`,
`CALLS_QUERY_INVALID`, `LEADS_QUERY_INVALID`, `DELIVERIES_QUERY_INVALID`,
`DO_NOT_CALL_REQUEST_INVALID`, `API_KEY_REQUEST_INVALID`, `LEAD_REQUEST_INVALID`,
`WEB_CALL_REQUEST_INVALID`, `CAMPAIGN_REQUEST_INVALID`. The same `400` refuses a parameter
sent twice or empty, a date that does not exist, and `from` after `to`.

- Every `400` from `/do-not-call` is `DO_NOT_CALL_REQUEST_INVALID`, and every refused
  campaign create or edit body is `CAMPAIGN_REQUEST_INVALID` (a disposition label in
  `stop_disposition_ids` included: send ids from `GET /dispositions`). The message names
  the field.
- There is no agent filter on `GET /billing/consumption`: use `group_by=agent`.
- A date-only `to` covers that whole day: a UTC day on `/calls`, `/calls/export` and
  `/deliveries`, and a day on the workspace's clock on `/billing/consumption` and
  `/billing/transactions` unless you pass `timezone` (`timezone=UTC` for UTC days).
  `from=2026-08-01&to=2026-08-31` is all of August.
- `expires_at` in the past is refused on do-not-call add and edit and on shared links.
- `metadata.extracted` on a lead: send it back unchanged or leave it out; changing it is
  `400`.
- Stopping a half-built draft campaign is `409 CAMPAIGN_NOT_STOPPABLE`: archive it with
  `DELETE`.
- Workflow save / validate / publish / rebind refusals carry `issues[]` with a `path`:
  `/expected_version`, `/document`, `/bindings/<n>/tool_revision_id`.
  `reference_is_tool_id` means a tool id was sent where its revision belongs; the message
  names the revision to send (`workflow.head_revision_id` from `GET /tools/{id}`).
- A rebind to a tool that is not in the workspace is `404 WORKFLOW_NOT_FOUND` with one
  issue per binding, code `tool_not_found`, path `/bindings/<binding id>`: send the tool's
  own id from `GET /tools`.

### Agent object

A workflow agent answers `type: "workflow"` and has **no** `system_prompt`, `flow_config`,
`webhook_url`, `webhook_events`, `webhook_headers` or `tools` — the fields are absent, not
null. Its instructions, graph and tool bindings are its workflow document:
`GET /agents/{id}/workflow`, whose `bindings` are the tools it can call. Agents created
before the workflow engine keep `type: "prompt"` / `"flow"` and their old shape — these
still exist and still take calls; branch on `execution_version`, not on `type`. A legacy
agent's workspace behaves exactly as it always did — placing and reading its calls is
unaffected by anything on the workflow plane, so nothing here requires moving one over.

### Publish → settings

`POST /agents/{id}/workflow/publish` returns `settings_updated_at` beside `revision`.
Publishing writes the agent row, so an `updated_at` read before it is stale afterwards.
Send `settings_updated_at` as `expected_updated_at` on the next `PATCH /agents/{id}`;
without it the documented create → save → check → publish → PATCH sequence answers
`409 WORKFLOW_SETTINGS_CONFLICT` with nobody else involved. An identical publish replay
returns the same revision **and** the same `settings_updated_at`.

**Environments.** Every published revision carries `environment` — the deployment plane
that stored it, returned on `POST /agents/{id}/workflow/publish` (`revision.environment`)
and on `GET /agents/{id}/workflow/versions`. You never send it. The hosted API stores as
`testing`, and a call placed through the same API runs on the same plane, so
publish-then-call always matches — do not treat `testing` as a failure: it is the plane
that takes your real calls, not a rehearsal copy. The dashboard labels the same version
**Live** ("Version 3 is live.", "Live · version 3"), and there is no promote step. Mapping:
`testing` → Live, `production` → Live, `local` → Local. The one real failure case is a
version published through a *different* deployment; see `artifact_unavailable` in the
errors reference.

### Leads

`phone_number` is E.164 or the local form (`0501234567`), normalised on write; anything
undiallable is `400 INVALID_PHONE_NUMBER`. `source` may be `api` (default), `manual` or
`csv_import` — anything else is `400 INVALID_LEAD_SOURCE`, and `call` is Yappr's own.
`GET /leads` takes `limit`, `offset`, `search`, and `tag` (name) or `tag_id`; any other
parameter is `400 LEADS_QUERY_INVALID`, and an unknown tag is `404 LEAD_TAG_UNKNOWN`.
An agent tags a lead through `PATCH /leads/{id}` — extraction parameters land in
`extracted_data` and the `call.analyzed` payload and never write tags themselves. They do
reach the lead, read-only, as `extracted` (see **GET /leads/:id**).
`tags` (names, matched exactly) and `tag_ids` each replace every tag on the lead and are
applied whole: one unknown name is `400 INVALID_TAG_NAMES`, one unknown id is
`400 INVALID_TAG_IDS`, and nothing is written either way. `[]` clears the tags.

### Campaigns and flows

`CAMPAIGN_NOT_READY` (422 on launch/resume) and `FLOW_INVALID` (400 on a flow save) arrive
in `code`, and are repeated in `error` for older clients. `FLOW_INVALID` carries `issues[]`;
the campaign code carries `message`. Enrolment no longer answers
`409 ALREADY_IN_ACTIVE_CAMPAIGN` — a number another campaign holds is reported per number
(see **POST /campaigns/:id/leads**).

---

## Agents

### GET /agents

List all agents for the authenticated company, newest first.

**Scopes:** `agents:read`

**Query params:** `limit` (1–100, default 20), `offset`, `name`. No status filter.
Archived agents are never listed.

**Find agents by name — `?name=<text>`.** Case-insensitive, anywhere in the name, and
literal (`%`, `_` and `*` are not wildcards); newest first; `pagination.total` counts the
matches. Names are not unique — match on `id` afterwards. An empty, repeated or
over-200-character `name` is `400 AGENTS_QUERY_INVALID`, and so is any parameter this list
does not read.

**Response:** each row is the **whole agent object** — the same shape `GET /agents/:id`
returns, not a summary — with a `pagination` envelope (`total`, `limit`, `offset`,
`has_more`). There are two shapes, and `execution_version` tells them apart: a
`workflow_v1` row (almost every agent, and the only kind that can be created today)
carries twenty-six fields; a `legacy` row — an agent from before the workflow engine,
still taking calls — carries those same twenty-six plus six more. Every field of a
row's own shape is present on it; a field you do not see in that shape is not part of
its response, not `null`.

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string | null",
      "voice": "string",
      "language": "he" | "en",
      "temperature": 0.5,
      "greeting_message": "string | null",
      "agent_speaks_first": true,
      "vad_stop_secs": 0.5,
      "vad_start_secs": 0.2,
      "vad_confidence": 0.7,
      "silence_timeout_secs": 60,
      "max_continuous_speech_secs": 120,
      "max_call_duration_secs": 600,
      "is_active": true,
      "lead_memory_enabled": true,
      "noise_cancellation_enabled": true,
      "background_sound": "string | null",
      "background_sound_volume": 0.3,
      "type": "workflow",
      "extraction_parameters": [{"name": "camelCaseName", "description": "AI instruction for what to extract from the call"}],
      "execution_version": "workflow_v1",
      "published_workflow_revision_id": "uuid | null",
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ],
  "pagination": { "total": 0, "limit": 20, "offset": 0, "has_more": false }
}
```

A `legacy` row carries the same twenty-five fields plus `type: "prompt" | "flow"`,
`system_prompt`, `flow_config`, `webhook_url`, `webhook_events`, `webhook_headers`,
`tools` and `idempotency_key`, real values, not empties — except `webhook_headers`, whose
**values are write-only**: a read returns the header names and never what they are set
to, so a secret sent there does not come back to any key. Send the value again with
`PATCH /agents/:id` to change it. `system_prompt` is the prompt driving the call, `flow_config` the graph on a `flow` agent, and `idempotency_key` is
whatever the retired create path wrote (often `null`). Branch on `execution_version`,
never on field count or on `type` alone — `"prompt"` and `"flow"` are a closing set (no
agent is created into them any more), not a growing one, and existing agents in them
still take calls.

**`idempotency_key` belongs to the request, not to the agent.** A `workflow_v1` row
never carries it — the key is echoed once, on the response that created the agent (see
**POST /agents** and **POST /agents/:id/duplicate** below), and a later read of that
same agent has no such field at all.

---

### GET /agents/:id

Fetch complete config of a single agent. Same two shapes as `GET /agents` above — check
`execution_version` first.

**Scopes:** `agents:read`

**Response — `workflow_v1` agent (almost every agent):**
```json
{
  "id": "uuid",
  "name": "string",
  "description": "string | null",
  "voice": "string",
  "language": "he" | "en",
  "temperature": 0.0 - 2.0,
  "greeting_message": "string | null",
  "agent_speaks_first": true | false,
  "vad_stop_secs": 0.5,
  "vad_start_secs": 0.2,
  "vad_confidence": 0.7,
  "silence_timeout_secs": 60,
  "max_continuous_speech_secs": 120,
  "max_call_duration_secs": 600,
  "is_active": true,
  "lead_memory_enabled": true,
  "noise_cancellation_enabled": true,
  "background_sound": "string | null",
  "background_sound_volume": 0.3,
  "type": "workflow",
  "extraction_parameters": [{"name": "camelCaseName", "description": "AI instruction for what to extract from the call"}],
  "execution_version": "workflow_v1",
  "published_workflow_revision_id": "uuid | null",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

It **omits** `system_prompt`, `flow_config`, `webhook_url`, `webhook_events`,
`webhook_headers`, `tools` and `idempotency_key` — it has none of those things, so the
keys are absent rather than `null` or `[]`. Its instructions, its graph and its tool
bindings are all in its workflow document: `GET /agents/{id}/workflow` returns them, and
the document's `bindings` are the tools the agent can call. A `null`
`published_workflow_revision_id` means draft-only, not call-ready. `idempotency_key` is
echoed once, on the response that created this agent — see **POST /agents** below — and
never on a read.

An agent created before the workflow engine keeps `type: "prompt"` or `"flow"` and every
field it has always returned — `system_prompt`, `flow_config`, `webhook_url`,
`webhook_events`, `webhook_headers`, `tools`, and `idempotency_key` (whatever the retired
create path wrote for it, often `null`) — real values, unchanged, except that
`webhook_headers` names its headers without their values (write-only). `voice` is the voice
name a caller hears; the engine behind it is never set directly.

**Turn-taking and interruption.** An agent stops the instant the caller starts
talking — queued audio is dropped, on phone calls and browser calls alike — and
it is free to react, interject or make listening noises while the caller speaks.
Nothing on the platform suppresses that. To make an agent wait in silence until
the caller finishes, write the instruction into a conversation node's `instructions`
(or `global_instructions`) on a workflow agent, or into `system_prompt` on a legacy
one — it is the only thing that will.

The three `vad_*` fields tune the reaction and are per-agent, never global:

| Field | Effect on the call |
| --- | --- |
| `vad_start_secs` | How much speech counts as the caller starting, and how much of the audio just before it is kept so the first word survives an interruption |
| `vad_stop_secs` | How long a pause ends the caller's turn — how fast the agent answers, and how likely it is to cut in on someone still thinking. Below ~0.5s it may answer half a sentence |
| `vad_confidence` | How sure the agent must be it is hearing speech. Below the 0.7 default it reacts more eagerly, including to background noise on a noisy line |

`vad_confidence` is read two ways. How readily the caller can cut the agent off
mid-sentence follows the number continuously. Where the caller's turn begins and
ends is a two-position switch either side of the `0.7` default — at or above it
deliberate, below it eager — so for that half `0.05` and `0.69` behave
identically, as do `0.70` and `1.00`. Move it across the default, not by 0.05.

The eight expressive voices (`Keren`, `Eitan`, `Hila`, `Ido`, `Boaz`, `Tali`,
`Erez`, `Efrat`) run their own turn-taking, so `temperature` and the three
`vad_*` fields are rejected with `400` on an agent using one. They are
interrupted exactly like every other agent.

**Extraction parameters have a kind.** Each entry in `extraction_parameters` may carry
`type`: `number`, `yes_no` or `date`. Send no `type` for text — that is what text has
always meant, and it is the spelling the dashboard and the stored call settings both use;
`"text"` is accepted too and means the same thing. The kind decides what comes back in
the call's `extracted_data`: a string, a JSON number, a JSON boolean, or a `YYYY-MM-DD`
string. A value the conversation never supplied is `null` whatever the kind, and so is a
value that cannot be read as the declared kind — never a string that only looks like one.
Any other value is rejected: `422 WORKFLOW_SETTINGS_REQUEST_INVALID` on a workflow agent
(naming the entry and the kinds allowed), `400 BAD_REQUEST` on a prompt or flow agent.

Adding, removing or retyping an extraction parameter on a published agent queues a
settings promotion. An agent that asks for a kind the running analyzer does not yet
accept answers `422 WORKFLOW_VALIDATION_FAILED` on publish (`extra_forbidden` at
`/settings_snapshot/postcall/…/type`) — that is a deployment-skew condition, not a bad
request; the same body succeeds once the workflow services are current.

---

### POST /agents

Create one unpublished draft using
`{"name":"Reception assistant","language":"en","workflow":{"global_instructions":"Help callers with their questions."}}`
and an `Idempotency-Key` header (16–128 letters, digits, `_` or `-`). Only name,
description (optional, up to 2,000 characters), language (`he` default or `en`),
authoring_locale (optional, `he` or `en`), template (optional, below) and
workflow.global_instructions (optional, up to 100,000 characters) are accepted. Name is
trimmed and limited to 200 characters. IDs, name on the canonical workflow, and execution
ownership are assigned by Yappr; never send execution_version, publication pointers, legacy
type/flow_config/system_prompt, or caller-owned IDs.

`authoring_locale` is `"he"` or `"en"` — the language Yappr writes the new agent's
starting step names, their instructions and the closing route condition in, text that
is read in the editor, never spoken on the call. It defaults to `language`: send the
language of whoever is reading, not the language of the call.

**Start from a template.** Send `template` instead of your own instructions and the agent
starts with the instructions the dashboard's **New agent** form offers:

| `template` | Starts an agent that… |
|---|---|
| `inbound` | answers incoming calls: greets, understands the request, answers it or takes a message |
| `qualify` | calls a lead back: checks who it reached, learns the need, agrees the next step |
| `reminder` | confirms a booked appointment: confirms it, moves it or takes the time the person prefers |

```bash
curl -s -X POST "https://api.goyappr.com/agents" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Front desk", "language": "en", "template": "inbound"}' | jq .id
```

The starter is written in `authoring_locale` (which defaults to `language`) and is ordinary
instructions: read it with `GET /agents/:id/workflow`, change it with
`PUT /agents/:id/workflow`. Leave `workflow` out. A template **and** non-empty
`workflow.global_instructions` is `400 WORKFLOW_AGENT_REQUEST_INVALID` ("Send a template or
workflow.global_instructions, not both"), and so is any `template` other than the three
names. A template's name does not set which way the agent calls: that is the number's job.

**Numbers carry the direction, not agents.** An agent has no inbound or outbound setting;
the same agent can answer calls and place them. What decides it:
- **To answer calls**, make it a number's `inbound_agent_id` (`PATCH /phone-numbers/:id`)
  or a SIP endpoint's (`POST /sip-endpoints`). `inbound` on `GET /agents` and
  `GET /agents/:id` lists the numbers and endpoints that route calls to it.
- **To place calls**, send its `agent_id` to `POST /calls` with a `from` number, or make it
  that number's `outbound_agent_id`: a call from the number sent without an `agent_id` uses
  it. A number from the customer's own Telnyx account is outbound only.
- **No number yet?** A browser call (`POST /calls` with `"type": "web"`, the dashboard's
  Test Call) reaches the agent without one.

So an "inbound agent" and an "outbound agent" are the same `POST /agents`; the number you
bind it to afterwards is what makes it one or the other.

The response has the standard Agent fields plus read-only execution_version and
published_workflow_revision_id. Draft creation returns 201; an identical normalized
request replay returns 200 with the same agent. Retry a lost response with the same
key and body. Changed details under that key return 409 AGENT_IDEMPOTENCY_CONFLICT;
archived/missing original returns 410 AGENT_CREATION_GONE and is never recreated.
A merely disabled original returns 200 without reactivation. Keys are scoped to the
company and endpoint. Do not fall back to legacy creation after an error.

Read `GET /agents/:id/workflow`, save `PUT /agents/:id/workflow` with expected_version
and document, then explicitly validate/publish with `POST /agents/:id/workflow/validate`
or `/publish` and the saved expected_version. Creation starts Strict Mode off with a
valid closing route and empty Before/After phases; it does not publish or enable calls.

There is one kind of agent. A body **without** `workflow` — one carrying
`system_prompt`, `type` or `flow_config` — asks for the retired prompt or flow agent and
returns `410 AGENT_LEGACY_CREATION_GONE` with the shape to send instead. It is `410` and
not `400` because the request is well formed and the kind of agent it asks for no longer
exists: there is no field to fix and no retry that succeeds. Never fall back to it after a
failed workflow create.

Agents that already exist are unaffected: they keep taking calls, keep their tools,
lifecycle webhooks and phone numbers, and are still read with `GET /agents/:id`, updated
with `PATCH /agents/:id` and archived with `DELETE /agents/:id`. The one thing that does
change for them is **when** the agent is moved onto the workflow engine: its three webhook
columns are emptied and its notifications become After triggers, and the request body your
endpoint receives changes shape. *Webhook Events* below carries both shapes side by side.

Moving an integration off the old body:

| Old field | Where it goes now |
|---|---|
| `system_prompt` | `workflow.global_instructions` on create |
| `type`, `flow_config` | the conversation graph in `PUT /agents/:id/workflow` |
| voice, VAD, timeouts, background sound, lead memory | `PATCH /agents/:id` after creation |
| `webhook_url`, `webhook_events`, `webhook_headers` | After triggers on the workflow, one per event — see *Webhook Events* |
| `extraction_parameters` | unchanged, on `PATCH /agents/:id` |
| tool attachments | `POST /tools` plus the workflow's own bindings |

**Scopes:** `agents:create`

**Request body:** `name`, optional `description`, `language` and `authoring_locale`, and
either `workflow.global_instructions` or a `template` (`inbound`, `qualify`, `reminder`).
Nothing else is accepted.

**Response:** `201` — the agent object, as an unpublished draft. `200` on an idempotent
replay. Both echo the `Idempotency-Key` you sent as `idempotency_key`, so the response
confirms which key produced this agent, and on the `200` replay that the same key
produced the same one. The field belongs to the request, not to the agent: `GET /agents`
and `GET /agents/:id` carry no key at all.


---

### POST /agents/:id/duplicate

Copy an existing agent: its ordinary settings (voice, engine and engine_voice
together, VAD, timeouts, background sound, extraction parameters, and the rest) and
its current **draft** workflow document — bindings, positions, everything — become
one new agent. The body, or no body at all, is optional; `{"name":"...","description":"...","language":"he","fork_tools":true}`
are the only fields accepted, all optional. `name` defaults to `"<source name> (copy)"`,
or the Hebrew equivalent when the copy's language is `he`; omitting `description` or
`language` copies the source's own value, and sending `description: null` clears it on
the copy. An `Idempotency-Key` header (16–128 letters, digits, `_` or `-`) is required,
exactly as on create.

The copy is created **unpublished** (`published_workflow_revision_id: null`) and
**switched off** (`is_active: false`) — two independent reasons it takes no calls the
moment it exists. Publish it yourself with the workflow endpoints, same as any other
new agent; duplicating never publishes.

**Without `fork_tools` the copy shares the source's tools.** Its workflow bindings keep
the source's exact `tool_revision_id` pins, so a `PATCH /tools/{id}` changes both agents,
and archiving a tool later breaks both together, not just the one you meant to change.

**`fork_tools: true` gives the copy a separate tool for every shared tool**, in the same
call, and repoints its bindings. It needs `tools:create` as well as `agents:create` —
without it the request is `403 INSUFFICIENT_SCOPE` and nothing is copied. The response
adds `tool_fork`:

```json
"tool_fork": {
  "status": "complete" | "partial" | "failed",
  "forked": [{ "tool_id": "uuid", "name": "Book slot (copy)", "source_tool_id": "uuid",
               "source_name": "Book slot", "header_names": ["Authorization"],
               "url_private_part_removed": true, "needs_values": true }],
  "kept": [], "shared": []
}
```

Forked names are `"<tool> (copy)"`, then `"(copy 2)"`. Header **values** and a URL's
private query are never copied: a forked HTTP tool keeps its header names with empty values.
For each forked tool with `needs_values`, `PATCH /tools/{tool_id}` with the values before
publishing or activating the copy. On `partial` or `failed`, repeat the **same** request
with the **same** `Idempotency-Key` and `fork_tools: true` — the copy and any tools
already made are replayed, and the rest are forked.

**Not copied — the phone side.** No phone number or SIP endpoint is repointed at the
copy, and no shared web-call link is minted for it. A copy answers nothing until you
configure that yourself with `POST /phone-numbers/configure` or a split.

**Not copied — history.** Call logs, workflow revisions, eval suites and any
in-flight settings promotion all start empty; the copy has zero revisions.

The `Idempotency-Key` is scoped to this company, this endpoint, **and the source
agent id**: the same key replayed against the same source returns the original copy
with `200`. The same key aimed at a different source, or one already spent on
`POST /agents`, is `409 AGENT_IDEMPOTENCY_CONFLICT` — never a silent replay of the
wrong copy. If the copy that key made has since been archived or removed, the key
cannot be reused (`410 AGENT_CREATION_GONE`); use a new key to make another copy.

If the source's workflow binds a tool that no longer resolves — deleted or
archived since the source last saved — the duplicate fails loudly instead of
producing a copy nobody can publish: `409 WORKFLOW_REFERENCE_INVALID`, nothing
written. Restore or remove the tool on the **source**, then duplicate again.

**Scopes:** `agents:create` — duplicating adds an agent to the workspace, so a
read-only key cannot do it. With `fork_tools: true`, also `tools:create`.

**Request body:** Optional `name`, `description`, `language` (`he` \| `en`),
`fork_tools` (boolean). Nothing else is accepted.

**Response:** `201` — the copy, in the same shape `POST /agents` returns. `200` on
an idempotent replay. Same rule as create: the response echoes `idempotency_key`, a
read of the copy never carries it.

---

### PATCH /agents/:id

Update any subset of agent fields. Only include fields that should change.

For `execution_version=workflow_v1`, only ordinary voice, technical and analysis
settings are accepted. Read `GET /agents/:id/settings` (`agents:read`) for the safe
settings projection and original `updated_at`. Send that exact timestamp as
`expected_updated_at` on PATCH; stale tokens return 409 without changes. Public
PATCH keeps optional-token partial-field compatibility, while dashboard/chat
workflow edits require the original timestamp. Never silently re-read after a
conflict and overwrite newer settings. Explicit false/zero/permitted null are
preserved; the body budget is 600000 UTF-8 bytes.

Settings do not accept prompt/graph/bindings/native-webhook configuration or
publication/routing fields for a workflow owner. Saving uses the existing validated
settings-snapshot promotion pipeline; accepted calls keep their immutable snapshot.
Disabled unarchived agents remain editable, but editing does not reactivate them.
For a workflow agent the response is the workflow Agent object: `type: "workflow"`,
with `system_prompt`, `flow_config`, `webhook_url`, `webhook_events`,
`webhook_headers` and `tools` **absent** — not null, not empty — same as
`GET /agents/:id`. Read the canonical workflow document, not those legacy fields.
A legacy agent's PATCH response still carries them as real values, unchanged — header
values excepted: `webhook_headers` comes back with names only.

**A refused field is named.** Sending `webhook_url`, `webhook_events`,
`webhook_headers`, `system_prompt`, `flow_config` or `tools` to a workflow agent is
`422 WORKFLOW_SETTINGS_REQUEST_INVALID` with an `issues[]` entry per field, each
carrying a JSON pointer and a note on where that field moved (see **Moving an
integration off the old body** above). Nothing is written.

`greeting_message` is PATCH-able on every agent kind: it is the opening line used when
`agent_speaks_first` is `true`, and `null` clears it.

**Scopes:** `agents:update`

**Request body:** Any subset of POST fields above.

**Response:** `200` — full updated agent object

---

### POST /agents/:id/extraction/dry-run

Read a transcript you supply for the values this agent collects, and get them back.
Nothing is called, nothing is written, and the agent is unchanged — the assertable half
of a rehearsal, for CI: a browser session (`POST /calls {"type":"web"}`) that nobody
connects ends `no_answer` with no transcript — or, on an agent whose mint answers
`protocol: "call_request"`, never becomes a call at all (`call_id: null`) — so without
this there was no `extracted_data` to check before a real caller met the parameters.

**Scopes:** `agents:read` — the only read scope that spends anything: each call runs one
model read of the transcript you send, and it is billed (logged against the workspace,
not free because the scope is read-only).

**Request body:**

| Field | Notes |
|---|---|
| `transcript` | Required. Either an array of `{"role","text"}` turns (`role` is `agent`, `user` or `voicemail`; anything else reads as the caller) or the whole conversation as one string. As a string it is one turn per line behind a speaker label: `Agent:`, `User:`, `Caller:`, `Customer:`, `Voicemail:`, `סוכן:`, `משתמש:`, `מתקשר:`, `לקוח:`, `תא קולי:` — any other line is `400 EXTRACTION_DRY_RUN_TRANSCRIPT_UNLABELLED`, naming the line. Max 400 turns / 40,000 characters. |
| `extraction_parameters` | Optional. A set to try **instead of** the agent's own saved ones — same shape as on the agent: `name`, `description`, optional `type` (`text` default, `number`, `yes_no`, `date`). Validated exactly like `PATCH /agents` (e.g. `"type":"bool"` is `400 EXTRACTION_DRY_RUN_INVALID` with PATCH's message). |
| `reference_time` | Optional. The day the conversation happened: `"YYYY-MM-DD"` (that day) or a zoned timestamp (read in the workspace time zone). Default: today. |

**Response:**
```json
{
  "agent_id": "uuid",
  "transcript_turns": 2,
  "extraction_parameters": [{ "name": "seats", "type": "number" }],
  "reference_date": "2026-09-23",
  "timezone": "Asia/Jerusalem",
  "extracted_data": { "seats": 12 }
}
```

For a `date` parameter the answer also carries `extracted_data_precision`, as on
`GET /calls/:id`.

**Extracted dates.** A `date` parameter is read from the day the call started, in the
workspace time zone — on a real call and here (`reference_time`, echoed as
`reference_date` and `timezone`). A day and month with no year → the next time it comes
round (never the past); "today" / "tomorrow" / "in a week" → counted from the call day;
"next Sunday" / "on Tuesday" → the first such day after the call day; a year the caller
said is kept; a month with no day ("sometime in November", "next month") → `null` with
precision `month` and that month; "after the holidays" → `null` with precision `unknown`.

`extracted_data` is keyed by your parameters and nothing else: a key the model invented
is dropped, a parameter it left out is still a key with `null` — meaning the conversation
never said it, never that the parameter is missing. Each value is coerced to the kind its
parameter declared, the same coercion a real call's `extracted_data` goes through.

It reads the agent's extraction parameters as saved right now, not as published, and
writes no call, so it never appears in `GET /calls`.

**Errors:** `400 EXTRACTION_DRY_RUN_INVALID` — no `transcript`, an empty one, a turn with
no `text`, a transcript over the size limits, an `extraction_parameters` entry missing
`name` or `description`, an empty `extraction_parameters` array, a malformed
`reference_time`, or any field this endpoint does not take.
`400 EXTRACTION_DRY_RUN_TRANSCRIPT_UNLABELLED` — a text transcript line with no speaker
label. `404 AGENT_NOT_FOUND` — no such agent, or archived.
`422 EXTRACTION_NOT_CONFIGURED` — the agent has no extraction parameters and the request
sent none either, so there is nothing to read the transcript for (a bad entry in
parameters you *did* send is the `400` above, not this). `503
EXTRACTION_DRY_RUN_UNAVAILABLE` — the reader could not be reached; nothing was read or
changed, retry.

---

### Canonical workflow authoring

| Endpoint | Scope | Contract |
|---|---|---|
| `GET /agents/:id/workflow` | `agents:read` | Canonical draft, original draft version, and separate published pointer. No mutation. |
| `PUT /agents/:id/workflow` | `agents:update` | `{expected_version, document}`; compare-and-swap Save only. |
| `POST /agents/:id/workflow/validate` | `agents:update` | `{expected_version}`; check the saved draft without saving or publishing. |
| `POST /agents/:id/workflow/publish` | `agents:update` | `{expected_version}`; explicit publication after the canonical validator and freshness checks. |
| `GET /agents/:id/workflow/versions` | `agents:read` | Immutable publication summaries, with optional numeric cursor. |
| `POST /agents/:id/workflow/rebind` | `agents:update` | `{expected_version, bindings: {binding_id: tool_id}}`; moves one or more existing bindings to another tool's current revision. Edits the draft only. |
| `GET /tools/workflow-catalog` | `tools:read` | Safe versioned builder choices, full typed input/output schemas; limit 1–50, opaque cursor, up to 10 exact revision_ids. |
| `GET /agents/:id/settings` | `agents:read` | Ordinary settings and original updated_at; no native secret configuration or document. |

**Giving an agent a tool.** `POST /tools/attach` does not work here — every agent this
API creates is a workflow agent, so it answers `409 WORKFLOW_TOOL_OWNER_REQUIRED`. The
read half misleads the same way: `GET /tools?agent_id={id}` lists legacy attachments
only, so an agent with tools bound and published still answers `{"data":[]}`. The four
calls that work:

1. `GET /tools/workflow-catalog?limit=20` — each row's `id` is the `tool_revision_id` a
   binding points at; `input_schema` names the fields the binding must map;
   `allowed_channels`/`allowed_phases` say where it may sit.
2. `GET /agents/{id}/workflow` — `draft.version` is the next `expected_version`;
   `draft.document` is what you edit and send back whole.
3. `PUT /agents/{id}/workflow` — add one entry to `document.bindings`
   (`{"id","tool_revision_id","inputs"}`) and put that `id` in the conversation node's
   `available_binding_ids` (or the step's `binding_id`, for an `action` node).
4. `POST /agents/{id}/workflow/validate`, then `.../publish`.

An input mapped `{"kind":"model","path":"/field"}` works only inside the conversation. A
before-call step, a follow-up or a sequence child using one is `model_input_unavailable`
— send the value in `variables` on `POST /calls`, declare it in `request_schema` and read it
with `{"kind":"request"}`, or read a produced result with `{"kind":"step"}`/`{"kind":"artifact"}`.
Never `{"kind":"stored"}`: nothing writes saved context, so that source is empty on every
call and `validate` answers `stored_context_has_no_writer`.

**Point a binding at another tool.** Use `rebind` when one agent should call a
different endpoint from the others — the usual case being an agent you duplicated
for a second client without `fork_tools`, whose bindings still point at the first
client's tool.

    POST /agents/{agent_id}/workflow/rebind
    { "expected_version": 7, "bindings": { "notify": "<tool_id>" } }

`expected_version` is `draft.version` from `GET /agents/{id}/workflow`; a stale one
answers `409 WORKFLOW_CONFLICT` and writes nothing. Each key is a `bindings[].id`
already in the draft. The named bindings move to that tool's current revision —
`inputs`, the other bindings and every step are untouched — and a binding already on
that tool is left alone. The answer is the authoring state, as a save returns it.
Rebinding edits the draft only: `validate`, then `publish`, before callers hear it.

Which call you need:
- new URL for **every** agent using the tool → `PATCH /tools/{id}` with
  `configuration.url`. Bindings follow the new revision; no workflow edit.
- different endpoint for **one** agent → `POST /tools` for its own endpoint, poll
  `GET /tools/{id}` until `workflow.status` is `current`, then rebind.
- stay on an older revision forever → `PUT …/workflow` with
  `tool_revision_policy: "pinned"` on that binding.

Errors: `409 WORKFLOW_CONFLICT` (re-read the draft), `409 WORKFLOW_TOOL_NOT_READY`
(the tool has no current revision yet — keep polling), `422 WORKFLOW_BINDING_NOT_FOUND`
(the message names the id).

**Re-sending a save is safe.** `PUT /agents/:id/workflow` is safe to repeat: if the
answer never arrived and the save had landed, sending the same document with the
same `expected_version` answers `200` with the draft it produced, not `409` — as
long as nothing has been saved since; the replay is recognised only at
`expected_version + 1`. A `409` never writes anything, so on one, re-read the draft:
your change may already be in it.

The public OpenAPI `WorkflowDocument` schema is the complete canonical v1 document;
do not invent node or mapping shapes. The JSON request budget is 600000 UTF-8 bytes,
and stored documents have a 512 KiB budget. Preserve large integers/precise decimals
with a lossless JSON codec rather than native floating-point parse/stringify.
The chat builder uses a bounded `document_json` string at the model boundary and
the same document/API/validator underneath; it is not a separate execution graph.

**The conversation graph.** `document.conversation` is `{entry_node_id, nodes[], edges[],
global_edges[]}`. Four node types, discriminated by `type`:

- `conversation` — `instructions` (the model's own behavior for this step) plus
  `available_binding_ids`, the tools the model may call by its own choice while there.
  This is the only node the model speaks from.
- `action` — one deterministic call to a single tool binding (`binding_id`). A transfer
  is an `action` node whose binding is a transfer tool — there is no separate transfer
  node type.
- `sequence` — `sequence_id`, pointing at one of `document.sequences[]` (a
  `ToolSequence`: `id`, `name`, optional `output_schema`/`output_mapping`, and `steps[]`
  in the same `SequenceStep` shape Before/After use — see **Branching inside a sequence**
  below).
- `end` — the terminal node: just `id`/`label`. This is the Intrinsic End the Unified
  Tools catalog above excludes.

Two edge kinds route between nodes. A `conversation` edge (`kind:"conversation"`) carries
`source`, `target` and a `condition` — up to 10,000 characters of prose the model reads
to decide whether to take it; it is guidance, not code. A `result` edge
(`kind:"result"`) carries `source`, `target` and `outcome:"succeeded"|"failed"`, and only
ever leaves an `action` or `sequence` node — its target is decided by the tool's own
result, never by the model. `global_edges[]` are the escape hatches: each carries a
`target` and its own prose `condition`, reachable from every conversation node without a
wired edge — the model gets it as an extra candidate on every turn.

**Authoring a tool step.** An `action` node needs a route into it: publication refuses a
step nothing reaches (`unreachable_node`). Add the node and a `conversation` edge from
the step it follows in the same document write, and remember a `conversation` edge's
`condition` must be at least one character — an empty one is refused by the document
contract itself, not by a validation issue you can read and act on.

**Check / publish refusals.** `422 WORKFLOW_VALIDATION_FAILED` returns `issues[]`, each
with `code`, `path` and `message`. An issue that belongs to one conversation step also
carries `node_id` (that step's `conversation.nodes[].id`) and `label` (its label in the
document); both are optional and absent on an issue about the document as a whole. Use
them to point the author at the step instead of at the JSON pointer — e.g.
`unreachable_node` arrives once per unreachable step with `path:
/conversation/nodes/<id>`.

**Strict Mode governs `conversation`-kind edges only.** Off (the default), the model may
also end the call, restate, or diverge from a wired edge when the caller's words call for
it — the graph is instructional weight, not a cage. On, only a wired edge or global edge
advances the conversation. Either way, `result` edges are always enforced: a tool's
outcome is never advisory.

Before/After dependencies and private sequence children are explicit. A sequence
contains tool-only children and an explicit public output schema/mapping; never
expose private children independently or recursively nest sequences. Request schema
and stored-context schema are distinct; schemas are not runtime values. Missing
references may use an explicit typed fallback, including false, zero or null.

**Every lifecycle step needs a `label`.** A before-call step, a follow-up step and a
sequence child are all `{"id", "label", "binding_id"}` — a step written as
`{"id":"post","binding_id":"notify-endpoint"}` is refused, and the refusal does not
name the field. Worked After trigger:

```json
{"after":[{"id":"summary","event":"any_end","steps":[
  {"id":"email","label":"Email the clinic the call summary",
   "binding_id":"email-summary","requires":["transcript"],"on_failure":"continue"}]}]}
```

**Sending what a call collected.** The values an agent is configured to extract are the
**analysis** artifact's `extracted_data`. An after-call step hands them to a tool with an
ordinary artifact source — there is no special "extracted" kind:

```json
"inputs": {
  "preferred_day": { "kind": "artifact", "artifact": "analysis", "path": "/extracted_data/preferred_day" },
  "collected":     { "kind": "artifact", "artifact": "analysis", "path": "/extracted_data" }
}
```

The step needs `"requires": ["analysis"]`. Each field sits at
`/extracted_data/<the name you gave the parameter>`, and every parameter the agent
collects is a key on every call: one the conversation never covered is stored as `null`.
The pointer resolves, so a `fallback` on that source never fires — an input reading a
single extracted field needs a type that accepts null (`"type": ["string", "null"]`) or the
step fails on any call that did not cover it. `/extracted_data` as a whole avoids that, but
only into an input declared `"type": "object"`. The same artifact carries `/summary` and
`/disposition_id`. Saving checks none of this; `validate` and `publish` do: an input
`{kind:"artifact", artifact:"analysis", path:"/extracted_data/<name>"}` is refused
(validate `valid: false`, publish `422 WORKFLOW_VALIDATION_FAILED`, `path` =
`/bindings/<n>/inputs/<field>`) with
- `extracted_field_unknown` — the agent collects nothing called `<name>`;
- `extracted_field_type_mismatch` — the input's type cannot take that kind of value
  (text/date → string, number → number or integer, yes_no → boolean, `/extracted_data` →
  object).

A `date` value is read from the day the call started, in the workspace time zone — see
**Extracted dates** under **POST /agents/:id/extraction/dry-run**.

**Branching inside a sequence.** A sequence step may carry a `when` condition and
route its outcome with `on_succeeded` / `on_failed`. Conditions are declarative data;
no expression is evaluated and no customer code is run.

A condition is `{"kind":"compare","source":{…},"op":"…","value":{…}}`, or
`{"kind":"all_of","conditions":[…]}`, `{"kind":"any_of","conditions":[…]}` (1-16 each)
or `{"kind":"not","condition":{…}}`. At most four nested levels — three wrappers around
a comparison — and at most 32 parts in total. Both `source` and `value` are input
sources limited to the kinds that read already-frozen data: `literal`, `request`,
`stored`, `sequence`, `step`. Live model arguments and produced call artifacts are not
readable in a condition.

Operators: `exists`, `not_exists`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`,
`not_contains`, `in`, `not_in`, `is_true`, `is_false`, `is_empty`, `is_not_empty`. The
six unary ones — `exists`, `not_exists`, `is_true`, `is_false`, `is_empty`,
`is_not_empty` — take no `value`; every other operator requires one. Nothing is
coerced: `"1"` is never `1`, while `1` and `1.0` are the same number. Ordering is
numbers only and a boolean is not a number. `in`/`not_in` need a list on the `value`
side. `contains` is text inside text, or a list holding that exact value. `is_empty`
and `is_not_empty` apply to text, lists and objects, so a JSON `null` answers false to
both — test for it with `eq` against `{"kind":"literal","value":null}`. `exists` is
presence, and a source that declares a `fallback` always resolves, so it always exists.

`on_succeeded`/`on_failed` name another step of the same sequence or `"#end"`.
`on_failed` requires `"on_failure": "continue"` on that step. Nothing may route back to
the sequence's first step, and dependencies and routes together must be acyclic. A
sequence that declares any condition or route runs endpoint and connected-app steps
only — keep transfers outside it. A sequence with no condition and no route behaves
exactly as it did before.

A step whose condition is false is skipped: never dispatched, no attempt, no result.
So is a step that depends on a skipped one, and a step only a route could have started
when no route reached it. `"#end"` finishes the sequence and skips whatever is still
outstanding. The run carries on without the skipped step. Read a value from a step that
may be skipped only through a source that declares a `fallback`, and map a required
sequence output from such a step only with a `fallback` — otherwise make it optional.

Publish-time `issues[]` codes, each with the JSON pointer of what to change:
`sequence_route_target` (route names a step outside this sequence),
`entry_step_routed` (route points back at the first step),
`sequence_cycle` (dependencies and routes form a loop),
`failure_route_conflict` (`on_failed` while `on_failure` is `stop`),
`condition_depth`, `condition_size`,
`condition_value_required` / `condition_value_unexpected` (operator does or does not
compare against a value), `condition_value_type` (`in`/`not_in` need a list),
`condition_type_mismatch` (declared types disagree, or the operator does not apply to
the declared type), `branch_dependent_source` (branch value read with no fallback),
`transfer_in_sequence`, and `input_dependency` (a step reads an output it is neither
downstream of nor routed from). All five branching advisories — an unreachable step, a condition
that can never be true, a step depending on one that may be skipped, a condition
reading a step allowed to fail and continue, a condition whose source declares no type
— arrive as the single code `sequence_branch_advisory` and block nothing.

**The phase contract.** A follow-up trigger's `event` may be `any_end`, which stands for
`call.ended`, `call.failed` and `call.no_answer` together, or `request.failed`, the request
dying before anything was dialled — no call exists and no call event is published, so this
is the only trigger that runs for it. Every other event matches exactly. A
`<artifact>.ready` trigger (`transcript`, `analysis`, `recording`, `lead`, `billing`)
starts its follow-up only for a result that was actually produced; a call nobody answered
settles those producers without producing anything and runs none of them.

A **before-call step may refuse the call** by routing an outcome to `"#decline"`:
`{"id":"screen","label":"Screen","binding_id":"blocklist","on_succeeded":"#decline"}`.
Refusing on failure needs `"on_failure":"continue"` on the same step. An inbound caller is
then never answered — the call is refused at the carrier — and an outbound call is never
dialled: the request ends `failed` with `preparation_status:"declined"` and
`error_code:"before_declined"`, and no call record is created. `"#decline"` is the only
route target a before-call step may name.

A document with before-call steps **may also offer the `"web"` channel** — that
combination publishes and works: a browser call is created, prepared and then started by
the caller, the same way an outgoing call is (see **Web calls on an agent that
prepares** below). The preparation window belongs to the platform with no field to set:
an inbound call prepares after it arrives and before it is answered within 30 s, an
outbound or browser call before the dial within five minutes. Publication follows the
longest `depends_on` chain, charging each step its resolved tool's `timeout_ms`, and
refuses a chain that fits neither window. Independent steps run together, so only the
longest counts.

Phase `issues[]` codes: `before_budget_exceeded` (the chain fits neither window),
`guard_phase` (a `when` on a before-call or follow-up step — conditions belong to a
sequence), `route_phase` (a route on a follow-up step), `before_route_target` (a before-call
step routing anywhere but `"#decline"`), `decline_phase` (`"#decline"` inside a sequence,
where the call is already connected).

**Quoting a before-call result in step text.** `global_instructions` and a conversation
node's `instructions` — and nowhere else — may carry `{{before.<step_id>}}`,
`{{before.<step_id>.<dotted.path>}}` or `{{before.<step_id>.<dotted.path>|fallback text}}`.
Dots become JSON Pointer segments and a numeric segment is a list position. The fallback is
taken verbatim when the value is missing; `|` with nothing after it is a declared empty
string, and no `|` at all makes the reference disappear rather than leaving braces the agent
reads aloud. Publication resolves the step id against the before-call phase and the path
against the producing tool's `output_schema`, so prose can never read what a tool input
could not. Write it exactly — lowercase, no spaces inside the braces. At most 256 references
per document, 512 characters per reference and 1000 per fallback.

Reference `issues[]` codes: `placeholder_syntax` (not the exact shape, including the near
misses `{{Before.`, `{{ before.`, `{{before .`), `placeholder_unknown_step`,
`placeholder_phase` (the id names a conversation, follow-up or sequence step),
`placeholder_unknown_path` (not declared by the tool's `output_schema`),
`placeholder_unsupported_field` (written in a label, a route condition, or a tool's or
sequence's own description — none of those is ever substituted),
`placeholder_reserved_variable` (a call variable named `before` declared alongside a
reference), `placeholder_limit`, `placeholder_too_long`. Where the producing step may
legitimately not run — `before.on_failure: "continue_with_available"`, or the step itself
continuing on failure — a reference with no fallback is an advisory, not a refusal: the
warning code `before_reference_missing_fallback`. Tell the customer what it costs — if the
value is missing when the call starts the reference is removed and the sentence is spoken
without it — and offer the fix: fallback text after the `|`, or `|` with nothing after it
to declare the empty string deliberately.

Validation warnings are safe codes: `strict_off_guidance`, `during_output_advisory`,
`sequence_branch_advisory`, `before_reference_missing_fallback`, `binding_channel_unsupported`
(a tool bound where the agent's channels outrun its contract — e.g. a phone-only transfer
on an agent that also takes web calls; still publishes), `stored_context_has_no_writer` (a
binding input reads `kind: "stored"`, which nothing ever fills — read it from `request` or
an `artifact` instead), `input_constant_placeholder` (a **required** tool input is a
`literal` that reads as a stand-in — `n/a`, `TBD`, `TODO`, `test`, `xxx`, empty, the Hebrew
`לא רלוונטי` or `ל"ר` — and is sent exactly as written on every call), or the generic
`workflow_warning`. The last two put `path` on the input itself,
`/bindings/{n}/inputs/{field}`, and neither refuses a publish.
Never discard an unknown warning or treat advisory ordering as enforced execution. A tool
bound into a **phase** its contract excludes (`binding_phase_unsupported`) is not a
warning — it is a refusal in `issues[]` and blocks Check/Publish, because no picker ever
offers that combination and no published agent has that shape. Explain a Strict change
before publishing; accepted runs keep their exact published artifacts. A 409 means review
the saved version/dependency changes, not blindly fetch a fresh token and resend.
`WORKFLOW_SETTINGS_TOO_LARGE` (413) leaves saved data intact and blocks publication until
technical settings fit.
No authoring endpoint starts a real call.

---

### DELETE /agents/:id

Archives the agent and removes it from ordinary lists while retaining workflow/run
history. New calls are blocked; running calls are not aborted. PATCH cannot undo
archival. Same-key creation replay returns 410. To pause reversibly, PATCH
is_active=false; the agent stays visible and can be reactivated.

**Scopes:** `agents:update`

**Response:** `200` — `{ "success": true }`

---

## Tools

### Unified versioned Tools

The explicit `workflow` variant creates reusable HTTP, connected-app and named transfer
tools in one registry. It is distinct from the temporary legacy `type`/`config` bodies
below. Send `x-company-id` for the chosen workspace on every dashboard mutation; API
keys remain company-scoped. IDs, revision numbers and head generations are server-owned.

| Endpoint | Scope | Workflow contract |
| --- | --- | --- |
| `GET /tools?workflow=true` | `tools:read` | Safe current/candidate projections, 1–50 records; opaque company/environment/limit-bound `cursor`. |
| `GET /tools/{id}` | `tools:read` | Exact tool status, current revision and candidate/promotion state. No private HTTP headers or URL query values. |
| `GET /tools/{id}/schema` | `tools:read` | Current typed input/output schemas; not a raw execution contract. |
| `POST /tools` | `tools:create` | `{name, description?, workflow}` and mandatory `Idempotency-Key`; `201` materialized, `202` durably pending, `200` replay of a ready identity. |
| `PATCH /tools/{id}` | `tools:update` | `name`, `workflow.kind`, what that kind is built from and the fields you are changing, plus `expected_head_revision_id` and numeric `expected_head_generation`, with an Idempotency-Key. Every field left out keeps its value (see **A `PATCH` changes what it sends** below). Creates a candidate, never overwrites a frozen revision. |
| `DELETE /tools/{id}` | `tools:update` | Archives a workflow tool while retaining revisions/history; legacy deletion remains separate. Idempotent: an already-archived tool answers `200` again and keeps its first archive time, so only a tool outside the workspace is `404`. There is no `tools:delete` scope — a key cannot be issued with one. |
| `GET /tools/{id}/workflow-revisions` | `tools:read` | The 100 newest contract revisions of one saved tool, newest first. Stored endpoint configuration is stripped from every row. |
| `POST /tools/{id}/workflow-revisions` | `tools:update` | `{expected_revision, contract}` only; `201` with the new revision. Compare-and-swap on `expected_revision` (`null` when the tool has none). |
| `GET /tool-apps` | `tools:read` | Curated discovery page, not account readiness. Toolkit-list versions may be absent. |
| `GET /tool-apps/{slug}` | `tools:read` | App detail and available dated versions. |
| `GET /tool-apps/{slug}/actions?version=YYYYMMDD_NN` | `tools:read` | Version-specific action page, up to 50 rows; pass opaque cursors unchanged. `&search=` filters it (below). |
| `GET /tool-apps/{slug}/actions/{action}?version=YYYYMMDD_NN` | `tools:read` | Full authoritative input/output schemas, local metadata ID, scope alternatives and reviewed eligibility/fixed-field policy. `latest` is not a pin. |

**Discovery.** An app whose publisher has not dated it comes back on `GET /tool-apps`
with `version: null`; that is normal, not an error. Ask for `GET /tool-apps/{slug}`
before choosing an action version, and expect `422 WORKFLOW_DATED_VERSION_REQUIRED`
there for a `version: null` app — it cannot be used yet, pick another.

The `/tool-apps` reads forward the catalog service's own failures: a `WORKFLOW_*` code
you will not find documented elsewhere — `WORKFLOW_DATED_VERSION_REQUIRED` above is the
one named exception — always carried as `422` or `503`. Branch on the status, not the
code — retry a `503` unchanged; a `422` means the catalog rejected the request itself, so
re-read the app or action and correct the query.

**Finding an action.** `GET /tool-apps/{slug}/actions?version=<dated>&search=free%20slots`
filters by name, slug and description in the catalogue itself (1–100 characters, one line,
up to 50 matches per page) and echoes `search`; a page without `search` was not filtered.
An empty, over-100-character or multi-line `search` is `422 WORKFLOW_CATALOG_SEARCH_INVALID`. Action names are
English.

**Connected-app slugs.** The `{slug}` in `/tool-apps/{slug}` and its action routes matches
`^[a-z0-9_]{1,100}$` — lowercase letters, digits and underscores. Google Calendar is
`googlecalendar`; `google-calendar` is a `404 WORKFLOW_NOT_FOUND`. Use whatever
`GET /tool-apps` returned, verbatim. The `toolkit` you send to `POST /tool-connections`
is the same shape, but from the different, shorter `GET /tool-apps/connection-options`
list — see **Connected accounts** below; a slug from `GET /tool-apps` that this workspace
has not opened for connection fails there with `409 CONNECTION_APP_UNAVAILABLE`.

HTTP example (no request is dispatched by saving):

```json
{
  "name": "Lookup order",
  "workflow": {
    "kind": "http",
    "input_schema": {"type":"object","properties":{"order_id":{"type":"string"}},"required":["order_id"],"additionalProperties":false},
    "output_schema": {"type":"object"},
    "configuration": {"url":"https://example.com/orders","method":"POST","headers":{}},
    "effect": "read",
    "timeout_ms": 10000
  }
}
```

HTTP schemas are explicit; timeouts are 1–60,000 ms. App definitions use
`{kind:"app", metadata_id, connection_id, fixed_inputs}`: select the exact ready local
account and only policy-permitted typed fixed fields. The provider's full raw schema
is validated after fixed-field composition; model/test arguments cannot override those
fields or replace account/action/version. `required_scopes.all_of` requires every scope;
each `any_of` group requires at least one alternative. Unsupported completion/file
semantics fail visibly; a provider success flag does not prove remote jobs completed.
Transfer definitions use `{kind:"transfer", destination, announce_transfer?,
announce_message?}` with a fixed international number. Create a separate tool for each
named destination; they are during-phone-only. Intrinsic End is not in this catalog.

**Importing an existing saved tool.** A tool created through the earlier `type`/`config`
bodies has no contract until you add one. `POST /tools/{id}/workflow-revisions` adds an
immutable revision so a workflow can use it. The body is strictly
`{expected_revision, contract}` — any other property is `400 WORKFLOW_REQUEST_INVALID`.
`contract` requires object `input_schema` and `output_schema` and optionally
`allowed_phases` (default all three), `allowed_channels` (default both), `timeout_ms`
(default 30000), `effect` (default `write`), `replay_safe` (default false) and
`include_call_context` (default `true` — every request this tool makes carries the call
under `call`; send `false` to stop that for one tool without touching its mapped inputs,
which still substitute `{{call.field}}` either way). The default is silence: a contract
that says nothing, or says `true`, stores no key and the revision comes back without the
field; only `false` is ever recorded, and turning it back on is a revision that says
nothing again. Anything other than `true`/`false` is `400 WORKFLOW_REQUEST_INVALID`. Name,
description and private endpoint configuration are read from the saved tool and cannot
be supplied here. Transfer tools always come back as during-phone-only, `terminal` and
not replay-safe, whatever the request asked for. Send the highest `revision` you read
from the list as `expected_revision`; a stale value is `409 WORKFLOW_CONFLICT` and
writes nothing. Only tools that call your own endpoint or transfer a call can take a
revision — anything else is `422 WORKFLOW_TOOL_IMPORT_REQUIRED`. Revisions are additive:
a workflow that already pinned an earlier revision keeps it until it is published again.

**Names are not unique.** Two tools in one workspace may share a name; a create whose
name is already taken is not refused — it answers `201`/`202` with the tool plus
`warnings: [{ code: "tool_name_in_use", message, tools: [{id, name}] }]`. Treat
`warnings` as optional and never as a refusal — the tool in the same response was
created either way; match tools by `id`, not by name.

**A tool whose creation failed** (`workflow.status: "failed"`, `workflow.current: null`,
e.g. `connection_unavailable`) is not a dead end. `GET /tools/{id}` shows what it asked
for under `workflow.requested` (an app tool's `metadata_id`, `connection_id`, `toolkit`,
`action`, `version`, `fixed_inputs`; a transfer tool's destination and announcement). Fix
the cause (connect the account), then `PATCH /tools/{id}` with the **whole** tool, **no**
`expected_head_*` fields and a **new** `Idempotency-Key`: it is built under the same id
(`200` once current, `202` while building, `422` if it fails again) and needs
`tools:create` as well as `tools:update`. An expected-head field on that retry is `422`;
a creation still being built is `409 WORKFLOW_TOOL_CONFLICT`. Or `DELETE /tools/{id}` to
remove it (a repeat answers `200`). Testing it first answers `409 WORKFLOW_TOOL_NOT_READY`.

**Ids that name nothing.** An app tool whose `metadata_id` is not an action from
`GET /tool-apps/{app}/actions/{action}`, or whose `connection_id` is not one of this
workspace's `GET /tool-connections` rows, is `400 WORKFLOW_TOOL_REFERENCE_INVALID` with
`issues[].path`, and nothing is written. An account that exists but is not ready is still
`422` with the failed tool — fix it with the `PATCH` above.

Keys contain 16–128 letters, digits, `_` or `-`. Preserve the identical accepted body
and key after a lost response; reusing a key with changed content is
`409 WORKFLOW_TOOL_IDEMPOTENCY_CONFLICT`. A stale `expected_head_revision_id` /
`expected_head_generation` pair on `PATCH /tools/{id}` is `409 WORKFLOW_TOOL_CONFLICT`
and saves nothing — re-read `GET /tools/{id}` and send back its `workflow.head_revision_id`
and `workflow.head_generation` under those two request names. Poll the returned
tool identity until materialization is terminal. A pending request is not a duplicate
creation opportunity. Invalid contracts return `422`; unavailable control returns
`503`, never permission to switch to legacy tooling. Accepted changes are at most
256 KiB. Preserve nested schemas, defaults, combinators and exact JSON numbers; use a
lossless JSON client for values outside JavaScript's safe integer range.

**A `PATCH` changes what it sends and nothing else.** Every field you leave out keeps the
value the tool already has — `description`, `effect`, `timeout_ms`, `configuration.method`,
`include_call_context`, an app tool's `fixed_inputs`, a transfer tool's `announce_transfer`
and `announce_message`. Send a field only to change it. That includes the call package: a
tool with `include_call_context: false` stays that way until a change sends
`"include_call_context": true` — leaving the key out keeps it off. A `description` sent as
`""` clears it on purpose. What a change cannot leave out is what names the tool and what
its kind is built from: `name`, `workflow.kind`, `expected_head_revision_id` and
`expected_head_generation`, and for an HTTP tool `input_schema`, `output_schema` and
`configuration` (`{}` when the endpoint is not changing), for an app tool `metadata_id` and
`connection_id`, for a transfer tool `destination` — leave one out and it is a `422` naming
it. (Before 2026-09-22 a header rotation that omitted `effect` and `timeout_ms` reset them to
`write` and `30000` — a lookup tool silently became one the platform may call as a write —
and one that omitted `description` blanked the sentence an agent picks the tool by.) `url`
and `headers` keep the rules below, because their stored values are never handed back.

On HTTP updates, omit private `configuration.url`/`headers` to retain their exact saved
values. Empty headers clear them. `url_display` is non-executable text: never put it
back into `url`; an explicit URL replaces the entire value including legitimate query
parameters. Promotion preserves the old head until every affected follow-current
workflow validates and the complete affected set/freshness is rechecked atomically.
Explicit pins and accepted runs stay unchanged. Each compile input has a 1 MiB technical
budget; this is not a fanout cap. Failed/conflicting promotion makes no partial update.

**Reading an HTTP tool back is lossy.** `configuration` returns `url_display` (scheme,
host, path), `url_redacted`, `configured_query_names`, `configured_header_names` and the
constant `url_replacement_required: true`. That constant is a rule, not a flag: a
revision that changes the URL must send the whole URL again, query string included;
omit the field to keep the saved one. Never echo `url_display` back as the replacement
URL.

**Headers on a workflow-owned HTTP tool are updated per header, not as a whole map.**
Stored values are never returned, so on `PATCH /tools/{id}`:

| What you send | What happens |
| --- | --- |
| no `workflow.configuration.headers` key | every stored header is kept |
| `"headers": {}` | every header is cleared |
| `"X-Client": "client-42"` | that header is set |
| `"Authorization": null` | the value already stored under that exact name is kept |
| a stored name you leave out of a `headers` you did send | that header is removed — this is the delete syntax. To change one header, send every header you want to keep, with `null` for each value you were never shown |

`null` is refused outright on `POST /tools`, as `WORKFLOW_TOOL_REQUEST_INVALID` pointing
at `/workflow/configuration/headers/<name>`. On `PATCH` the request is accepted and the
check happens while the revision is built, so a `null` under a name with no stored value
comes back as `422` carrying the tool with `workflow.status: "failed"` and
`workflow.error_code: "tool_contract_invalid"` — no `issues[]`. The names to use are the
ones `GET /tools/{id}` returns in `configuration.configured_header_names`; matching is
exact, so renaming a header means sending its value again.

A duplicated agent shares the original's tools by the same `tool_revision_id` pin unless it
was duplicated with `fork_tools: true` — see **POST /agents/:id/duplicate** above. To give
an existing copy its own endpoint instead of moving both, create a new tool and rebind the
copy's step to it (see **Point a binding at another tool** above).

#### Standalone saved-tool tests

| Endpoint | Scope | Contract |
| --- | --- | --- |
| `POST /tools/{id}/test` | `tools:update` | Mandatory Idempotency-Key; `202` shared-journal test admission. No agent/call is fabricated. |
| `GET /tools/{id}/tests/{test_id}` | `tools:read` | `200` exact reauthorized test projection; a run ID grants no call-history access. |
| `POST /tools/{id}/tests/{test_id}/cancel` | `tools:update` | `200` stops new dispatch, preserves history and already-started effects. |

```json
{"phase":"before","channel":"phone","inputs":{"order_id":"example-order"},"mock_output":{"found":true},"policy":"mock","allowed_binding_ids":[]}
```

Phase (`before|during|after`) and channel (`phone|web`) are required validation context,
not live-call authority. Optional `revision_id` pins an exact revision of this tool;
otherwise acceptance freezes the current head. Same-key replay retains that revision
after head changes. Inputs are an object; mock output may be any schema-valid JSON.
Mock is the default and makes no provider/HTTP request. Explicit `policy:"allowlist"`
with `allowed_binding_ids:["test_tool"]` permits only this binding's effect through the
common executor. Empty allowlists grant no effect; `real` is unsupported. Transfers are
always mock-only and require during/phone context. Obtain authorization before choosing
an effectful policy. The isolated test service currently supports local/testing only;
unconfigured or unsupported environments fail with `503`.

Requests are at most 512 KiB; inputs/mock output each at most 256 KiB. At most eight
active unexpired tests per workspace; admission beyond that returns `429`. Malformed
contracts return `422`; changed idempotent content `409`; missing/foreign resources or
same-key replay by a different original author `404`; denied current workspace
authority `403`. Reading and cancelling carry none of that: they take no body and no
key, so they answer only `403`, `404`, `503` and the account-wide `401` — the `409`, `422`
and `429` above belong to starting a test. Other authorized workspace members may
read/cancel a test with the appropriate tools scope. Poll with bounded backoff using the returned deadline.
States are accepted, prepared, running, succeeded, failed, blocked, pending, unknown or
cancelled. Treat unknown plus `resolution:manual_reconciliation_required` as no-retry:
a late receipt can be shown without changing the settled status. Do not repeat an
uncertain effect automatically. Public output is a bounded/redacted preview, not raw
vendor evidence or reusable execution input; inspect `redaction`, `receipt_settled_test`
and `resolution` alongside IDs/status. Fixed account, URL, action and destination remain
immutable through testing. Tool tests and call tests are separate authorization subjects.

### GET /tools

List all tools. Optionally filter to a specific agent. `GET /tools` and
`GET /tools?workflow=true` answer every row in the same shape that row's own
`GET /tools/{id}` answers with — a workflow-owned tool carries `workflow_version:
"workflow_v1"` and its `workflow` object (see **GET /tools/:id** below) and has no
`type`/`config`; a legacy row carries `type`/`config` as shown below, and never
`workflow`.

**Scopes:** `tools:read`

**Query params:**
- `agent_id` (uuid, optional) — filter to tools attached to this agent
- `name` (optional) — case-insensitive, anywhere in the name, literal (`%`, `_` and `*`
  are not wildcards); newest first; `pagination.total` counts the matches. Names are not
  unique — match on `id` afterwards. An empty, repeated or over-200-character `name` is
  `400 TOOLS_QUERY_INVALID`. `name` is not a filter on `GET /tools?workflow=true` (the
  revision catalog): sending it there is `400 TOOLS_QUERY_INVALID` — use the default
  `GET /tools?name=`, whose workflow rows carry the same `workflow` object.
- `limit`, `offset` — paging. The default list takes only `workflow`, `agent_id`,
  `limit`, `offset` and `name`; anything else — `status` and `cursor` included — is
  `400 TOOLS_QUERY_INVALID`, naming it.

**With `workflow=true`** (the workflow tool catalog, 1–50 rows a page, paged by
`cursor`/`next_cursor`) the parameters are `limit`, `cursor` and:
- `status` (optional, **only here**) — a create that is accepted but cannot be built stays
  in the workspace at `workflow.status: "failed"` (reason in `workflow.error_code`,
  `workflow.current: null`); those rows, and only those, are left out of this list.
  `status=failed` finds one, `status=all` keeps the page whole. Any other value is
  `422 WORKFLOW_TOOL_REQUEST_INVALID`. A tool whose later *edit* failed also reads
  `status: "failed"` but keeps its promoted head (`workflow.current` set), is still
  bindable, and stays on the list. A failed creation is never on the default list: find
  it with `GET /tools?workflow=true&status=failed`.

**Response (legacy row shape):**
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
    "configured_header_names": ["Authorization"],
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
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

**A workflow-owned tool has no `type` and no `config`.** It carries
`workflow_version: "workflow_v1"` and a `workflow` object instead: `current`,
`candidate`, `head_revision_id`, `head_generation`, and the current revision's
`configuration.configured_header_names`. See **Unified versioned Tools** above for the
full contract, and **the two revision tokens** paragraph there for
`head_revision_id`/`head_generation`.

**A legacy tool's request header values are never returned.** `GET /tools`,
`GET /tools/:id`, `GET /tools?agent_id=`, the tools embedded in `GET /agents`, and the
objects `POST`/`PATCH /tools` echo back all report `config.configured_header_names` — the
names, sorted — and carry no `config.headers` at all.

Writing them is per header, not as a whole map:

| What you send in `config` | What happens |
| --- | --- |
| no `headers` key | every stored header is kept |
| `"headers": {}` | every header is cleared |
| `"X-Client": "client-42"` | that header is set |
| `"X-Yappr-Webhook-Secret": null` | the value already stored under that exact name is kept |
| a stored name you leave out | that header is removed |

So reading a tool and sending its `config` straight back to `PATCH /tools/{id}` is safe:
`configured_header_names` is dropped on the way in and every stored header survives. A
`null` under a name with nothing stored is a plain `400` naming `configured_header_names`
— on `POST /tools` always, since nothing is stored yet.

---

### GET /tools/:id/bindings

Answers the one question a credential rotation depends on: which agents reference this
tool, and does the new revision reach them.

**Scopes:** `tools:read`

**Response:**
```json
{
  "tool_id": "uuid",
  "head_revision_id": "uuid | null",
  "total": 2,
  "has_more": false,
  "data": [
    {
      "agent_id": "uuid",
      "agent_name": "string",
      "environment": "testing",
      "binding_id": "string",
      "tool_revision_policy": "follow_current" | "pinned",
      "tool_revision_id": "uuid",
      "effective_revision_id": "uuid | null",
      "rotation_reaches": true,
      "published": true,
      "draft": true
    }
  ]
}
```

Each row is one binding: the agent, the binding id inside its workflow document,
`tool_revision_id` (the revision the binding names) and `effective_revision_id` (the
revision calls actually use). `published: true` means the binding is in the revision
that agent is taking calls from right now; `draft: true` means it is in the draft an
author is editing — a binding can be both.

**Rotating a credential:** `PATCH /tools/{id}` with the new header values, then read this
route. Rows with `rotation_reaches: true` need nothing — the binding moves with the tool.
Rows with `rotation_reaches: false` (always `tool_revision_policy: "pinned"`) are held on
the revision they name, which still carries the **old** header value: save that binding
back to `follow_current` (a whole-document save) or `POST /agents/:id/workflow/rebind`,
then publish that agent. Header values are never returned here, or anywhere.

`total` counts every binding referencing the tool, including any beyond the page;
`has_more` says whether the page was cut. `head_revision_id` is `null` only while a
brand-new tool is still being built.

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
| `config.url` | string | yes | Final public HTTP(S) URL. Localhost, cloud-metadata hosts, non-global literal or DNS-resolved addresses, mixed public/private DNS answers, and redirects are rejected; configure the final destination directly. |
| `config.method` | string | no | One of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. |
| `config.headers` | object | no | String-valued request headers, e.g. `{"Authorization": "Bearer secret"}`. Routing/framing headers (`Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Expect`, `Keep-Alive`, `Proxy-*`, `TE`, `Trailer`, `Upgrade`) are rejected. |
| `config.timeout_seconds` | number | no | 1–60 seconds; default `30`. |
| `config.payload_config.include_standard_metadata` | boolean | no | Default `true` — includes `company_id`, `agent_id`, `agent_name`, `call_id`, `call_direction`, `caller_number`, `callee_number`, `call_metadata`, and `call_variables`. |
| `config.payload_config.static_parameters` | array | no | Each item: `{ "name": "camelCase", "value": "string" }` |
| `config.payload_config.extraction_parameters` | array | no | Each item: `{ "name": "camelCase", "description": "string", "required": true }`. `required` is optional and defaults to `true`; set it to `false` when a missing value must not block dispatch. |
| `idempotency_key` | string | no | UUID for safe retries |

**Important constraints:**
- `name` MUST be camelCase English. No snake_case, no spaces, no Hebrew.
- `extraction_parameters` and `static_parameters` MUST be nested inside `payload_config` inside `config`. NOT at the top level.
- All parameter names are normalized to camelCase automatically.
- `description` fields for extraction parameters can be in any language including Hebrew.
- `required` must be a boolean when provided. Required values are collected before dispatch; optional values are sent only when available.
- Webhook actions are dispatched once. `retry_count` is unsupported because an automatic replay could duplicate a non-idempotent operation.

**Response:** `201` — full tool object

**A legacy create renames your tool.** `POST /tools` with a `type`/`config` body stores
the name camelCased: `notify-no-show` is created as `notifyNoShow`,
and a legacy `PATCH /tools/{id}` that renames a tool does the same. Read the stored name
back out of the response and use that when you look the tool up or name it in a
prompt — the string you sent will not match. A name sent with the `workflow` variant is
stored exactly as given, trimmed only.

---

### PATCH /tools/:id

**A workflow-owned tool** (`workflow_version: "workflow_v1"`) is updated with the `workflow`
body — see **A `PATCH` changes what it sends and nothing else** under *Unified versioned
Tools* above: every field you leave out keeps its value. The rest of this section is the
legacy `type`/`config` body.

Update a legacy webhook tool. Only include fields that should change.

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

Attach a tool to an agent. **Legacy attachment only — this does not work for an agent
this API creates.** Every such agent is a workflow agent, so this endpoint answers
`409 WORKFLOW_TOOL_OWNER_REQUIRED`. Give a workflow agent a tool through its document
instead — see **Giving an agent a tool** under *Canonical workflow authoring* above.

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

**`POST /tools/{id}/test` has two contracts, on the same path.** A workflow-owned tool
answers `202` with a `test_id` to poll (see **Standalone saved-tool tests** above) and is
mock-by-default. A legacy `type`/`config` tool, documented below, delivers immediately and
answers `200` with `payload_sent`, or `502`/`504`. Which one you get depends on the tool,
not on the request.

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
| `caller_number`, `callee_number` | PSTN / WebRTC | E.164 on a phone call. On a call that arrived on a SIP endpoint, `callee_number` is the endpoint's address — its credential, so do not log or forward it — and `caller_number` is whatever the customer's phone system sent |
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

**Scopes:** `phone_numbers:search` (there is no `phone_numbers:read`)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "number": "+972XXXXXXXXX",
      "friendly_name": "string | null",
      "provider": "telnyx" | "external",
      "status": "active" | "pending_requirements" | "suspended",
      "is_active": true,
      "inbound_agent_id": "uuid | null",
      "outbound_agent_id": "uuid | null",
      "inbound_split": { "agent_id": "uuid", "percent": 30 } | null,
      "outbound_split": { "agent_id": "uuid", "percent": 30 } | null,
      "sip_inbound_configured": true,
      "sip_outbound_configured": true,
      "country_code": "string | null",
      "monthly_cost": 0 | null,
      "created_at": "ISO8601",
      "carrier_account": { "id": "uuid", "name": "string", "provider": "telnyx", "status": "untested" | "active" | "paused" } | null,
      "ownership_verified_at": "ISO8601 | null"
    }
  ]
}
```

`provider` is `telnyx` for a number bought from Yappr and `external` for a number in the
customer's own Telnyx account (see **Carrier Accounts** below). Only an `external` number
carries `carrier_account` — the account it calls through, never its key — and
`ownership_verified_at`: when the customer's Telnyx key last proved the number is theirs;
`null` means Telnyx no longer lists it and it cannot place calls until a carrier-account
test finds it again. On an `external` number `monthly_cost` is `null`: Yappr charges
nothing for it. A campaign or `POST /calls` needs `is_active: true` and
`status: "active"`.

`inbound_split` / `outbound_split` is the number's two-agent A/B test on that
direction, or `null` when it always answers with the one bound agent.
`percent` is the **second** agent's share (`agent_id` inside the split object)
— the bound agent keeps the rest. See **PATCH /phone-numbers/:id** below for
how to set it.

**These fields are the whole of a phone number.** The same object is what
`from_phone_number` expands to on a campaign (and anywhere else a number is
embedded) — one projection, one allowlist. A stored row also holds the carrier
account's own plumbing; none of it is part of this object, none of it is
returned, and nothing in your integration should expect a provider or order
id, a SIP trunk or credential id, or SIP usernames and secrets from this API.

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

Assign inbound and/or outbound agents to a phone number. Also accepts
`inbound_split` / `outbound_split`, the same shape `PATCH /phone-numbers/:id`
takes — that endpoint below is the preferred one for new integrations.

**Scopes:** `phone_numbers:configure`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `phone_number_id` | uuid | yes | The number's internal UUID (from GET /phone-numbers) |
| `inbound_agent_id` | uuid | no | Agent to handle inbound calls |
| `outbound_agent_id` | uuid | no | Agent to use for outbound calls |
| `inbound_split` | object \| null | no | See **PATCH /phone-numbers/:id** |
| `outbound_split` | object \| null | no | See **PATCH /phone-numbers/:id** |

**CRITICAL:** All fields use `snake_case`. Using camelCase returns a 400 error.

**Response:** `200` — updated phone number object. Also answers `400` (missing
`phone_number_id`, invalid JSON, or an agent change while the number is
`pending_requirements`), `403` (the number belongs to another workspace) and `404`
(unknown id) — not only `200` / `422`.

**Takes effect immediately.** There is no staging step. The moment this call returns
`200`, the number's next call goes to the agent you named — including a call that is
already ringing but has not been answered yet; calls already connected finish with the
agent that answered them. Nothing warns you that the number was busy. Before pointing a
production number at a different agent, read it back with `GET /phone-numbers` and find
the row by `id` — there is no GET for a single number, and the call list has no
per-number filter, so to see how busy a number is, open it in the dashboard, which shows
per-direction counts and asks you to confirm. To undo, send the previous agent ids back.

**One number per location.** A number answers with exactly one agent, so a customer with
several branches buys a number per branch, creates (or duplicates) an agent per branch,
and calls `configure` once per number. The number dialled is what decides which branch
the caller reached — there is no routing to write inside the agent. Outbound works the
same way: set `outbound_agent_id` on that location's number and place the call with
`from` set to it; an explicit `agent_id` on `POST /calls` always wins.

**Partial updates.** `PATCH /phone-numbers/:id` and this endpoint write only the fields
the request names. An omitted field is left alone — it is not read back and re-sent — so
two callers changing different fields on the same number do not overwrite each other.
Send an explicit `null` to unbind an agent or clear a name; send
`{"inbound_split": null}` to stop a split. A body with no writable field answers `200`
and writes nothing.

Do not "read the number, then send the whole object back". That pattern reverts any
change made between your read and your write. Send just the field you are changing.

---

### PATCH /phone-numbers/:id

Update one number's agent bindings, its friendly name, or its A/B tests.
Preferred over `configure` for anything touching a split.

**Scopes:** `phone_numbers:configure`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `friendly_name` | string \| null | no | |
| `inbound_agent_id` | uuid \| null | no | |
| `outbound_agent_id` | uuid \| null | no | |
| `inbound_split` | object \| null | no | `{ "agent_id": "uuid", "percent": 1-99 }`, or `null` to turn the test off |
| `outbound_split` | object \| null | no | Same shape. Applies when `POST /calls` is sent **without** an `agent_id` — see **POST /calls** below |

```bash
# Send 30% of this number's incoming calls to a second agent, keep 70% on the bound one
curl -X PATCH "https://api.goyappr.com/phone-numbers/PHONE_NUMBER_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "inbound_split": { "agent_id": "SECOND_AGENT_ID", "percent": 30 } }'

# Turn it off
curl -X PATCH "https://api.goyappr.com/phone-numbers/PHONE_NUMBER_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "inbound_split": null }'
```

**`percent` is the SECOND agent's share.** The number's already-bound agent
(`inbound_agent_id` / `outbound_agent_id`) keeps `100 - percent`. The second
agent must belong to your workspace and must differ from the bound one.

**Which agent answers a given call never changes mid-call and never re-rolls
on retry** — it is derived once from the carrier's call id (inbound) or the
request's `Idempotency-Key` (outbound).

**A second agent that cannot take calls yet — inactive, or an unpublished
workflow — is not an error at configure time.** The split saves, but every
call quietly goes to the first agent until the second one is ready, and the
call record marks it with `metadata.ab_variant_fallback: true`. Publish the
copy (see **Duplicating an agent to A/B test a change** in `SKILL.md`) before
you expect it to receive anything.

**Read the results** with `GET /calls?ab_variant=a` / `?ab_variant=b`, or the
`ab_variant` field on each call.

**Campaigns and BYOC SIP endpoints do not use this.** Campaigns run their own
per-contact split (`split` on `POST /campaigns` — see **Campaigns** below);
SIP endpoints carry no split at all.

**Response:** `200` — updated phone number object, same shape as `GET /phone-numbers`.

| Status | Code | When |
|---|---|---|
| 404 | — | No such number in this workspace |
| 422 | `INVALID_SPLIT` | `percent` outside 1–99, the split's second agent is the one already bound, or the split is neither an object nor `null` |
| 404 | `AGENT_NOT_FOUND` | `inbound_agent_id`, `outbound_agent_id`, `inbound_split.agent_id` or `outbound_split.agent_id` is not an agent in this workspace (made up, another workspace's, or archived) — `message` names the field. It used to be `422 INVALID_AGENT` |
| 400 | — | A field this endpoint does not update, or the number is still `pending_requirements` |

---

## SIP Endpoints

BYOC (Bring Your Own Carrier) SIP endpoints let a customer route inbound
calls from their own telephony system to a Yappr agent **without**
purchasing a Yappr-managed phone number. Each endpoint is a SIP URI of
the form `sip:{slug}@yappr-byoc.sip.telnyx.com`.

There is **no SIP digest auth** at the protocol layer. The slug embedded
in the URI is the bearer credential — server-generated with ~120 bits of
random entropy in its 24-char suffix, so unguessable. Treat the full URI
like an API key: anyone who has it can dial the agent, billed to the
workspace.

**What is not enforced — say so before handing a URI out:**

- **No TLS.** Calls reach the URI over UDP or TCP, port 5060. TLS is not
  available on these addresses, so the URI travels in clear text between the
  customer's phone system and Yappr, and sits in its configuration, logs and
  SIP traces.
- **No source filtering.** `allowed_source_ips` is stored with the endpoint
  for the customer's records, but no call is checked against it: a call to the
  URI is answered wherever it comes from.
- **The URI is not hidden everywhere.** A call that arrives on an endpoint
  reads `to: null` and carries `sip_endpoint_id` on `GET /calls` and
  `GET /calls/:id`, and its `To` is empty in the export. The dashboard's call
  logs still show the URI as the number called, and the call details tools and
  webhooks receive carry it as `callee_number`.
- **What does limit exposure:** who can read the phone system's configuration,
  `is_active: false` while the endpoint is not in use, and rotating the URI
  (create a new endpoint, repoint the phone system, then delete the old one)
  whenever it may have been seen.

Use SIP Endpoints when the customer already has a business line and
wants Yappr to answer specific calls (overflow, after-hours, escalations)
while keeping their existing telephony in place. Use phone numbers when
they want Yappr to own a new DID outright. The two coexist — a single
agent can answer calls from both.

**Caller-ID trust:** for calls arriving via SIP endpoints, the
calling-party number is whatever the customer's upstream sends —
attacker-controlled if the upstream is compromised. By default Yappr
does **not** use that number for lead-memory lookups or returning-caller
recognition, on any call that arrives via a SIP endpoint. There is no setting
to change that, in the API or the dashboard.

### GET /sip-endpoints

List the company's SIP endpoints.

**Scopes:** `sip_endpoints:read`

**Query params:**
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | int | 50 | 1–200; a larger value is capped at 200 |
| `offset` | int | 0 | for pagination |

Newest first. Any other parameter (a filter such as `status` or `name`) is
`400 SIP_ENDPOINT_QUERY_INVALID`, not answered with every endpoint. Each row's
`sip_uri` is the endpoint's credential.

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
| `name` | string | yes | 1–200 characters, shown in the dashboard |
| `inbound_agent_id` | uuid | yes | An agent in this workspace; it answers every call to the endpoint |
| `slug` | string | no | The readable start of the address: 2–12 characters. Server appends a hyphen and a 24-char random suffix |
| `allowed_source_ips` | string[] | no | Up to 50 IPv4/IPv6 addresses, each optionally with a `/prefix`. **Recorded only — no call is checked against it.** `[]` and `null` both mean no list |

Slug rule: 2–12 lowercase letters, digits and single hyphens, starting and
ending with a letter or digit (letters are lowercased), and not a reserved
word — `yappr`, `admin`, `internal`, `system`, `api`, `sip`, `telnyx`,
`trunk`, `root`, `test`, `sudo`, `support` — alone or followed by a hyphen. A
slug that does not fit is refused with `400 SIP_ENDPOINT_REQUEST_INVALID`,
never rewritten. Leave it out and the prefix is derived from `name`, cut to
12 characters.

Any other field — `sip_username`, `sip_password`, `transport`,
`require_tls`, a typo — is refused with `400 SIP_ENDPOINT_REQUEST_INVALID`,
by name, rather than dropped, and nothing is created.

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

The customer pastes the value of `data.sip_uri` into their telephony
platform's outbound SIP route: authentication none, UDP or TCP on port 5060
(TLS is not available), G.711 (µ-law or A-law) or G.722. No username, no
password.

---

### GET /sip-endpoints/{id}

Get one endpoint. Same fields as the list response.

**Scopes:** `sip_endpoints:read`

---

### PATCH /sip-endpoints/{id}

Update name, inbound agent, active state, or the recorded source addresses.
Send at least one. The slug is immutable: a body with `slug` is refused with
`400 SIP_ENDPOINT_REQUEST_INVALID`, and so is any other field the endpoint does
not read, by name. To move to a different URI, create a new endpoint, point the
phone system at it, then delete this one.

**Scopes:** `sip_endpoints:manage`

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | new label |
| `inbound_agent_id` | uuid | agent must belong to this company |
| `is_active` | bool | `false` switches the endpoint off without deleting it: calls to its URI are rejected before they are answered until it is switched back on |
| `allowed_source_ips` | string[] \| null | replace the recorded list (not enforced); `[]` or `null` clears it |

**Response:** `200` — `{ "data": { ...endpoint } }`.

---

### DELETE /sip-endpoints/{id}

Hard-deletes the endpoint. New calls dialing the slug get rejected
pre-answer; in-flight calls finish. A deleted URI is never handed out again.
To rotate access, **create first**: create a new endpoint, point the phone
system at its `sip_uri`, then delete the old one — deleting first drops every
call until the new URI is in place.

**Scopes:** `sip_endpoints:manage`

**Response:** `200` `{ "ok": true }`

---

## Carrier Accounts (the customer's own Telnyx account)

Let agents call **from numbers the customer already owns at Telnyx** — nothing ported,
no Yappr number bought. Yappr places each call on a Call Control App in the customer's
own Telnyx account, with an API key they gave Yappr, so **Telnyx bills their account**
for the phone minutes and its own fees (call control, media streaming, recording, noise
suppression). **Yappr bills the agent minutes** at the usual per-minute rate. The agent,
the recording, the transcript and the webhooks are the same as on any other call, and
the recording is copied into Yappr when the call ends.

**Outbound only.** Calls *to* these numbers keep going wherever they go in Telnyx today.
To have an agent answer them, route the number in Telnyx to a SIP endpoint (above).
Setting `inbound_agent_id` on one of these numbers is
`422 INBOUND_NOT_AVAILABLE_ON_EXTERNAL_NUMBER`.

**Available to every workspace.** There is nothing to switch on: any workspace can
connect its Telnyx account from the dashboard (**Phone numbers → Your carrier**) or
through the routes below. Yappr can switch the feature off for one workspace in an
emergency; that workspace's routes then answer `403 CARRIER_ACCOUNTS_NOT_ENABLED` (body
`{error, code, enabled: false}`) and nothing is sent to Telnyx — contact Yappr support.

**Scopes:** `carrier_accounts:read` (every `GET`) and `carrier_accounts:manage` (every
other method — `test` included, because it uses the customer's Telnyx key). Every
workspace can grant them, but they are opt-in: no existing key was given them and a new
key does not start with them, so tick the **Your carrier (Telnyx)** scope group in
Settings → API keys. A key without the route's scope gets `403 INSUFFICIENT_SCOPE` naming
the scope — the same status as the emergency switch-off, so branch on `code`. In
the dashboard, only owners and admins can change a carrier account.

| Method | Path | What it does | Daily limit |
|---|---|---|---|
| GET | `/carrier-accounts/status` | `{"enabled": true}` — or `403 CARRIER_ACCOUNTS_NOT_ENABLED` on a workspace Yappr switched off. Needs `carrier_accounts:read`: a key without it gets `403 INSUFFICIENT_SCOPE`, which says nothing about the feature | — |
| GET | `/carrier-accounts` | `{ "data": [account] }`, numbers expanded, never `webhook_url` | — |
| POST | `/carrier-accounts` | Connect a Telnyx account | 10 |
| GET | `/carrier-accounts/{id}` | One account; `webhook_url` only for a `manage` key | — |
| PATCH | `/carrier-accounts/{id}` | Rename, replace the API key or the public key | 20 |
| DELETE | `/carrier-accounts/{id}` | Disconnect | — |
| POST | `/carrier-accounts/{id}/connection` | Create or choose the Call Control App | 10 |
| POST | `/carrier-accounts/{id}/test` | Check everything. Places no call | 60 |
| POST | `/carrier-accounts/{id}/reactivate` | Test, then lift a pause | shares `test`'s 60 |
| POST | `/carrier-accounts/{id}/numbers` | Add a number from that Telnyx account | 50 |
| DELETE | `/carrier-accounts/{id}/numbers/{phone_number_id}` | Remove a number | — |

Limits are per workspace per day; over one is `429 RATE_LIMITED`. On any route,
`503 TELNYX_UNAVAILABLE` means Telnyx did not answer and nothing changed (retry in a
minute), and an id not in this workspace is `404 CARRIER_ACCOUNT_NOT_FOUND`.

### The carrier account object

```json
{
  "id": "uuid",
  "name": "Main Telnyx",
  "provider": "telnyx",
  "api_key_last4": "9XyZ",
  "api_key_updated_at": "ISO8601",
  "public_key_set": true,
  "signature_verified": false,
  "connection": { "id": "CALL_CONTROL_APP_ID", "created_by_yappr": true, "outbound_voice_profile_id": "PROFILE_ID" } | null,
  "status": "untested" | "active" | "paused",
  "pause_reason": "key_rejected" | "connection_invalid" | "carrier_rejections" | null,
  "last_error": { "code": "carrier_rejected", "sip_code": "403" | null, "at": "ISO8601" } | null,
  "last_success_at": "ISO8601 | null",
  "last_tested_at": "ISO8601 | null",
  "numbers": [ /* phone-number objects, provider "external" */ ],
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "webhook_url": "https://… (manage keys only)"
}
```

- **The Telnyx API key is write-only.** Only its last four characters ever come back;
  you can replace it, never read it.
- **`webhook_url` carries a secret for this account** — treat it like a password. It
  comes back on the connect response, and on `GET /carrier-accounts/{id}` for a
  `manage` key. You need it only for an app the customer makes themselves.
- `signature_verified` turns `true` once a call event from Telnyx verified against the
  public key; from then on every event for this account must carry a valid signature.
- `last_error.code` is one of `carrier_rejected`, `key_rejected`, `connection_invalid`,
  `public_key_mismatch`, `connection_mismatch`, `inbound_on_app`, `number_released`.
- **A number on the account** is a phone-number object with `provider: "external"`,
  `carrier_account: { id, name, provider, status }` and `ownership_verified_at` — when
  the customer's key last proved it is an active number in their account. `null` means
  Telnyx no longer lists it: it cannot call until a `test` finds it again.

### POST /carrier-accounts

Connect the customer's Telnyx account.

**Scopes:** `carrier_accounts:manage`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | 1–100 characters |
| `api_key` | string | yes | A Telnyx API key made just for Yappr (it starts with `KEY`) |
| `public_key` | string | no | Recommended. The account's public key: 44 characters of base64, from Keys & Credentials → Public Key |

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Main Telnyx", "api_key": "TELNYX_API_KEY", "public_key": "TELNYX_PUBLIC_KEY"}' | jq .
```

The key is checked with Telnyx **before anything is stored**. **Response:** `201`

```json
{
  "data": { /* the account: status "untested", connection null, numbers [] */ },
  "webhook_url": "https://…",
  "telnyx": {
    "connections": [ { "id": "…", "name": "…", "active": true, "outbound_voice_profile_id": "… | null" } ],
    "outbound_voice_profiles": [
      { "id": "…", "name": "…", "enabled": true, "allowed_destinations": ["IL", "US"],
        "daily_spend_limit": "50.00", "daily_spend_limit_enabled": true, "channel_limit": 10 }
    ]
  }
}
```

`telnyx` is what the key can see: pick the profile (and, optionally, the app) for the
next step from it.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_NAME`, `INVALID_API_KEY`, `INVALID_PUBLIC_KEY`, `INVALID_JSON` | Fix the field `error` names |
| 422 | `TELNYX_KEY_REJECTED` | Telnyx refused the key. Nothing was stored |
| 422 | `KEY_IS_YAPPR_ACCOUNT` | The key belongs to Yappr's own Telnyx account. Use a key from the customer's own account |

### PATCH /carrier-accounts/{id}

Rename the account, or replace its API key or public key. Send at least one of `name`,
`api_key`, `public_key` (`400 NOTHING_TO_UPDATE` otherwise). A public key can be
replaced, not cleared.

**Scopes:** `carrier_accounts:manage`

A new `api_key` is checked with Telnyx first. Once an app is chosen, it must be a key to
**the same Telnyx account** — one that can see that app — or it is
`422 KEY_ACCOUNT_MISMATCH`. `TELNYX_KEY_REJECTED` and `KEY_IS_YAPPR_ACCOUNT` apply as on
create. To rotate: create a new key in Telnyx, `PATCH` it here, then delete the old one
in Telnyx.

**Response:** `200` `{ "data": account }`

### DELETE /carrier-accounts/{id}

Disconnect. `409 CARRIER_ACCOUNT_HAS_NUMBERS` until every number is removed — there is no
cascade, because campaigns and agents may still call from them. If Yappr created the
Call Control App, it is deleted from the customer's Telnyx account too (best effort). The
API key is never touched: the customer deletes it in Telnyx.

**Scopes:** `carrier_accounts:manage`

**Response:** `200` `{ "success": true, "id": "uuid", "telnyx_connection_deleted": true | false | null }`
(`null` when the app was not Yappr's to delete).

### POST /carrier-accounts/{id}/connection

Every call from the account's numbers goes through one Call Control App in the
customer's Telnyx account. Send **exactly one** of:

- `{"create": {"outbound_voice_profile_id": "PROFILE_ID"}}` — the default. Yappr creates
  an app named "Yappr outbound" on that profile, with its webhook set. Pick a profile
  from `telnyx.outbound_voice_profiles` whose `allowed_destinations` cover every country
  the agents call. Yappr never creates or changes an outbound voice profile: its
  countries and spend limits stay the customer's decision.
- `{"connection_id": "CALL_CONTROL_APP_ID"}` — an app the customer made just for Yappr.
  Its webhook URL must be exactly the account's `webhook_url`, it must have an outbound
  voice profile, and it must be switched on.

**Scopes:** `carrier_accounts:manage`

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts/ACCOUNT_ID/connection" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"create": {"outbound_voice_profile_id": "PROFILE_ID"}}' | jq .
```

**Response:** `200` `{ "data": account }` with `connection` set. The app cannot be
swapped afterwards: `409 CONNECTION_ALREADY_CONNECTED` — remove the numbers, disconnect,
and connect again.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_CONNECTION_REQUEST` | Not exactly one of `create` / `connection_id`, or an id that is not a Telnyx id |
| 409 | `CONNECTION_ALREADY_CONNECTED` | The account already has its app |
| 422 | `OUTBOUND_PROFILE_NOT_FOUND` | That profile is not in the customer's account |
| 422 | `CONNECTION_CREATE_REJECTED` | Telnyx refused to create the app — check the account's limits in Telnyx |
| 422 | `CONNECTION_NOT_FOUND` | No app with that id in the account |
| 422 | `CONNECTION_WEBHOOK_MISMATCH` | The app's webhook URL is not the account's. The error body carries `webhook_url` |
| 422 | `CONNECTION_HAS_NO_OUTBOUND_PROFILE` | Attach an outbound voice profile to the app (its Outbound tab) |
| 422 | `CONNECTION_INACTIVE` | The app is switched off in Telnyx |
| 422 | `TELNYX_KEY_REJECTED` | Telnyx refused the saved key |

### POST /carrier-accounts/{id}/numbers

Add a number the customer owns in that Telnyx account.

**Scopes:** `carrier_accounts:manage`

| Field | Type | Required | Notes |
|---|---|---|---|
| `number` | string | yes | Strict E.164 — the same rule as `POST /calls` (`+972` numbers are `+972` followed by 8 or 9 digits). Any country |
| `friendly_name` | string | no | Up to 100 characters |
| `outbound_agent_id` | uuid | no | Bind an outbound agent at once. Must be an agent in this workspace |

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts/ACCOUNT_ID/numbers" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number": "+972XXXXXXXXX", "friendly_name": "Sales line", "outbound_agent_id": "AGENT_ID"}' | jq .
```

- **Choose the app first:** before it, this is `409 CONNECTION_REQUIRED`.
- **Proven with the customer's own key.** Yappr asks Telnyx whether the number is an
  active number in that account, and adds it only if it is —
  `422 NUMBER_NOT_IN_YOUR_TELNYX_ACCOUNT` otherwise.
- **A number is in Yappr once.** A Yappr-bought number, or another workspace's claim that
  its own key still proves, is `409 NUMBER_ALREADY_REGISTERED` (it does not say where).
  A lapsed claim — its key no longer proves it — is released automatically, unless that
  workspace still uses the number (a campaign calls from it, or past calls were made
  from it): then the claim is switched off but kept, the `409` stands, and Yappr
  support moves the number.
- Tell the customer to leave the number's own settings in Telnyx as they are.
- A number added to a `paused` account starts switched off.

**Response:** `201` `{ "data": phone_number }` — `provider: "external"`,
`ownership_verified_at` set, `monthly_cost: null` (the number stays in, and is billed
by, the customer's Telnyx account).

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_NUMBER`, `INVALID_AGENT`, `INVALID_NAME`, `INVALID_JSON` | Fix the field `error` names (`INVALID_AGENT`: `outbound_agent_id` is not an id) |
| 404 | `AGENT_NOT_FOUND` | `outbound_agent_id` is not an agent in this workspace, naming the field |
| 409 | `CONNECTION_REQUIRED` | No Call Control App chosen yet |
| 409 | `NUMBER_ALREADY_REGISTERED` | Held elsewhere in Yappr (see above) |
| 422 | `NUMBER_NOT_IN_YOUR_TELNYX_ACCOUNT` | Telnyx does not list it as active in this account. Nothing was added |
| 422 | `TELNYX_KEY_REJECTED` | Telnyx refused the saved key |
| 503 | `OWNERSHIP_CHECK_UNAVAILABLE` | Telnyx did not answer while checking another holder. Nothing was added |

### DELETE /carrier-accounts/{id}/numbers/{phone_number_id}

Agents stop calling from the number. Nothing changes in the customer's Telnyx account.
`404 NUMBER_NOT_FOUND` when the number is not on this account.

**Scopes:** `carrier_accounts:manage`

**Response:** `200` `{ "success": true, "id": "uuid" }`

### POST /carrier-accounts/{id}/test

Checks the account and **places no call**.

**Scopes:** `carrier_accounts:manage`

**Response:** `200`

```json
{
  "ok": true,
  "checks": [
    { "name": "api_key", "ok": true, "detail": "Telnyx accepts the API key." },
    { "name": "connection", "ok": true, "detail": "The Call Control App is active and points at Yappr." },
    { "name": "outbound_voice_profile", "ok": true, "detail": "Calls may go to: IL, US." },
    { "name": "numbers", "ok": true, "detail": "2 number(s) are in this Telnyx account." }
  ],
  "telnyx": { "connections": [ … ], "outbound_voice_profiles": [ … ] },
  "numbers": [ { "id": "uuid", "number": "+972XXXXXXXXX", "verified": true } ]
}
```

- `connection` fails when no app is chosen, or the app is gone, switched off, or its
  webhook URL was changed. `outbound_voice_profile` fails when none is attached or it
  is switched off; when it passes, `detail` lists the countries it allows.
- **Every test re-proves each number.** One Telnyx no longer lists goes unverified
  (`ownership_verified_at: null`) and cannot call; found again later, it comes back.
- `ok` ignores the `numbers` check: a lost number is simply uncallable.
- **A refused key pauses the account here too** (`key_rejected`), exactly as a refused
  dial does — `telnyx` is then `null`. A missing app is reported, not paused, by a test.

### POST /carrier-accounts/{id}/reactivate

"Turn back on". Runs the `test` first; if every check but `numbers` passes, it lifts the
pause: `status` goes back to `untested`, the refusal count resets, and every
**verified** number is switched back on.

**Scopes:** `carrier_accounts:manage` (shares `test`'s daily limit)

**Response:** `200` `{ "data": account, "checks": [ … ] }`. A failing test is
`422 CARRIER_TEST_FAILED` with the same `checks` — fix what they show in Telnyx, then
call it again.

### Status, and what pauses an account

| `status` | Meaning |
|---|---|
| `untested` | No call has been answered on the app since it was connected or turned back on |
| `active` | The last answered call ran on the app |
| `paused` | Every number on the account is switched off (`is_active: false`), so campaigns stop instead of burning through leads. `POST /calls` from one of them is `400 INVALID_FROM_NUMBER` |

- **At once:** Telnyx refuses the **key** (a `401`, or its "authentication failed"
  error) on a dial or a test → `key_rejected`; or the dial names a **Call Control App
  that is gone** → `connection_invalid`.
- **Counted:** any other refusal — one bad destination, a country the outbound voice
  profile does not allow, a caller ID Telnyx will not present, a ringing call ended with
  SIP 401/403/407 — counts once. **Five in a row** pause the account with
  `carrier_rejections`; an answered call resets the count. A `403` on its own is never
  read as a refused key.
- **Not counted:** SIP 404/484/604 on a ringing call — that is the destination number,
  not the account.

Fix the cause in Telnyx (`pause_reason`, `last_error`), then call `reactivate`.

### Calling from these numbers

There is no new call field: the `from` number decides the route. A number on a carrier
account that is not paused works everywhere a Yappr-bought number does for outbound —
`from` on `POST /calls`, a campaign's `from_phone_number_id`, or an agent's outbound
number (`outbound_agent_id` when adding it, or `PATCH /phone-numbers/:id`).

**When Telnyx refuses a call from one of these numbers.**

- **Before it rings** (Telnyx turns the dial down, refuses the key, or cannot find the
  app): the call is recorded `failed` and is not retried. If `POST /calls` was placing it
  right away, it answers **`422`** with the reason in `error` (and no `code`) — "Your
  Telnyx account refused this call…", or "Calls from this number are paused…" when the
  account paused — and **no webhook is sent**: that answer is the only notice. A call
  accepted with `202`, or placed by a campaign, sends `call.failed` with the reason in
  `data.error_reason` and no `data.hangup_cause`. A refusal by the customer's account is
  about the account, not the lead: the number called is never added to do-not-call.
- **While it rings:** the call ends `failed`, and `call.failed` carries
  `data.hangup_cause` — `carrier_rejected` (SIP 401/403/407, counts toward the five) or
  `carrier_number_invalid` (SIP 404/484/604, does not count).

The SIP code itself is not in the webhook: the account keeps the last one in
`last_error.sip_code` on `GET /carrier-accounts/{id}` (`null` when Telnyx refused over
its API: the call before it rang, a command on it, or a test). The exact Telnyx reason
is only in the customer's Telnyx portal (call debugging).

| SIP code | Check in Telnyx |
|---|---|
| 401, 403, 407 | The outbound voice profile is attached to the app and allows the destination country; the caller ID is a number in this account; the account has balance, and Level 2 for international calls |
| 404, 484, 604 | The destination number |

---

## Calls

### GET /calls

List calls with optional filters and pagination.

**Scopes:** `calls:read`

**Query params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | int | 20 | 1–100 — never more than 100 rows a page, whatever you send; read `pagination.limit` for what you got |
| `offset` | int | 0 | counts from the top of a list that grows while you read it. Send this or `cursor`, not both. An offset past the end is `400 CALLS_QUERY_INVALID` naming how many calls match — stop paging at `pagination.total` |
| `cursor` | string | — | continue exactly where the last page stopped: `pagination.next_cursor`, opaque, on every page. This is the one to build a job on — an offset silently repeats or skips rows when calls arrive mid-walk. Cursors are signed: only a `pagination.next_cursor` from this endpoint works — a hand-built one, or one from `/deliveries`, is `400 CALLS_CURSOR_INVALID`, never a silent first page. **A cursor carries only the position, not the filters:** send the same filters with every page. Sent with other filters, or none, it is answered `200` from that position under whatever filters came with it — not refused |
| `agent_id` | uuid | — | filter by agent; anything that is not a uuid is `400 CALLS_QUERY_INVALID`, and an agent that is not in this workspace is `404 CALL_AGENT_UNKNOWN` |
| `status` | string | — | `pending_connection` (a browser session nobody has connected yet), `ringing`, `in_progress`, `completed`, `failed`, `no_answer`, `transferred`, `dnc_blocked` (destination on the company DNC list — no carrier leg, no charge) |
| `direction` | string | — | `inbound`, `outbound`, `web_call` |
| `callee` | string | — | filter by callee phone (E.164). Useful for counting prior attempts to the same lead within a retry window. |
| `caller` | string | — | filter by caller phone (E.164) |
| `ab_variant` | `a` \| `b` | — | Only calls answered/placed by one side of a number's split — `a` the number's own agent, `b` the second one. Calls on a number with no split carry no variant and are excluded by either value. |
| `source` | string | — | Where the call came from: `test`, `shared_link`, `api`, `phone_inbound`, `phone_outbound`. `unknown` (a call recorded before this existed) is not a filter value. |
| `disposition` | string | — | Only calls that ended with this outcome, by its label exactly as `GET /dispositions` returns it. A label this workspace does not have is `404 CALL_DISPOSITION_UNKNOWN`, not an empty page |
| `disposition_id` | uuid | — | The same outcome filter by id. Send this or `disposition`, not both |
| `from` | ISO8601 | — | `created_at` lower bound |
| `to` | ISO8601 | — | `created_at` upper bound, inclusive; a date-only `to` covers that whole day (UTC) |
| `updated_since` | ISO8601 | — | every call **changed** at or after this time, whatever its `created_at`. The filter an incremental sync wants; `from`/`to` are not. Send a `+03:00` offset URL-encoded as `%2B03:00` — a bare `+` reads as a space |

An unrecognised `status`, `direction` or `source`, any parameter not in this table, an
`agent_id` that is not a uuid, a `from`/`to`/`updated_since` that is not an ISO 8601
timestamp (a date, or a date and time with `Z` or an offset — so `2026`, `Sep 1` and
`2026/09/01` are refused, and so is `2026-09-31`, a day its month does not have), and
`cursor` together with `offset`, are all `400 CALLS_QUERY_INVALID` naming the parameter —
not a 500, and never a window silently reinterpreted (`?from=yesterday` used to answer `200`
with a different window). `scheduled` is not a status. A known filter sent with no value
(`?agent_id=`) is refused the same way rather than returning every call in the workspace —
leave the parameter out instead.

**Syncing calls into your own system.** Every row carries `updated_at`, and almost
everything worth coming back for — `status`, `ended_at`, `duration_seconds`, `cost_cents`,
the matched `lead`, the `disposition`, the whole `analysis` object — settles *after* the row
is created. A sync windowed on `created_at` therefore reads each call once, at its youngest
and emptiest, and never learns the rest landed. `updated_at` is stamped when a change
*starts* being written and is readable only once the write finishes, and your clock is not
the server's, so windows that merely touch can skip a change for good. Record the time
before a run starts; ask the next run for `?updated_since=<that time minus 5 minutes>` and
page it by `cursor` to exhaustion; upsert each call by `id`, keeping whichever copy has the
newer `updated_at` (the overlap hands you some calls twice, by design). A call you stored
while its `analysis.status` was still `pending` is worth re-reading by id until it settles.
`updated_at` moves on every analysis change, including a `failed` / `analysis_unavailable`
outcome, which is written within about 5 minutes of the 10-minute mark — so an analysis
that never finishes still reaches a sync windowed on `updated_since`.
While paging by cursor, `pagination.total` counts the calls still ahead of the cursor, not
the whole list.

**Common pattern — "has this lead already been tried today?"**

```
GET /calls?agent_id=...&callee=+972XXXXXXXXX&from=2026-04-19T00:00:00Z&limit=1
```
Read `pagination.total` — the number of calls matching the filters — as the prior-attempt
count, not `data.length`, which is capped by `limit` (20 by default) and undercounts a busy
number. Use in retry-throttle logic (automation platforms like Make.com/n8n get clean counting without iterating the response).

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
      "updated_at": "ISO8601",
      "tool_calls_count": 2,
      "ab_variant": "a" | "b" | null,
      "source": "test" | "shared_link" | "api" | "phone_inbound" | "phone_outbound" | "unknown",
      "cost_cents": 12,
      "cost_status": "charged" | "not_charged" | "pending",
      "metadata": { "...": "your keys" },
      "analysis": { "status": "done" | "pending" | "skipped" | "failed", "reason": "string | null", "completed_at": "ISO8601 | null" },
      "recording_url": "string | null",
      "disposition": { "id": "uuid", "label": "string", "color": "#hex" },
      "lead": { "...full lead object with tags..." }
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "has_more": true,
    "next_cursor": "opaque string | null"
  }
}
```

**The list row now carries the same `cost_cents`, `failure`, `source`, `shared_link_id`
and `analysis` that `GET /calls/:id` returns** — see that endpoint below for the full
semantics of each. All five (plus `recording_url`, `disposition`, `lead`,
`ab_variant` and `sip_endpoint_id`) are **omitted**, not `null`, on a row that has none — `analysis` is the one
exception and is on every row. A month's spend or a failure report is this list summed,
not one `GET /calls/:id` per call; a sync can page this list and decide what to do with
each call — `analysis.status: "done"` means the values are ready on the detail read,
`"pending"` means come back later, `"skipped"`/`"failed"` mean nothing more is coming.
`updated_at` is on every row, and `GET /calls/:id` carries the same value.

**A call that arrived on a SIP endpoint** is `source: phone_inbound` with **`to: null`** —
it dialled no number — and carries **`sip_endpoint_id`**. Its `from` is whatever the
customer's phone system sent as the caller, which may not be a phone number. The
endpoint's URI is its credential, so neither this list, `GET /calls/:id` nor the export
returns it. There is no `sip_endpoint_id` filter; match on the field instead.

**`cost_status`** is on every row, beside `cost_cents`: `charged` (the recorded charge;
final), `not_charged` (`cost_cents: 0`, final — the call failed, went unanswered, was
blocked, had no connected time, or ended more than 24 hours ago with no charge recorded)
or `pending` (`cost_cents: null` — still running, or ended less than 24 hours ago and not
yet recorded). Only `pending` is worth polling, and no call stays `pending` more than a day
after it ended. That 24-hour change is read off the clock and does **not** move
`updated_at`, so an `updated_since` sync never sees it: re-read a call you stored as
`pending` by id once it is a day past `ended_at`.

**`metadata`** on a row is your keys, with internal bookkeeping removed. A few platform keys
stay: `ab_variant` / `ab_variant_fallback`, `share_link_id`, `agent_id` on a dashboard test
call, `queued` / `queue_id` / `queue_wait_seconds`, `workflow_request_id` — name your own
keys so they cannot collide.

---

### GET /calls/export

The call log as a CSV file, filtered exactly the way `GET /calls` above is filtered —
same query params, except that `limit`, `offset`, `cursor` and `updated_since` are
**refused** here (`400 CALLS_QUERY_INVALID`): an export is one whole window of call starts,
not a page of it and not what changed since it last ran. A file answered for
`updated_since` would carry the whole `from`/`to` window while reading as everything that
changed. This is the dashboard's own **Export CSV**, addressable.

**Scopes:** `calls:read`

**Columns, in this fixed order:** `Started` (ISO 8601, `+00:00`), `Agent` (empty when the
call has no agent — match on empty, not on a translated word), `A/B`, `Direction`,
`Status` (`pending_connection` is a filter value here too), `Disposition`, `From`, `To`
(empty on a browser call; `To` is also empty on a call that arrived on a SIP endpoint),
`Duration` (whole seconds), `Cost (USD)` (a bare decimal, see below), `Source`, `Shared link ID`
(only on a `shared_link` call), `Call ID` (the join key to `GET /calls/{id}`), `Lead name`
(empty when there is no lead, or it was deleted), `Summary`, `Cost status` (`charged`,
`not_charged`, `pending` — exactly `cost_status`), `Ended by` (exactly `ended_by`; empty
when nothing recorded it), `Agent ID` (pivot on this, not on `Agent`: two agents can share
a name), then one
`Extracted: <field>` column per `extracted_data` key found in the window — read those by
heading, not position. Every line under the headings is one call — there is **no `Total`
line** (there used to be, and a column sum counted the month twice). What the calls cost
together is the `X-Total-Cost-USD` response header, the same sum a column total over
`Cost (USD)` gives; `X-Total-Rows` counts the calls. The file opens with a UTF-8 BOM, so Hebrew names open correctly in a
spreadsheet.

**`Cost (USD)` is `0.00` on a call that ended without a charge** — failed, unanswered,
blocked, never connected, or ended more than a day ago with no charge recorded — and
**empty only while the charge is still pending**. The `Cost status` column says which, so
the file needs no second read.

**Formula guard.** A `Lead name`, `Summary` or `Extracted:` value that opens with `=`, `+`,
`-`, `@` or a tab is written with a leading `'`, so a spreadsheet does not run it; strip one
leading `'` when reading the file as data. Phone numbers and plain numbers are never
prefixed.

**The dashboard's Export CSV is the same fields in the same order, written for people:**
headings, labels and Yes/No in the reader's language, `Started (ISO 8601)` plus an
extra `Started (<zone>)` second column. Read a dashboard file by position; do not match its
headings against this endpoint's.

**The row limit.** One export carries at most **10000** calls; a window holding more is
`400 CALLS_EXPORT_TOO_LARGE`, naming the count — never truncated. Page a larger export by
splitting the window with `from`/`to`, ending each window on the **first of the next
month** (`to=2026-10-01T00:00:00Z`) rather than a guessed last day. `to` is inclusive, so
consecutive windows **meet and overlap by one instant**: a call started exactly at that
boundary is written into both files. Concatenating files means dropping the duplicate
boundary row from one of the two, and each file's own `X-Total-Cost-USD` still counts it
once, so adding two files' headers counts it twice.

`X-Total-Rows` and `X-Total-Cost-USD` (exposed to browser `fetch()`, alongside
`Content-Disposition`) carry the call count and their cost. The file is the calls that existed the moment you
asked — one still streaming never lands half-written.

```bash
curl -L "https://api.goyappr.com/calls/export?agent_id=$AGENT_ID&from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z" \
  -H "Authorization: Bearer $YAPPR_API_KEY" -o september.csv
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
  "status": "pending_connection" | "ringing" | "in_progress" | "completed" | "failed" | "no_answer" | "transferred" | "dnc_blocked",
  "failure": { "code": "string", "reason": "string", "stage": "dialing|connecting|conversation|null", "at": "ISO8601 | null" },
  "started_at": "ISO8601 | null",
  "ended_at": "ISO8601 | null",
  "duration_seconds": 0,
  "source": "test" | "shared_link" | "api" | "phone_inbound" | "phone_outbound" | "unknown",
  "shared_link_id": "uuid",
  "cost_cents": 12,
  "cost_status": "charged" | "not_charged" | "pending",
  "updated_at": "ISO8601",
  "analysis": { "status": "pending" | "done" | "skipped" | "failed", "reason": "string | null", "completed_at": "ISO8601 | null" },
  "transcript": [ { "role": "agent|user", "text": "string", "start": 0, "end": 0 } ],
  "transcript_live": [ { "role": "agent|user", "text": "string", "start_ms": 0, "end_ms": 0, "source": "gemini|openai", "interrupted": true } ],
  "usage": {
    "cost_usd": 0.0412,
    "legs": [ { "engine": "gemini-live|gpt-live", "model": "string", "cost_usd": 0.0412, "sessions": 1,
                "input_tokens": 41200, "output_tokens": 9100,
                "audio_input_tokens": 9200, "text_input_tokens": 32000, "audio_output_tokens": 9100,
                "cached_input_tokens": 28400, "audio_seconds": null,
                "backend_model": "string | null", "backend_unpriced": false,
                "recorded_at": "ISO8601" } ]
  },
  "summary": "string | null",
  "extracted_data": { /* present only when extraction ran — see note below */ },
  "extracted_data_precision": { "<date parameter>": { "precision": "day" | "month" | "unknown", "month": "YYYY-MM | null" } },
  "follow_ups": { "state": "waiting" | "skipped", "groups": [ { "reason": "string", "steps": ["string"] } ] },
  "recording_url": "string | null",
  "ended_by": "caller" | "agent" | "system" | "operator" | "unknown" | null,
  "disconnect_reason": "string | null",
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
      "kind": "integration_call",  // historical — the retired native calendar/mailbox step
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

**`updated_at`** — When this call last changed: the same field the list rows carry, so a
sync that pages `GET /calls?updated_since=` and then reads a call by id for its transcript
and analysis keeps the timestamp its loop windows on.

**`metadata`** — The metadata object you attached at `POST /calls` (or at a browser-session
mint). Empty object `{}` if none was provided. Internal bookkeeping is removed; the few
platform keys that stay are listed under **GET /calls** above.

**`extracted_data`** — Present **only when extraction ran**: an agent with no
`extraction_parameters`, a call too short to analyse, or an analysis that failed all
leave the member absent. Read it with a presence check, not a truthiness one. When it is
there, every configured parameter is a key; `null` means the conversation never supplied
that value (or supplied something unreadable as the declared kind) — never that the
parameter is missing. An object of nothing but nulls is a real answer: extraction ran and
the call said none of it. See **Extraction parameters have a kind** above for what each
value looks like per kind.

**`extracted_data_precision`** — *Present only for an agent with a `date` parameter, on a
call analysed since it was recorded.* One entry per `date` parameter:
`{"precision": "day", "month": "2026-10"}` when the caller gave a day (the value is that
day); `{"precision": "month", "month": "2026-11"}` when they gave a month and no day —
"sometime in November", "next month" — and the value is **`null`**, because a month's 1st
stored as a date would be a guess a CRM books; `{"precision": "unknown", "month": null}`
when they gave neither ("after the holidays") or nothing. Read it before acting on a
`null` date: `month` means call back that month and ask which day. It is on this read
(and the extraction dry run) only — a webhook or an After step reading `/extracted_data`
sees just the `null`, so re-read the call when a `null` date matters.

**`source`** — Where the call came from, the answer to "what did my own testing cost,
versus the link I sent out." `test` is a rehearsal you started yourself — the agent's
Test tab, or a test phone call from the dashboard. `shared_link` is a call placed through
a [shared link](#shared-links); those calls also carry **`shared_link_id`**, so spend can
be attributed to the link you handed out. `api` is a browser session this API minted.
`phone_inbound` and `phone_outbound` are the two real phone legs — a test call you dial
from the dashboard reads `test`, not `phone_outbound`, which is the separation
`?source=` on `GET /calls` exists for. A call recorded before any of this was written
reads `unknown`, which `?source=` will not accept as a filter value. `shared_link_id` is
absent on every call that is not `shared_link`.

**`analysis`** — Where the call's post-call pass stands: `{ "status": "pending" | "done"
| "skipped" | "failed", "reason": <code|null>, "completed_at": <iso|null> }`, present on
**every** call, list rows included. `summary`, `disposition` and `extracted_data` are
written by that one pass and are **absent, not null**, until it lands — poll
`analysis.status`, never the absence of those keys. `pending` means come back; `done`
means read them (and `done` with no `extracted_data` is a real answer — the pass ran and
the call said none of it, which is what every call made before its parameters existed
will say); `skipped` means nothing is coming and nothing is wrong
(`call_too_short` — under 3 seconds — `call_did_not_complete`, `no_transcript`); `failed`
means nothing is coming and something is wrong (`analysis_failed`, `analysis_unavailable`
— worth an alert). A call handed to a human reads `pending` / `call_in_progress` until
that leg ends; the pass runs after. Expect the values within a minute or two of the call
ending; anything still `pending` after 10 minutes is stuck. Prefer the `call.analyzed`
webhook to polling.

**`failure`** — Present only on a call whose `status` is `failed` or `no_answer`. A call
that completed has **no** `failure` member at all — check for the member, not for a value
in it.

`failure.code` is stable and is what you branch on; `failure.reason` is one sentence for
a person and its wording changes. `failure.stage` is `dialing`, `connecting`,
`conversation` or `null`. `failure.at` is when the failure was recorded, or `null`.

Codes: `no_answer`, `busy`, `rejected`, `cancelled`, `unreachable` (all `dialing`);
`caller_left` — a browser call the caller closed, or navigated away from, before it
connected — `network_blocked` — a browser call the caller's own network never let
connect — and `voice_unavailable` (all three `connecting`); `call_interrupted` and `transfer_failed` (both
`conversation`); `unknown` when nothing recorded why. Treat a code you do not recognise
as `unknown` rather than as an error in your integration.

The same failure is in `timeline` as a `phase` row with `scope: "call"`,
`status: "failed"` and the same sentence in `error`.

The raw text the platform recorded internally is not returned anywhere on this endpoint —
not in `failure`, and not in `metadata` either, which stays only what you attached at
`POST /calls`. It is the carrier's own cause code, an exception's tail, or a provider's
error class, and it is ours, not yours to read.

**`ended_by`** — Who ended the call. One of:

| Value | Meaning |
|-------|---------|
| `"caller"` | The far end went away first — the human on the line hung up, or the browser closed the connection (a browser test call's End button included). |
| `"agent"` | The agent chose to end the call: its end-call tool, the End step of its flow, or its closing line followed by a hangup. |
| `"system"` | Yappr ended it — the silence timeout, the maximum-duration cap, an answering machine, a fault that took the call down, the watchdog, or a browser session that expired unused. |
| `"operator"` | Ended from the platform side by a person: the End button on a dashboard **phone** test call, or Yappr stopping a call found still open after its conversation had ended (`disconnect_reason` `Ended by operator`). |
| `"unknown"` | The carrier reported the ending but did not say which side dropped the call. |
| `null` | Nothing has recorded it: a call still running, or a finished one no producer attributed. Do not read `null` as "still live" — check `status`. |

**A transfer records nothing at the handover.** Once the caller is bridged to a person the
leg is still up, so whoever hangs up after that is the answer and the carrier supplies it.
The value you read is already resolved for the call's direction — on an inbound call the
carrier's "called side hung up" is the agent, on an outbound call it is the person dialled.

**First-write-wins**: once `ended_by` is set, it isn't overwritten by later updates. So a specific attribution (e.g. `"system"` from voicemail detection) is preserved even when a generic hangup event lands afterward.

Useful for retry / analytics decisions — e.g. don't auto-retry a call that the caller intentionally ended (`ended_by === "caller"`) but do retry when the platform aborted it (`ended_by === "system"`).

**`disconnect_reason`** — Short human-readable label for why, meant for display. Branch on
`status` and `ended_by`; treat this as text, because wording changes and labels are added.
In practice: `Completed`, `No answer`, `Busy`, `Call rejected`, `Cancelled`,
`Caller inactive`, `Max duration reached`, `Platform call limit reached` (an agent with
`max_call_duration_secs: 0` has no cap of its own, and the platform ends its call after
65 minutes), `Voicemail detected`,
`Answering machine detected`, `Ended by operator`, `Ended by the platform: stuck call`
(a call still open ten minutes after its agent's maximum duration: Yappr closes it with
`ended_by: "system"` and bills it only up to the last sign of life within that maximum;
nothing reported about it later changes its status, duration or charge), `Failed`, and —
when a handoff never connected —
`Transfer not answered`, `Transfer destination busy`, `Transfer rejected`,
`Transfer destination unreachable`, `Transfer never connected`, `Transfer failed`. A
handoff that did connect leaves the reason to the call's own ending. Also first-write-wins,
and `null` for short or atypical hangups.

**`cost_cents`** — What the call took out of your workspace's credits. Read it with
**`cost_status`**: `charged` (the recorded charge; final), `not_charged` (`0`, final — the
call failed, went unanswered, was blocked, or had no connected time; a call that ended
more than 24 hours ago with no charge recorded reads this too, because nothing came off the
balance and nothing will) or `pending` (`null` — still running, or ended less than 24 hours
ago with its charge not yet recorded; the only state worth polling). `null` never means
free, and `0` never means not settled yet. This is a **different number** from
`usage.cost_usd` below: `cost_cents`
is what Yappr billed you, `usage.cost_usd` is what Yappr paid the model provider. Totals
across calls: `GET /billing/consumption`.

**`usage`** — *Present only when a reading exists.* What the call consumed on the voice model that ran it, reported by the provider and priced at published rates. One entry in `legs` per engine, summed across every provider session the call spanned — a call whose connection dropped and was rebuilt mid-call is still one entry carrying the whole call.

The two engines report in different units and the leg says which: a Gemini voice bills tokens split by modality (`audio_input_tokens`, `text_input_tokens`, `audio_output_tokens`, `cached_input_tokens`), a GPT voice bills seconds of live audio (`audio_seconds`, with the token fields `null`). `backend_unpriced: true` means the reasoning model's tokens were counted but have no published rate yet, so `cost_usd` is the voice model alone.

**No `usage` member is not a cost of zero** — a call that never reached the model, and every call from before this shipped, have no reading at all. This is what Yappr pays the provider, not what the call charged against the workspace's credits.

**`transcript` can be rewritten once, later, on a browser call.** Yappr re-reads an older
browser call's recording one side at a time when its caller's words had landed inside
agent turns, and replaces the turns only when both speakers come back. The rewrite moves
`updated_at` (so an `updated_since` sync picks it up) but sends no webhook and fires no
After step — `transcript.ready` is sent once, when the transcript first appears. A copy
you stored earlier is not wrong, just older: keep the newer `updated_at`.

**`transcript_live`** — *Present only when the model produced one.* The voice model's own transcript, recorded turn by turn while the call was happening, rather than transcribed from the recording afterwards. A SECOND, independent account of the same conversation; it does not replace `transcript`, which stays what `transcript.ready` carries and what the summary and extraction are built from.

Roles are structural — the caller's audio and the agent's audio are separate streams — so a role here cannot be misattributed the way a speaker-diarizer's can. `interrupted: true` on an agent turn means the caller talked over it; a model's transcript can run ahead of its own voice, so those turns may contain words the caller never heard. Read `transcript` unless you have a specific reason to prefer the model's own account.

**`tool_calls`** — One row per tool / integration invocation that fired during the call, in firing order. The `kind` field is the discriminator:

- `webhook_tool` — prompt-mode agent with a tool list. `request` carries the full HTTP envelope (method/url/headers/body). Auth-related headers are redacted as `"[REDACTED]"`.
- `tool_call` — flow-mode `tool_call` node fired. For webhook tools, `request.body` is the exact flat payload delivered to the customer endpoint: optional standard metadata, then configured static parameters, then resolved extraction values (later layers win collisions). System/transfer tool nodes retain their resolved action args. `tool_id` and `node` identify which tool and flow node ran. `arg_sources` maps only resolved tool arguments to their mode (`literal` or `ai_extract`).
- `integration_call` — **historical only.** The native calendar/mailbox step is retired and no new call produces this value; calls placed before the retirement still carry it and are still returned. Same `request.body`-only shape; `provider`, `action`, `integration_id` record which credential and method ran at the time.

For flow-agent calls, prefer reading `flow_trace.steps[].tool_call` — same per-fire data, inlined per visited step in graph order.

**`events`** — Full chronological timeline of all call events (tool calls, transcriptions, LLM events, errors, termination). For advanced use cases / low-level analysis. For flow agents, prefer `flow_trace` (below) — `events` carries the same data more verbosely. Auth headers are also redacted.

**`tool_calls`, `events` and `flow_trace` are superseded by `timeline`** (below) for anything you are building now. They are kept for integrations already reading them, and they are the raw view: apart from redacted auth headers they return a tool's URL, its arguments, the response body and the engine's own error text as recorded. The summaries-only rule below is a rule about `timeline`, not about the endpoint.

**`timeline`** — **What happened on the call, as one time-ordered list.** This is the
single read surface for call observability: the same rows the customer sees on the call
log in the dashboard, read from the same place, so your view and theirs can never
disagree. Prefer it over `events` and `flow_trace` for anything you are building now.

Every row carries `kind` and `at`. The rest depends on the kind:

| `kind` | What it is | Fields |
|---|---|---|
| `message` | A turn in the conversation | `role` (`agent` / `user` / `voicemail`), `text`, `offset_ms` |
| `phase` | A stage of the call | `lane` (`before` / `during`), `status`, `error` |
| `transition` | The conversation moving | `from_node`, `from_label`, `to_node`, `to_label`, `edge_id`, `edge_condition`, `edge_scope` (`direct` / `global`), `strict` |
| `tool` | One tool invocation | `tool_type`, `name`, `step_id`, `lane`, `status`, `duration_ms`, `attempt_count`, `error`, `failure` |
| `trigger` | An after-call follow-up the workspace authored | `event`, `steps`, `status`, `error` |
| `delivery` | One row of the webhook delivery ledger | `event`, `status`, `response_status`, `attempt_count`, `error_message`, `delivered_at`, `tool_name` |

`strict` on a transition says where the row came from: `true` is the authoritative stage
cursor a staged conversation holds, and only those rows carry `edge_condition`; `false`
is the agent's own record of the stage it entered, which is what an older call has. An
agent whose conversation has no stages produces no `transition` rows at all.

`tool` rows come back for every agent, however it is built. A staged conversation's
invocations and a single-prompt agent's own webhook tools, transfers and end-of-call all
read back in the same shape, so "no `tool` rows" always means the call ran no tools.

A `tool` row adds the fields for its own `tool_type`:

| `tool_type` | Extra fields |
|---|---|
| `http` | `method`, `url_host` (host only), `request_bytes`, `response_status` |
| `app` | `app`, `action`, `connection_label` |
| `transfer` | `destination` |
| `end` | `reason`, `ended_by` |

**Summaries only.** A URL's path and query, request headers, credentials, the connected
account behind an app action, and raw request and response bodies are never returned in
these rows — `tool_calls` and `events` on the same response still return them, which is
what they are for and why they are superseded. A failure is one sentence in `error` (or
`error_message` on a delivery), written for a person to act on — never an internal code.
Do not branch on its wording; branch on `status`.

**A tool row that did not work out** carries `error`, the sentence above, and `failure`,
the code behind it: `tool_timeout` (the tool did not answer inside its own limit, which
comes back as `failure.limit_seconds`), `tool_unreachable` (nothing answered at the
address), `tool_rejected` (it answered and refused — an `http` row also has
`response_status`), `transfer_failed`, `tool_failed`. Branch on `failure.code`, never on
the sentence. A timed-out tool keeps `status: "pending"` on purpose: nothing answered, so
whether the action happened is unknown and may need reconciling. A row that worked, or is
still running, has no `failure` member.

**`status` is one of three words** on every row that has one — `succeeded`, `failed`, or
`pending` (it has not settled yet) — except a `delivery`, which carries the delivery
ledger's own `delivered`, `failed` or `pending`. A row with no `status` at all means the
agent's own record of that step never came back; that is not a failure.

**Webhook deliveries live here.** If a customer asks why their CRM never got the
appointment, read the `delivery` rows: one per attempt-set, whichever part of Yappr sent
it — an after-call follow-up step and a workspace webhook both land in the same ledger
and come back in the same shape.

**`follow_ups`** — *Present only when one of the agent's follow-ups (After steps) did not
run on this call.* A follow-up that ran shows up in `timeline` as a `trigger` row, then its
`tool` and `delivery` rows; this member explains the ones that did not. It is absent when
there is nothing to explain — every follow-up started, the workflow had none, or the agent
has no published workflow.

```json
"follow_ups": { "state": "skipped", "groups": [ { "reason": "browser_test", "steps": ["Send to CRM"] } ] }
```

`state` is `waiting` when every group is still waiting for the result it runs on — read
the call again later — and `skipped` otherwise: at least one follow-up will not run on
this call. Reasons: `browser_test` (a dashboard test call that ran without the workflow;
`steps` lists every published follow-up), `no_workflow_run` (any other call that ran
without it, such as a share-link or Web SDK call), `artifact_pending` (the result it runs
on is still being produced), `artifact_unavailable` (that result was never produced — the
analysis failed, or the transcript was empty), `artifact_late` (the call's run closed
before the result arrived). The three `artifact_*` groups also carry `event` and
`artifact`. Treat a reason you do not recognise as `skipped`.

**An older call** has no `phase` rows and no `transition` rows of the newer kind; its
transcript, tool rows and deliveries still come back here unchanged. Read each row's
`kind` rather than assuming which kinds a call will have.

**`ab_variant` / `ab_variant_fallback`** — Present only when the number that took the call
is running an A/B split. `ab_variant` is `"a"` or `"b"`; `ab_variant_fallback` is `true`
when the split picked `b` but the call went to `a` because `b` could not take it.

**`flow_trace`** — *Present only on a call placed against the retired `flow_config` engine, never on a converted agent's call.* Structured view of the path through that old graph. Superseded by `timeline`'s `transition` rows for anything current — see above.

**`execution`** (optional) — Workspaces with execution history enabled also get an
`execution` block on `GET /calls/:id` and on `GET /call-requests/:id`: how the platform
carried the call out — the steps it ran, their attempts, timings, and input/output
previews — beside the conversation itself. Ask for a page of it with `execution_limit`
and follow `execution.history.next_url` for the next one.

It is an investigation view, not an authority: read-only, a bounded snapshot (history is
retained for a limited window; `execution.history.complete` says whether you have all of
it), and stripped of the platform's own plumbing — delivery-row ids, internal job and
journal counts and storage-retention flags are removed before the response is written,
and every URL in it points at the public API base. **A field you see there but cannot
find in `CallExecution` in the OpenAPI schema is not part of the contract; do not build
on it.** For the conversation itself — turns, tools, transfers, webhook deliveries —
read `timeline` above; `execution` answers the different question of whether the
platform finished its own work.

### `flow_trace` shape

`flow_trace` is per-call history from the retired `flow_config` engine (see **Flow
agents — retired**) — superseded by `timeline` above for a converted agent, whose
`transition` rows carry the same "which edge fired and why" answer for the current
conversation graph. Read on for the shape `flow_trace` itself still returns, on the
calls it was ever populated for.

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
      "step_type": "tool_call",          // also: start, conversation, transfer, end (and integration_call on pre-retirement calls)
      "step_name": "Book appointment",
      "entered_at": "ISO8601",
      "reason": "eval: confirmed_book",
      "tool_call": {
        "kind": "tool_call",             // discriminator — "tool_call", or "integration_call" on pre-retirement calls
        "tool_name": "Book appointment",
        "status": "success",
        "args": {"appointmentDateTime": "Sunday at 12pm", "email": "..."},
        "arg_sources": {"appointmentDateTime": "ai_extract", "email": "ai_extract"},
        "response_preview": "{\"event_id\": \"abc\", \"duplicate\": false}",
        "error": null,
        "duration_ms": 412,
        "tool_id": "uuid",
        "provider": null,                // set only on a pre-retirement integration_call
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
- **"Why did the bot transition from conversation node X?"** — find that step's `eval_decisions[]`. The last entry's `decision` is the transition that fired (its label maps to a transition id in that call's stored `flow_config`); its `reasoning` is the model's justification for the choice.
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
| `flow_node_entered` | `{step_id, node_kind, name, reason, via_transition_id?}` — `node_kind` is one of `start`, `conversation`, `tool_call`, `transfer`, `end`, or, on calls placed before the native calendar/mailbox step was retired, `integration_call`. |
| `flow_eval_decision` | `{step_id, decision, reasoning?, turn_id?, target_step_id?, valid}` |
| `flow_tool_result` | `{step_id, kind, status, tool_name, tool_id?, provider?, action?, integration_id?, args, arg_sources, response_preview, raw_response_preview?, error, duration_ms}` — `kind` is `tool_call`, or `integration_call` on calls from before that step was retired, with the integration-specific fields populated. `raw_response_preview` is set when the runtime post-processed the LLM-facing view (currently Google Calendar wall-clock conversion). |

### How the turn-taking actually went, per call

The last event in `events[]` is `call_ended`, and its `data` carries two counts
beside `end_reason`:

| Key | What it counts |
|---|---|
| `barge_ins` | Times the caller spoke over the agent **while it was talking** and stopped it mid-sentence |
| `barge_ins_within_250ms_of_bot_audio_onset` | The subset that landed in the first quarter-second of the agent's own audio |

A caller who waits for the agent to finish and then answers is not a barge-in,
so `0` on a long call means the agent was never talked over — not that
interruption was off. One intrusion counts once however many of the call's
detectors noticed it. The second count is a diagnostic for the line: a stop that
early is more likely the agent hearing its own voice come back on a phone leg
with no echo cancellation than a caller cutting in that precisely. Calls placed
before 2026-09-16 carry neither key.

**Recording URL notes:**
- `recording_url` is a signed link on the API host carrying `exp` (when it stops opening,
  in Unix seconds) and `sig`. Use it exactly as returned: a changed `exp` or `sig` is
  refused.
- Opening it needs no `Authorization` header and answers `200` with the audio itself — no
  redirect to follow. `HEAD` answers with the same headers and no body, and a `Range`
  request gets just the bytes it asks for, so an `<audio>` element can seek.
- A link lasts **7 to 8 days**: `exp` is 00:00 UTC eight days after the UTC day it was
  issued on (a link read on 25 September expires at 00:00 UTC on 3 October), so two reads
  of the call on one day return the same link. It is not permanent —
  for a later play, read the call again; every read issues a current link.
- Anyone holding a link can play the recording until it expires. To take links back, see
  **POST /calls/:id/recording/revoke** below.

---

### POST /calls

Initiate an outbound call.

**Scopes:** `calls:create`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent_id` | uuid | no | Optional. Omit it and the `from` number decides: its `outbound_agent_id` places the call, or — if that number has an `outbound_split` configured — the split picks between the bound agent and the second one. An explicit `agent_id` always wins over a split; sending one skips split resolution entirely. A `from` number with no agent attached and no resolvable split is refused with `422 AGENT_NOT_RESOLVED` — *"Attach an agent to this phone number or send agent_id"* — nothing is queued or dialed. When a split resolved the agent, the call carries `metadata.ab_variant` (`"a"`/`"b"`); a value you send in `metadata.ab_variant` yourself is dropped and replaced. A retry under the same `Idempotency-Key` reuses whichever agent the original accepted call resolved to — it never re-rolls, even if you change the split in between. |
| `to` | string | yes | Destination phone number — strict E.164 format (see Phone validation below) |
| `from` | string | yes | Caller phone number — strict E.164, must be an active number owned by the company: bought from Yappr, or added from the customer's own Telnyx account (see **Carrier Accounts** above — the call then runs on their Telnyx account) |
| `metadata` | object | no | JSONB stored in `call_logs.metadata` — arbitrary key-value pairs, not injected into prompt. **Forwarded in real-time to every tool webhook as `call_metadata`** (see [Tool Webhook Payload](#tool-webhook-payload)) — ideal for carrying internal IDs (appointment_id, contact_id, calendar_id) that tool receivers need without requiring a `GET /calls/:id` round-trip. |
| `variables` | object | no | `Record<string, string>` — substituted into system prompt using `{{VariableName}}` syntax. Also forwarded to tool webhooks as `call_variables`. |
| `workflow_revision_id` | uuid \| null | no | Workflow agents only. Pins the call to one exact published version instead of whichever is current at dispatch. Take the id from `GET /agents/{id}/workflow/versions` (`data[].id`). Sending it for a non-workflow agent is `422 WORKFLOW_PIN_INVALID`; a version that is not this agent's own is rejected later as `404 WORKFLOW_AGENT_UNAVAILABLE`, the same answer as an unreachable agent. |

**Workflow agents answer `202`, not `201`.** Every outbound call on a workflow agent is
accepted first and placed afterwards, so `202` is the normal success response there — it
is not an at-capacity signal. The body is the acceptance acknowledgment:

```json
{"id":"uuid","request_id":"uuid","run_id":"uuid","call_id":null,
 "status":"queued","preparation_status":"pending","agent_id":"uuid",
 "to":"+972...","from":"+972...","queued_at":"ISO8601","expires_at":"ISO8601"}
```

`status` is `scheduled` (with `scheduled_for`) when the workspace's calling window is not
open yet, `queued` otherwise. Follow `request_id` through **Call requests** below; never
poll `GET /calls` for a call that may not exist yet.

`202` carries four different bodies in all, and none of the other three is a live call.
Tell them apart by the fields, not by `status`:

| Shape | How you recognise it | What it means |
| --- | --- | --- |
| Workflow acceptance | `request_id` | The body above. The normal success answer on a workflow agent; an identical retry with the same key returns it again. |
| Queued at capacity | `queue_position` | Every line was busy; it is placed when one frees up. |
| Deferred to the calling window | `scheduled_for`, no `request_id` | Outside the workspace's outbound hours; `status` is `scheduled` and it goes out when the window opens. |
| Returned to the queue | no `id` at all — `status`, `message` and a short `reason` only | Prepared and handed back before dialling; it is retried automatically. Never resend it yourself. |

Send an `Idempotency-Key` of 1–200 visible ASCII characters (`!` through `~`; a space is
rejected) — that charset is checked on every outbound call, whatever kind of agent it
names. An identical retry returns the original acceptance instead of placing a second
call; reusing the key with different details is `409 WORKFLOW_IDEMPOTENCY_CONFLICT`.
Workflow admission rejects any property outside `agent_id`, `to`, `from`, `variables`,
`metadata`, `workflow_revision_id` and `type` with `422 WORKFLOW_REQUEST_INVALID`; `type`
is optional and its only accepted value is `"phone"`. `409 WORKFLOW_UNPUBLISHED` means
publish the agent first. `503 WORKFLOW_ADMISSION_UNAVAILABLE` means **no call was placed**
— retry the same body with the same key.

A missing `to` or `from` is also `422 WORKFLOW_REQUEST_INVALID`, naming which field; an
`agent_id` that names no agent in this workspace is `404 WORKFLOW_AGENT_UNAVAILABLE`; an
agent that exists but is switched off (`is_active: false` — including a fresh
`POST /agents/:id/duplicate` copy, which always starts off) is `409 WORKFLOW_AGENT_INACTIVE`
— see the errors reference above for both.

**`from` is a per-call override, not a fixed binding.** Any active number in the company can be paired with any agent on any outbound call. The `outbound_agent_id` configured on a phone number (via `POST /phone-numbers/configure` or `PATCH /phone-numbers/:id`) only picks the agent when a call sends no `agent_id` (see `agent_id` above) and sets the dashboard's default; it does not constrain the API — callers choose `agent_id` + `from` independently per request. This means one number can serve many agents; purchasing a separate number per agent is unnecessary for outbound.

**A `from` number from the customer's own Telnyx account** (`provider: "external"`) is
refused by that account, not by Yappr, when Telnyx turns the dial down: placed right
away, `POST /calls` answers `422` with the reason in `error` (no `code`) and **no webhook
is sent**; accepted with `202` or placed by a campaign, it sends `call.failed` with
`data.error_reason`. Not retried. On a `paused` carrier account the number is switched
off, so `from` answers `400 INVALID_FROM_NUMBER`. See **Carrier Accounts** above.

**CRITICAL:** `to` and `from` MUST NOT be the same number. This creates an infinite call loop. The API returns 400 but always verify before calling.

**Phone validation (enforced at API and DB layers):**
- Both numbers must match `^\+[1-9][0-9]{7,14}$` — leading `+`, 8–15 digits, no spaces or dashes.
- Israeli numbers (`+972…`) must be exactly 12 or 13 characters total (`+972` followed by an 8-digit landline or 9-digit mobile). Anything longer or shorter is rejected.
- Malformed `to` → `400 INVALID_TO_NUMBER`. Malformed `from` → `400 INVALID_FROM_NUMBER`. Bad numbers never reach the carrier and never create a `call_log` row.
- On a workflow agent, a well-formed `to` that still cannot be reached is `400 invalid_destination`, checked before the request is accepted: an Israeli number with a leading `0` after the country code, an Israeli mobile, non-geographic or landline number with the wrong number of digits, a mobile prefix no longer in service, or a service number such as 1-800 that cannot be dialled at all. Nothing is placed or charged, and the same number fails identically on every retry.

**`variables` vs `metadata` distinction:**
- `variables` → injected into the system prompt before the call starts (use for per-call context the agent should know)
- `metadata` → stored on the call record, not injected into the prompt (use for tracking data — CRM IDs, source, etc.)

**Reserved keys (400 on collision).** The five built-in tokens (`id`, `direction`, `agent_number`, `user_number`, `agent_name`) are platform-supplied — the bot emits them itself at call start. Using any of them as a key in `metadata` is rejected with `400 INVALID_METADATA_RESERVED_KEY`. Pick a different name for your custom field (e.g. `customer_id` instead of `id`, `caller_phone` instead of `user_number`).

**This was a flow-agent-only contract and it is retired along with `flow_config`** (see
**Flow agents — retired**): a stored flow could reference `{{metadata.<key>}}` inside
`args_template`, and reading `flow_config.metadata.custom_metadata_keys` in advance was
how you found which keys it needed. `GET /agents/:id` nulls `flow_config` for every
converted agent now, so that read returns nothing. A workflow document's own tool
bindings declare their inputs explicitly — see **The conversation graph** — so there is
no separate metadata-contract lookup to make before dispatching a call to one.

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

### Call requests

Only workflow agents produce these. `POST /calls` returns `request_id`; this is how you
follow it until a call exists, and how you stop one that has not gone out.

| Endpoint | Scope | Contract |
| --- | --- | --- |
| `GET /call-requests/{id}` | `calls:read` | Current state of one accepted request. |
| `POST /call-requests/{id}/cancel` | `calls:create` | Stops a request that has not been placed. Idempotent; returns the same object. |

```json
{"id":"uuid","run_id":"uuid","status":"preparing","preparation_status":"running",
 "workflow_revision_id":"uuid","call_id":null,"expires_at":"ISO8601","error_code":null}
```

`status` is one of `scheduled`, `preparing`, `ready`, `dispatching`, `dispatched`,
`dispatch_unknown`, `failed`, `expired`, `cancelled`. The last three are final.
`dispatch_unknown` means placement is unconfirmed either way — poll until it settles;
never place the call again to find out. `call_id` is `null` until a call record exists;
once set, read the call itself with `GET /calls/:id`. `workflow_revision_id` is the
published version frozen for this request, so a later publication never changes a call
already accepted.

`preparation_status` (`pending`, `running`, `ready`, `failed`, `expired`, `cancelled`,
`declined`) tracks the pre-call step alone. A preparation that fails **or runs out of
time** does not always fail the request: an agent configured to continue with whatever is
available still calls, with whatever the preparation did produce.

`declined` is a decision, not a failure — a before-call step refused the call itself, so
nothing is dialled, no call record is created, and the failure policy does not apply. The
request ends `failed` with `error_code: "before_declined"`.

`error_code` is set only when `status` is `failed` or `expired`. An `expired` request is
always `request_expired`. On a `failed` one the preparation's own code wins wherever it
recorded one — a refusal records `before_declined` — and where it recorded nothing the value
is `before_declined` for a refusal and `request_failed` for anything else.

A request that dies before anything is dialled publishes no call event, because there is no
call. It publishes the lifecycle event `request.failed` instead, which an After trigger can
run on — the only way to follow up on a request that never became a call.

Cancel deliberately requires `calls:create`, the same permission that created the
request: a read-only key must not be able to stop a call, and the key that may start one
may stop the one it started. **Cancel is not a hangup.** Once placement has been claimed
it returns `409 WORKFLOW_DISPATCH_ALREADY_CLAIMED`; at that point the call, not the
request, is the thing to look at. A missing or non-UUID id is `404
WORKFLOW_REQUEST_NOT_FOUND`; `503 WORKFLOW_ADMISSION_UNAVAILABLE` is temporary.

---

### POST /calls — web call session (browser SDK)

Mint a short-lived, single-use token for an **in-browser** voice call via the [`@goyappr/client`](https://www.npmjs.com/package/@goyappr/client) SDK. Same endpoint as an outbound call — just set `type: "web"`. **No call is placed** and no phone number is needed; the token is what the visitor's browser uses to connect.

**Scopes:** `calls:create`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | yes | `"web"`. Omit (or `"phone"`) for a normal outbound phone call — fully backward compatible. |
| `agent_id` | uuid | yes | Agent the web caller talks to. |
| `variables` | object | no | `{{Variable}}` values injected into the prompt. |
| `metadata` | object | no | Attached to the call. Same rules as `POST /calls` — reserved keys are `400 INVALID_METADATA_RESERVED_KEY`. |
| `lead_id` | uuid | no | Attaches the call to that lead; the post-call pass writes to it. Not an id → `400`; not a lead here, or deleted → `404`. |
| `allowed_origins` | string[] | no | Optional browser-origin allow-list for the session. |

Any other field is `400 WEB_CALL_REQUEST_INVALID`, naming it.

**Response 201**

```json
{
  "type": "web",
  "call_id": "uuid | null",
  "token": "wcs_…",
  "expires_at": "ISO8601",
  "agent_id": "…",
  "agent_name": "…",
  "protocol": "offer",
  "connection": {
    "host": "…",
    "base_url": "…",
    "web_call_url": "…",
    "call_requests_url": "…",
    "turn_credentials_url": "…",
    "api_key": "publishable key, or null"
  }
}
```

**The call exists at once.** `call_id` is readable with `GET /calls/{call_id}` straight
away, with status `pending_connection` until the browser connects; then the same id runs
the call. Unused, it settles `no_answer` (`failure.code: "session_expired"`,
`ended_by: "system"`, `cost_cents: 0`) about a minute after the token expires — mint on
click, not on page load. A `pending_connection` row holds no line and costs nothing until a browser connects.

With `protocol: "call_request"` the mint answers `call_id: null`: the call request reports
the call's id once it starts. Such an agent cannot take `lead_id` — `422
WEB_LEAD_UNSUPPORTED`, and nothing is minted.

**`connection.host` is not the API host.** It is the origin the other three URLs live
on — named rather than left for you to parse out of them, so you can pin it, proxy it or
allow it through a content policy deliberately. `https://api.goyappr.com` is the
secret-key API (`recording_url` on a call is published there, one of that API's own
routes); the browser data plane carries live SDP and ICE straight from the visitor's
browser, so it is a different service and its URLs would not answer on the API host. Read
`host` and the three URLs from this block rather than assembling them from the API base.

**Refused before any token is spent.** A mint on a switched-off agent (`is_active:
false` — including a fresh `POST /agents/:id/duplicate` copy) is
`409 WORKFLOW_AGENT_INACTIVE`; on a workflow agent whose workflow has never been
published it is `409 WORKFLOW_UNPUBLISHED`. Both are refused before the session row is
written, so neither spends a token. An agent of the retired prompt kind has no
publication and is never asked for one.

**The key in `connection` is publishable, and only ever publishable** — the same class
as a Stripe publishable key. It identifies the data plane, grants nothing on its own, and
the browser is where it belongs. Two deployment cases, and they are not the same one:

- the workspace's data-plane key is a **secret-class** key → the mint refuses the whole
  request with `503 WEB_CALL_UNAVAILABLE`. No session is minted and no token is spent; a
  retry does not clear it.
- there is **no** data-plane key at all → `201` as usual, with `connection.api_key: null`.
  The browser then has no key to present unless you pass one to the SDK yourself
  (`apiKey` on `YapprConversation`).

So type it `string | null`, and branch on the `503` rather than on an empty key. The
per-call credential is `token`, which is single-use and short-lived — that is the value
to keep out of logs and out of your page source.

**A web channel alongside before-call steps publishes and works.** Minting always
succeeds for a reachable active agent, and the response's `protocol` says which exchange
the browser must speak — see below. Only an older client that ignores `protocol` and
sends a one-shot offer anyway is refused, with `409 workflow_preparation_required` —
before the token is claimed, so nothing is spent and no call slot is taken. There is
nothing to retry on that refusal: switch the client to create a call request, poll it and
start it, the same way an outgoing call is placed on a preparing agent.

**`protocol` says which exchange this agent needs.** `"offer"` is the one-shot
connect every version of the SDK speaks. `"call_request"` means the agent's
published workflow runs before-call steps **or has follow-ups (After steps)**, so the
browser must create the call, poll it and start it — see **Web calls on an agent that
prepares** below. A one-shot offer places a call with no workflow run, so a follow-up
on it would never start. Always follow `protocol`; do not infer it from the workflow.
A `call_request` token also lives 15 minutes rather than 5, because it has to
outlast the steps it waits for.

**Rehearsing an extracted-data follow-up.** A browser test call of an agent whose After
step reads `/extracted_data/<name>` runs that step once analysis is ready: the call's
`timeline` carries the `trigger` row, the tool row and the `delivery` row. If
`execution.owner` is `legacy` on a call, the call had no workflow run and none of the
agent's follow-ups ran on it.

**Two-plane model.** Your server holds the secret API key and calls this endpoint to mint the token (control plane). The browser receives only `token` + `connection` and runs the WebRTC call (data plane) — your secret key never reaches the client. Every web call is metered and billed to the key's company exactly like any other call.

**Browser usage:**

```bash
npm install @goyappr/client
```

```js
import { YapprConversation } from "@goyappr/client";

// `session` = the JSON your server got back from POST /calls {type:"web"}
const call = await YapprConversation.startSession({
  token: session.token,
  connection: session.connection,       // carries the endpoint URLs + public key
  protocol: session.protocol,           // pass it through; the SDK picks the exchange
  onStatusChange: ({ status }) => {},   // preparing | connecting | connected | disconnected | failed
  onModeChange:   ({ mode }) => {},     // "speaking" | "listening"
  onPreparation:  ({ steps }) => {},    // only for an agent that prepares
  onError:        (msg) => {},
});

call.setMicMuted(true);
call.getOutputVolume();                 // 0–1, drive a visualizer
await call.endSession();
```

**Post-call data (same as phone).** When a web call ends it runs the full post-call pipeline keyed to the call id: **transcript, summary, recording, and disposition** land on the call record (`GET /calls/:id`), and the agent's configured **post-call webhook fires** with the same payload as a phone call (transcript, summary, `call_metadata`, `call_variables`). There is no live in-browser transcript yet (`onMessage` reserved), but the server-side transcript is available shortly after the call ends (it is generated post-call from the recording — allow a few seconds before fetching `GET /calls/:id`).

### Web calls on an agent that prepares

An agent whose published workflow declares before-call steps, or follow-ups, cannot be
started in one shot — a single SDP exchange has nowhere for that work to run. Such an
agent's mint answers `protocol: "call_request"`, and the browser takes a
three-step exchange instead. `@goyappr/client` does all of it when you pass
`session.protocol` through; the endpoints are here for anyone writing their own
client.

**1. Create it.** `POST /call-requests` (scope `calls:create`) on the secret-key
API, or `POST {connection.call_requests_url}` from the browser with the session
token. Nothing is dialled, no call record is created, no line is held.

```json
{ "type": "web", "agent_id": "…", "variables": { "LeadName": "David" } }
```

**202**

```json
{
  "request_id": "…", "run_id": "…", "channel": "web",
  "status": "preparing", "preparation_status": "pending", "call_id": null,
  "expires_at": "ISO8601",
  "start_capability": "…",
  "status_url": "…", "cancel_url": "…", "start_url": "…"
}
```

`start_capability` is returned **once** and stored only as a hash. It authorises
this one request's read, cancel and start and nothing else, so it is safe in a
browser. Send it as the `x-yappr-call-request-key` header.

**2. Poll `status_url`** until `status` is `ready`. On the browser data plane the
read also carries `preparation_steps` — one entry per authored step, in document
order, each with the author's own `label` — so a waiting caller can be told what
is running. Step *results* are never included.

```json
{ "status": "preparing", "preparation_status": "running",
  "preparation_steps": [{ "id": "lookup_caller", "label": "Look up the caller", "status": "running" }] }
```

**3. Start it.** `POST {start_url}` with a **fresh** SDP offer — build the peer
now, not before the steps ran — and the capability header. **201** returns
`sdp`, `type`, `pc_id`, `ice_candidate_url` and `call_id`, exactly what the
one-shot connect returns.

A start is one offer: the same offer again returns the same peer
(`replayed: true`), a different one is `409 WORKFLOW_START_ALREADY_CLAIMED`.
`409 WORKFLOW_START_NOT_READY` means poll longer; `410 WORKFLOW_START_EXPIRED`
means create a new request; `503 AT_CAPACITY` claimed nothing, so the request is
still good — wait and start again. `POST {cancel_url}` stops a request nobody is
going to start.

**The old one-shot connect still works**, unchanged, for every agent whose mint
says `protocol: "offer"` — which is every agent with no before-call steps and no
follow-ups. An
older client that sends a one-shot offer to an agent that prepares gets
`409 workflow_preparation_required`, and that refusal costs nothing: the token
is not spent and no line is taken, so the same token can create a request
instead.

The browser presents the token as the `x-yappr-web-token` header to the endpoints in `connection` — the SDK does this for you; you never set it. Pass a `variables` object at mint (`POST /calls {type:"web", agent_id, variables}`) and it is injected into the agent's instructions as `{{Variable}}` tokens, exactly like a phone call. **Preview limitations:** no live in-browser transcript yet (`onMessage` reserved — server-side transcript above is unaffected); very restrictive networks that block UDP may fail to connect, surfaced via `onError`.

---

### GET /calls/:id/recording

The `recording_url` a call read returns (and `call.recording_url` in a follow-up's
payload) is this route plus a signature. It takes **no API key**: the signature is the
permission, so the link works as an `<audio src>`, a download link or a `curl` target. It
answers `200` with the audio directly, and answers `HEAD` and `Range` requests, so a
player can read its length and seek. Never build or edit one — read the call for it.

**Scopes:** none — the link's own signature.

| Status | Code | Why |
|---|---|---|
| 403 | `RECORDING_LINK_EXPIRED` | Past its `exp`. Read the call again for a new link. |
| 403 | `RECORDING_LINK_REVOKED` | The call's links were revoked after this one was issued. Read the call again. |
| 403 | `RECORDING_LINK_INVALID` | Not a link Yappr issued, or it was changed. Use `recording_url` exactly as returned. |
| 404 | `NOT_FOUND` | The call has no recording (yet). |
| 503 | `RECORDING_LINK_UNAVAILABLE` | The link could not be checked just now. Try again in a moment. |

A link issued before links started expiring has no `exp`; it keeps opening until the
call's links are revoked.

### POST /calls/:id/recording/revoke

Takes back every recording link issued for one call so far — for a `recording_url` that
was pasted somewhere it should not be (a ticket, a chat, a shared document). It takes no
body and no query parameters: either is `400 RECORDING_REVOKE_INVALID`, naming it, and
nothing is revoked.

**Scopes:** `calls:create`. A key limited to some agents revokes only its agents' calls.

```bash
curl -s -X POST "https://api.goyappr.com/calls/CALL_ID/recording/revoke" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

**Response:** `200`
```json
{
  "call_id": "uuid",
  "revoked_at": "ISO8601",
  "recording_url": "https://api.goyappr.com/calls/<call id>/recording?exp=…&sig=… | null"
}
```

From `revoked_at` on, every earlier link for the call answers `403 RECORDING_LINK_REVOKED`
— the old links with no `exp` included. `recording_url` is a new link that works (`null`
while the call has no recording), and later reads of the call return new links too;
revoking again takes those back as well. The call's `updated_at` moves, so a sync on
`GET /calls?updated_since=` picks up the new link instead of keeping the dead one. The
recording itself is not deleted, and the dashboard still plays it.

| Status | Code | Why |
|---|---|---|
| 400 | `RECORDING_REVOKE_INVALID` | A body field or query parameter was sent. Nothing was revoked. |
| 404 | `NOT_FOUND` | No call with this id in this workspace, or a call of an agent the key is not limited to. |
| 404 | `RESOURCE_ID_INVALID` | The id in the path is not an id. |
| 503 | `RECORDING_LINK_UNAVAILABLE` | Nothing was revoked. Try again in a moment. |

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

**Windows gate phone calls only.** `GET /call-windows` needs no specific scope — any
authenticated key for the workspace can read the schedule. `PUT /call-windows` requires
`call_windows:manage`: this one setting takes every agent in the workspace on or off the
phone, which is why it is scoped separately from ordinary agent management. Refused
`403 INSUFFICIENT_SCOPE` with nothing written if the key lacks it. **Breaking for older
keys:** a key minted before this scope existed does not hold it. You do not need a new
secret — in Settings → API keys, a key that predates a scope lists it with a one-press
**Add to this key**; the same key then works.

### GET /call-windows · PUT /call-windows

**Response / PUT body:**
```json
{
  "timezone": "Asia/Jerusalem",
  "inbound_enabled": false,
  "outbound_enabled": true,
  "closed_message": null,
  "updated_at": "ISO8601",
  "windows": [
    { "day_of_week": 0, "start_time": "09:00", "end_time": "19:00" }
  ]
}
```

`day_of_week` is `0`–`6` (`0` = Sunday). `start_time`/`end_time` are `HH:MM`, 24-hour,
evaluated in the workspace timezone; `start_time` must be strictly before `end_time` — no
overnight wrap, express a midnight-crossing window as two entries on consecutive days.
`PUT` replaces the configuration: omitting `windows` leaves the existing schedule
unchanged, sending it (even `[]`) overwrites every day. Outbound calls placed outside an
enabled window are queued (`202`, `status: "scheduled"`, with `scheduled_for`); inbound
calls outside an enabled window are ended before being answered — no `call_logs` row, no
charge.

**`closed_message`** (string, nullable, ≤ 500 chars) — what an inbound caller will hear
when the window is closed, spoken before the call ends. `null` (the default) ends the
call without saying anything. Omit the key on `PUT` to leave it unchanged; send `null` or
a blank string to clear it. It only reaches anyone while `inbound_enabled` is `true`.
Stored and returned today; calls do not speak it yet, so an out-of-hours call is still
ended in silence until the voice release that picks it up.

**Windows gate phone calls only.** A browser session minted with `POST /calls
{"type":"web"}` is a rehearsal and is never gated: the mint returns `201` immediately
even with every window closed and both toggles on. To hold a browser call to opening
hours, read `GET /call-windows` and decide in your own page before minting.

**Hours live in one place.** If you are writing an agent's instructions, do not have it
recite opening hours as if they were a setting — the schedule is what decides whether a
call connects, and a second copy in the prompt drifts. Set the schedule with
`PUT /call-windows`.

**Not overwriting someone else.** These settings are one record for the whole
workspace, with no per-agent copy — your integration, a colleague's dashboard tab and a
scheduled job all write the same hours. Without a version, the last write wins in
silence. `GET /call-windows` returns `updated_at`; send it back as `expected_updated_at`
on `PUT` and the write only goes through if the record is still the one you read. If
someone changed the hours in between, the response is `409 CALL_WINDOWS_CONFLICT`,
**nothing is written**, and the message carries the version to re-read against. The field
is optional — omit it and the write is unconditional, exactly as before it existed.

**Errors:** `400 INVALID_CALL_WINDOWS` (two ranges on the same day overlap, or
`start_time` is not strictly before `end_time`); `400` (`day_of_week` outside `0..6`, a
time not `HH:MM`, `closed_message` not a string/`null`/too long, or `expected_updated_at`
present but not a timestamp); `409 CALL_WINDOWS_CONFLICT` (the `expected_updated_at` you
sent is not the current version).

---

## Dispositions

Disposition labels are the outcomes a call is sorted into (e.g. "Interested", "Appointment Set").

**The label is the matching rule.** A disposition has no description, prompt or criteria field. After each call the post-call model reads the transcript and copies exactly one label out of this list, so the words you choose are all it has to go on — "Booked a viewing" earns the right calls where "Outcome A" is a guess. Create the labels first, then the calls classify themselves.

Dispositions marked `is_protected: true` cannot be deleted — Yappr seeds a workspace with these protected by default: `Voicemail`, `Do Not Call`, `Transferred to a Person`, `Unclassified`, `No Answer`, `Failed`. They *can* be renamed, and the platform finds four of them **by name** when it sets them without asking the model — `No Answer` and `Failed` when a call never connected, `Voicemail` when nobody really spoke, `Unclassified` when the analysis itself failed — so renaming one of those four stops that classification from happening at all.

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
| `color` | string | no | Hex color e.g. `"#22c55e"`. Omitted, `null` or blank stores grey (`#6b7280`) — the column cannot hold nothing. Not validated. |

**Response:** `201` — full disposition object

**Errors:** `409 DUPLICATE_LABEL` if the workspace already uses that label (nothing is created).

---

### PATCH /dispositions/:id

Update a disposition.

**Scopes:** `dispositions:manage`

| Field | Type | Required |
|-------|------|----------|
| `label` | string | no |
| `color` | string | no |

**Response:** `200` — full updated disposition object

**Errors:** `409 DUPLICATE_LABEL` if the workspace already uses that label (nothing is changed).

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
| `tag` | string | — | only leads carrying this tag, by name exactly as `GET /lead-tags` returns it |
| `tag_id` | uuid | — | the same filter by id. Send `tag` or `tag_id`, not both. An unknown tag is `404 LEAD_TAG_UNKNOWN`, not an empty page; any other parameter is `400 LEADS_QUERY_INVALID` |

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
  "extracted": { "preferred_day": "Tuesday", "policy_number": "4471-B" },
  "metadata": {},
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

**`extracted`** — what this lead's calls collected, keyed by each extraction parameter's
own name, merged across every call with that person: the most recent call that answered a
field wins it, and a field that call never covered keeps the answer an earlier call found.
Only answers are merged, so this is not a copy of any one call's `extracted_data` (which
carries every parameter, `null` for the ones that call never covered) — a parameter no call
has answered is absent here. At most 100 fields: the latest call's answers stay, and
earlier ones fill the rest in order of their names. `null` until a call collects
something; the values arrive with the call's analysis, a minute or two after it ends.
Read-only: it is stored under the reserved `metadata.extracted` key, neither `POST /leads`
nor `PATCH /leads/{id}` can set it, and replacing `metadata` does not erase it.

---

### POST /leads

Create a lead.

**Scopes:** `leads:manage`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `phone_number` | string | yes | E.164 or the local Israeli form (`0501234567`); normalised on write |
| `name` | string | no | |
| `email` | string | no | |
| `source` | string | no | `api` (default), `manual` or `csv_import`. Any other value is `400 INVALID_LEAD_SOURCE`, never silently rewritten. `call` is Yappr's own and cannot be claimed. |
| `tags` | string[] | no | Tag names, matched exactly — resolved to IDs server-side. One unknown name is `400 INVALID_TAG_NAMES` and nothing is written |
| `tag_ids` | uuid[] | no | Alternative to `tags` — pass UUIDs directly. One unknown id is `400 INVALID_TAG_IDS`. Send one of the two, not both: `tags` wins when both are present |
| `long_term_context` | string | no | AI memory injected into system prompt at call time |
| `metadata` | object | no | Arbitrary JSON object. The reserved key `extracted` is dropped — only a call writes it |

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

## Campaigns

Bulk outbound dialing over your leads. A campaign holds a list of enrolled contacts, a set of **stop rules**, and **pacing** limits; once launched, the platform keeps handing eligible contacts to the ordinary outbound call queue until every contact has stopped or run out of attempts.

**A campaign call is an ordinary outbound call.** Same queue, same weight, same billing as one placed by `POST /calls`. Pacing controls only *how fast* a campaign hands calls to the queue — it never gets priority over anything, and it never bypasses the do-not-call list, the workspace call windows, the credit floor, or the concurrency cap.

**Ownership split.** You own the *config* (name, agent, from-number, stop rules, pacing, budget, compliance basis) and the *contact list*. The platform owns *state* — status transitions, per-contact progress, spend, and pacing counters. Every engine-owned field is rejected on write (see [Read-only fields](#read-only-engine-owned-fields)).

| Method | Path | Purpose |
|---|---|---|
| GET | `/campaigns` | List campaigns |
| GET | `/campaigns/defaults` | The dashboard's suggested settings for this workspace, ready to send to `POST /campaigns` |
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

The expanded `agent` is the same object `GET /agents/{id}` returns for that agent,
projected the same way: `type` reads `workflow`, the voice is named rather than given as
an internal enum, and the retired prompt-agent fields (`system_prompt`, `flow_config`,
`webhook_*`) are absent. A workflow agent's live script is its workflow document —
`GET /agents/{id}/workflow` — not anything on the campaign.

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

  "split": { "agent_id": "uuid", "percent": 30 } | null,
  "calling_window": {},

  "stop_disposition_ids": ["uuid"],
  "stop_on_no_answer": false,
  "stop_on_voicemail": false,
  "stop_on_unclassified": false,

  "max_attempts": 3,
  "max_infra_retries": 3,
  "retry_no_answer_seconds": 3600,
  "retry_completed_seconds": 86400,
  "randomize_retry_time": false,
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

  "regulatory_basis": "lawful_basis_confirmed | consent | existing_customer | non_marketing | registry_screened | null",

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
  "split_agent": { /* full agent object for split.agent_id, or null */ },
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

**No configuration field has a default.** Only `name` is required to create, but every
field you leave out stays `null`, and `POST /campaigns/:id/launch` then answers
`422 CAMPAIGN_NOT_READY` naming each one. The **Suggested** column below is what the
dashboard prefills for a person, not what the API substitutes for you. Send every field on
create, or fill the gaps with `PATCH` before launching — how often to call someone and when
to stop are decisions the platform will not make on your behalf.

To start from what the dashboard offers, `GET /campaigns/defaults` (`campaigns:read`) →
`settings`, merge `name`, `agent_id`, `from_phone_number_id` and `regulatory_basis`, and
`POST` it. Its `stop_disposition_ids` are this workspace's Interested, Appointment Set, Not
Interested, Issue Resolved, Transferred to a Person, Wrong Number and Do Not Call — a lead
who says they are interested is handed to you by the outcome and its follow-ups, not
dialled again; `calling_window` is in the workspace timezone (Sun–Thu in Israel).

#### Client-writable fields

This exact allowlist applies to both `POST` and `PATCH`. **Any other key — including a typo or a read-only field — is rejected with `400`** and a message listing the writable set. This is deliberate: silently ignoring a misspelled `stop_dispositions` would leave you believing you armed a kill switch when you did not.

| Field | Type | Suggested | Validation / notes |
|-------|------|---------|--------------------|
| `name` | string | — | **Required on create.** Trimmed. **Not unique** — a name another campaign already uses is accepted (`201`), so a retried create makes a second draft. Tell campaigns apart by `id` |
| `description` | string | null | Free text |
| `agent_id` | uuid | — | Required before launch |
| `from_phone_number_id` | uuid | — | Required before launch; must be an active number the workspace owns |
| `split` | object \| null | null | Optional two-agent A/B test — `{ "agent_id": "...", "percent": 1-99 }`. `percent` is the **second** agent's share of contacts; `agent_id` on the campaign above takes the rest. See [Testing two agents on a campaign](#testing-two-agents-on-a-campaign) below |
| `calling_window` | object | `{}` | Optional narrowing of the workspace calling hours for this campaign — it can never widen them. `{}` follows the workspace hours; see [retry_rules and calling_window](#retry_rules-and-calling_window) |
| `stop_disposition_ids` | uuid[] | `[]` | Array of **disposition ids**, never labels. Every id must belong to this workspace, or `400`. `No Answer`, `Failed`, `Voicemail` and `Unclassified` are refused (`400`, naming the outcome and the switch to use instead) — see [Stop outcomes the platform assigns](#stop-outcomes-the-platform-assigns) |
| `stop_on_no_answer` | boolean | `false` | Retire a contact the first time nobody picks up |
| `stop_on_voicemail` | boolean | `false` | Retire a contact on a voicemail-class outcome |
| `stop_on_unclassified` | boolean | `false` | What to do when the outcome that arrives is `Unclassified` — the call happened but matched none of your outcomes. `false` retries, `true` retires. Not a timeout: a contact is never advanced without an outcome |
| `max_attempts` | int | 3 | 1–999. Per-contact dial cap |
| `max_infra_retries` | int | 3 | 0–20. Separate budget for platform-side failures, which never count against `max_attempts` |
| `retry_no_answer_seconds` | int | 3600 | 30–604800. Wait before redialing an unanswered contact |
| `retry_completed_seconds` | int | 86400 | 60–604800. Wait before redialing a contact whose call connected but landed a non-stop outcome |
| `randomize_retry_time` | boolean | `false` | `false` keeps a retry at the same time of day; `true` picks another hour inside the calling window. Never earlier than the configured wait either way |
| `double_dial_enabled` | boolean | `false` | Pair a second ring with an unanswered attempt |
| `double_dial_gap_seconds` | int | 90 | 10–3600. Required before launch even when `double_dial_enabled` is `false` |
| `max_calls_per_day` | int | 200 | 1–100000. Resets on the workspace's own calendar day |
| `min_seconds_between_calls` | int | 30 | 0–86400. Minimum spacing between two admissions |
| `max_in_flight` | int | 2 | 1–8. How many attempts *this* campaign may have outstanding. Self-restraint, not a capacity grant — the platform's shared outbound lanes are the real ceiling |
| `budget_cents` | int \| null | null | Positive integer, or `null` for no cap. Enforced against `spent_cents + reserved_cents` |
| `regulatory_basis` | string | — | One of `lawful_basis_confirmed` (a single attestation of consent or another lawful basis for everyone on the list — what the dashboard records), `consent`, `existing_customer`, `non_marketing`, `registry_screened`. **Required before launch** |
| `starts_at` | ISO8601 | null | Do not admit before this instant |
| `ends_at` | ISO8601 | null | Do not admit after this instant |

```bash
curl -s -X POST "https://api.goyappr.com/campaigns" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "March renewals",
    "agent_id": "AGENT_ID",
    "from_phone_number_id": "PHONE_NUMBER_ID",
    "regulatory_basis": "existing_customer",
    "stop_disposition_ids": ["NOT_INTERESTED_ID", "APPOINTMENT_SET_ID"],
    "stop_on_no_answer": false,
    "stop_on_voicemail": true,
    "stop_on_unclassified": false,
    "max_attempts": 3,
    "max_infra_retries": 3,
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

#### Stop outcomes the platform assigns

The platform sets four outcomes by itself — `No Answer` on every unanswered ring, `Failed`
on every dial that did not go through, `Voicemail` and `Unclassified` even on a call
someone answered — so a stop set holding one would retire the contact the first time it
lands, before any retry. `POST` and `PATCH` refuse them in `stop_disposition_ids` with
`400 CAMPAIGN_REQUEST_INVALID`, naming each and the switch to use instead:
`stop_on_no_answer`, `stop_on_voicemail`, `stop_on_unclassified` (for `Failed`, nothing: a
failed dial is retried until `max_attempts`). The switches are read from the call's
outcome, not its label.

#### retry_rules and calling_window

`retry_rules` is not a field: sending it is `400 CAMPAIGN_REQUEST_INVALID` like any other
unknown key, and a campaign read does not return it. It was an earlier structured retry
matrix the dialer never evaluated. The scalar controls are the whole retry configuration,
and they are what the pacer reads:

- retry timing → `retry_no_answer_seconds`, `retry_completed_seconds`, `randomize_retry_time`, `max_attempts`, `max_infra_retries`
- when the campaign may dial → the **workspace** call windows (`GET`/`PUT /call-windows`) are the outer gate; a campaign with no reachable workspace window refuses to launch and pauses itself as `paused_config`. `calling_window` (`{tz, days:[0..6], start:"HH:MM", end:"HH:MM"}`) can only narrow those hours for this one campaign, never widen them.

**`calling_window` needs a zone.** `{}` inherits the workspace calling hours — this is an
optional per-campaign narrowing, not the gate itself (see above). As soon as the object
sets `days`, `start` or `end`, `tz` (an IANA name such as `Asia/Jerusalem`) is required —
`"09:00-18:00"` says nothing until it says whose nine in the morning. Setting one without
the other is `400`.

Leave `calling_window` at `{}` unless you want this one campaign to dial inside narrower hours than the workspace.

#### Testing two agents on a campaign

```json Split the list 70/30
{ "split": { "agent_id": "SECOND_AGENT_ID", "percent": 30 } }
```

**A contact keeps the agent it got, forever.** The pick happens once — on a
contact's first admission — and every later attempt, including a no-answer
redial, reuses that agent. This is not a fresh coin toss per attempt: if it
were, a no-answer retry could switch versions mid-comparison and the result
at the end would be measuring nothing. Raising or lowering `percent` later
only changes which agent a **not-yet-dialed** contact gets.

**Turning the test off, or changing an agent, does reach contacts already
dialed.** Send `{ "split": null }` and every contact returns to the
campaign's own `agent_id` on its next attempt. Replace either agent in the
pair and contacts pinned to the one you removed are re-assigned across the
pair you are running now.

**Both agents are screened against the do-not-call list at enrolment** — a
contact suppressed for either one is reported `on_do_not_call` and never
enrolled, so a contact can never be assigned an agent that is not cleared
to call it.

**Both agents must be launchable, or `POST /campaigns/:id/launch` refuses**
and names the one that is not: each needs a positive `max_call_duration_secs`,
and the second one must additionally be active and (if a workflow agent)
published. **Deactivating the second agent is not how you end the test** — a
contact already pinned to it just falls back to the campaign's own agent
(recorded as variant `a`, since that is who actually called), while the pin
itself survives, so re-activating the agent returns its contacts to it. Send
`{ "split": null }` to actually end it.

**Read the results** with `GET /calls?ab_variant=a` and `?ab_variant=b`.

| Status | Code | When |
|---|---|---|
| 422 | `INVALID_SPLIT` | `percent` outside 1–99, the second agent is the same as `agent_id`, or `split` is neither an object nor `null` |
| 404 | `AGENT_NOT_FOUND` | `split.agent_id` (or `agent_id`) is not an agent in this workspace — the message names the field |
| 422 | `CAMPAIGN_NOT_READY` (at launch) | The second agent can't take these calls — see the launch preflight above |

---

### PATCH /campaigns/:id

Update any subset of the writable fields above. Safe while a campaign is `running` — the next tick picks the new values up.

**Scopes:** `campaigns:manage`

- `400` when the campaign is `completed`, `stopped`, or `archived` (no longer editable)
- `400` when the body contains no writable field
- `400` on an unknown/read-only key, an out-of-range value, or a `stop_disposition_ids` entry from another workspace
- a rename is never refused for the name alone — campaign names do not have to be unique

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

**Query params:** `status` (comma-separated; an unknown status is `400 CAMPAIGNS_QUERY_INVALID`, naming it), `phone`, `limit` (default 50; above 200 reads as 200, a negative as 1, and `0` or a value that is not a number as 50), `offset`.

`phone` finds a contact by the number you know, in any format: `0501234567`,
`050-123-4567`, `+972501234567` and `00972501234567` find the same contact, and part of a
number (`1234567`, at least 3 digits) finds every contact whose number contains it. Text
that is not a number (`?phone=Dana`) is `400 CAMPAIGNS_QUERY_INVALID`.

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

`stop_reason` (and the attempt ledger's settle reason) is a short code; values you will see include `in_another_campaign`, `campaign_stopped`, `campaign_archived`, `disposition`, `stop_disposition`, `non_stop_disposition`, `disposition_timeout`, `no_answer`, `voicemail`, `dial_failed`, `infra_failure`, `insufficient_credit`, `queue_expired`, `never_dialed`, `dnc_blocked`, `orphan_reaped`, `cancelled`, `lead_removed`, `manual`.

---

### POST /campaigns/:id/leads

Enroll contacts. Two interchangeable inputs, usable together in one request:

**Scopes:** `campaigns:manage`

| Field | Type | Notes |
|-------|------|-------|
| `lead_ids` | uuid[] | Existing leads in this workspace |
| `phone_numbers` | array | Raw numbers. Each item is `{ "phone": "...", "name"?, "email"?, "notes"? }` or a bare string |

Both may be sent in the **same request** — they are additive, and because enrollment is idempotent the same person cannot be enrolled twice however the two overlap. At least one of the two is required, and **at most 1,000 contacts per request** (`400` above that — send several requests). Enrollment is allowed on a `draft` campaign **and on a running one**; only terminal campaigns (`completed`, `stopped`, `archived`) refuse.

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
  "in_another_campaign": [ { "phone": "+972521112222", "lead_id": "uuid", "campaign_id": "uuid", "campaign_name": "September recall" } ],
  "results": [ { "phone": "+972501111111", "lead_id": "uuid", "result": "enrolled" } ],
  "total_leads": 1042,
  "company_id": "uuid"
}
```

- `already_enrolled` — re-enrolling the same contact is idempotent, not an error, so a sync script can be written naively
- `on_do_not_call` — filtered out at enroll time and reported up front; the dispatcher re-checks at dial time regardless
- `not_found` — ids in `lead_ids` that are not leads of this workspace
- `invalid_phone` — unparseable numbers, and existing leads whose stored number cannot be canonicalized

**Enrolment never refuses the batch.** A number another live campaign is calling comes back in `in_another_campaign[]` with `campaign_id` and `campaign_name`, and in `results[]` — one entry per number that got past parsing and the do-not-call screen, in the order sent, with `result` `enrolled`, `already_enrolled` or `in_another_campaign`. Everyone else is enrolled. A draft holds no number; launching a draft retires contacts another campaign took meanwhile (`stop_reason: in_another_campaign`).

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
| `stop` | any non-terminal status | `stopped` (terminal) and every `pending`/`scheduled` contact → `excluded` with `stop_hit: true`, `stop_reason: campaign_stopped`. In-flight calls finish. A half-built draft cannot be stopped (`409 CAMPAIGN_NOT_STOPPABLE`) — archive it with `DELETE` |

- Launching an already-`running` campaign is a no-op: `200` with `"message": "Already running"`.
- Launching from a terminal status, or stopping a terminal campaign, returns `400`.
- `launch`/`resume` run a **preflight**; a failure is `422 CAMPAIGN_NOT_READY` with a specific, actionable message and no state change.
- `launch` (and `resume` on a draft) can answer `409 CONFLICT` when another campaign started calling one of the draft's contacts at the same instant. Nothing changed; send it again — that contact is then skipped with `stop_reason: in_another_campaign`.
- Contacts retired by a stop or an archive carry `stop_reason: campaign_stopped | campaign_archived`, whether the campaign was stopped in the dashboard or through the API.

```bash
curl -s -X POST "https://api.goyappr.com/campaigns/CAMPAIGN_ID/launch" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '{status, last_tick_result, error, message}'
```

#### Launch preflight — the causes of `422 CAMPAIGN_NOT_READY`

All of these must hold; the first failure is the one you get back, named in `message`.

| Message | Fix |
|---|---|
| Assign an agent before launching | `PATCH` with `agent_id` |
| Assign a phone number to call from before launching | `PATCH` with `from_phone_number_id` |
| `regulatory_basis` is required before launching | `PATCH` with one of the five bases |
| Finish configuring the campaign before launching. Not set: … | `PATCH` every field it names — none has a default: `max_attempts`, `max_infra_retries`, `retry_no_answer_seconds`, `retry_completed_seconds`, `randomize_retry_time`, `stop_on_no_answer`, `stop_on_voicemail`, `stop_on_unclassified`, `double_dial_enabled`, `double_dial_gap_seconds`, `max_calls_per_day`, `min_seconds_between_calls`, `max_in_flight` |
| Configure at least one stop rule before launching | A non-empty `stop_disposition_ids`, or `stop_on_no_answer` / `stop_on_voicemail` set to `true` |
| The assigned agent no longer exists | Point `agent_id` at a live agent |
| An agent on this campaign has no maximum call duration set | `PATCH /agents/:id` with a positive `max_call_duration_secs` on every agent the campaign calls with, the A/B test's second agent included — `0` means the agent has no cap of its own, so each call can run to the platform's 65-minute limit, far above any budget |
| The second agent on this campaign's A/B test is not available | Point `split.agent_id` at an active agent in this workspace, or send `"split": null` |
| The phone number assigned to this campaign is no longer active | Pick an `is_active` number with `status: "active"` |
| This workspace has no upcoming calling window | Fix `PUT /call-windows` — windows and, if it is wrong, the workspace's `timezone` (an IANA name) in the same request |
| Enroll at least one contact before launching | `POST /campaigns/:id/leads` — at least one contact must still be callable (`pending` or `scheduled`) |

---

### Campaign statuses

| Status | Meaning | Resumes by itself? |
|---|---|---|
| `draft` | Created, never launched | — |
| `scheduled` | Launched but waiting for `starts_at` | — |
| `running` | Admitting calls | — |
| `paused` | **You** paused it | **No** — a manual pause survives a top-up. Call `resume` |
| `paused_insufficient_credit` | Balance under the floor needed to place a call | **Yes** — the tick re-checks every minute and resumes from any funding path (checkout, auto-topup, admin credit) |
| `paused_budget` | `spent_cents + reserved_cents` would exceed `budget_cents`, or the workspace's own monthly spending limit is reached | No — read `pause_reason` (below), raise that limit, then `resume` |
| `paused_infra` | One contact's call failed to go out more than `max_infra_retries` times | No — resume once calls go out |
| `paused_config` | Config problem (no reachable calling window, agent without a duration cap, the from-number no longer active) | No — fix the config, then `resume` |
| `completed` | Nothing live left to dial. Terminal | — |
| `stopped` | You stopped it. Terminal | — |
| `archived` | Soft-deleted, hidden from list. Terminal | — |

**`pause_reason`** (on the campaign and on `/stats`) says why a paused campaign is paused,
so you know where the fix is: `manual`, `insufficient_credit`, `campaign_budget` → raise
`budget_cents`, resume; `workspace_spend_limit` → raise the monthly limit
(`PATCH /billing`), resume; `call_placement_failures` (`paused_infra`) → one contact's call
failed to go out more than `max_infra_retries` times — calls under way finished, nobody lost
their place; resume once calls go out; `configuration` (`paused_config`). `null` when the
campaign is not paused.

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
| `from_number_unavailable` | The from-number is no longer active → status `paused_config` (not `paused_infra`) |
| `agent_has_no_duration_cap` | The agent's `max_call_duration_secs` was set to `0` (no cap of its own) mid-campaign → status `paused_config` |
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
- **`No Answer`, `Failed`, `Voicemail` and `Unclassified` are refused in `stop_disposition_ids`** (`400 CAMPAIGN_REQUEST_INVALID`, naming each). The platform assigns them by itself, even to real conversations, so in the stop set one would retire people you actually reached. Use `stop_on_no_answer` / `stop_on_voicemail` / `stop_on_unclassified` instead, which are evaluated on the call's outcome rather than its label.
- **Put `Interested` in the stop set** (`GET /campaigns/defaults` does), so a lead who said yes is handed over by the outcome's follow-ups instead of being dialled again.
- **There is no built-in "reached a human" rule.** To stop calling people you have already spoken to, create a disposition for that outcome (`POST /dispositions`) and put its id in `stop_disposition_ids`.
- **Outcomes are classified asynchronously after the call ends**, typically within seconds but occasionally much later. A contact sits in `awaiting_disposition` until its outcome arrives, however long that takes — there is no timeout that decides without one, and only that contact waits while the campaign keeps calling everyone else. `stop_on_unclassified` decides what happens when the outcome that arrives is `Unclassified`. The platform will not redial a contact in `awaiting_disposition`, and neither should you.
- **A disposition that is a stop rule on a live campaign cannot be deleted.** `DELETE /dispositions/:id` is refused at the database layer (it surfaces as a `500`, not a clean error) rather than silently disarming your kill switch. Remove the id from every non-terminal campaign's `stop_disposition_ids` first. (The 10 seeded defaults are `403 PROTECTED` anyway, so this bites on custom outcomes.)

### Compliance

- `regulatory_basis` is a required attestation before launch, recorded on the launch audit event together with the enrolled count. It is the artefact that exists when someone asks why a person was called.
- **Enrollment excludes numbers on the do-not-call list** and reports them in `on_do_not_call`. The dispatcher re-checks at dial time.
- **A verbal opt-out is honoured automatically.** When a call is classified as `Do Not Call`, that number is added to the workspace's do-not-call list — workspace-wide, across every agent and campaign, not just this one. This fires even when the classification lands long after the call.
- A number can be dialed by only **one active campaign at a time** — enrolment reports it per number as `in_another_campaign` — so the same person on two lists does not receive double the calls.

### Campaign error codes

| Status | Code / shape | Cause |
|---|---|---|
| 400 | `CAMPAIGN_REQUEST_INVALID` on a create/edit body (message names the field); `CAMPAIGN_QUERY_INVALID` on a list | Unknown or read-only key (`retry_rules` included), out-of-range value, a `calling_window` that is not an object or sets hours without a `tz`, stop-disposition id from another workspace or a label instead of an id, `No Answer` / `Failed` / `Voicemail` / `Unclassified` in `stop_disposition_ids`, a `budget_cents` below one call's hold, empty PATCH, editing a terminal campaign, enrolling into a terminal campaign, over 1,000 contacts in one enroll |
| 400 | `INVALID_FROM_NUMBER` | `from_phone_number_id` is not an id, or not a phone number in this workspace (made up, another workspace's, or released). Nothing was written; send an `id` from `GET /phone-numbers` |
| 404 | — | Campaign not in this workspace (or archived); contact not enrolled |
| 409 | `CAMPAIGN_NOT_STOPPABLE` | Stopping a half-built draft — archive it with `DELETE` |
| 409 | `CONFLICT` | Launch raced another campaign for one of the draft's contacts — send it again |
| 422 | `CAMPAIGN_NOT_READY` | Launch preflight failed; `message` names the single blocking cause |
| 422 | `INVALID_SPLIT` | A malformed or out-of-range `split` on create/update — see [Testing two agents on a campaign](#testing-two-agents-on-a-campaign) |
| 404 | `AGENT_NOT_FOUND` | `agent_id` or `split.agent_id` is not an agent in this workspace (made up, another workspace's, or archived) — `message` names the field. It used to be `422 INVALID_AGENT` |

> **Envelope note — `422 CAMPAIGN_NOT_READY` carries the code twice.** It returns `{ "error": "<CODE>", "code": "<CODE>", "message": "<human text>" }` — branch on `code` and show `message`; `error` repeats the code rather than carrying prose. Every other refusal here uses the ordinary `{ "error": "<human text>", "code": "<CODE>" }`.

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

Update a tag. The tag keeps its id, so every lead carrying it keeps carrying it —
renaming is the safe way to relabel a segment. Send only the fields you are changing; a
body with none of them is `400`.

**Scopes:** `lead_tags:manage`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | no | Unique in the workspace. A taken name is `409 DUPLICATE_NAME`. |
| `color` | string | no | Hex, or `null` for the dashboard's default grey. |
| `description` | string | no | Free text, or `null` to clear. |
| `sort_order` | int | no | Reorder the tag. Nothing renumbers the others. |

**Response:** `200` — the whole tag as it now stands. There is no `updated_at`.

---

### DELETE /lead-tags/:id

Delete a tag, taking it off every lead that carries it. **A tag leads still carry is
refused**, so this is never a quiet operation:

```
DELETE /lead-tags/{id}            -> 409 {"error":"5 leads still carry \"renewal-due\". …",
                                          "code":"LEAD_TAG_IN_USE","leads_tagged":5}
DELETE /lead-tags/{id}?force=true -> 200 {"success":true}
```

Read `leads_tagged` before deciding: those leads stop matching `GET /leads?tag=…` and
stop being enrolled by any campaign built on that segment, and there is no undo —
recreating the tag gives a new id with nothing attached. Retag them with
`PATCH /leads/{id}` first, or repeat with `?force=true`.

`force` takes only `true` or `false`. `1`, `yes`, an empty value, or any other query
parameter is `400 LEAD_TAG_DELETE_INVALID` rather than being read as "no". A tag no lead
carries deletes on the first call either way.

The count has to succeed before anything is deleted: if it cannot be taken the call
answers `503 LEAD_TAG_COUNT_UNAVAILABLE` and the tag is still there. Retry, or send
`?force=true` to delete without the count.

**Scopes:** `lead_tags:manage`

---

## Shared Links

**Shared links are the reliable way to hear an agent.** `POST /shared-links
{"agent_id":"…"}` returns a `url` of the form `https://app.goyappr.com/share/<token>`.
Opening it places a real browser call: billed, listed by `GET /calls` with
`direction: "web_call"`, recorded and analysed like a phone call. `created_by` is `null`
for a link made with an API key. There is no delete — `PATCH /shared-links/{id}
{"is_revoked":true}` retires it, and `false` brings the same URL back. Read `status`
(`active` / `expired` / `revoked`), not `is_revoked`, to ask whether a link still works.

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

## API Keys

Issue narrow keys from code instead of the dashboard: how an integration gives a job
less authority than it has itself — a nightly export that only reads leads gets a key
that can only read leads, so a mistake in that job cannot place a call or spend a
shekel.

**`api_keys:manage` only starts with a person.** It is off by default and can only be
ticked when a person creates a key in the dashboard's Settings → API keys, under **API
keys → Manage**. A key issued through this API can never receive it, however wide the
issuing key's own scopes are, so key issuance stays one generation deep. Each workspace
needs its own first key: a key belongs to one workspace and cannot issue keys in another.

**`api_keys:read` audits without changing anything.** It lists and reads keys — names,
prefixes, scopes, `last_used_at` — and can neither issue nor revoke. It is **not** in the
dashboard's **Read-only** preset (see the presets below); unlike `api_keys:manage` it *can*
be granted through `POST /api-keys`: give it to a job that should watch the inventory and
nothing else.

**Scopes say what a key may do; `agent_ids` says which agents it may do it to.** Scopes
are resource types (`calls:read`, `leads:manage`, …). A key issued without `agent_ids`
reaches the whole workspace, as every key always has; a key issued with them reaches only
those agents — see **Limit a key to some agents** below.

**Dashboard presets.** **Standard** = agents and tools read + create + update, calls read +
create. **Read-only** = the reads of agents, tools, `phone_numbers:search`, calls,
dispositions, leads, lead tags, campaigns, flows, agent eval, integrations,
tool-connections, shared links, do-not-call and SIP endpoints — no billing, API keys or
affiliates. **Full access** = every scope.

### GET /api-keys · GET /api-keys/:id

Every active key in the workspace, newest first (revoked keys are not listed), or one key
by id (`404` once revoked).

**Scopes:** `api_keys:read`, or `api_keys:manage` (which reads the list as well). A key
holding neither gets `403 INSUFFICIENT_SCOPE`.

**Response (list):**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "prefix": "ypr_live_9f2c41a",
      "scopes": ["leads:read", "leads:manage"],
      "agent_ids": null,
      "agents": null,
      "created_at": "ISO8601",
      "last_used_at": "ISO8601 | null",
      "expires_at": "ISO8601 | null"
    }
  ]
}
```

`agent_ids` is on every read of a key: `null` = no limit, a list = the only agents it
reaches. `agents` is the same list with each agent's `name` (`null` for an agent that no
longer exists), so the list alone says which client each key belongs to. `expires_at` is
when the key stops working, `null` for one that works until revoked; a key past it answers
`401 EXPIRED_KEY` to every request and **stays listed** until you revoke it. The list takes
no query parameters — any is `400 API_KEY_REQUEST_INVALID`.

The secret is never returned here — `prefix` (first 16 characters) is enough to tell two
keys apart and to match a key against the dashboard list. `last_used_at` is when the key
last authenticated a request, `null` if it never has — the quickest way to find a key
nothing uses.

### POST /api-keys

Issues a key and returns its secret **once**. No later request returns it — it is stored
only as a hash. Save it before doing anything else; if you lose it, revoke it and issue
another.

**Scopes:** `api_keys:manage`

**Request body:** `{"name": "Nightly lead sync", "scopes": ["leads:read", "leads:manage"]}`
— `scopes` is required and has no default: a key is issued with exactly what you ask for.
Optional `agent_ids` limits the key to some agents (below). Optional **`expires_at`** gives
the key an end date: an ISO 8601 date-time **with a time zone** (`2026-12-31T23:59:59Z`);
from that moment every request made with it answers `401 EXPIRED_KEY`. Leave it out or
send `null` for a key that works until revoked. A moment already past, or a date without a
time zone, is `400 API_KEY_REQUEST_INVALID` rather than guessed at. Give a contractor's or
a trial client's key an end date instead of relying on someone remembering to revoke it.
Nothing else is read: an unknown body field is `400 API_KEY_REQUEST_INVALID` naming it.

**Two rules decide what a new key may hold:**
- **Subset** — you can only grant scopes the calling key itself holds. Anything more is
  `403 API_KEY_SCOPE_ESCALATION`, naming each scope that went beyond.
- **`api_keys:manage` is never granted here** — `403 API_KEY_MANAGE_NOT_DELEGABLE`.
  Create that key in the dashboard.

`api_keys:read` is granted here like any other scope.

**Response:** `201`
```json
{
  "id": "uuid",
  "name": "Nightly lead sync",
  "prefix": "ypr_live_9f2c41a",
  "scopes": ["leads:read", "leads:manage"],
  "agent_ids": null,
  "agents": null,
  "created_at": "ISO8601",
  "last_used_at": null,
  "expires_at": null,
  "key": "ypr_live_9f2c41a7b0e3…"
}
```
`key` appears in this response and no other.

A name belongs to **one active key**, compared without regard to case (`Client-A` is taken
while `client-a` is live): a second is `409 API_KEY_NAME_TAKEN`, and two creates sent at
once under one name get one key and one `409`. There is no update — `PATCH`/`PUT
/api-keys/{id}` is `405`: change scopes, agents or the end date in the dashboard
(Settings → API keys → **Edit scopes**, whose *When this key stops working* keeps the end
date as it is, removes it, or sets a new one 7, 30, 90 or 365 days out), or issue a
replacement and revoke the old key. Saving Edit scopes with a new end date changes the
key's `expires_at` — read it again rather than trusting the value you issued it with.

**Rotating from code** therefore needs a **new name** for the replacement (the old key
still holds its name until revoked, and there is no rename): issue the replacement under
it, move the job over — both keys work meanwhile, so nothing stops — then
`DELETE /api-keys/{id}` the old one, from a different key (a key cannot revoke itself). The
dashboard's **Rotate** on a key's card does it in one step and keeps the name, scopes,
agents and end date; the old secret keeps working for a grace you pick (up to 7 days, shown
as its `expires_at`) or stops at once, for a secret that leaked.

#### Limit a key to some agents — `agent_ids`

`POST /api-keys` takes `agent_ids`: 1–100 agent ids. Leave it out (or send `null`) for a
key that reaches the whole workspace. An id that is not a live agent here is
`400 API_KEY_AGENT_UNKNOWN`; an empty list is `400 API_KEY_REQUEST_INVALID`.

A limited key reaches only: its agents (`/agents`, no create or duplicate), their calls
(`/calls`, `/calls/export`; `POST /calls` must send one of its agents as `agent_id`, and a
`from` number one of its agents answers or calls from), the leads they called (`/leads`,
read only), their charges (`/billing/consumption`), their deliveries (`/deliveries`) and
the campaigns they answer (`/campaigns`; `from_phone_number_id` must be one of its agents'
numbers). Everything else — tools, numbers, dispositions, the do-not-call list, calling
hours, other keys, billing status — answers `403 API_KEY_AGENT_SCOPED`, and so does calling
from any other number (another client's, or one no agent uses). Naming another agent
answers `403 AGENT_OUTSIDE_KEY_SCOPE`, the same answer whether that agent exists or not.
Enrolling contacts in one of its campaigns (`POST /campaigns/{id}/leads`) is the one lead
write it makes: a new number becomes a workspace lead, a known number enrolls the
workspace's lead for it.

```bash
curl -X POST "https://api.goyappr.com/api-keys" -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Client A","scopes":["agents:read","calls:read"],"agent_ids":["<agent id>"]}'
```

**Testing a scope boundary** — issue a narrow key, then watch the endpoint that needs the
missing scope refuse it:
```bash
NARROW=$(curl -sX POST "https://api.goyappr.com/api-keys" \
  -H "Authorization: Bearer $YAPPR_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"scope probe","scopes":["calls:read"]}' | jq -r .key)
curl -i -X PUT "https://api.goyappr.com/call-windows" -H "Authorization: Bearer $NARROW" \
  -H "Content-Type: application/json" -d '{"windows":[]}'   # 403 INSUFFICIENT_SCOPE
```
Revoke the probe key with `DELETE /api-keys/{id}` when done.

### DELETE /api-keys/:id

Revokes a key immediately — irreversible. Every request made with it from then on is
refused, and it drops off `GET /api-keys` and the dashboard list.

**Scopes:** `api_keys:manage`

**Response:** `200` — `{ "success": true, "id": "uuid" }`

A key cannot revoke itself: `409 API_KEY_SELF_REVOKE`, pointing at the dashboard, where a
person can do it deliberately — it would otherwise leave nothing able to issue or revoke
keys for the workspace. Rotation is therefore: issue the replacement under a new name,
move your integration onto it, then revoke the old one.

**Errors** (all three endpoints): `400 API_KEY_REQUEST_INVALID` (`name` missing/over 100
characters, `scopes` missing/empty/not an array of strings, an empty or oversized
`agent_ids`, an `expires_at` without a time zone or already past, a query parameter on the
list, or a field the endpoint does not read); `400 API_KEY_AGENT_UNKNOWN` (an
`agent_ids` entry that is not a live agent here); `400
API_KEY_SCOPE_UNKNOWN` (a requested scope does not exist — check it against the Scope
Map); `403 INSUFFICIENT_SCOPE` (the two `GET`s: neither `api_keys:read` nor
`api_keys:manage`; `POST` and `DELETE`: no `api_keys:manage`); `403 API_KEY_SCOPE_ESCALATION` /
`403 API_KEY_MANAGE_NOT_DELEGABLE`; `404 NOT_FOUND`; `409 API_KEY_NAME_TAKEN` /
`409 API_KEY_SELF_REVOKE`; `405` on `PATCH`/`PUT`; `503 API_KEY_STORAGE_UNAVAILABLE` (nothing was
created/revoked — retry).

---

## Billing

### GET /billing

Get billing status and balance.

**Scopes:** `billing:read`

**Response:**
```json
{
  "has_payment_method": true,
  "billing_email": "s***@domain.com" | null,
  "balance_cents": 2500,
  "balance": 25,
  "currency": "usd",
  "is_suspended": false,
  "auto_topup_enabled": false,
  "auto_topup_amount_cents": 2000 | null,
  "low_balance_threshold_cents": 500 | null,
  "monthly_budget_cents": 5000 | null,
  "monthly_spend_cents": 1240,
  "monthly_budget_remaining_cents": 3760 | null,
  "monthly_budget_reached": false,
  "monthly_period_start": "ISO8601"
}
```

There is no subscription field: Yappr is prepaid credit. `balance` is `balance_cents` / 100:
the same amount in currency units, with decimals (`98.47`). `is_suspended` is `true` while
calling is stopped for a billing reason — a suspended workspace still answers this read. Auto top-up is the three
`auto_topup_enabled` / `auto_topup_amount_cents` (charged each time) /
`low_balance_threshold_cents` (the balance that triggers it) fields together, none of
them writable here. `auto_topup_enabled` says whether it is on; the amount and threshold
carry values even while it is off (`2000` and `500` if never set), and are `null` only
before the workspace has a credit account.

`billing_email` is masked (`s***@domain`), never the full address, and `null` when
unset. `monthly_spend_cents` is reported **whether or not a limit is set** — it is
month-to-date spend for every workspace, read from the same place `PATCH /billing`
writes. The other four spend fields are documented under `PATCH /billing` below.

This is the account as it stands now. For its history — every top-up, credit, refund
and adjustment beside each day's usage, with an opening and closing balance — read
`GET /billing/transactions`.

---

### GET /billing/transactions

The workspace's billing history as a statement: every change to the credit balance in a
window, newest first, and the balance at each end of it — the dashboard's **Settings →
Billing → Transaction History**, addressable.

**Scopes:** `billing:read`. A key limited to some agents is `403 API_KEY_AGENT_SCOPED`
(the balance is the whole workspace's).

| Param | Default | Notes |
|---|---|---|
| `from` | 30 days before `to` | ISO 8601; a date-only `from` starts that day on the statement's clock |
| `to` | now | ISO 8601, inclusive; a date-only `to` covers that whole day on the statement's clock. `?to=2026-07-31` alone reads July 1 through July 31 |
| `timezone` | the workspace's | IANA name. The clock the usage days and date-only `from`/`to` are read on — by default the workspace's own (the `timezone` set on `PUT /call-windows`, the clock the dashboard shows this money on; UTC for a workspace that never set one), as on `GET /billing/consumption`. `timezone=UTC` gives UTC days |
| `limit` | 100 | at most 500; caps the rows, never the summary |

Anything else, a timestamp that is not real, an offset such as `+03:00` or an unknown
name in `timezone`, a `from` after `to` (on the clock the statement is read on), or a
`from` in the future with `to` left out is `400 TRANSACTIONS_QUERY_INVALID`, naming the
parameter. A late-evening charge lands on the next day in an `Asia/Jerusalem` workspace,
exactly as the dashboard's Transaction History shows it.

```json
{
  "data": [
    { "id": null, "type": "usage", "product": "voice_call", "date": "2026-09-23",
      "created_at": "ISO8601", "description": null, "count": 41, "status": "completed",
      "amount_cents": -412, "affects_balance": true },
    { "id": "uuid", "type": "top_up", "product": null, "date": "2026-09-21",
      "created_at": "ISO8601", "description": "Credits top-up", "count": 1,
      "status": "completed", "amount_cents": 5000, "affects_balance": true }
  ],
  "summary": {
    "opening_balance_cents": 1210, "credits_in_cents": 5000, "credits_out_cents": 3666,
    "closing_balance_cents": 2544, "card_charges_cents": 0
  },
  "balance_cents": 2544,
  "as_of": "ISO8601",
  "has_more": false,
  "range": { "from": "2026-08-31T21:00:00.000Z", "to": "2026-09-30T20:59:59.999Z",
             "timezone": "Asia/Jerusalem" }
}
```

`range` is the window that was read, as instants, and `range.timezone` the clock its days
are on: the `timezone` as you sent it, or the workspace's.
`from=2026-09-01&to=2026-09-30` on an `Asia/Jerusalem` workspace reads from 21:00 UTC on
31 August. `as_of` is when the statement was read.

- **Rows.** `top_up` (paid credits, in), `gift` (credits Yappr added, in), `usage` (one row
  per day per product on the statement's clock — `voice_call` or `eval_run` — with `count`
  charges folded in; out), `refund` (a refunded or disputed top-up; out), `adjustment` (a
  manual correction, either way), `phone_number` (a number's first charge or renewal —
  paid by card, `affects_balance: false`), `starting_balance` (a balance no other row
  records, dated where the history begins; before it the balance is 0), `other` (anything
  newer; trust `affects_balance`). Today's `usage` row reads `status: "in_progress"`: the
  day is still running on that clock and the row keeps growing, but what it shows has
  already moved the balance. Any other row whose `status` is not `completed` has not.
- **Signs are the account holder's:** positive put credits in, negative took them out —
  the opposite of `GET /billing/consumption`, where a charge is positive.
- **`summary` always adds up:** `opening + credits_in - credits_out = closing`.
  `card_charges_cents` sums the phone numbers on their own. The closing balance of a window
  that runs to now is `GET /billing`'s `balance_cents`, and last month's closing balance is
  this month's opening one.
- `has_more: true` means the rows were cut at `limit`; narrow the window to read older ones.

---

### PATCH /billing — set the monthly spending limit

An opt-in safeguard, off by default. It does not replace the billing gate (whether a
call can start at all) — it answers a different question: does this workspace still
*want* to keep spending this month.

**Scopes:** `billing:manage`

**Request body:** `{"monthly_budget_cents": 5000}` — whole cents, `0` for "place nothing
this month", `null` to turn the limit off. Anything else is `400 SPEND_BUDGET_INVALID`
and the previous limit stands.

**Response:** `200` — the same five fields `GET /billing` carries: `monthly_budget_cents`,
`monthly_spend_cents`, `monthly_budget_remaining_cents`, `monthly_budget_reached`,
`monthly_period_start`. One read answers both "can it pay?" and "does it still want to?".

While `monthly_budget_reached` is `true`, `POST /calls` answers `402 SPEND_BUDGET_REACHED`
and queued outbound calls — campaigns included, paused as `paused_budget` — are failed
with the same sentence rather than held, so nothing is re-dialled. A workflow agent's
call, and a call request already accepted and waiting for its call window, are paused the
same way. Three things keep working and are not oversights: calls coming **in**, a
browser rehearsal (`"type": "web"`, which is what the dashboard's Test Call places), and
the calls a shared link places, which mint the same browser session. Tell your own
users this — a coordinator who reads "outbound calls are paused" and then watches a test
call connect will report it as a bug. The limit lifts by itself at 00:00 UTC on the first
of the next month.

**The workspace owner is emailed once per calendar month** — the first time the limit
actually refuses a call. Every refusal after that is silent: one stopped campaign must
not become a hundred messages. The dashboard also carries a banner on every page while
the limit is reached.

Spending is every completed charge since the first of the month: calls, phone numbers,
evaluation runs. Top-ups and refunds are not spending.

**Two different budgets.** `monthly_budget_cents` here is the **workspace's** own
calendar-month limit — every outbound call in the workspace, campaigns included. A
campaign's own `budget_cents` (`POST /campaigns`, see **Campaigns** below) is a
**different** number: that one campaign's lifetime budget, spent down once and never
reset. Either can pause a campaign, and both report `paused_budget` — read both before
raising one, since raising the campaign's budget does nothing if it was the workspace
limit that fired. One window, everywhere: `monthly_period_start` here is the same instant
the dashboard's Spent-this-month tile and pause banner measure; a Call Logs total or a
`GET /billing/consumption` range is a *different* window of the same money and will not
match unless you ask for the same days.

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
Once the agent is moved to the workflow engine those three columns are emptied and the
same endpoint and events live on the workflow as After triggers; the events you receive
and their names do not change, the request body does.

**Payload shape — agent not yet moved to the workflow engine:**
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

**Payload shape — agent moved to the workflow engine:**
```json
{
  "event": "call.analyzed",
  "call": {
    "company_id": "uuid", "agent_id": "uuid", "agent_name": "string", "call_id": "uuid",
    "call_direction": "inbound", "caller_number": "+972…", "callee_number": "+972…",
    "call_metadata": {}, "call_variables": {}, "channel": "phone",
    "status": "completed", "started_at": "ISO8601", "ended_at": "ISO8601",
    "duration_seconds": 0, "ended_by": "string", "close_reason": "string",
    "recording_url": "string", "transcript": [],
    "analysis": { "summary": "string", "extracted_data": {}, "disposition_label": "Booked" },
    "disposition": { "id": "uuid", "label": "Booked" },
    "lead": {}, "billing": {}
  }
}
```

`event` is the only member that stays where it is, and it keeps the **same spelling**
you read today (`call.analyzed`, `call.started`, …) even where the workflow's own
trigger has a different name. Everything else moves under `call`:

| Before the move | After the move |
|---|---|
| `event` | `event` — unchanged |
| `timestamp` | *gone* — it was the sender's clock; the call's own times are `call.started_at` / `call.ended_at` |
| `agent_id`, `company_id`, `call_id` | `call.agent_id`, `call.company_id`, `call.call_id` |
| `data.direction` | `call.call_direction` |
| `data.from_number`, `data.to_number` | `call.caller_number`, `call.callee_number` |
| `data.status`, `data.duration_seconds`, `data.transcript` | `call.status`, `call.duration_seconds`, `call.transcript` |
| `data.disposition` (label string) | `call.disposition` — an **object**; the label is `call.disposition.label` |
| `data.summary` | `call.analysis.summary` |
| `data.extracted_data` | `call.analysis.extracted_data` |
| per-event extras inside `data` (a failure's `error`, a blocked call's reason) | *gone* |

There is no `data` wrapper after the move. Read `event` first and branch on the presence
of `call` if you have to serve both shapes during the migration; you are told before your
agent is moved, so the simpler path is to switch your parser at the same time.

The `call` object is the same **call package** a workflow tool receives, so it carries
more than the old payload did: the lead, the call's `metadata` and per-call variables,
billing, the recording URL and the full disposition object are all in it. The warning
below about fetching `GET /calls/:id` applies to the old shape only.

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

### Trigger events (the workflow's own names)

The table above is indexed by the legacy event names, because that's what an agent still
on the old webhook still sends. A workflow's After trigger is authored against its own
`event` enum instead — most values are the same word, a few are not, and a few exist only
on the workflow side with no legacy equivalent at all:

| Trigger event | Legacy equivalent | Notes |
|---|---|---|
| `call.answered` | `call.answered`, `call.started` | The pickup itself — the **only** event published while the call is still going. |
| `call.ended` | `call.ended` | |
| `call.failed` | `call.failed` | |
| `call.no_answer` | `call.no_answer` | |
| `any_end` | *(none — subscribe to the three above individually on the legacy side)* | Authoring shortcut, not a wire event: `call.ended` + `call.failed` + `call.no_answer`. |
| `request.failed` | `call.dnc_blocked` | The request died before anything was dialled; no call exists. |
| `transcript.ready` | `transcript.ready` | |
| `analysis.ready` | `call.analyzed` | |
| `lead.ready` | `lead.created`, `lead.updated` | |
| `recording.ready` | *(new)* | The legacy webhook never pushed this; you polled `recording_url`. |
| `billing.ready` | *(new)* | |
| `transfer.accepted`, `transfer.answered`, `transfer.failed` | *(new)* | A transfer's own lifecycle. |
| `ai_session.ended` | *(new)* | The AI portion of the call ending, distinct from the call itself ending. |

**WARNING — a webhook carries the call, not its context.** This applies to the legacy
shape only — before an agent moves to the workflow engine. The `call.analyzed` payload
includes `direction`, `status`, `from_number`, `to_number`, `duration_seconds`, the
disposition **label**, `summary`, `transcript` and `extracted_data` — everything the
conversation produced. It does NOT include:
- The lead object (name, phone, tags, history)
- `metadata` from call creation
- Cost data
- The full disposition object — only the label string, and it is absent if classification failed

To get the complete call record including resolved lead + disposition object: `GET /calls/:id`.

**After the move to the workflow engine, this warning no longer applies.** The `call`
object in a workflow's own trigger is the same **call package** a workflow tool
receives — see the table above — and already carries the lead, `metadata`, per-call
variables, billing, the recording URL and the full disposition object. There is nothing
to fetch back for those.

**Pattern for getting lead name or CRM IDs in post-call automation:**
- On the legacy shape, fetch `GET /calls/:id` after receiving `call.analyzed` to pull the full record including the `metadata` dict you passed at call creation.
- On a workflow agent's After trigger, the package already has it — no follow-up fetch.
- If you need the data in real-time (during the call, not after), use a **tool webhook** instead: it fires synchronously when the agent invokes a tool, and `call_metadata` + `call_variables` are both in the payload (see [Tool Webhook Payload](#tool-webhook-payload)).

---

## Deliveries

Did it fire, why not, send it again: `GET /deliveries` lists them, `GET /deliveries/{id}`
shows what was sent and what came back, `POST /deliveries/{id}/retry` sends a failed one
again. In the dashboard: **Tools → Deliveries** — searchable Tool / Agent, Result,
Triggered by, Period or a date range; the address holds the view
(`?tool=&agent=&status=&source=&days=|from=&to=&page=&delivery=`), and a row's drawer shows
what was sent and what came back, with **Send again** on a failure.

### GET /deliveries

Every webhook delivery in your workspace — settled, or still `pending` — newest first,
across calls: how you confirm a configured webhook actually fired, for one call, for one
tool across a week, or for everything that failed last night. A row here is the `delivery`
row of a call's `timeline` (`GET /calls/:id`), field for field, plus `call_id` and
`source`. Before this endpoint, checking delivery health across many calls meant paging
`GET /calls` and opening each one.

**Scopes:** `calls:read` **or** `tools:read` — either one.

**Query params:** `tool_id`, `agent_id`, `call_id`, `status` (`delivered` \| `failed` \|
`pending`), `source` (`live` \| `test`), `from`, `to` (a real ISO 8601 timestamp on the
row's `at` — a date alone covers that whole day, UTC; a month-end its month does not have,
like `2026-09-31`, is refused), `limit` (1–200, default 50), `cursor`. Anything else, a
value outside its set, a filter sent twice or with no value, and a `from` after `to` are
`400 DELIVERIES_QUERY_INVALID`, same as `GET /calls` — send `cursor` only once you have
one.

**Response:**
```json
{
  "data": [
    {
      "kind": "delivery",
      "id": "uuid",
      "tool_id": "uuid | null",
      "agent_id": "uuid | null",
      "call_id": "uuid | null",
      "at": "ISO8601",
      "delivered_at": "ISO8601",
      "event": "call.answered",
      "source": "live" | "test",
      "status": "delivered" | "failed" | "pending",
      "response_status": 200,
      "attempt_count": 1,
      "error_message": "string | null",
      "tool_name": "string | null"
    }
  ],
  "pagination": { "limit": 50, "has_more": true, "next_cursor": "opaque string | null" }
}
```

`status` is the field to branch on: `delivered` — your endpoint accepted it; `failed` — it
did not, after every attempt; `pending` — it has not settled yet. `at` is when it settled,
and `delivered_at` is the same moment under the name the per-call timeline uses — never a
separate "was it delivered" flag. `response_status` is what your endpoint answered
with, `null` when nothing answered at all. `attempt_count` includes the attempt that
settled it. `error_message` is one sentence for a person, only on a failure — wording may
change, so branch on `status`/`response_status`, never on the text. `tool_name` is the
tool whose step sent the delivery, or, for an agent not yet on the workflow engine, the
agent itself. `id`, `tool_id` and `agent_id` (the agent whose call it was, for a tool's
step) are on this row and on the call timeline's `delivery` row alike, so one can be
found from the other.

**Real traffic and rehearsals — `source`.** `live` is real traffic: a call, or a lead
event (`lead.created`, `lead.updated`), which can belong to no call and then has
`call_id: null`. `test` is a `POST /tools/{id}/test` that actually reached your endpoint — a
legacy webhook tool's test at once, a workflow tool's **real** test (`"policy":
"allowlist"`, `"allowed_binding_ids": ["test_tool"]`, an `http` tool) once its request
settles — **or** anything sent on a call the dashboard opened to rehearse an agent (its
Test tab or a test dial). A mock test sends nothing and writes no row, and neither does a connected-app
action, which is not a webhook. A tool test happens on no call, so its `call_id` is `null`
and its `event` carries a `test:` prefix; a dashboard test call's rows carry that call's id
and ordinary events — branch on `source`, not on the event's spelling.
Left out, `?source=` returns both; `?source=live` keeps rehearsals out of a delivery-health
report, and `?source=test&tool_id=…` answers "did my test reach the endpoint?".

`agent_id` filters both eras of an agent: deliveries it sent itself, and deliveries its
tools sent on its calls (a workflow-engine agent sends through its tools). The list is
summaries; open one with `GET /deliveries/{id}` for what was sent, where to, and what
came back. No header value or credential ever leaves the platform.

**Paging is by cursor, not offset** — this log grows while you read it, so an offset
would silently skip or repeat rows. Follow `pagination.next_cursor` until `has_more` is
`false`, passing it back unchanged. **Cursors are signed**, as on `GET /calls`: one built
by hand, edited, or taken from `GET /calls` is `400 DELIVERY_CURSOR_INVALID` rather than a
silent first page, so a corrupted loop stops instead of re-reading the newest rows for
ever. A cursor saved before signing began is refused the same way, once — read the first
page again and follow the new `next_cursor`. A job that stores a cursor between runs must
handle that `400` by starting over from the first page.

```bash
# Everything that failed yesterday
curl "https://api.goyappr.com/deliveries?status=failed&from=2026-09-21T00:00:00Z&to=2026-09-22T00:00:00Z" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

### GET /deliveries/:id

One delivery — the list row, field for field (`404 DELIVERY_NOT_FOUND` for an id that is
not a delivery here, never the list) — plus:

| Field | What it is |
|---|---|
| `request.destination` | Where it was sent, when it was sent: `scheme://host/path`, without the query string, fragment or credentials; `scheme://host` only when `destination_path_withheld`. `null` when no destination was recorded for it |
| `request.tool_revision_id` | The workflow tool revision that sent it; `null` for a legacy webhook tool, an agent's own webhook, and older deliveries |
| `request.recorded` | `true` when the delivery recorded what it was sent with; when `false` (an older delivery), `method` and `header_names` are the sender's **current** ones |
| `request.method`, `request.header_names` | The method and header names it was sent with. Header values are never returned. |
| `request.body` | The body as it was sent. A retry re-sends exactly this. For a `GET` tool these fields went as query parameters. |
| `retry_target` | Where `POST /deliveries/{id}/retry` would send it **now**: `destination` (same form), `tool_revision_id`, and `changed` — `true` when that is not where this delivery went. On an older delivery (`request.recorded: false`, so no `request.destination`) `changed` is always `false` and tells you nothing. `null` when the sender is no longer a webhook with an address |
| `response.status` | What your endpoint answered; `null` when nothing answered. |
| `response.body` | What your endpoint answered, as text, at most 2,000 characters. |
| `retry_of` / `retried_by` | The delivery this one re-sent / the retry that re-sent this one. |
| `retryable` | `true` when `POST /deliveries/{id}/retry` would send it. |
| `bodies_withheld` | `true` when the key lacks `calls:read`: both bodies are then `null`. |
| `destination_path_withheld` | `true` when the key holds neither `tools:read` nor `tools:update`: both destinations are then `scheme://host` (for a Make or Zapier hook the path is the credential). `retry_target.changed` still compares the whole addresses |

**Scopes:** `calls:read` or `tools:read`; the two bodies need `calls:read`, and the
destinations' paths need `tools:read` or `tools:update`.

Every configured header value is replaced by `[REDACTED]` wherever it appears in either
body (as a value, inside a string, or as a key), and an address is never returned with its
query string, fragment or credentials. `response.body` is `null` when nothing answered, for
deliveries made before 2026-09-23, and for a workflow step's refusal (the status is kept,
not the text) — a retry always keeps the answer.

### POST /deliveries/:id/retry

Re-sends the stored body once, to where the tool points **now** — read
`retry_target.destination` and `retry_target.changed` on `GET /deliveries/:id` first. `201`
with the new delivery, in the `GET /deliveries/:id` shape (`retry_of` = the original). Only a `failed` delivery, and only once per delivery
— two racing retries send once. Nothing is sent on a refusal: `409 DELIVERY_NOT_RETRYABLE`
(it was accepted, or has not settled), `409 DELIVERY_ALREADY_RETRIED` (with `retried_by`),
`409 DELIVERY_SENDER_UNAVAILABLE`. If the retry fails too, retry the retry.

**Scopes:** `tools:update` — the scope that already sends a tool's request on demand.

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

## Not in the API

Four dashboard surfaces have no endpoint — carry your own equivalent rather than looking
for one:

- **No `GET /agent-templates`.** Nothing lists the starters or returns their text before
  an agent exists. Create from one by name — `template: "inbound"`, `"qualify"` or
  `"reminder"` on `POST /agents` — and read what it wrote with
  `GET /agents/:id/workflow`; or carry your own text as `workflow.global_instructions`, or
  duplicate a tuned agent with `POST /agents/:id/duplicate`.
- **No `GET /changelog`.** The dashboard's What's new page is TS modules shipped with
  the dashboard build. Link customers to the dashboard page itself.
- **No `POST /chat`.** The dashboard's builder chat is not a public endpoint — build
  the agent yourself with `POST /agents` and the workflow endpoints, which is what the
  chat calls underneath.
- **No `GET /stats`.** The dashboard KPI page reads its own aggregate RPC directly, not
  a documented endpoint. Count from `GET /calls` over a date range and
  `GET /billing/consumption`.

Those four are the gaps we know about — not a claim that everything else a workspace
member can reach in the dashboard has a public endpoint behind it.

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
| GET /tools/:id/workflow-revisions | `tools:read` |
| POST /tools/:id/workflow-revisions | `tools:update` |
| GET /tools/:id/bindings | `tools:read` |
| POST /tools/attach | `tools:update` |
| POST /tools/detach | `tools:update` |
| POST /tools/:id/test | `tools:update` |
| GET /deliveries, GET /deliveries/:id | `calls:read` or `tools:read` (bodies need `calls:read`) |
| POST /deliveries/:id/retry | `tools:update` |
| GET /api-keys, GET /api-keys/:id | `api_keys:read` or `api_keys:manage` |
| POST /api-keys | `api_keys:manage` |
| DELETE /api-keys/:id | `api_keys:manage` |
| POST /agents/:id/extraction/dry-run | `agents:read` |
| GET /phone-numbers (list) | `phone_numbers:search` |
| POST /phone-numbers/search | `phone_numbers:search` |
| POST /phone-numbers/purchase | `phone_numbers:purchase` |
| POST /phone-numbers/configure | `phone_numbers:configure` |
| GET /carrier-accounts (list/get/status) | `carrier_accounts:read` |
| POST /carrier-accounts, PATCH/DELETE /carrier-accounts/:id | `carrier_accounts:manage` |
| POST /carrier-accounts/:id/connection \| /test \| /reactivate | `carrier_accounts:manage` |
| POST /carrier-accounts/:id/numbers, DELETE /carrier-accounts/:id/numbers/:phone_number_id | `carrier_accounts:manage` |
| GET /billing | `billing:read` |
| PATCH /billing (spending limit) | `billing:manage` |
| POST /billing/setup | `billing:manage` |
| POST /billing/topup | `billing:manage` |
| GET /billing/consumption | `billing:read` |
| GET /billing/transactions | `billing:read` (refused to a key limited to some agents) |
| GET /call-windows | none — any authenticated key for the workspace |
| PUT /call-windows | `call_windows:manage` |
| GET /calls (list/get) | `calls:read` |
| GET /calls/export | `calls:read` |
| POST /calls | `calls:create` |
| GET /calls/:id/recording (the signed `recording_url`) | none — the link's signature |
| POST /calls/:id/recording/revoke | `calls:create` |
| GET /call-requests/:id | `calls:read` |
| POST /call-requests/:id/cancel | `calls:create` |
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
| GET /agents/:id/flow/versions | `flows:read` |
| POST /agents/:id/flow/test | `flows:test` |
| POST /agents/:id/flow/restore | `agents:update` |
| GET /tool-apps, /tool-apps/connection-options | `tools:read` |
| GET /tool-connections, /tool-connection-auth-attempts/:id | `tool-connections:read` |
| POST /tool-connections, /tool-connections/:id/reconnect | `tool-connections:manage` |
| DELETE /tool-connections/:id | `tool-connections:manage` |
| POST /tool-connections/:id/remove | `tool-connections:manage` |
| POST /tool-connections/attempts/:id/cancel | `tool-connections:manage` |
| GET /do-not-call (list/get) | `do_not_call:read` |
| POST /do-not-call | `do_not_call:manage` |
| PATCH /do-not-call/:id | `do_not_call:manage` |
| DELETE /do-not-call/:id | `do_not_call:manage` |
| GET /campaigns (list/get/stats), GET /campaigns/defaults | `campaigns:read` |
| GET /campaigns/:id/leads | `campaigns:read` |
| POST /campaigns (create) | `campaigns:manage` |
| PATCH /campaigns/:id | `campaigns:manage` |
| DELETE /campaigns/:id (archive) | `campaigns:manage` |
| POST /campaigns/:id/leads (enroll) | `campaigns:manage` |
| DELETE /campaigns/:id/leads/:leadId | `campaigns:manage` |
| POST /campaigns/:id/launch \| /pause \| /resume \| /stop | `campaigns:manage` |

---

# Flow agents — retired

**There is no flow agent left to describe.** `type: "flow"` and `flow_config` were the
pre-release procedural shape — a graph of nodes instead of one `system_prompt`.
`POST /agents` has answered `410 AGENT_LEGACY_CREATION_GONE` for any body without
`workflow` since before this release, and at release every agent that existed is
converted onto the workflow engine — there is no agent left running on `flow_config`.
Build the graph in **The conversation graph** above, inside *Canonical workflow
authoring*; [`flow-composition-guide.md`](flow-composition-guide.md) still carries
transition-design and humanization patterns at a conceptual level, but its JSON examples
predate the migration — follow the shapes above, not the ones there.

`agents.type` and `agents.flow_config` remain on a converted agent's row as frozen
history. `GET`/`PATCH /agents/:id` null them out in the response (see *Canonical workflow
authoring*), and `PATCH` refuses a body naming `flow_config` (or `system_prompt`, `type`)
outright for any workflow-engine agent — `422 WORKFLOW_SETTINGS_REQUEST_INVALID`, "Use
ordinary agent settings only. Edit instructions, graph and bindings through the workflow
document." It does not silently drop the field.

Three endpoints below `flow_config` were not withdrawn and still answer requests, with a
real gap worth knowing before you reach for them:

- `GET /agents/:id/flow/versions` is read-only — harmless against a converted agent, just
  meaningless, since nothing it shows is what the agent will actually do on a call.
- `POST /agents/:id/flow/test` **refuses** a workflow agent outright:
  `409 WORKFLOW_FLOW_TEST_UNSUPPORTED`, "This agent runs a workflow, which the flow
  simulator cannot walk." Since every agent `POST /agents` can create today is a workflow
  agent, that means every agent you can create — a legacy flow agent frozen before this
  release is untouched, still answering its old `400` when it has no `flow_config`.
  Rehearse a workflow agent for real instead, both without a phone number:
  `POST /calls {"type":"web","agent_id":"…"}` returns a single-use `token`, a `protocol`
  (`offer`, or `call_request` when the agent runs steps before it answers) and a
  `connection` block with every URL the browser needs; or `POST /shared-links` returns a
  page a person can open and talk to the agent from. Both produce a real, transcribed
  call that shows up in `GET /calls`.
- `POST /agents/:id/flow/restore` **writes**. It checks the row's `type` column, not
  execution state, and a converted agent's `type` is untouched by the conversion — so a
  restore against a converted agent that was `type:"flow"` before release still succeeds,
  still returns `200`, and still updates `flow_config`. The call engine never reads that
  column for a converted agent. A `200` here is not proof of anything happening to what
  the agent will say next; do not use this endpoint to inspect or change a converted
  agent's conversation.

The `integration_call` node these endpoints could once show is itself retired — it
carried a Google Calendar or Gmail credential on the node and dispatched against a
Yappr-managed OAuth client. Connect the account instead under **Connected accounts**
below and call it from a `sequence` step or an `action` node bound to that connection.

---

# Connected accounts

Calendars, mailboxes and every other third-party account an agent acts on are
connected here. This is the only integration path.

**The `/integrations` endpoints are retired.** `GET /integrations` and
`DELETE /integrations/{id}` answer `410` with `code: endpoint_retired` and will
stop answering entirely in the next release. They listed and revoked the native
Google Calendar / Gmail credentials, which no longer exist. Do not retry a
`410` — it means permanently gone. Use the table below instead.

Connection control is available on deployments that enable the workspace connection service. An unavailable service is not permission to fall back to anything: there is nothing to fall back to.

| Endpoint | Scope | Contract |
| --- | --- | --- |
| `GET /tool-apps/connection-options` | `tools:read` | Authentication-configured app slugs/names; discovery is `GET /tool-apps`, neither executes an action. |
| `GET /tool-connections` | `tool-connections:read` | Safe company metadata, 50 records/page, opaque `next_cursor`. Pass the cursor unchanged; it binds company and environment. `?state=` (one record state, or `removed`) and `?toolkit=` (one slug from `GET /tool-apps/connection-options`) narrow it; anything else in the query string is `400 CONNECTION_INVALID`. |
| `GET /tool-connections/{id}` | `tool-connections:read` | Exact account status, with server checks coalesced for 15 seconds. |
| `POST /tool-connections` | `tool-connections:manage` | Body `{ "toolkit": "gmail", "label": "Team mailbox", "locale": "en" }`; returns `201 {connection, attempt, handoff_url}`. Hosted OAuth only; no provider ownership fields or manual secrets accepted here. |
| `GET /tool-connection-auth-attempts/{id}` | `tool-connections:read` | Exact local attempt plus safe connection state. Never infer success from list differences or browser messages. |
| `POST /tool-connections/{id}/reconnect` | `tool-connections:manage` | Body `{ "mode": "replace", "locale": "en" }`; returns a fresh one-time human handoff. Same-account reauthorization is not yet exposed. |
| `DELETE /tool-connections/{id}` | `tool-connections:manage` | Returns `202 {connection}` after immediate local denial; removal at the connected-app service and manual revocation in the provider account may still be outstanding. Repeated requests do not advance the authorization epoch again. |
| `POST /tool-connections/{id}/remove` | `tool-connections:manage` | Takes a record that is **already disconnected** off the list. `200 {connection}`; repeating it is safe. Not a delete: nothing is disconnected, revoked or erased. |
| `POST /tool-connections/attempts/{id}/cancel` | `tool-connections:manage` | Cancels an authorization attempt nobody is going to open. Use the `attempt.id` a create or reconnect returned, not the connection id. |

`POST /tool-connections` requires both `toolkit` and `label` — omitting `label` is
`400 CONNECTION_INVALID`. `toolkit` must be a `slug` from
`GET /tool-apps/connection-options`, which is a *different, shorter* list than
`GET /tool-apps`; anything else is `409 CONNECTION_APP_UNAVAILABLE`. If connection
options returns `{"data": []}`, nothing can be connected in that workspace yet and every
create will `409`.

`POST /tool-connections/{id}/reconnect` takes `{"mode": "replace"}` and nothing else but
an optional `locale` — a reconnect without it (or with any other `mode`) is
`400 CONNECTION_REPLACEMENT_REQUIRED`, and nothing starts. Replace is the only mode: the
person who opens the handoff signs in again, and the account they choose becomes the
connection's account.

Give the handoff privately to the intended authorized human, who signs in to Yappr, reviews the target workspace and label, and explicitly claims the browser-bound attempt before receiving the app authorization link. The API key initiator and consenting human are separate identities — a key-started handoff may be claimed by any member of the workspace it is scoped to; a dashboard-started one stays with whoever started it. Treat the URL fragment as a temporary capability: present it only for this consent step; do not log it, persist it in workflow/call data, or include it in voice-agent prompts. Account records belong to the company, not the human who completed consent. Several labeled accounts per app are supported.

Poll the exact attempt with increasing intervals, bounded by `expires_at`. Stop on `completed`, `failed`, `expired`, `cancelled`, or `reconciliation_required`. An ambiguous/lost callback exchange must never be redeemed again automatically. `completed` refers to authorization processing; `connection.state` must independently be `ready` before actions can use it. Other states are `disconnected`, `connecting`, `verifying`, `reconnect_required`, and `degraded`.

**Cancelling a stuck attempt.** `POST /tool-connections/attempts/{id}/cancel` frees the
slot an unfinished attempt holds against the ten-open-attempts-per-key limit below —
already cancelled, completed, failed and expired attempts answer `200` with the attempt
unchanged, so a retry (or cancelling one you are no longer sure about) is safe. It does
**not** delete the connection record (that stays, waiting for an authorization that will
never come — `DELETE /tool-connections/{id}` is what removes it) and it does not touch
any provider grant: if consent never completed there was never one to revoke; if it did,
disconnect and then revoke Yappr's access in the provider's own account settings.

**Rate limit.** `429 CONNECTION_RATE_LIMIT` means ten authorizations started *by this API
key* are still open — attempts that expired, were cancelled or completed do not count,
and neither do attempts started by anyone else in the workspace. Finish one, cancel one,
or wait: an attempt nobody finishes is closed server-side ten minutes after it started.
The workspace also has a ceiling of 120 starts in ten minutes, counted whatever became of
them, so connecting and cancelling in a loop is refused the same way.

Safe read DTOs expose only local Yappr IDs, toolkit, label, verified provider identity when available, readiness, decimal-string `binding_revision`/`authorization_epoch`, disconnect progress and timestamps. Replacement increments immutable identity and authorization generations for future bindings; pinned work never silently changes accounts. Disconnect blocks new actions immediately, while already sent actions may finish. Where a `DELETE` settles, in `disconnect_progress`: `record_deleted` — nothing was ever bound to this connection, so there is nothing left to take back (the usual outcome for an authorization that was never finished); `manual_revocation_required` — an account was bound, so a human should remove Yappr's access in the provider account's own app-access settings too; `unknown` — that step needs reconciliation, read the connection again; `pending` — local denial is committed and the upstream step has not reported yet, so read the connection again for its settled value. `none` means the connection has not been disconnected. Connection deletion is not proof that a grant was revoked.

**Who started it.** Every record carries `created_by` (whoever started the first
authorization) and `started_by` (whoever started the most recent one — a replacement is
usually somebody else), each `{"type": "user" | "api_key", "id": "..."}` and never `null`.
The id stays after that member leaves or that key is revoked; there is no name or address.
Compare `created_by.id` with your own API key's id to tell your integration's records from
a person's before cleaning anything up.

**Taking a disconnected record off the list.** `POST /tool-connections/{id}/remove` hides a
record that is already disconnected; `?state=removed` reads it back, with `removed_at` set.
The record, its id, label and audit trail are kept.

| | `DELETE /tool-connections/{id}` | `POST /tool-connections/{id}/remove` |
| --- | --- | --- |
| does | blocks new tool actions, advances the authorization epoch | stops listing the record |
| needs first | any state | already disconnected |
| repeating it | safe | safe, answers the same record |

Not disconnected yet → `409 CONNECTION_STILL_CONNECTED`; send the `DELETE` first. Somebody
is connecting it again right now → `409 CONNECTION_ATTEMPT_OPEN`; wait for that
authorization to finish or expire (ten minutes), or cancel it with
`POST /tool-connections/attempts/{id}/cancel`. A removed record never comes back by itself:
`POST /tool-connections/{id}/reconnect` still works on it, and once that authorization
completes the record is working again, `removed_at` is `null` and it is back on the list.
A filtered page is a page of **matches**, not of records — it can hold fewer than 50 rows,
or none, and still carry a `next_cursor`, so never stop on a short page. Cleaning up a
workspace you share: list `?state=disconnected&toolkit=<slug>`, keep only the rows whose
`created_by.id` is your own key's id, then `remove` each.

**Turning a connected account into a tool.** A connected account is not yet something an
agent can call. With the same `x-company-id` on every call:

1. `GET /tool-apps/{slug}/actions?version=<dated version>` — the app's actions,
   cursor-paged with `next_cursor`. There is no `limit` parameter; sending one is `422`.
2. `GET /tool-apps/{slug}/actions/{action}?version=<same version>` — take its `id`; an
   action whose `eligible` is `false` cannot be saved.
3. `GET /tool-connections?state=ready&toolkit=<slug>` — take a row's `id`. An account in any
   other state makes the next call answer `422` with the tool written at
   `workflow.status: "failed"`.
4. `POST /tools` with
   `workflow: {"kind":"app","metadata_id":"<id from 2>","connection_id":"<id from 3>","fixed_inputs":{},"timeout_ms":10000}`.

The tool then behaves like any other: it shows up in `GET /tools/workflow-catalog` once its
revision is promoted and binds to a step exactly like an HTTP tool. A booking journey needs
`GOOGLECALENDAR_FIND_FREE_SLOTS` before `GOOGLECALENDAR_CREATE_EVENT`.

`400` covers malformed/foreign cursors and invalid fields, `401` an invalid API key, `403 INSUFFICIENT_SCOPE` a key without the scope, `404` missing/cross-company resources, `409` active/closed/ambiguous authorization state, `429 CONNECTION_RATE_LIMIT` bounded start limits, and `503` unavailable control/storage. These routes pass the connection service's body and status through unchanged, so besides the `CONNECTION_*` codes a code this reference does not list can arrive, at one of the statuses above. Treat it by its status, never by its name: on `503`, retry the same request, and if it persists start a fresh connection rather than looping. The forwarded names are not a contract. Error messages never echo submitted credentials.

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

**Webhooks**: each run emits `agent_eval.run.completed` (or `.failed`) when it terminates. Configure them on the agent's `webhook_events`.

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

**Scopes:** `agent_eval:update`. Send only fields you want to change. `agent_id` is NOT patchable — to repoint a case at a different agent, create a new case (the original keeps its run history).

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

Standard CRUD — same scope conventions as cases. DELETE soft-deletes the suite and sets the `suite_id` of contained cases to null (the cases survive as ad-hoc).

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
- 402 — insufficient credit balance (top up before retrying)

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
  "runs": [EvalRun, ...]            // each individual run, with case + agent + persona expanded
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

**Response:**
- **`200`** — run finished within the 60s window. Body is the full `EvalRun` with `case` (and nested `agent` + `persona`) expanded; `score`, `pass_fail`, `evaluation`, and the cost columns are final.
- **`202`** — still running after 60s. Body is the latest non-terminal `EvalRun`. Keep polling `GET /agent-eval/runs/:id` until both `status` is terminal AND `queue_status === "done"`.

**Errors:** 400 (validation), 402 (insufficient balance), 404 (case not found).

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

Just the assertion roll-up. **Scopes:** `agent_eval:read`.

Returns 422 when the run is still in flight. Useful in CI:

```bash
curl "https://api.goyappr.com/agent-eval/runs/$RUN_ID/evaluation" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '.pass_fail'
```

---

## POST /agent-eval/runs/:id/cancel

Best-effort cancel. **Scopes:** `agent_eval:run`.

If the worker has not yet claimed the run, it transitions to `cancelled` immediately and is never executed. If the worker already started it, the cancellation is signalled and the voice runtime terminates at the next turn boundary with `termination_reason='cancelled'`. Cancelled runs are still billed for any turns produced before the cancel signal landed.

Returns the updated run object. 409 if the run is already in a terminal state.

---

# Billing Consumption

## GET /billing/consumption

Aggregated debits from your credit account, bucketed by date and product.

**Scopes:** `billing:read`

**Query params:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `from` | ISO8601 | now - 30d | Start of window |
| `to` | ISO8601 | now | End of window, inclusive. A date-only `from` or `to` is a whole day **on the report's clock** (`timezone`, below). `from` after `to` is a `400`. |
| `group_by` | "day" \| "month" \| "total" \| "agent" \| "product" \| "disposition" \| "agent,disposition" \| "source" \| "agent,source" | "day" | Bucket granularity. Anything else is `400` |
| `product` | enum | (all) | `voice_call` \| `eval_run` \| `phone_number` \| `topup` \| `refund` \| `adjustment`. Anything else (`voice`, `minutes`) is `400 CONSUMPTION_QUERY_INVALID`. |
| `include_topups` | bool | false | Include positive credit purchases. `true` or `false` only |
| `timezone` | IANA name | the workspace's | The clock days, months and date-only windows are read on — by default the workspace's own (the `timezone` set on `PUT /call-windows`, the one the dashboard shows this money on). `timezone=UTC` gives UTC days. An offset such as `+03:00` or an unknown name is `400 CONSUMPTION_QUERY_INVALID` |
| `sort` | `amount` \| `period` \| `name` | `amount` | Largest first; `period` oldest first (only on `day` / `month`); `name` agent, then outcome, then origin, then product, A to Z (not on `day` / `month`) |

Each parameter at most once; any other is `400 CONSUMPTION_QUERY_INVALID`, by name. A
charge at 22:30 UTC on 30 September is **1 October** in an `Asia/Jerusalem` workspace,
and `group_by=day` puts it there.

**Response:**
```jsonc
{
  "data": [
    { "period": "2026-05-06", "product": "voice_call", "total_amount_cents": 1240, "count": 18 },
    { "period": "2026-05-07", "product": "voice_call", "total_amount_cents": 980,  "count": 14 },
    { "period": "2026-05-06", "product": "eval_run",   "total_amount_cents": 12,   "count": 47 }
  ],
  "range": { "from": "…", "to": "…", "group_by": "day", "product": null, "timezone": "Asia/Jerusalem", "sort": "amount" }
}
```

`range.timezone` names the clock that was used. Days and months with no charge are not rows.

When `group_by=agent` (and on `agent,disposition` and `agent,source`), each row carries `agent_id` and `agent_name` (archived agents included; two agents can share a name, so key on the id). Agent grouping currently only populates for `voice_call`; `agent_id: null` on `voice_call` is a call whose agent has since been deleted — the charge is kept, never dropped.

**`group_by=agent,disposition`** — cost *and* outcomes in one read: one row per agent per
outcome, each with its own `count` and `total_amount_cents`.
```jsonc
{
  "data": [
    { "agent_id": "a1…", "disposition_id": "d1…", "disposition": "Booked", "product": "voice_call", "total_amount_cents": 1420, "count": 63 },
    { "agent_id": "a1…", "disposition_id": null,   "disposition": null,    "product": "voice_call", "total_amount_cents": 0,    "count": 2 }
  ]
}
```
`group_by=disposition` gives the same breakdown for the workspace as a whole. A charge
with no call behind it (number rent, top-up, eval run) and an undispositioned call both
read `disposition: null` — the row's own `agent_id` tells the two apart. This plus
`GET /calls/export` replaces joining `GET /calls` and `GET /dispositions` by hand.

**`group_by=source`** (or `agent,source`) — each row carries `source`: where the call
behind those charges was started — `test`, `shared_link`, `api`, `phone_inbound`,
`phone_outbound`. These are the values `GET /calls` reports and `GET /calls?source=`
filters by, so the two reads agree call for call. Use it to separate a workspace's own
rehearsals from the calls it was paid for without exporting the call log once per source.
An origin is a fact about the call a charge belongs to, so a charge with no call behind it
— a number's monthly rent, a top-up, an eval run — comes back as `source: null`, and a call
recorded before origins were written down comes back as `source: "unknown"`.

**The window.** `to` is inclusive here too (a date-only `to` is that whole day on the
report's clock — the workspace's unless `timezone` says otherwise — where `GET /calls` and
the export read a date-only `to` as a UTC day), and charges are bucketed by when they were debited — a call is debited when it ends. `GET /calls/export` windows on when calls
*started*, with an inclusive `to`. The same `from`/`to` on both reads therefore differs by
the calls that straddle a boundary and by charges with no call behind them, which only this
endpoint has — add `product=voice_call` to compare call spend alone.

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
| GET /billing/transactions | `billing:read` |
