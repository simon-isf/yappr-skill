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

**Discovery:** `GET https://api.goyappr.com` (no auth) returns all available endpoints, each
written `METHOD /path` with `{id}` (e.g. `GET /agents/{id}`); retired routes are listed
apart under `retired` (`status` 410, `code` `ENDPOINT_RETIRED`, `endpoints`).

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
| 402 | Billing — insufficient balance (`BILLING_ERROR`), no usable card when buying a number (`PAYMENT_METHOD_REQUIRED`, see **POST /phone-numbers/purchase**), or the workspace's own monthly spending limit is reached (`SPEND_BUDGET_REACHED`, see **PATCH /billing**) | Guide to billing setup, or raise the limit |
| 403 | `INSUFFICIENT_SCOPE` — the key is fine but lacks a scope; the message names it. Also a resource in another workspace or a protected one | Widen the key in Settings → API keys, or use one that holds the scope. Never rotate on a `403`. |
| 404 | `AGENT_NOT_FOUND` — the agent in the path, or the `agent_id` a request names, is not in this workspace | The public API answers a missing agent this way, filters included: `agent_id` on `GET /calls`, `GET /calls/export` and `GET /shared-links` (an archived agent still filters). Another `404` code under `/agents/{id}` means the agent is there and something else is missing. Phone-number and carrier-number bodies answer it too, naming the field (`inbound_agent_id`, `outbound_agent_id`, `inbound_split.agent_id` or `outbound_split.agent_id`); a campaign body answers `400 CAMPAIGN_REQUEST_INVALID` with `agent_not_found` in `issues[]` instead; call requests keep `404 WORKFLOW_AGENT_UNAVAILABLE` for an agent that is archived or switched off (below). |
| 429 | Rate limit or concurrent call limit | Wait and retry |
| 500 | Server error | Retry once; if persistent, report |

### Errors

Every error carries `error` (human) and `code` (machine). Branch on `code`. **Errors name
every problem at once:** a `400`/`422` carries `issues[]` (`{code, path, message}`, one per
problem); `error` repeats the first and counts the rest. The whole body is
`{error, code, issues?}` — there is no top-level `message`. Query issues are
`query_param_unknown`, `_repeated`, `_blank` or `_invalid`, every bad parameter at once; body
issues are `field_unknown`, `field_required` or `field_invalid` with `path` a JSON pointer
(`/colour`). `DELETE /lead-tags/{id}` names its parameters in `issues[]` too. A refusal that
names nothing more specific carries its status's code: `BAD_REQUEST` 400, `BILLING_ERROR` 402,
`FORBIDDEN` 403, `NOT_FOUND` 404, `METHOD_NOT_ALLOWED` 405, `CONFLICT` 409, `GONE` 410,
`PAYLOAD_TOO_LARGE` 413, `UNSUPPORTED_MEDIA_TYPE` 415, `UNPROCESSABLE_REQUEST` 422,
`RATE_LIMIT` 429, `INTERNAL_ERROR` 500, `UPSTREAM_ERROR` 502, `SERVICE_UNAVAILABLE` 503,
`UPSTREAM_TIMEOUT` 504; anything else `REQUEST_FAILED`. `401` never falls back to a generic code — it is always one of
`MISSING_KEY`, `INVALID_KEY` or `EXPIRED_KEY`.

**A missing scope is `403 INSUFFICIENT_SCOPE`, on every route.** The key is valid for this
workspace but not allowed that one operation, and the message names the scope it lacks. It
used to be `401` on most routes and `403` on a few; it is `403` everywhere now, and `401`
means only that the key itself was not accepted. Never read a `403` as a dead key: rotating
it changes nothing — widen its scopes in the dashboard, or issue a key that holds the scope.

- `404 RESOURCE_ID_INVALID` — the resource's id in the path is not a UUID, on every
  resource and every verb (`/agents/not-an-id`, `/calls/not-an-id/end`,
  `/carrier-accounts/not-an-id`, `/billing/transactions/not-an-id`). On a route with two
  ids, `/tools/{id}/tests/{test_id}` and `/carrier-accounts/{id}/numbers/{phone_number_id}`,
  the first is checked this way and a second that is not a UUID is that route's own not
  found (`404 WORKFLOW_TOOL_TEST_NOT_FOUND`, `404 NUMBER_NOT_FOUND`). A malformed id is a
  refusal, never the collection behind it; it stays `404`, not `400`.
- `404 ROUTE_NOT_FOUND` — the API serves no such path: a sub-path no route has
  (`DELETE /agents/{id}/nonsense`), a resource that does not exist, or an id left empty
  (`GET /calls/` could be `GET /calls/{id}` with no id, so it is refused rather than read
  as the list). A trailing slash that cannot be an id left empty is ignored: `POST /calls/`
  is `POST /calls`. A doubled slash is merged into one before the request reaches the API,
  so `GET //calls` is served as `GET /calls` and `GET /agents//{id}` as `GET /agents/{id}`;
  do not count on one being turned away. It is answered before any scope or agent check,
  and nothing is read or changed. The message names what the API serves at the deepest
  part of the path it recognised.
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
- `404 AGENT_NOT_FOUND` vs `422 INVALID_SPLIT` — an agent field on a phone number that
  names no agent in this workspace (it does not exist, belongs to another workspace, or is
  archived) is `404 AGENT_NOT_FOUND`, and the message names the field
  (`inbound_agent_id`, `outbound_agent_id`, `inbound_split.agent_id` or
  `outbound_split.agent_id`). It used to be `422 INVALID_AGENT`. On a campaign the same
  problem (`agent_id` or `split.agent_id`) is `agent_not_found` inside one
  `400 CAMPAIGN_REQUEST_INVALID` (below). `422 INVALID_SPLIT` is only about the shape of an A/B split: a
  `percent` outside 1–99, the second agent the same as the first, or a split that is
  neither an object nor `null`.
- `422 WORKFLOW_VALIDATION_FAILED` with `binding_phase_unsupported` — a tool bound into a
  phase its contract excludes (a transfer in a Before or After step). Publish refuses; the
  issue carries `node_id` and `label`. A transfer on an agent that also answers on `web` is
  a *warning* (`binding_channel_unsupported`, also carrying `node_id`/`label` where a step
  uses it) and still publishes — web callers reaching that step simply cannot use it.
- `400 CALLS_QUERY_INVALID` — `GET /calls` (and `GET /calls/export`) with an unrecognised
  `status`, `direction` or `source` (`scheduled` is not a status), any unknown query
  parameter, a known filter sent with no value, an `agent_id`, `lead_id` or
  `carrier_account_id` that is not a uuid, a `search` under 2 or over 100 characters (or
  a name more than 300 agents carry — and leads, for a key with `leads:read`), a
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

#### More codes, by area

Codes the sections below do not spell out. Branch on `code`; the message says what to fix.

- **Per-resource request refusals (400).** `LEAD_TAGS_QUERY_INVALID` / `LEAD_TAG_REQUEST_INVALID`,
  `DISPOSITIONS_QUERY_INVALID` / `DISPOSITION_REQUEST_INVALID`, `SHARED_LINKS_QUERY_INVALID` /
  `SHARED_LINK_REQUEST_INVALID`, `CALL_WINDOWS_QUERY_INVALID` / `CALL_WINDOWS_REQUEST_INVALID`,
  `AGENT_EVAL_QUERY_INVALID` / `AGENT_EVAL_REQUEST_INVALID`: a query parameter the route does
  not read (deletes included), a body field it does not read, a parameter sent twice or with
  no value, or a `limit` / `offset` that is not a whole number.
- **Calls.** `400 INVALID_AB_VARIANT` — `ab_variant` on `GET /calls` or the export is `a` or
  `b`. An `agent_id` filter naming an agent that is not in this workspace is
  `404 AGENT_NOT_FOUND` (it used to be `CALL_AGENT_UNKNOWN`); leaving the filter out is fine. On `POST /calls`: `422 OUTSIDE_CALL_WINDOW` (no future outbound
  window is configured — set one, then call), `422 WORKFLOW_DEADLINE_INVALID` (the next window
  is further out than scheduling allows — widen it), and `503 BILLING_UNAVAILABLE` — the
  balance could not be settled *yet* (an auto top-up or a payment still resolving); retry in
  a few seconds. It is deliberately not a `402`: never read it as "out of money".
- **A call's execution history** (`GET /calls/{id}`, `GET /call-requests/{id}`):
  `422 EXECUTION_CURSOR_INVALID` (a cursor this read did not issue, or issued for other
  filters, or an `execution_*` value out of range — follow `execution.history.next_url`),
  `410 EXECUTION_RETENTION_EXPIRED` (that history is no longer kept — read the call without
  the cursor), `503 EXECUTION_READ_UNAVAILABLE` (temporary — retry).
- **Call requests.** `POST /call-requests`: `400 INVALID_AGENT_ID`; `409 WORKFLOW_NOT_ENABLED`
  — the agent runs no workflow, so mint a web session with `POST /calls {"type":"web"}`
  instead. Start (`POST /call-requests/{id}/start` and the browser's
  `/web-call/call-requests/{id}/start`): `402 WORKFLOW_BILLING_UNAVAILABLE` (out of credit),
  `403 WORKFLOW_START_DENIED` (the capability does not belong to that request — the same
  answer for a wrong capability, a missing request and a phone request),
  `409 WORKFLOW_REQUEST_CANCELLED`, `502 WEB_START_REFUSED` (the voice side refused the
  offer; the request is finished — create a new one), `503 WEB_START_UNAVAILABLE` (it never
  answered; the request is finished). The browser's `POST /web-call/call-requests`:
  `409 SESSION_TOKEN_EXPIRES_TOO_SOON` / `SHARE_LINK_EXPIRES_TOO_SOON` — less than the
  five-minute preparation window is left on the token; mint a new session.
- **Leads.** `409 DUPLICATE_PHONE` — a lead with this number already exists; read it and
  `PATCH` it.
- **Your own Telnyx numbers.** `422 CARRIER_NUMBER_NOT_CALLABLE` — switching on a number that
  is not verified, or whose account is paused: run the account's test, or turn it back on.
- **Agents and workflows.** `413 WORKFLOW_TOO_LARGE` (split or simplify the document),
  `502 WORKFLOW_COMPILED_INVALID` / `503 WORKFLOW_COMPILER_UNAVAILABLE` (retry with the same
  `expected_version`; a publish `503` may have committed with its answer lost, and the replay
  returns that revision rather than publishing another), `422 WORKFLOW_CONNECTION_UNAVAILABLE` (a connected account changed or
  needs reconnecting before you can publish), `422 WORKFLOW_SETTINGS_UNSUPPORTED` (this voice
  manages its own turn-taking: drop the temperature and speech-detection settings, or pick a
  voice from the other family), `400`/`422 WORKFLOW_SETTINGS_VOICE_INVALID` (pick an available
  voice), `503 WORKFLOW_STORAGE_UNAVAILABLE` (retry with the same `Idempotency-Key`),
  `403 WORKFLOW_ACTOR_DENIED` (this key can no longer change settings in this workspace).
- **Tools.** `POST /tools/attach` / `detach`: `409 WORKFLOW_TOOL_OWNER_REQUIRED` (the agent or
  the tool is a workflow one — every agent created or converted is — so bind the tool in the
  workflow document instead), `409 WORKFLOW_AGENT_BUSY` (the agent is being
  changed right now — reload and retry), `409 WORKFLOW_BINDINGS_REQUIRED` (the agent picks its
  tools inside its workflow — edit the workflow). `400 WORKFLOW_TOOL_IDEMPOTENCY_REQUIRED` — a
  create needs an `Idempotency-Key` of 16–128 letters, digits, `_` or `-`.
  `422 WORKFLOW_TOOL_NOT_BUILT` — the create or change was saved but could not be built (a
  change keeps the previous revision in use); `issues[0]` names the field to fix.
  `422 WORKFLOW_TOOL_CURSOR_INVALID` — drop the cursor and list from the start.
  `404 WORKFLOW_TOOL_ARCHIVED` — a test (or its cancel) on an archived tool: restore it with
  `POST /tools/{id}/restore` first.
  `503 WORKFLOW_TOOL_STORAGE_UNAVAILABLE` — retry the same request with the same
  `Idempotency-Key`. `WORKFLOW_TOOL_PROMOTION_REQUIRED` — while a rotated tool's new revision
  is still being checked, a call on an agent that follows the current revision is refused
  rather than placed on the old one.
- **Tool tests.** `429 WORKFLOW_TOOL_TEST_BUSY` (too many tests running — wait for one),
  `409 WORKFLOW_TOOL_TEST_CONFLICT` (this `Idempotency-Key` belongs to a test with other
  details — send the original body or a new key), `403 WORKFLOW_TOOL_TEST_DENIED` (the key is
  not authorized for the workspace that owns the test), `503 WORKFLOW_TOOL_TEST_UNAVAILABLE`
  (retry later).
- **App catalog** (`GET /tool-apps`, `GET /tools/workflow-catalog`):
  `400 WORKFLOW_CATALOG_QUERY_INVALID` (only `limit` 1–50, `cursor` and up to ten
  `revision_ids`, once each), `422 WORKFLOW_CATALOG_REQUEST_INVALID` (only `version`, `cursor`
  and, on the app and action lists, `search`), `422 WORKFLOW_CATALOG_CURSOR_INVALID` (page from
  the start), `422 WORKFLOW_DATED_VERSION_REQUIRED_INVALID` (one action needs a `version` in
  `YYYYMMDD_NN` form), `413 WORKFLOW_CATALOG_TOO_LARGE` / `WORKFLOW_CATALOG_ITEM_TOO_LARGE` (ask
  for less), `422 WORKFLOW_CATALOG_RESPONSE_INVALID` / `WORKFLOW_METADATA_PAGE_INVALID` /
  `WORKFLOW_METADATA_IDENTITY_MISMATCH` (retry the same request unchanged),
  `422 WORKFLOW_METADATA_VERSIONS_UNAVAILABLE` (that app published no usable versions — pick
  another), `503 WORKFLOW_CATALOG_UNAVAILABLE` / `WORKFLOW_TOOL_CONTROL_UNAVAILABLE` (the
  catalog is unreachable just now — retry).
- **Deliveries.** `503 WEBHOOK_DELIVERY_UNAVAILABLE` — a delivery or its retry could not be
  read or recorded; nothing was sent — try again in a moment.
- **Connected accounts.** `400 CONNECTION_CURSOR_INVALID` (follow `next_cursor` from the first
  page), `413 CONNECTION_BODY_TOO_LARGE` (over 64 KiB — send only the fields the route reads), `409 CONNECTION_ATTEMPT_CLOSED` (the sign-in expired
  or was used — start a new connection), and `CONNECTION_CONFIG_UNAVAILABLE`,
  `CONNECTION_STORAGE_UNAVAILABLE`, `CONNECTION_UNAVAILABLE` (temporary — retry). An attempt
  that did not finish names why in its `error_code`: `AUTH_EXPIRED` (its ten minutes ran out),
  `AUTH_ACCOUNT_MISMATCH` (a different account signed in — reconnect with the right one),
  `AUTH_CONFIG_CHANGED` (the app's settings changed meanwhile — connect again),
  `MEMBERSHIP_REMOVED` / `AUTHORITY_REMOVED` (the person signing in left, or lost the right to
  connect accounts), `AUTH_LINK_UNKNOWN` / `AUTH_REDEMPTION_UNKNOWN` (the sign-in did not
  complete — start a fresh connection rather than reusing the handoff).
- **Transfers.** A transfer that never started is a `transfer_failed` call event whose
  `data.error_code` is `NO_DESTINATION` (no phone number or SIP address configured),
  `INVALID_DESTINATION` (not a valid phone number or SIP address), `NO_TELEPHONY_LEG`,
  `NO_API_KEY`, `ALREADY_TRANSFERRING`, `CALL_ENDED`, `CARRIER_REJECTED`,
  `CARRIER_UNREACHABLE`, `UNAVAILABLE_ON_SIP_TRUNK` (a phone number on a trunk call) or
  `REFER_ONLY_ON_SIP_TRUNK` (a SIP address on a call that did not arrive over a trunk); the
  caller stays with the agent. `NOT_CONNECTED` comes later: the handoff was accepted but
  nobody answered (busy, rejected or rang out), so a call can carry `transfer_started` and
  then `transfer_failed`; on an extension call (a dial-back) that failure ends the call. A hand-off to a SIP address (**A transfer to a SIP address**,
  under Tools) can also fail once the request has gone out, with `error_code`
  `REFER_FAILED` or `REFER_NO_RESULT`, and then the call ends: the carrier has dropped the
  caller, and the agent cannot take them back. `REFER_FAILED`: the phone system reported a
  failure; the call ends a fraction of a second later, with
  `disconnect_reason` "Transfer refused by the phone system". `REFER_NO_RESULT`: nothing
  came back in time: the phone system refused or ignored the request, or the new call was
  not answered within about nine seconds. The call ends, about nine seconds after the
  request when Yappr got no result, with `disconnect_reason` "Transfer failed".

### The API refuses what it does not read

A query parameter an endpoint does not read is a `400` that names it and lists what the
endpoint does read — never silently ignored. `issues[]` names each parameter: `path` is
the parameter's name and `code` is `query_param_unknown`, `query_param_repeated`,
`query_param_blank`, or `query_param_invalid` where the value is what is wrong
(`limit=ten`). A few reads do not refuse one, so never rely
on them to: `GET /campaigns/{id}/leads` (which also takes a `limit` or `offset` that is not
a number), `GET /sip-endpoints/{id}`, every read under `/carrier-accounts`, and the signed
`recording_url`, which audio players open with parameters of their own.

**A write's query string is not where its settings go.** Every write — a create, a change,
a delete or an action — refuses a query parameter it does not read, and one sent twice or
with no value, before anything is read or changed: `DELETE /agents/{id}?bogus=1` is
`400 AGENTS_QUERY_INVALID` and the agent is untouched, and `POST /tools?dry_run=true` is
refused rather than creating the tool. Three writes read one: `POST /campaigns/{id}/launch`
and `POST /campaigns/{id}/resume` take `dry_run` — no other write has a dry run — and
`DELETE /lead-tags/{id}` takes `force` (anything else there is
`400 LEAD_TAG_DELETE_INVALID`). The code is the route family's:
`AGENTS_QUERY_INVALID`, `TOOLS_QUERY_INVALID`, `CALLS_QUERY_INVALID` (on `/call-requests`
too), `LEADS_QUERY_INVALID`, `CAMPAIGNS_QUERY_INVALID`, `DO_NOT_CALL_REQUEST_INVALID`,
`PHONE_NUMBERS_QUERY_INVALID`, `SIP_ENDPOINT_QUERY_INVALID`,
`CARRIER_ACCOUNTS_QUERY_INVALID`, `BILLING_QUERY_INVALID`, `DELIVERIES_QUERY_INVALID`,
`API_KEY_REQUEST_INVALID`, `REPORT_ISSUE_QUERY_INVALID`, and the lead-tag, disposition,
shared-link, calling-hours and eval families' own codes (`POST /tools/attach` and `/detach`
answer `TOOL_ATTACHMENT_REQUEST_INVALID`). Three answer it their own way: connected
accounts with `400 CONNECTION_INVALID`, the workflow's save, check, publish and rebind with
`400 WORKFLOW_REQUEST_INVALID`, and starting a tool test with
`422 WORKFLOW_TOOL_TEST_INVALID`. Send a write's settings in its body.

A body field an endpoint does not read is refused by name too, on most creates and edits:
agents, workflow tools, campaigns, API keys, SIP endpoints, recording revokes,
`PATCH /phone-numbers/{id}` (`400 BAD_REQUEST` naming each field it does not update), and every write on
`/leads`, `/do-not-call`, `/lead-tags`, `/dispositions`, `/shared-links`, `/call-windows`
and `/agent-eval`. That refusal is a `400` with the family's code (the phone number's is the
plain `BAD_REQUEST`), except on
these writes, which answer `422`: `POST /tools`, `PATCH /tools/{id}` and
`POST /tools/{id}/restore` (`422 WORKFLOW_TOOL_REQUEST_INVALID`), starting a tool test
(`422 WORKFLOW_TOOL_TEST_INVALID`), `POST /agents/{id}/duplicate`
(`422 WORKFLOW_DUPLICATE_REQUEST_INVALID`), and a phone call through `POST /calls` to an
agent that runs a workflow (`422 WORKFLOW_REQUEST_INVALID`). A `400` and a `422` ask the
same of you: change the request before retrying. Some writes may drop a body field they do not read instead, so never rely on
them to refuse one: `POST /phone-numbers/search`, `/purchase` and `/configure`,
`/carrier-accounts`, `/billing`, `/call-requests`, enrolling contacts
(`POST /campaigns/{id}/leads`) and a campaign's `launch`, `pause`, `resume` and `stop`,
`/agents/{id}/flow/…`, `POST /deliveries/{id}/retry`, cancelling a tool test, removing a
connected account or cancelling its sign-in, `POST /report-issue`, a tool created or
changed with `type`, and a phone call through `POST /calls` to an agent that does not run
a workflow (a browser session, `"type": "web"`, refuses one on any agent). Send only the
fields a route's section lists.

Codes: `AGENTS_QUERY_INVALID`, `TOOLS_QUERY_INVALID`, `CONSUMPTION_QUERY_INVALID`, `CAMPAIGNS_QUERY_INVALID`,
`CALLS_QUERY_INVALID`, `LEADS_QUERY_INVALID`, `DELIVERIES_QUERY_INVALID`,
`DO_NOT_CALL_REQUEST_INVALID`, `API_KEY_REQUEST_INVALID`, `LEAD_REQUEST_INVALID`,
`WEB_CALL_REQUEST_INVALID`, `CAMPAIGN_REQUEST_INVALID`. The same `400` refuses a parameter
sent twice or empty, a date that does not exist, and `from` after `to`.

- Every `400` from `/do-not-call` is `DO_NOT_CALL_REQUEST_INVALID`, and every refused
  campaign create or edit body is `CAMPAIGN_REQUEST_INVALID` (a disposition label in
  `stop_disposition_ids` included: send ids from `GET /dispositions`). The message names
  the field.
- A refusal names every problem at once: an unknown field no longer hides the value errors
  beside it — `400 WORKFLOW_SETTINGS_REQUEST_INVALID` on `PATCH /agents/{id}` names the stray
  field and each value the settings cannot hold (`settings_value_invalid`) in one
  `issues[]`, and a campaign create or edit reads its values past an unknown field. A
  campaign create or edit answers one `400 CAMPAIGN_REQUEST_INVALID` holding every value
  issue together with its references: each platform outcome in the stop set at its place
  (`platform_stop_outcome`, `/stop_disposition_ids/<n>`), a bad `from_phone_number_id`
  (`invalid_from_number`) and an `agent_id` or `split.agent_id` that names no agent here
  (`agent_not_found`) — never a separate `400 INVALID_FROM_NUMBER` or `404`.
- `POST /campaigns/{id}/archive` is `405 METHOD_NOT_ALLOWED` with no `Allow` header, because
  no method is served there: a campaign is archived with `DELETE /campaigns/{id}`. Only a
  campaign id gets that answer — `POST /campaigns/defaults/archive`, or a segment that is not
  an id, is `404 ROUTE_NOT_FOUND`. Every other `405` carries `Allow`, listing the methods the
  path takes.
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
  names the revision to send (`workflow.head_revision_id` from `GET /tools/{id}`). A save
  refused for its shape names `reference_is_tool_id` in the same answer. Every issue about
  a step carries its `node_id`, and every `422 WORKFLOW_VALIDATION_FAILED` carries
  `warnings[]` beside `issues[]`.
- Check and publish refuse a **required** input whose only source is `kind: "stored"` with
  no `fallback` (`422 WORKFLOW_VALIDATION_FAILED`, `stored_context_has_no_writer`, `node_id`
  = the step); a save still keeps the draft. Nothing writes saved context: declare the value
  in `request_schema`, send it in `variables` on `POST /calls` and read it with a
  `request` source.
- `DELETE /agents/{id}` on an archived agent is `404 AGENT_NOT_FOUND`, as `GET` and `PATCH`
  are.
- A rebind to a tool that is not in the workspace is `404 WORKFLOW_NOT_FOUND` with one
  issue per binding, code `tool_not_found`, path `/bindings/<binding id>`: send the tool's
  own id from `GET /tools`.

### Agent object

A workflow agent answers `type: "workflow"` and has **no** `system_prompt`, `flow_config`,
`webhook_url`, `webhook_events`, `webhook_headers` or `tools` — the fields are absent, not
null. Its instructions, graph and tool bindings are its workflow document:
`GET /agents/{id}/workflow`, whose `bindings` are the tools it can call. That is every
agent created today and almost every agent from before the workflow engine: those were
converted onto it (`execution_version: "workflow_v1"`), their prompt or graph moved into the
workflow document and their `webhook_url` / `webhook_events` / `webhook_headers` cleared and
turned into follow-ups (After triggers). The few agents not converted yet keep
`type: "prompt"` / `"flow"` (`execution_version: "legacy"`) and their old shape, and still
take calls; branch on `execution_version`, not on `type`.

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
`workflow_v1` row (every agent created today and every converted one — almost all)
carries the fields below; a `legacy` row — one of the few agents not yet converted onto
the workflow engine, still taking calls — carries those plus the legacy fields listed
after the example. Every field of a
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
      "idle_reminder_count": 0,
      "idle_reminder_text": "string | null",
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
      "model": "gemini-3.1-flash-live | gemini-3.8-live | gpt-live | null",
      "resolved_model": "string",
      "live": true,
      "inbound": { "phone_numbers": [], "sip_endpoints": [] },
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ],
  "pagination": { "total": 0, "limit": 20, "offset": 0, "has_more": false }
}
```

A `legacy` row carries the same fields, with `type: "prompt" | "flow"`, plus
`system_prompt`, `flow_config`, `webhook_url`, `webhook_events`,
`configured_webhook_header_names`, `tools` and `idempotency_key`, real values, not
empties. Its webhook header **values are write-only, for every key**: where
`webhook_headers` was, a read carries `configured_webhook_header_names` — the names,
sorted — and never what they are set to, so a secret sent there does not come back to any
key. `PATCH /agents/:id` without `webhook_headers` keeps them, a map replaces them all, and
`null` clears them. The same holds wherever a legacy agent is embedded: a Do Not Call
entry's `agents[]`, an eval case's or run's `agent`, a campaign's `agent` and
`split_agent`, the `PATCH /agents/:id` answer and `POST /agents/:id/flow/restore`. Each
entry of `tools` is `{id, name}` without `tools:read` — which tools, not how they call. `system_prompt` is the prompt driving the call, `flow_config` the graph on a `flow` agent, and `idempotency_key` is
whatever the retired create path wrote (often `null`). Branch on `execution_version`,
never on field count or on `type` alone — `"prompt"` and `"flow"` are a closing set (no
agent is created into them any more, and almost every agent in them has been converted),
not a growing one; the few left still take calls.

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
  "idle_reminder_count": 0,
  "idle_reminder_text": "string | null",
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
  "model": "gemini-3.1-flash-live | gemini-3.8-live | gpt-live | null",
  "resolved_model": "string",
  "live": true,
  "inbound": { "phone_numbers": [], "sip_endpoints": [] },
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

It **omits** `system_prompt`, `flow_config`, `webhook_url`, `webhook_events`,
`webhook_headers`, `tools` and `idempotency_key` — it has none of those things, so the
keys are absent rather than `null` or `[]`. A converted agent reads exactly this way: its
prompt or graph is in the workflow document, and its webhook settings were cleared and
became follow-ups (After triggers). Its instructions, its graph and its tool
bindings are all in its workflow document: `GET /agents/{id}/workflow` returns them, and
the document's `bindings` are the tools the agent can call. A `null`
`published_workflow_revision_id` means draft-only, not call-ready. `idempotency_key` is
echoed once, on the response that created this agent — see **POST /agents** below — and
never on a read.

An agent not yet converted onto the workflow engine keeps `type: "prompt"` or `"flow"` and every
field it has always returned — `system_prompt`, `flow_config`, `webhook_url`,
`webhook_events`, `webhook_headers`, `tools`, and `idempotency_key` (whatever the retired
create path wrote for it, often `null`) — real values, unchanged, except the webhook header
values, which are write-only for every key: `configured_webhook_header_names` (the names,
sorted) stands where `webhook_headers` was, and each `tools` entry is `{id, name}` for a key
without `tools:read`. Without `tools:read` (or `tools:update`) `webhook_url` is
`scheme://host` and `webhook_url_path_withheld` is `true` — the path is often the
endpoint's only credential; to change it, send the whole new URL, never the shortened one. `voice` is the voice
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
description (optional, up to 2,000 characters), language (optional, `he` default: `he`,
`en`, another call language such as `fr` or `ar`, or `multi`; `he-IL`/`iw` are read as `he`
and `en-US`/`en-GB` as `en`; anything else is `400` with an issue at `/language`),
authoring_locale (optional, `he` or `en`), greeting_message (optional; the key then also
needs `agents:update`), model (optional, `gemini-3.1-flash-live` or `gemini-3.8-live`;
omitted means automatic — `gpt-live` is set afterwards with `PATCH`), template (optional,
below) and workflow.global_instructions (up to 100,000 characters) are accepted. Name is
trimmed and limited to 200 characters. IDs, name on the canonical workflow, and execution
ownership are assigned by Yappr; never send execution_version, publication pointers, legacy
type/flow_config/system_prompt, or caller-owned IDs.

`authoring_locale` is `"he"` or `"en"` — the language Yappr writes the new agent's
starting step names, their instructions and the closing route condition in, text that
is read in the editor, never spoken on the call. It defaults to `he` for a Hebrew agent and
`en` for any other language (`multi` included): send the language of whoever is reading,
not the language of the call.

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

The starter is written in `authoring_locale` (which follows `language`, as above) and is ordinary
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
  it. A number from the customer's own Telnyx account does both, but answers only once it
  is configured (`carrier_state.state: "ready"`, see **Carrier Accounts**).
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

There is one kind of agent. A body carrying `system_prompt`, `type` (other than
`"workflow"`, which is just a field to remove), `flow_config` or another field only the
retired agent had (`tools`, `tool_ids`, `prompt`, `webhook_url`, `webhook_events`,
`webhook_headers`) — even beside `workflow` — asks for the retired prompt or flow agent and
returns `410 AGENT_LEGACY_CREATION_GONE` with the shape to send instead. It is `410` and
not `400` because the request is well formed and the kind of agent it asks for no longer
exists: there is no field to fix and no retry that succeeds. Never fall back to it after a
failed workflow create.

Agents that already existed were converted onto the workflow engine (all but a few, which
keep their old shape until they are moved): they keep taking calls, their tools (now
workflow bindings), notifications and phone numbers, and are still read with
`GET /agents/:id`, updated with `PATCH /agents/:id` (ordinary settings only) and archived
with `DELETE /agents/:id`; their prompt or graph is edited through the workflow endpoints
like any other agent's. Conversion emptied the three webhook columns and turned the
notifications into After triggers, and the request body the endpoint receives changed
shape. *Webhook Events* below carries both shapes side by side.

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

**Request body:** `name`, optional `description`, `language`, `authoring_locale`,
`greeting_message` and `model`, and either `workflow.global_instructions` or a `template`
(`inbound`, `qualify`, `reminder`). Nothing else is accepted.

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
one new agent. The body, or no body at all, is optional; `{"name":"...","description":"...","language":"he","model":"...","fork_tools":true}`
are the only fields accepted, all optional (`model` gives the copy another model of the
source voice's family, or `null` for automatic). `name` defaults to `"<source name> (copy)"`,
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

**Request body:** Optional `name`, `description`, `language` (any call language or
`multi`, as on create), `model`, `fork_tools` (boolean). Nothing else is accepted.

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
values excepted: `configured_webhook_header_names` comes back where `webhook_headers` was,
names only.

**A refused field is named.** Sending `webhook_url`, `webhook_events`,
`webhook_headers`, `system_prompt`, `flow_config` or `tools` to a workflow agent (a
converted one included) is `400 WORKFLOW_SETTINGS_REQUEST_INVALID` with an `issues[]`
entry per field (`field_unknown`), each carrying a JSON pointer and a note on where that
field moved (see **Moving an
integration off the old body** above). Nothing is written.

`greeting_message` is PATCH-able on every agent kind, workflow agents included: the
agent's opening line, spoken word for word when `agent_speaks_first` is `true`, in the
agent's `language`. `{{FirstName}}` and other call variables are filled in; an unknown one
is dropped with its gap ("Hi {{FirstName}}, ..." → "Hi, ..."). `null` clears it, and the
agent opens in its own words. On a workflow agent it may also read a Before-call step's
result, `{{before.<step_id>.<field>|<fallback>}}`, said word for word: the value, else the
fallback, else the rest of the line (only references and none had a value: own words). It is
filled after variables and random variations, so the value is never read as a template.
Check/Publish (`POST /agents/:id/workflow/validate` / `.../publish`) refuse a step the document
has no Before step for with the `placeholder_*` codes at path `/settings/greeting_message`;
saving the setting itself does not check it. On a flow agent the start node's own opening overrides it.
Workflow agents end the call themselves after their goodbye (`ended_by: "agent"` on the
call).

**Call language.** `language` on PATCH is `"he"`, `"en"`, another call language (`ar`,
`ru`, `fr`, `es`, `de`, `it`, `pt`, `nl`, `tr`, `pl`, `uk`, `hi`, `ja`, `ko`, `zh`) or
`"multi"`; the locale spellings `he-IL`, `iw`, `en-US` and `en-GB` are accepted too and
stored as `he` / `en` (POST takes the same values). It is the language the agent speaks and
listens for on calls. The
dashboard's **Call language** (New Agent, Agent settings) writes the same field, and a
dashboard save no longer resets a language set through the API.

**Idle reminders ("are you still there?").** `idle_reminder_count` (whole number 0–3,
default `0`) is how many times the agent asks a silent caller whether they are still there
before `silence_timeout_secs` hangs up. When the silence timeout runs out and reminders are
left, the agent says the line and the timer starts again; the caller saying anything resets
the count; after the last one the call ends as before (`Caller inactive`). `0` hangs up at
the first timeout without asking. `idle_reminder_text` (up to 200 characters) is the line,
said word for word; `null` (or blank) is a short default in the call's language — Hebrew
"הלו, אתם עדיין על הקו?", English "Hello, are you still there?", and for any other language
or `multi` the agent asks in its own words. Every agent kind, both models, phone and web.
A workflow agent's change reaches its calls without saving the workflow. A bad value is
`422 WORKFLOW_SETTINGS_REQUEST_INVALID` naming the field (workflow agents) or `400` (legacy).

```json
{ "silence_timeout_secs": 20, "idle_reminder_count": 2, "idle_reminder_text": null }
```

**Scopes:** `agents:update`

**Request body:** Any subset of the ordinary settings `GET /agents/:id/settings` returns
(`name`, `description`, `voice`, `model`, `language`, `greeting_message`, VAD, timeouts,
idle reminders, background sound, lead memory, `extraction_parameters`, `is_active` and the
rest), plus optional `expected_updated_at`. Not `template` or `workflow`: instructions and
graph change through the workflow endpoints.

**Response:** `200` — full updated agent object

---

### POST /agents/:id/test-call — ring your own phone with an agent

Hear an agent the way a caller will. **Scopes:** `calls:create`. Send only the number to ring;
Yappr picks the number that calls. **Request body:** `{"to": "+972501234567", "variables": {"FirstName": "Dana"}}`
— `to` is required (E.164, a number that can be dialled: Israeli numbers only, `+972` and 8 or 9
digits), `variables` is optional (as on `POST /calls`); any other field is `400 TEST_CALL_INVALID`.

The calling number is the workspace's own, in this order: a number the agent calls from (or the
other half of its outbound split), a campaign's from-number, a number the agent answers on, then any
other active number (a Yappr-hosted number before one on the workspace's own Telnyx account at each
step). A workspace with no number is called from a Yappr test line, which places calls only and
never answers one. A key limited to agents sees and uses only numbers its agents answer or call from.
`GET /agents/:id/test-call` (`calls:create`) answers which line it would be without placing a call:
`{"agent_id", "available", "caller_line": "workspace" | "yappr" | null, "from"}`; `available: false`
means there is no number to call from, so test in the browser instead.

It is an ordinary outbound call: billed per minute at the agent's model price, shown in the call
log and `GET /calls` with `source: "test"`, and checked like every outbound call (the Do-Not-Call
list, the outbound call window, the monthly spending limit, the $1.00 credit floor, capacity). Two
answers differ from `POST /calls` because someone is waiting: outside the call window it is
`422 OUTSIDE_CALL_WINDOW` (never scheduled for later), and with every line busy it is
`503 AT_CAPACITY` (never queued). An agent that does not run a workflow answers `201` with the call (`status:
"ringing"`, `call_id`, `from`, `caller_line`); a workflow agent answers `202` with a
`request_id` and `call_id: null` — poll `GET /call-requests/{id}` until `call_id` is set, and send an
`Idempotency-Key` so a retry returns the same request instead of ringing again. Other refusals:
`400 SELF_CALL_NOT_ALLOWED` (`to` is the calling number), `402 BILLING_ERROR` /
`SPEND_BUDGET_REACHED`, `404 AGENT_NOT_FOUND`, `409 AGENT_INACTIVE` / `WORKFLOW_UNPUBLISHED`,
`422 NO_CALLER_NUMBER`, `DESTINATION_ON_DNC`, `DESTINATION_OUTSIDE_PHONE_SYSTEM_COUNTRY` (the calling
number goes out through the customer's phone system in `national` format, which reaches Israeli
numbers only).

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
`reference_date` and `timezone`). What is still to come counts forward: a day and month
with no year → the next time it comes round; "today" / "tomorrow" / "in a week" → counted
from the call day; "next Sunday" / "on Tuesday" → the first such day after the call day.
A year the caller said is kept; a month with no day ("sometime in November", "next month")
→ `null` with precision `month` and that month; "after the holidays", or a past answer that
cannot be read → `null` with precision `unknown`. A month named with no tense word ("June"
alone) still counts forward.

**A date the caller says already happened is counted back.** "it ended in June", "נגמרה
ביוני", "I arrived on the 5th of March", "נכנסתי ב-5 במרץ", "I arrived in March", "עליתי
באוגוסט", "my visa expired on the 20th of August" are the most recent such day or month on
or before the call (a call on 23 Sep 2026: `2026-03-05`, month `2026-03`, `2026-08-20`);
"yesterday", "last Sunday", "last month" are those days and that month. Each date in one
answer keeps its own tense: "I arrived back in March, and my hearing is on the first of
March" is March 2026 and `2027-03-01`. A date that belongs to something still to come stays
ahead, even after a past verb: a target ("moved to the 5th", "rescheduled for the 5th",
"נדחה ל-5 במרץ"), an event's day ("I got a letter for my hearing on the 12th of November",
"קיבלתי זימון לדיון ב-12 בנובמבר" → `2026-11-12`), or something that still holds ("I was
told my visa expires in November").

**The day of an event a letter, message or call told the caller about is that event's.** A
date after the notice ("a letter", "a text", "a referral", "מכתב", "הודעה", "זימון",
"הפניה") and "about", "for", "regarding", "על" or "לגבי" — or the event's own ל (after a
summons, invitation or referral) or ש — belongs to the event when the event is a medical
procedure or service (a surgery, a test, an angiography, a vaccine, chemo, a follow-up,
"הצנתור", "החיסון", "ההקרנה", or one named like a procedure: a colposcopy, an appendectomy,
"קולפוסקופיה"), a hearing, an appointment, an interview or a flight. Anything else a plain
letter, message, email or call is about keeps the day the message came: "I got a letter
about my lease on the 5th of March", "קיבלתי מכתב מביטוח לאומי על הגמלה ב-5 במרץ", an
order, a visa → `2026-03-05`. A summons, invitation, referral, appointment or reminder makes
whatever it calls the caller to an event: "I got a summons for my appeal on the 3rd of
December", "קיבלתי זימון לערעור ב-3 בדצמבר" → `2026-12-03`. The noun that heads the phrase
decides, for an event too — the last before the date in English, the first after "על" in
Hebrew: "a letter about my surgery approval / treatment plan on the 5th of March",
"קיבלתי מכתב על אישור הניתוח ב-5 במרץ" → `2026-03-05` (a thing of the surgery: the letter's
day); "my surgery date", "על מועד הניתוח", "על תור לבדיקה", and a verb after the event ("my
surgery happening on", "taking place on", "my MRI booked on") keep the event's day; any
other word in -ing names a thing ("a letter about my surgery waiting list on the 5th of
March" → `2026-03-05`). "I got a letter about my surgery on the 12th of November",
"קיבלתי הפניה לבדיקה ב-3 בדצמבר" are this November / December (a call on 23 Sep 2026:
`2026-11-12`, `2026-12-03`). What was had, gone through, received, paid or submitted is
past, and so is what was received of the event: "I had surgery on the 12th of November",
"עברתי ניתוח" → `2025-11-12`; "I received the results of my MRI on the 5th of March",
"קיבלתי הודעה על תוצאות הבדיקה ב-5 במרץ" → `2026-03-05`. A `date` parameter whose
description says upcoming / planned / next / appointment ("The date of the upcoming
appointment", "התאריך של הניתוח המתוכנן") is never counted back; write "last" or "הקודם" in
one that is about the past.

**A length of time ago is an approximate month, not a day.** "three months ago" / "לפני
שלושה חודשים" → `null` with `extracted_data_precision: {"precision": "month", "month":
"2026-06", "approximate": true}` on a call on 23 Sep 2026; "two and a half years ago" /
"לפני שנתיים וחצי" → the same with `"month": "2024-03"`. `approximate` is present only on
such months (`GET /calls/:id` and the dry run); "last month" is the month, not marked. Days
and weeks ("a week ago") are a day. A range is its middle: "six to seven weeks ago" →
`2026-08-08`, "בין שש לשבע חודשים" → month `2026-03`, approximate.

**Set the workspace time zone.** Dates are read on the workspace's clock; a workspace left
on UTC reads an Israeli call made after midnight as the day before.

**Extracted numbers.** A number said in words is its number, in either language: "twenty
five" / "עשרים וחמש" → 25, "two thousand" → 2000. An approximate answer is its number
("about 12" → 12), and a half is kept: "about two and a half" / "בערך שנתיים וחצי" → 2.5,
"a year and a half" / "שנה וחצי" → 1.5, "half a year" / "חצי שנה" → 0.5. A range is its
middle: "3-4", "three or four", "between 3 and 4", "שלוש או ארבע" → 3.5, and
`extracted_data_ranges` (the dry run and `GET /calls/:id`) gives the ends: "בין שש לשבע" →
`6.5` with `{"pain_level": {"low": 6, "high": 7}}`. It is absent when no number was a range,
and on calls analysed before it was recorded. An answer that still cannot be read as one
number is `null`.

**The dry run reads a transcript the same way a finished call is read** — the same
instructions, model, settings, coercion and date clock (`reference_time` stands in for the
call's start) — so its answer is what the agent will collect from that conversation. Pass
`reference_time` to test relative dates against a fixed day.

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
API creates, and every converted agent, is a workflow agent, so it answers
`409 WORKFLOW_TOOL_OWNER_REQUIRED`. The
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
call — a required input with that as its only source and no `fallback` is refused by
Check and publish (`422 WORKFLOW_VALIDATION_FAILED`, `stored_context_has_no_writer`); an
optional one, or one with a `fallback`, gets it as a warning.

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

**The dashboard edits a shared tool for one agent the same way.** Editing a webhook or
a transfer from inside an agent's step never changes it for the other agents that use
it: Save creates that agent's own tool (the same settings plus the edit, same name),
waits for it to be `current`, and moves only that step's binding onto it, `inputs`
kept. The other agents keep the shared tool; only this agent using it, the tool is
edited in place. To do it through the API, follow "different endpoint for **one**
agent" above. A header value or a URL's private query is never readable, so a copy you
create must send them in full — `null` (keep the stored value) is refused on a create.

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

**How calls reach the agent: `channels` and numbers.** `document.channels` is an array of
`"phone"` and `"web"`, at least one, both by default. `"phone"` covers incoming calls
**and** the calls the agent places (`POST /calls`, a call request, a campaign): there is no
separate switch for incoming and outgoing. `"web"` covers browser calls (the dashboard's
browser test, a shared link, the Web SDK) and needs no phone number. The dashboard's Start
sheet is this one list (its Phone and Browser switches); the rows on the Start node are only
labels. Leave both on unless the agent must never be reached one way, and never drop one to
make an agent "inbound-only" — the numbers decide the direction. A call on a channel the
published version leaves out is refused when it is prepared: a call request on it ends
`failed` with `error_code: "artifact_unavailable"` (the same code a version published through
a different deployment gets, and an unpublished agent): the dashboard's browser test turns it
into "This agent isn't ready to take browser calls. Publish it, and check that Browser is on
in its Start step." A call transfer needs `"phone"` (`tool_grant_channel`), and a
tool needs at least one listed channel (`unsupported_channel`).

An agent answers a number only once the **number** is bound to it, which is a write on the
number and not on the workflow: `PATCH /phone-numbers/{id}` with `{"inbound_agent_id": "<agent id>"}`
(scope `phone_numbers:configure`), and `outbound_agent_id` for the calls it places from that
number when `POST /calls` names no agent. `null` unbinds. It is immediate and not tied to
Publish, and it takes the number from whichever agent has it, with no warning: read
`GET /phone-numbers` first (each row carries both ids) and tell the user which agent they are
replacing. `GET /agents/{id}` lists the numbers and extensions an agent answers on (`inbound`);
it has no list of outgoing numbers, so filter `GET /phone-numbers` by `outbound_agent_id`.
Publish the agent first: an inactive or unpublished agent takes the number's calls and fails
them. A number on the customer's own carrier takes an outbound agent only, an extension's
business number takes no inbound agent, and a number still `pending_requirements` refuses an
agent change with `400`.

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
result, never by the model. A `succeeded` result edge may also carry a `when` on what
the tool answered (*Routing on what a tool answered*, below). `global_edges[]` are the escape hatches: each carries a
`target` and its own prose `condition`, reachable from every conversation node without a
wired edge — the model gets it as an extra candidate on every turn.

**Authoring a tool step.** An `action` node needs a route into it: publication refuses a
step nothing reaches (`unreachable_node`). Add the node and a `conversation` edge from
the step it follows in the same document write, and remember a `conversation` edge's
`condition` must be at least one character — an empty one is refused by the save itself
(`422 WORKFLOW_DOCUMENT_INVALID`, the document's shape), not left to Check.

**A line while a tool step runs (`hold_line`).** An `action` node may carry `hold_line`:
one fixed sentence the caller hears in the agent's voice while that step's tool runs, e.g.
`{"id":"check-diary","type":"action","label":"Check the diary","binding_id":"diary-lookup","hold_line":"One moment please."}`.
It starts when the tool starts (never on entering the step), and the agent's next words wait
until it has been heard — never more than 4 s past the tool's answer; a tool slower than the
line adds no wait. On GPT Live the line is skipped when the tool answers before the agent has
finished its current sentence. It must finish inside that wait — about 2.5 s of speech: up to
28 characters in English, about 25 in Hebrew or Arabic, about 16 in Korean or Japanese kana,
about 10 Chinese characters, a digit counting as about three. Every save — this API, the
dashboard, the builder chat — refuses a `hold_line` that is not text of 1 to 28 characters
(`422 WORKFLOW_DOCUMENT_INVALID`, `field_invalid` at `/conversation/nodes/<n>/hold_line`, the
step in `node_id`) and writes nothing; `null` or no `hold_line` is no line of your own (see the
default line below).
Check and publish refuse `hold_line_too_long` (shorter text that still takes too long to say),
`hold_line_blank`, `hold_line_not_fixed` (any `{{` or `}}`: no references, no random
variations) and `hold_line_on_transfer` (a transfer step says its transfer tool's
announcement). A document with a hold line compiles as `compiler_version` `1.5.0`; one without
is unchanged. A flow agent's `pre_fire_announcement` became this line, in the agent's language
(`"רגע אחד בבקשה."` / `"One moment please."`, both inside the limit), when the agent was
converted to a workflow; a line is never cut short to fit.

**The default line.** A slow tool with no `hold_line` still gets one: a step with none, and any
tool a conversation step offers (including agent-wide grants), is covered by the call's shipped
phrase, `"One moment please."` / `"רגע אחד בבקשה."`, said as the tool starts. Only for a tool that
really runs (not a words-only turn, End call or a transfer), that usually takes about 2 s or longer
(learned from its recent runs on that server; until it has a few runs a connected app counts as
slow, a URL tool as fast), on an English or Hebrew call (other languages and multilingual agents:
none). It starts only while the tool is still running; the answer never waits for it on GPT Live
and at most 0.5 s on Gemini Live. Gemini Live skips it when the agent is already talking; GPT Live
skips it when the agent just said its own "one moment" / "let me check", and says a second short
line for a tool that usually takes over 6 s. A `hold_line` on an action step replaces it; there
is no field to switch the default off or to change its words for a tool a conversation step
offers. Nothing to write for it: do not add a "say one moment before calling the tool" rule to
the prompt, the call already does.

**Check / publish refusals.** `422 WORKFLOW_VALIDATION_FAILED` returns `issues[]`, each
with `code`, `path` and `message`. An issue that belongs to one conversation step also
carries `node_id` (that step's `conversation.nodes[].id`) and `label` (its label in the
document); both are optional and absent on an issue about the document as a whole. Use
them to point the author at the step instead of at the JSON pointer — e.g.
`unreachable_node` arrives once per unreachable step with `path:
/conversation/nodes/<n>` (the step's position) and the step in `node_id`. `path` is a JSON
pointer into the document by position, the style a refused save uses
(`/bindings/0/inputs/order_id`, `/conversation/nodes/2`, `/after/0/steps/0`); a problem
with an input a step reads is at that input on the binding the step runs, with the step in
`node_id`. Check and publish name every issue at once: every binding and every step is
checked before the answer, so one problem no longer hides the others.

**Save refuses a binding that can never work.** `PUT /agents/{id}/workflow` answers
`422 WORKFLOW_DOCUMENT_INVALID` for a binding input the bound tool does not have — its input
schema lists its properties and closes them with `"additionalProperties": false`
(`unknown_input`) — and for a `stored` source reading a path the document's `stored_schema`
does not declare (`unknown_source_path`), each at `/bindings/<n>/inputs/<field>`, beside any
other issue in the document. A draft may still be unfinished: an input with no source yet,
a `request` source, and a tool whose input schema is left open or is written with `$ref` or
a combinator are saved and left to Check.

**Strict Mode governs `conversation`-kind edges only.** Off (the default), the model may
also end the call, restate, or diverge from a wired edge when the caller's words call for
it — the graph is instructional weight, not a cage. On, only a wired edge or global edge
advances the conversation. Either way, `result` edges are always enforced: a tool's
outcome is never advisory. The one thing on a `result` edge that needs Strict on is a
`when` (*Routing on what a tool answered*, below). With Strict off, a tool or sequence the agent calls again with
the same values before the caller speaks again answers with its first run's result instead
of running twice (a tool call that failed without doing anything may run once more). With
Strict on, the same holds for a step's action called again from the step that leads to it,
and a route back into an action step that already ran for that request is answered instead
of entered. In both modes, a call the current step cannot take (or one missing a value)
runs nothing and is answered with what to do instead, and one that cannot run in this call
at all (an account no longer connected, a mapped value the call does not have) has the agent
tell the caller; after two in a row the agent is made to say its next line, even if it
said a filler between them. A Strict action step whose inputs are all optional
runs with none if the agent keeps calling another action instead (three times in a row);
ending the call, a transfer or a route never runs it. Nothing to configure.

Before/After dependencies and private sequence children are explicit. A sequence
contains tool-only children and an explicit public output schema/mapping; never
expose private children independently or recursively nest sequences. Request schema
and stored-context schema are distinct; schemas are not runtime values. Missing
references may use an explicit typed fallback, including false, zero or null.

**Every lifecycle step needs a `label`.** A before-call step, a follow-up step and a
sequence child are all `{"id", "label", "binding_id"}` — a step written as
`{"id":"post","binding_id":"notify-endpoint"}` is refused by the save:
`422 WORKFLOW_DOCUMENT_INVALID`, `field_required` at `/after/0/steps/0/label`, nothing
written. Worked After trigger:

```json
{"after":[
  {"id":"summary","event":"call.ended","steps":[
    {"id":"email","label":"Email the clinic the call summary",
     "binding_id":"email-summary","requires":["transcript"],"on_failure":"continue"}]},
  {"id":"missed","event":"call.no_answer","steps":[
    {"id":"text","label":"Text the clinic about the missed call",
     "binding_id":"missed-call-sms","on_failure":"continue"}]}]}
```

`requires` is the wait for call data, and only an event that can have the data may use it
(see "What each event can have" under Trigger events). A wait on `any_end` is the trap:
it includes the unanswered call, so the step is blocked there and nothing is sent.

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

**Read from the call by description** — an input `{"kind":"extract","instruction":"…",
"type"?, "on_missing"?: "skip"|"fail", "fallback"?: {"value":…}}`, After steps only (see
SKILL.md, “Reading a value from the call by description”). Check/publish codes, `path` =
the input: `extract_unavailable_phase` (not a follow-up step), `extract_type_unsupported`
(a list, an object, an undeclared type, or a `type` the input cannot take),
`extract_missing_policy` (`fallback` and `on_missing` together), `extract_instruction_empty`,
`extract_too_many` (over 64 descriptions), `extract_unavailable` (the workspace's voice
engine does not read it yet; nothing was published). At run time a value the call did not
say is never guessed: `fallback`, else `on_missing` (skip is the default for a required
input; a skipped step is not a failure; an optional input with neither is left out). The call
timeline shows a `skipped` row (`reason` `extraction_missing` / `dependency_skipped`) and
`reads` on the step's `tool` row (`outcome` `read` / `fallback` / `missing`, no value).

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

**Routing on what a tool answered (`when` on a `result` edge, `compiler_version` 1.10.0).**
A tool step (an `action` node, or a `sequence` node) leaves by `result` edges. When the next
step depends on what the tool *answered* (an availability check that says `book`,
`offer_other_time` or `transfer`), put a `when` on the `succeeded` edge for each answer and
leave one `succeeded` edge without a `when` for every other answer: the **otherwise** edge.
The platform decides from the answer with no model in between, so the same answer always
takes the same edge. Do not describe this choice in the next step's instructions and hope the
model reads it.

```json
{"id":"check-book","source":"check","target":"confirm-time","kind":"result","outcome":"succeeded",
 "when":{"kind":"compare","op":"eq","source":{"kind":"step","scope":"during","step_id":"check","path":"/route"},"value":{"kind":"literal","value":"book"}}},
{"id":"check-otherwise","source":"check","target":"offer-other-time","kind":"result","outcome":"succeeded"},
{"id":"check-failed","source":"check","target":"apologise","kind":"result","outcome":"failed"}
```

- `when` is the sequence condition above (`compare` / `all_of` / `any_of` / `not`, same
  operators, 4 levels, 32 parts, nothing coerced: `"0"` is not `0`, so use `in` with both
  when an endpoint may send either).
- It reads only fixed `literal` values and the answer of the step the edge leaves,
  `{"kind":"step","scope":"during","step_id":"<the edge's source>","path":"/<field>"}` (for a
  `sequence` node, its output). A request, stored, call or other step's answer is
  `result_guard_source`.
- Edges with a `when` are tried in the order they appear in `conversation.edges`; the first
  that holds is taken, then the otherwise edge. A step with a `when` needs exactly one
  `succeeded` edge without one (`result_guard_needs_otherwise` if none; two without are
  `ambiguous_result_edge`, as are two `failed` edges).
- Only a `succeeded` edge can have a `when` (`result_guard_outcome`), and only with
  `strict_mode: true` (`result_guard_needs_strict`: turn Strict Mode on, it starts off). A
  `failed` edge is taken whenever the tool fails, whatever it answered, and also when the
  tool never answered (a timeout, a connection that reset), with or without a `when` on the
  step; the request is not sent again. A step with no `failed` edge waits. A call transfer is
  the exception: if the carrier never said whether it connected, the call waits, because the
  caller may already be on the other line. A transfer the carrier refuses takes its `failed`
  edge like any other step.
- A comparison that cannot be made (the answer has no such field, or the wrong type) is false
  and the next edge is tried; it never fails the call. `unknown_source_path` when the tool's
  output schema rules the path out: a closed shape (`"additionalProperties": false`) that does
  not list the field, a field below a value that is text, a number or true/false, or a step
  into a list with something that is not a position (`/trips/first`, `/trips/-1`, `/trips/01`).
  An open shape is not checked, so a misspelt field in one is not caught at Check.
  The sequence condition codes (`condition_type_mismatch`, `condition_value_type`, …) apply.
- A `path` may step into a list by position, optional lists included (connected-app tools declare
  most lists as `"type": ["array", "null"]`): `/data/trips/0/distance` is the first trip's
  distance, `/data/waypoints/0/name` the first waypoint's name. A `null`, empty, missing or too
  short list makes the comparison false, so that edge is skipped and the otherwise edge is taken.
  There is no "any item" or "last item". `not` turns that false into true, so for "there is a
  trip and it is not long" write the positive comparison, `lte` 8000 on `/data/trips/0/distance`
  (`lte` is the opposite of `gt`, `lt` of `gte`), never `not` around `gt`: it also holds when the
  answer has no trip or the trip has no distance. `exists` is true for a `null` value, so `exists` plus `not` does not fix that.
  `not_exists` on `/data/trips/0` is true when the list is `null`, empty or shorter.
- A document with a `when` is `compiler_version` `1.10.0`; one without keeps the level and the
  bytes it had. A workspace whose voice engine is older than 1.10.0 refuses it at Check and
  publish with `result_guard_reader_unavailable` (one issue per edge, nothing published): remove
  the `when` and keep one `succeeded` edge, or publish again once the engine is updated.
- The dashboard shows such an edge on the canvas and in the step panel and keeps its `when`
  through other edits, but cannot author one. Write it with `PUT /agents/{id}/workflow` (or the
  MCP workflow tools), never tell the customer to "add the condition in the dashboard".
- Converted flow agents arrive this way: a step that branched on one exact answer from a tool
  became one `succeeded` edge per branch (in the old order) plus the otherwise edge, and
  `strict_mode` on. Expect to read a `when` on a result edge in such a document. A branch that
  cannot be expressed exactly is not converted: that agent stays `legacy`.

**The phase contract.** A follow-up trigger's `event` may be `any_end`, which stands for
`call.ended`, `call.failed` and `call.no_answer` together, or `request.failed`, the request
dying before anything was dialled — no call exists and no call event is published, so this
is the only trigger that runs for it. Every other event matches exactly. A
`<artifact>.ready` trigger (`transcript`, `analysis`, `recording`, `lead`, `billing`)
starts its follow-up only for a result that was actually produced; a call nobody answered
settles those producers without producing anything and runs none of them.

An ending decides what a step may wait for (`requires`, or an `artifact` input). Check and
publish refuse `artifact_never_produced` for any of the five on `call.no_answer` and
`request.failed`, and for `transcript`, `analysis` and `recording` on `call.failed`. They
cannot refuse it on `any_end`, so Check warns `after_any_end_waits` instead; a workflow whose
only follow-up is `call.ended` gets `after_ending_coverage`. Every follow-up whose event
matches and whose `when` holds runs (no first match); a *step* of a follow-up cannot carry a
condition (`guard_phase`), the trigger can (below).

**Only if (`when` on a trigger, `compiler_version` 1.9.0).** One optional condition per trigger
decides, when the follow-up opens, whether its steps run; when it does not hold every step is
recorded as skipped (`guard_false`) and the follow-up counts as done. Same shape as a
sequence condition (`compare` / `all_of` / `any_of` / `not`, 4 levels, 32 parts) over
`{"kind":"call","path":…}` and fixed `literal` values:

| Event | Readable paths |
|---|---|
| `any_end` | `/status` (`completed` / `no_answer` / `failed`), `/ended_by` (`caller` / `agent` / `system` / `operator`), `/duration_seconds`, `/call_direction` (`inbound` / `outbound`), `/channel` (`phone` / `web`) |
| `call.ended`, `call.failed`, `call.no_answer` | `/ended_by`, `/duration_seconds`, `/call_direction`, `/channel` |
| `analysis.ready` | `/disposition/id`, `/disposition/label`, `/analysis/extracted_data/<name>`, `/call_direction`, `/channel` |
| `call.answered`, `ai_session.ended`, `transfer.*`, `transcript/recording/lead/billing.ready` | `/call_direction`, `/channel` |
| `request.failed` | `/channel` |

Validate codes: `trigger_filter_unavailable` (a fact the event cannot guarantee), `trigger_filter_type`,
`trigger_filter_value` (a value the fact never has), `trigger_filter_source` (not call fact vs literal),
`call_source_placement` (a call source in a sequence), `trigger_filter_reader_unavailable` (voice engine
older than 1.9.0). A missing fact makes a comparison false, never an error. "Otherwise" is a second
trigger on the same event with `{"kind":"not","condition":<the first's when>}`; a filter on `analysis.ready`
never sees a call whose analysis never settled. A skipped follow-up reads on `GET /calls/{id}` as
`follow_ups.groups[].reason: "condition_not_met"` with `trigger_id`, `event`, `steps` and `seen`
(`[{"path":"/status","value":"completed"}]`), and the dashboard says *Skipped: the condition was not met*.
```json
{"id":"missed","event":"any_end","when":{"kind":"compare","source":{"kind":"call","path":"/status"},"op":"eq","value":{"kind":"literal","value":"no_answer"}},"steps":[…]}
```

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

The same reference works in a workflow agent's `greeting_message` (see **PATCH /agents/:id**);
issues about it carry path `/settings/greeting_message`.

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
`sequence_branch_advisory`, `before_reference_missing_fallback`, `override_needs_strict` (a step's
own settings with Strict off: the agent-wide copy stays callable there), `binding_channel_unsupported`
(a tool bound where the agent's channels outrun its contract — e.g. a phone-only transfer
on an agent that also takes web calls; still publishes), `stored_context_has_no_writer` (an
optional binding input, or one with a `fallback`, reads `kind: "stored"`, which nothing
ever fills — read it from `request` or an `artifact` instead; a required one with no
`fallback` is refused as an issue), `input_constant_placeholder` (a **required** tool input is a
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

**Check and publish issues, read by field.** On every issue and advisory, `label` is the
step's own label and comes only with `node_id`; an issue about a binding adds `tool_name`
(the tool it runs), and one about an input adds `field` (the input).
`binding_phase_unsupported` carries `node_id`/`label` for the step and `tool_name` for the tool.
- A **required** input with `kind: "request"` must read a path `request_schema` declares
  (under `properties`, or a schema opened with `additionalProperties: true`), or carry a
  `fallback`: otherwise Check and publish refuse it with `missing_request_field`, naming the
  step and the input (save keeps the draft). An **optional** one reading an undeclared path
  with no `fallback` gets `missing_request_field` as an advisory. Declare every call variable
  a step reads, then send it in `variables` on `POST /calls`.
- `fallback` is `{"value": <what to send>}` or `null`; a bare value is refused by the save
  (`field_invalid` at `/bindings/<n>/inputs/<field>/fallback`). Shape problems Check finds are
  `field_required` / `field_unknown` / `field_invalid` at a document pointer.
- Every `422 WORKFLOW_VALIDATION_FAILED` carries `warnings[]`: `strict_off_guidance` (Strict
  Mode off) and every binding/input advisory; the compiler's graph advisories arrive once the
  document compiles.
- `before.on_failure`: the dashboard writes it from the steps (`continue_with_available` when
  a step has `on_failure: "continue"`, else `stop_admission`). To refuse the call when a step
  fails, use `on_failed: "#decline"` with `on_failure: "continue"`.
- Save, Check or publish with no body is `400 WORKFLOW_REQUEST_INVALID`, `issues[0]`
  `field_required` at `/expected_version`.

**A publish `503`.** The server retries an unavailable compile or storage leg once itself.
A `503` after that means the outcome is unknown, not that nothing was published: the
publish may have committed with its answer lost. Send the same request with the same
`expected_version`: if a revision was already published for that draft version, the replay
returns it instead of publishing another; otherwise it publishes now.

---

### Tools & integrations: everything an agent can use

"Tools & integrations" is the one name, in the dashboard and here, for everything an agent can
use on calls: **connected apps** (one entry per account, shown on one line as
`"<App> · <account>"`, e.g. `Google Calendar · Clinic`), **Webhook** (a saved HTTP tool),
**Call transfer** (a saved transfer tool, phone calls only) and **End call** (built in, always
on). Each is on **every step** of the conversation or only on the **steps** of the workflow that
use it. Read the whole picture with one call before changing anything:

#### GET /agents/{id}/tools-and-integrations

**Scopes:** `agents:read`. Takes no query parameters (`400 AGENTS_QUERY_INVALID` names a stray
one). `{engine: workflow_v1|legacy, draft_version, live_version, draft_has_changes, channels,
data: [Entry]}`, everything for every step first (in the order it was added), then what only some
steps use, then End call.
`Entry = {id, kind: app|webhook|transfer|end_call, title, scope: agent|steps, status:
live|not_live|building|reconnect_required|always_on, app?, app_name?, connection_id?,
account_label?, tool_id?, actions: [Action], used_in: [{phase: before|during|after, node_id,
label}]}`.
`Action = {action (app slug, null for a webhook or transfer), name, name_he?, binding_id, tool_id?,
bindable? (apps), inputs: {<input>: source}, overrides: [{node_id, binding_id, inputs}]}`.
`id` is `i_<hex>` for an app and `tg_<hex>` for a webhook or transfer on every step (change both
with `PATCH /agents/{id}/integrations/{id}`), a binding id for a `steps` entry (change it in the
workflow document), or `end_call`. `inputs` uses the workflow's own source kinds — `literal`
(Fixed), `request`/`stored` (From the call), `model` (the agent fills it; with `options`, it picks
one: Choose from a list); `overrides` are conversation steps with their own sources. A
previous-engine agent answers `engine: "legacy"` with its attached tools (a flow agent: the tools
its steps use), read-only. `404 AGENT_NOT_FOUND`, `503 WORKFLOW_STORAGE_UNAVAILABLE` (retry).

#### Give an agent a whole connected app

An app is a connected account given to the **whole agent**: on every step of its
calls the agent can use that account's actions. Connecting an app makes its default actions
ready; giving it to an agent is one request. Never hand-build one tool per action for a
during-call capability — that is what an integration is. Per-action app tools (Unified Tools,
`workflow.kind: "app"`) are only for a before-call or follow-up step, an `action` node or a
sequence step.

Default actions: a curated set for the most used apps (Google Calendar: find free time, list,
book, change and cancel events; Gmail: send and draft, never reading the mailbox; Sheets,
Outlook, HubSpot, Salesforce, Calendly, Slack, WhatsApp, monday.com), otherwise the provider's
important actions minus destructive and admin ones, reads first, at most 12. Limits: 24 actions
per integration, 8 integrations and 64 integration actions per agent. For Sheets, monday.com and
Slack, name the sheet, board or channel in the agent's instructions.

#### GET /tool-connections/{id}/actions

**Scopes:** `tool-connections:read`. Every action of the account's app at the version its
actions are built at, defaults first: `{connection: {id, app, app_name, label, state}, version,
truncated, defaults_final, prepared, data: [{action, name, name_he, description, effect: read|write|delete, default, ready}]}`.
A large app's list is read in the background the first time: `truncated: true` lists the defaults
plus what is read so far (ask again shortly for the rest); it stays `true` for good on a list that
stops (over 1000 actions, or a part the catalogue cannot serve). `503` with `Retry-After` means even
the defaults are not read yet — send the same request again. `defaults_final` says whether
`"actions": "default"` is taken now: always for a curated app (Google Calendar, Gmail, HubSpot...),
an app read before, or a list that stops; `false` only while another app's list is read the first
time — then assigning with `"default"` answers `503` + `Retry-After` (name the actions to assign at once).

#### POST /tool-connections/{id}/actions/prepare

**Scopes:** `tool-connections:manage` (a key preparing actions for the first time also needs
`tools:create`). Body: none, `{}` or `{"actions": ["SLUG", ...]}`. Makes the actions ready so
an assign is instant; repeat-safe. `{prepared, version, data: [{action, status: ready|building|
unavailable, reason?}]}`. `building` with `reason: metadata_preparing`: the app's catalogue is
still being read for that action — prepare again in a few seconds. `unavailable` reasons: `not_eligible` (files or similar), `needs_setup`
(needs fixed settings — use a tool of its own on a step), or the build's error code.

#### GET /tool-connections/{id}/agents

**Scopes:** `tool-connections:read`. `{data: [{agent_id, name, via: integration|tools,
tools_count, live}]}` — check before disconnecting an account.

#### GET /agents/{id}/integrations

**Scopes:** `agents:read`. `{data: [Integration], draft_version, draft_has_changes,
separate_action_tools: [{connection_id, app, count, switchable}]}`.
`Integration = {id: "i_<account8>", app, app_name, connection: {id, label, state, ready},
actions: [{action, name, name_he, description, effect, default}], status: live|not_live|
building|reconnect_required}`.

#### POST /agents/{id}/integrations

**Scopes:** `agents:update`. Body `{connection_id, actions?: "default" | [slug], publish?: true,
expected_version?, replace_action_tools?: false}`. `201 {integration, skipped_actions, draft_version, live,
not_live_reason?, issues?, settings_updated_at?}`. `skipped_actions: [{action, reason, message}]`
names each default the app cannot offer a voice agent (left out); `settings_updated_at` (when
`live`) is the agent's new token for `PATCH /agents/{id}` `expected_updated_at`. Saves the draft (one binding per action, on every conversation
step) and publishes in the same request when the draft had no other unpublished change.
`not_live_reason`: `draft_has_other_changes`, `agent_not_published`, `publish_not_requested`,
`publish_refused` (with the compiler's `issues`), `publish_unavailable` — then publish with
`POST /agents/{id}/workflow/publish`. First use of an app can take a few seconds; still
preparing after ~12 s is `503 WORKFLOW_TOOL_CONTROL_UNAVAILABLE` with `Retry-After`, nothing
saved — send it again. `replace_action_tools: true` swaps the agent's separate per-action tools
for the account (only when `separate_action_tools[].switchable`).

Refusals: `404 AGENT_NOT_FOUND | TOOL_CONNECTION_NOT_FOUND`, `409 INTEGRATION_ALREADY_ASSIGNED`
(use PATCH) `| WORKFLOW_CONFLICT`, `422 AGENT_ENGINE_UNSUPPORTED` (previous-engine agent) `|
TOOL_CONNECTION_NOT_READY` (reconnect) `| INTEGRATION_ACTION_UNKNOWN | INTEGRATION_ACTION_UNAVAILABLE`
(each at `/actions/<n>`) `| INTEGRATION_LIMIT | INTEGRATION_SWITCH_UNAVAILABLE`, `403
WORKFLOW_ACTOR_DENIED` (key needs `tools:create`) `| WORKFLOW_ENVIRONMENT_MISMATCH`.

#### PATCH /agents/{id}/integrations/{integration_id}

**Scopes:** `agents:update`. Body `{actions: "default" | [slug], publish?, expected_version?}`.
Replaces the action list; kept actions keep their binding. Same answer (`200`), publish rule and
refusals, plus `404 INTEGRATION_NOT_FOUND`.

#### DELETE /agents/{id}/integrations/{integration_id}

**Scopes:** `agents:update`. Query `publish` (default true), `expected_version`. `200 {removed:
true, draft_version, live, settings_updated_at?}`. The account stays connected.

In the workflow document the integration is `integrations: [{id, connection_id, app, actions:
[{action, binding_id}]}]`; a save puts every integration binding on every conversation step.
A tool an integration manages answers `409 INTEGRATION_ACTION_MANAGED` to PATCH /tools/{id} (and
to DELETE while an agent binds it) and is not listed by GET /tools.

#### Action inputs: Fixed, from the call, AI, or a list

Every input of every binding (an app action, a webhook, a transfer) has one source, the workflow's
own `InputSource` — there is no second model. Four choices:

| Choice | Source | On the call |
|---|---|---|
| Fixed | `{"kind":"literal","value":…}` | Sent as is; the agent never sees it. Exactly `"{{call.caller_number}}"` / `"{{call.callee_number}}"` is that call fact. A **relative time**, `"{{call.time.<when>.<zone>}}"` (`now`, `start_of_today`, `end_of_today`, `start_of_tomorrow`, `end_of_tomorrow`, `in_hours.<1-8760>`, `in_days.<1-366>`; `<zone>` an IANA name such as `Asia/Jerusalem`, UTC when left out), is worked out when the step runs and sent as RFC 3339 with that zone's offset: `"{{call.time.start_of_today.Asia/Jerusalem}}"` → `"2026-11-02T00:00:00+02:00"`. A workspace whose calls do not run the newest voice engine refuses it at publish (`call_placeholder_time_unavailable`). |
| From the call | `request` · `stored` · `step` (· `artifact` after the call) | Read from the call request, saved context or an earlier step; the agent never sees it. |
| AI | `{"kind":"model","path":"/<input>"}` | The agent fills it from the conversation. During the call only. |
| Choose from a list | `{"kind":"model","path":"/<input>","options":[{"value","label"}]}` | The agent picks one of 1–20 by label; the tool gets the value. Text inputs (or a list of text) only. |

Which calendar is a **Fixed** setting, never prompt text: do not paste calendar ids into instructions.

- **Catalogue specs.** `GET /tool-connections/{id}/actions` gives each action `description_he`,
  `bindable` and `inputs: [{name, label, label_he, role: config|conversation, resource?: calendar,
  shape?: one_item_array, required, default_source}]`, configuration first. A new grant starts
  from `default_source`: Google Calendar's calendar (`items` on find free time — a one-item list —,
  `calendar_id` / `calendarId` elsewhere) is Fixed to `"primary"`; conversational inputs are AI.
- **List the account's calendars:** `GET /tool-connections/{id}/options/calendars`
  (`tool-connections:read`; first use also needs `tools:create` on a key) →
  `{resource: "calendars", data: [{value, label, primary, detail}]}`, the main one first as
  `value: "primary"`, writable calendars only. Read live through the account's own List calendars
  action (no effect); waits up to ~10 s. `202 {status: "loading", retry_after}` + `Retry-After`: the
  listing goes on, ask again after `retry_after` s and the same listing answers (your asks within
  2 min share one read). `409 RESOURCE_OPTIONS_RECONNECT_REQUIRED` (Google refused the account's
  read) or `409 TOOL_CONNECTION_NOT_READY`: reconnect it (`POST /tool-connections/{id}/reconnect`).
  `429 RESOURCE_OPTIONS_BUSY` + `Retry-After`. `503 RESOURCE_OPTIONS_PROVIDER_UNAVAILABLE` /
  `RESOURCE_OPTIONS_UNAVAILABLE`: retry later, or take the id from the user. `422 RESOURCE_UNSUPPORTED`
  (not Google Calendar).
- **Set them on a grant.** POST / PATCH `actions` items may be `{"action": slug, "inputs":
  {"<input>": source}}`; an action kept by a PATCH keeps its sources except the ones sent.
  Sources only: `PATCH /agents/{id}/integrations/{i_…}` `{"inputs": {"<action slug>": {"<input>":
  source | null}}}` (`null` = back to the catalogue default).
- **Webhook or transfer on every step:** `POST /agents/{id}/integrations` `{"tool_id", "inputs"?}`
  (an HTTP or transfer tool) → `integration: {id: "tg_<8hex>", kind: webhook|transfer, tool_id,
  name, binding_id: "t_<8hex>", inputs, overrides, status}`; listed under `tool_grants` on GET;
  PATCH `{"inputs": {"t_<8hex>": {...}}}` (keyed by its binding id); DELETE removes it. At most 8.
  `422 TOOL_GRANT_KIND | TOOL_GRANT_CHANNEL` (a transfer needs the phone channel).
- **One step, other settings:** a conversation node's `binding_overrides: {"<grant binding id>":
  "o_<id>"}` runs that step's own binding of the same tool (e.g. a different calendar there). GET
  lists them per action as `overrides: [{node_id, binding_id, inputs}]`. Held reliably only with
  `strict_mode` on: off, both copies stay callable on every step and Check warns
  `override_needs_strict` - turn Strict on when a step must keep its own calendar. Codes
  `override_not_grant`, `override_mismatch`. Ids shaped `i_…`, `tg_…`, `t_<hex>`, `o_…` are reserved.
- **Old tools upgrade on write.** `bindable: false` = the account's managed tool still fixes the
  calendar itself. Any write that sets inputs rebuilds it first (a new revision of the same tool);
  prepare answers `head_revision_id` + `bindable` per action. Untouched agents keep using `primary`.
- **Runtime.** Fixed and from-the-call inputs never reach the model's function schema; a value the
  model sends for them is dropped, any other unknown argument is still refused. A list becomes an
  `enum` the model reads by label. Check/publish refuse a required input with no source
  (`missing_input_source`, naming action + input), `options_type`, `options_duplicate`.
  `422 INPUT_SOURCE_INVALID` names each bad source by path (`/actions/0/inputs/items`).

```bash
# Let the agent choose between two calendars by name; times from the conversation
curl -s -X PATCH "https://api.goyappr.com/agents/AGENT_ID/integrations/i_0b8f4c2e" -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" -d '{"inputs": {"GOOGLECALENDAR_FIND_FREE_SLOTS": {"items":
  {"kind": "model", "path": "/items", "options": [{"value": "primary", "label": "Front desk"},
  {"value": "c_1a2b3c@group.calendar.google.com", "label": "Clinic"}]}}}, "expected_version": 13}'
```

---

### DELETE /agents/:id

Archives the agent and removes it from ordinary lists while retaining workflow/run
history. New calls are blocked; running calls are not aborted. PATCH cannot undo
archival. Once archived, the agent is `404 AGENT_NOT_FOUND` here as on `GET` and `PATCH`:
a second delete answers that `404`. Same-key creation replay returns 410. To pause reversibly, PATCH
is_active=false; the agent stays visible and can be reactivated.

**Scopes:** `agents:update`

**Response:** `200` — `{ "success": true, "id": "uuid", "archived": true, "archived_at":
"ISO8601" }`, also when the archive committed but its first answer was lost (Yappr reads
the agent back before it answers). An agent not yet converted is switched off rather than
archived: `archived: false`, `is_active: false`, and it stays listed.

`503 WORKFLOW_STORAGE_UNAVAILABLE`: the archive could not be confirmed, so it may not have
gone through. Send the same DELETE again: `200` archives it now, and `404 AGENT_NOT_FOUND`
on that retry means the first one archived it.

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
| `POST /tools` | `tools:create` | `{name, description?, workflow}` and mandatory `Idempotency-Key`; `201` when the tool was built while the request waited (up to about 4 s), so identical creates answer the same; `202` only means queued — poll `GET /tools/{id}` until `workflow.status` is `current` or `failed`; `200` replay of a ready identity. |
| `PATCH /tools/{id}` | `tools:update` | `name`, `workflow.kind`, what that kind is built from and the fields you are changing, plus `expected_head_revision_id` and numeric `expected_head_generation`, with an Idempotency-Key. Every field left out keeps its value (see **A `PATCH` changes what it sends** below). Creates a candidate, never overwrites a frozen revision. |
| `DELETE /tools/{id}` | `tools:update` | Archives a workflow tool while retaining revisions/history; legacy deletion remains separate. Idempotent: an already-archived tool answers `200` again and keeps its first archive time, so only a tool outside the workspace is `404`. The answer carries `archived_at`, and a `tool_in_use` warning naming each agent that still binds the tool — those agents cannot be published or duplicated until it is restored or their step removed. There is no `tools:delete` scope — a key cannot be issued with one. |
| `POST /tools/{id}/restore` | `tools:update` | Puts an archived workflow tool back exactly as it was, switched on; no body. Answers the whole tool with `restored` (`false` when it was not archived, so a repeat is safe). See **An archived tool** below. |
| `GET /tools/{id}/workflow-revisions` | `tools:read` | The 100 newest contract revisions of one saved tool, newest first. Each row carries the contract fields only (`id`, `tool_id`, `revision`, `name`, `description`, `kind`, schemas, phases, channels, `timeout_ms`, `effect`, `replay_safe`, and `include_call_context` when false) and `created_at`, when that revision was made; stored endpoint configuration is never in it. `404 WORKFLOW_NOT_FOUND` while the tool is archived. |
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
    "timeout_ms": 30000
  }
}
```

`timeout_ms` (HTTP and app tools) is how long the tool waits for an answer: 1–60000.
Left out on create it is 30000 (30 s), the same value a tool made on the dashboard starts
with; left out on a `PATCH` it keeps the tool's own. Existing tools are never changed.

**An HTTP tool's address must stay public.** When the tool is built, a host that is
loopback, private, link-local or a cloud-metadata address — written that way, or whose DNS
answers include one — is `422 WORKFLOW_TOOL_REQUEST_INVALID` with `url_not_public` at
`/workflow/configuration/url`. A host written as a number in a shortened, octal or
hexadecimal form is refused too: `url_not_public` when it spells a private address,
`url_host_form` when it spells a public one (write a hostname, or four plain decimal
numbers). Some such bodies are stopped by the network edge with an HTML `403` instead;
nothing is created either way. Every call resolves the host again and connects only to the
address it checked, so a name that has turned private since (rebinding) is refused and
nothing is sent: a workflow tool test reads `status: "blocked"`, `outcome.effect_status:
"not_dispatched"` and `outcome.error_code: "url_resolves_private"`, with no delivery row and
nothing to reconcile; a legacy tool test answers `400` "Webhook URL's hostname resolves to
a loopback, private or link-local address; use a public address"; an agent's webhook is not
retried.

HTTP schemas are explicit; timeouts are 1–60,000 ms. App definitions use
`{kind:"app", metadata_id, connection_id, fixed_inputs}`: select the exact ready local
account and only policy-permitted typed fixed fields. The provider's full raw schema
is validated after fixed-field composition; model/test arguments cannot override those
fields or replace account/action/version. `required_scopes.all_of` requires every scope;
each `any_of` group requires at least one alternative. Unsupported completion/file
semantics fail visibly; a provider success flag does not prove remote jobs completed.
Transfer definitions use `{kind:"transfer", destination, announce_transfer?,
announce_message?, transfer_method?, pbx_feature_code?, pbx_feature_code_hangup_after_secs?}`
with a fixed `destination`: an international number, or a SIP address of the caller's own
phone system (**A transfer to a SIP address**, below). Create a separate tool for each named
destination; they are during-phone-only. Intrinsic End is not in this catalog.

**A transfer tool's own transfer code.** On a call that arrived through an extension
endpoint, a transfer to an extension already uses the phone system's transfer code set on
the endpoint (`register.pbx_feature_code`; see **The phone system's transfer code** under SIP
Endpoints), so a transfer tool needs nothing for it. Only a tool that needs a different code
sets `"transfer_method": "pbx_feature_code"` with its own `"pbx_feature_code"` (same rule:
1–32 of `0-9 * # A-D w W`, at least one key, `{extension}` at most once) and, for an
attended code, `"pbx_feature_code_hangup_after_secs"` (1–10). They replace the endpoint's as a
pair: a tool with its own code and no hang-up time waits for the phone system even when the
endpoint sets one. `destination` must then be a SIP address whose extension a keypad can
dial (up to 32 digits, `*` or `#` before the `@`). On an update an omitted key keeps its
value and is checked together with what is sent; `"transfer_method": "auto"` removes all
three (the endpoint's code applies again); a `null` hang-up time removes only that; a kept
code lapses when a new `destination` no longer names such an extension. Faults are `422
WORKFLOW_TOOL_REQUEST_INVALID` at `/workflow/<field>`: `transfer_method_invalid`,
`pbx_feature_code_missing`, `pbx_feature_code_invalid`, `transfer_extension_not_dialable`
(at `/workflow/destination`), `pbx_feature_code_hangup_after_secs_invalid`,
`pbx_feature_code_hangup_after_secs_without_code`. A read shows the keys under
`workflow.current` only when the tool carries its own code. Ignored on calls that didn't
arrive through an extension endpoint. An agent moved to a workflow keeps each transfer's own
code, hang-up time included.

**A transfer to a SIP address.** A transfer tool's `destination` holds either an
international number or a SIP address (`sip:` or `sips:`, form `sip:user@host[:port]`, for
example `sip:reception@pbx.example.com`; at most 256 characters, user part required, no
password and no `?headers`). A SIP address asks the caller's own phone system to place the
new call (SIP REFER) instead of Yappr dialling, and works only on calls that arrived over a
SIP trunk or an extension endpoint (`auth_mode: "register"`: no REFER is sent there; Yappr
places a new call through the extension to the extension named before the `@`, see
**Register as an extension** under SIP Endpoints). "SIP trunk" here means a
username-and-password trunk (`auth_mode: "credentials"`;
see **SIP Endpoints**): a call that arrived on a SIP-address-only endpoint
(`auth_mode: "uri"`) is not a trunk call, so a SIP-address destination there gets
`REFER_ONLY_ON_SIP_TRUNK` and the agent keeps helping. A phone number on a trunk call gets
`UNAVAILABLE_ON_SIP_TRUNK` (a trunk or extension call cannot dial out), and the agent keeps helping then
too. Anything not starting with `sip:`/`sips:` must be an international number, and a
malformed value that does start that way is refused when the tool is saved: `422
WORKFLOW_TOOL_REQUEST_INVALID`, at `/workflow/destination`. The customer's phone system
must accept REFER, be able to reach the address, and have the new call answered within
about nine seconds (answers after 5 s and 8 s went through, one after 12 s did not). **If
the transfer fails the call ends**: the carrier drops the caller, so the agent cannot take
them back. Test the address first, with a call through the trunk.

A hand-off to a SIP address records `transfer_started` (`method` `"sip_refer"`,
`destination` the address with any password and any `?` headers removed; the extension
before the `@` stays) together with `transfer_answered`, and only once the customer's phone
system confirms that it took the call over. Yappr is then out of the call: billing ends at
the hand-off, the moment the carrier accepted the request, and the seconds the phone system
then takes to place the call are not billed; there is no second, human segment. The call
itself ends `completed` (never `transferred`), with `transferred_at` and `transfer_target`
(the same address) set.

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

**An archived tool** is off both tool lists and still this workspace's.
`GET /tools?workflow=true&status=archived` lists them most recently archived first and takes
`name`; its `next_cursor` is opaque — pass it back unchanged with the same `limit`, `status`
and `name`.
`GET /tools?status=archived` pages them by `limit`/`offset`. `GET /tools/{id}` reads one;
all three in a short form: `id`, `name`,
`description`, `workflow_version`, `is_active: false`, `created_at`, `updated_at`,
`archived: true`, `archived_at` and `workflow.kind`. Put one back with
`POST /tools/{id}/restore` (`tools:update`; no body — a field is
`422 WORKFLOW_TOOL_REQUEST_INVALID`): it answers the whole tool as `GET /tools/{id}` does,
switched on, with `restored` (`false` when it was not archived, so a repeat is safe).
Restore's `404` means there is no archived tool with that id: find it with
`GET /tools?workflow=true&status=archived`. A change (`PATCH /tools/{id}`, answered before
the body is read), its schema, or `GET`/`POST /tools/{id}/workflow-revisions` on an
archived tool is `404 WORKFLOW_NOT_FOUND`, whose message names `GET /tools?status=archived`
and `POST /tools/{id}/restore` — restore it, re-read the head with `GET /tools/{id}`, then
send the change. `GET /tools/{id}/bindings` still answers for it: the agents whose steps
name it. `POST /tools/{id}/test` and a test's cancel on an archived tool are
`404 WORKFLOW_TOOL_ARCHIVED`, answered before the body is read: restore the tool, then test
it. `DELETE` on an archived tool answers the same `archived_at` and the same `tool_in_use`
warning while agents use it, and changes nothing.
Restoring a creation that never built is `409 WORKFLOW_TOOL_NOT_READY`: it was never
archived, so fix it with the `PATCH` above or remove it with `DELETE /tools/{id}`.

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
and `announce_message` and its own transfer code (`transfer_method`, `pbx_feature_code`,
`pbx_feature_code_hangup_after_secs`). Send a field only to change it. That includes the call package: a
tool with `include_call_context: false` stays that way until a change sends
`"include_call_context": true` — leaving the key out keeps it off. A `description` sent as
`""` clears it on purpose. What a change cannot leave out is what names the tool and what
its kind is built from: `name`, `workflow.kind`, `expected_head_revision_id` and
`expected_head_generation`, and for an HTTP tool `input_schema`, `output_schema` and
`configuration` (`{}` when the endpoint is not changing), for an app tool `metadata_id` and
`connection_id`, for a transfer tool `destination` — leave one out and it is a `422` naming
it, and so is a `description` sent under `workflow` (at `/workflow/description`):
`description` is top-level, beside `name`. The one exception: to change only an HTTP tool's
`description` (or `name`), send `{"description": "...", "expected_head_revision_id": ...,
"expected_head_generation": ...}` and leave `workflow` (and `name`) out; the tool keeps
everything else. (Before 2026-09-22 a header rotation that omitted `effect` and `timeout_ms` reset them to
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
uncertain effect automatically.

**A real test is also a delivery, and gives one verdict.** A real HTTP tool test
(`policy: "allowlist"`) that reached the endpoint is also a `GET /deliveries/{id}` row, and
`GET /tools/{id}/tests/{test_id}` names it as `delivery_id`. An endpoint that answered with
an error — a 4xx or a 5xx — refused the request: the test reads `status: "failed"`,
`outcome.status` and `outcome.effect_status` `"failed"`, `outcome.error_code:
"downstream_http_error"`, `outcome.http_status` equal to the delivery's `response_status`,
and no `resolution`; the delivery reads `failed` too. `outcome.retryable` is always `false`:
Yappr never sends a tool's request again by itself. To send it again,
`POST /deliveries/{delivery_id}/retry` (the delivery says `retryable: true`). An endpoint
that answered 2xx with a body the tool could not use got the request: the test reads
`failed` with `output_schema_invalid`, `invalid_json_response` or `response_too_large` (fix
the tool's Outputs, then run a new test), and its delivery reads `failed` with the same
reason and is never sent again. `unknown` with
`resolution: "manual_reconciliation_required"` is kept for a request that got no answer at
all — a timeout, a dropped connection — which may or may not have reached the endpoint, so
check before running it again; its delivery reads `unknown` too, and its `error_code` is
`http_timeout` (never `dispatch_timeout`, which older tests now read as `http_timeout` too)
or `http_network_error`. On `output_schema_invalid`, `outcome.output_fields` is
`[{name, problem: "missing" | "mismatched"}]` (names only), and the delivery's
`error_message` names them too. A test's `call.call_id` and `call.agent_id` are `null`. An
empty answer (a `204`, or a `200` with no body) is `{}` for a tool whose `output_schema`
declares no fields, so it passes. `blocked` means nothing
was sent. The top-level `error_code` equals `outcome.error_code` once the request has
settled. `delivery_id` is `null` for a mock, a connected-app action, a
request refused before it was sent, and tests settled before 25 September 2026, which still
read a 5xx as `unknown`. Public output is a bounded/redacted preview, not raw
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
- `agent_id` (uuid, optional) — filter to tools attached to this agent the legacy way; a
  workflow agent (every new or converted one) answers `{"data":[]}` even with tools bound —
  read `bindings` from `GET /agents/{id}/workflow` instead
- `name` (optional) — case-insensitive, anywhere in the name, literal (`%`, `_` and `*`
  are not wildcards); newest first; `pagination.total` counts the matches. Names are not
  unique — match on `id` afterwards. An empty, repeated or over-200-character `name` is
  `400 TOOLS_QUERY_INVALID`. On `GET /tools?workflow=true` (the revision catalog) `name`
  narrows only `status=archived`; with any other status there it is `400
  TOOLS_QUERY_INVALID` — use the default `GET /tools?name=`, whose workflow rows carry the
  same `workflow` object.
- `status` (optional) — on this list it takes one value, `archived`: the tools archived with
  `DELETE /tools/{id}`, and only those (workflow tools in the short form under **An archived
  tool** above). Not together with `agent_id`. Any other value is `400 TOOLS_QUERY_INVALID`
  — `failed` and `all` belong to `GET /tools?workflow=true`.
- `limit`, `offset` — paging. The default list takes only `workflow`, `agent_id`,
  `limit`, `offset`, `name` and `status`; anything else — `cursor` included — is
  `400 TOOLS_QUERY_INVALID`, naming it.

**With `workflow=true`** (the workflow tool catalog, 1–50 rows a page, paged by
`cursor`/`next_cursor`) the parameters are `limit`, `cursor` and the ones below. The cursor
is signed (it carries the last row's id, no workspace id; never build or edit one) and works
only on the list it came from: send it back with the same `limit`, `status` and `name`. A
cursor from another list (for example `archived` to the default, or `failed`), an edited
cursor, or one from before 1 Oct 2026 is `422 WORKFLOW_TOOL_CURSOR_INVALID`: read the first
page again.
- `status` (optional, **only here**) — a create that is accepted but cannot be built stays
  in the workspace at `workflow.status: "failed"` (reason in `workflow.error_code`,
  `workflow.current: null`); those rows, and only those, are left out of this list.
  `status=failed` finds one, `status=all` keeps the page whole (every tool that is not
  archived), and `status=archived` pages the archived ones, newest archive first (and takes
  `name`). Any other value
  is `422 WORKFLOW_TOOL_REQUEST_INVALID`. A tool whose later *edit* failed also reads
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

Create a tool. **Use the `workflow` body** (see **Unified versioned Tools** above): that
is the tool a workflow agent binds. The `type`/`config` body below is the legacy create,
kept only as a temporary migration boundary: a tool made that way cannot be attached to a
workflow agent (`POST /tools/attach` answers `409 WORKFLOW_TOOL_OWNER_REQUIRED`) and no
workflow can bind it until `POST /tools/{id}/workflow-revisions` gives it a contract.

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
| `config.timeout_seconds` | number | no | 1–60 seconds; default `30`. On a live call the agent waits this whole limit for the result, also past 10 s (prompt, flow and workflow agents alike). |
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
Tools* above: every field you leave out keeps its value. It answers `200` once the change
is the tool's current revision, and `202` while `workflow.status` is `accepted`, `claimed`,
`queued`, `compiling` or `ready` (the new revision under `workflow.candidate`) — poll
`GET /tools/{id}` until it reads `current`. The rest of this section is the legacy
`type`/`config` body.

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
this API creates, or for a converted one.** Every such agent is a workflow agent, so this
endpoint answers `409 WORKFLOW_TOOL_OWNER_REQUIRED` (also when the tool is a workflow one).
Give a workflow agent a tool through its document instead — see **Giving an agent a tool**
under *Canonical workflow authoring* above.

**Scopes:** `tools:update`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent_id` | uuid | yes | |
| `tool_id` | uuid | yes | |
| `execution_order` | int | no | 0-based, default `0`. Use 999 for `end_call` system tool to ensure it's last |
| `config_override` | object | no | Merged over the tool's own `config` for this agent |

One tool per call — no arrays. For multiple tools, call this endpoint once per tool.

**Response:** `201` — the attachment (`id`, `agent_id`, `tool_id`, `execution_order`,
`config_override`). Any other body field is `400 TOOL_ATTACHMENT_REQUEST_INVALID`.

---

### POST /tools/detach

Detach a tool from an agent. Legacy attachment only, like attach: on a workflow agent (every
new or converted one) it answers `409 WORKFLOW_TOOL_OWNER_REQUIRED` — remove the binding
from its workflow with `PUT /agents/{id}/workflow` and publish. The tool is not checked, so
a `tool_id` that is not attached also answers `200`.

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

This is what Yappr sends to an HTTP tool's endpoint when a workflow agent — a new one or a converted one — uses the tool: the tool's inputs as top-level members, and the call as one `call` member beside them (the call package). For `POST`, `PUT`, `PATCH`, and `DELETE`, it is sent as JSON. For `GET`, the same members are encoded as query parameters (object/array values, `call` included, are compact JSON strings) and no request body is sent. It is NOT the same as the event-webhook payload (`call.analyzed` etc.) — see [Webhook Events](#webhook-events) for that.

**Payload shape (a tool used during the call):**

```json
{
  // The tool's inputs. On a tool converted from a legacy webhook tool these are its
  // extraction parameters (filled by the agent) and its static parameters (fixed values)
  "<input_name>": "<value>",

  "call": {
    "version": "1",
    "phase": "during",
    "company_id": "uuid",
    "agent_id": "uuid",
    "agent_name": "string",
    "call_id": "uuid",
    "call_direction": "inbound | outbound | web_call",
    "caller_number": "+972...",
    "callee_number": "+972...",
    "call_metadata": { "...": "whatever you passed to POST /calls body.metadata" },
    "call_variables": { "LeadName": "...", "AppointmentDate": "..." },
    "channel": "phone | web",
    "started_at": "ISO8601"
  }
}
```

**A converted agent's tools send the nine call fields one level in.** A legacy webhook tool
sent `company_id` … `call_variables` flat at the top level; once its agent was converted
they arrive under `call` with the same names and the same empty values (`""`, `{}`), while
its static and extraction parameters stay at the top level. An endpoint that read
`body.call_id` reads `body.call.call_id` now. `call.phase` is `before`, `during` or `after`
(a step before or after the call), and a member that phase cannot know is absent. Only the
few agents not yet converted still send the flat shape.

**Field reference** (the `call` members; flat on a not-yet-converted agent):

| Field | Source | Notes |
|-------|--------|-------|
| `company_id`, `agent_id`, `agent_name` | Agent config | Identifies which company/agent made the call |
| `call_id` | Platform | Yappr's internal UUID for the call (use to query `GET /calls/:id` if you need the transcript or disposition later) |
| `call_direction` | Platform | `inbound`, `outbound`, or `web_call` |
| `caller_number`, `callee_number` | PSTN / WebRTC | E.164 on a phone call. On a call that arrived on a SIP address endpoint, `callee_number` is the endpoint's address — its credential, so do not log or forward it — and `caller_number` is whatever the customer's phone system sent. On a username-and-password trunk call, `callee_number` is the number or extension the phone system dialled and `caller_number` is a phone number or empty (never the trunk's username) |
| `call_metadata` | `POST /calls body.metadata` | **The exact object you passed at call creation.** Use this to carry CRM IDs (appointment_id, contact_id, calendar_id, etc.) that tool receivers need to route updates back to the right record. Empty object `{}` if you didn't pass any. |
| `call_variables` | `POST /calls body.variables` | The same `{{VariableName}}` values that were filled into the agent's instructions. Available here for tool receivers that want to echo context (e.g. Slack alerts: "Noa booked an appointment for {{LeadName}}"). |
| `<static_params>` | Tool `config.payload_config.static_parameters` | Fixed values set when the tool was created — the same for every call |
| `<extraction_params>` | AI (during the call) | Values the agent extracted from the conversation (e.g. `requestedDateTime`, `cancellationReason`). Configured in `config.payload_config.extraction_parameters` |

**Turning the call off for one tool:** `"include_call_context": false` on the tool's workflow contract (see **Unified versioned Tools**) sends only the inputs. A converted tool always starts with it on, whatever `include_standard_metadata` said. Rare — only useful for a target that rejects unexpected fields.

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
When the agent fires `rescheduleAppointment`, the Make.com (or n8n) scenario receives `call.call_metadata.appointment_id` directly in the tool webhook body — no follow-up fetch required.

---

## Phone Numbers

### GET /phone-numbers

List all phone numbers owned by the company.

**Scopes:** `phone_numbers:search` (there is no `phone_numbers:read`). A key limited to some
agents is `403 API_KEY_AGENT_SCOPED`: numbers belong to the whole workspace.

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
      "rent": { "included": false, "reason": "own_carrier" | "not_charged" | "no_subscription" | "phone_system" | null, "monthly_price_cents": 1000, "last_charged_at": "ISO8601 | null" },
      "next_renewal_at": "ISO8601 | null",
      "scheduled_release_at": "ISO8601 | null",
      "created_at": "ISO8601",
      "carrier_account": { "id": "uuid", "name": "string", "provider": "telnyx", "status": "untested" | "active" | "paused" | "disconnected" } | null,
      "ownership_verified_at": "ISO8601 | null",
      "carrier_state": {
        "state": "ready" | "not_configured" | "blocked" | "not_ready" | "paused" | "telnyx_gone" | "removed",
        "telnyx_status": "active" | null,
        "current_connection_name": "string | null",
        "previous_connection_name": "string | null",
        "blockers": ["forwarding_always" | "translated_number" | "tech_prefix"],
        "notes": ["forwarding_on_failure" | "number_recording" | "call_screening" | "off_by_owner" | "off_until_active" | "off_while_paused"],
        "removed_at": "ISO8601 | null"
      } | null
    }
  ]
}
```

`scheduled_release_at` is set on a number that was released and is kept until the end of the
period already paid for (see `POST /phone-numbers/{id}/release`); `null` otherwise. Such a number
keeps working until that moment, and its rent does not renew (`next_renewal_at: null`).

`provider` is `telnyx` for a number bought from Yappr, `external` for a number in the
customer's own Telnyx account, brought in by a carrier-account sync (see **Carrier
Accounts** below), or `phone_system`: the business number of an extension endpoint that
**calls out through the customer's own phone system** (SIP Endpoints → Calls out through the
extension). A `phone_system` number carries `phone_system: {sip_endpoint_id,
sip_endpoint_name}` (`null` on every other number), has no rent (`rent.reason:
"phone_system"`), takes no calls in (PATCH `inbound_agent_id`/`inbound_split` →
`422 FIELD_NOT_ALLOWED`; calls in reach the endpoint's own `inbound_agent_id`), and is never
released here: it is switched on, off and removed on its endpoint. `outbound_agent_id` works
as on any number. Only an `external` number carries `carrier_account` — the account it
calls through, never its key — `ownership_verified_at` (when the customer's Telnyx key last
proved it is an active number of theirs; `null` means that is not proven now — Telnyx no
longer lists it as active, or its account was disconnected — so it cannot place calls and its
calls are not answered; a sync that finds it active again
sets it again and switches the number back on unless it is `off_by_owner` or its account is
paused) and `carrier_state`. On an
`external` number `monthly_cost` is `null`: Yappr charges nothing for it. A campaign or
`POST /calls` needs `is_active: true` and `status: "active"`. `telnyx_status` is `null` until
a sync has read the number.

**Is the rent charged? `rent` and `next_renewal_at`** (on `GET /phone-numbers` and
`PATCH /phone-numbers/{id}`; not on a number embedded elsewhere, such as a campaign's
`from_phone_number` or a carrier account's `numbers`). `included: false` only when a rent
charge landed in the last 40 days (each renewal is a `phone_number` row on
`GET /billing/transactions`, paid by card, never from credits); then `monthly_price_cents`
is the rent before VAT and `next_renewal_at` the next monthly renewal (the subscription's
start day and time; the last day of a shorter month). `included: true` with `reason`:
`own_carrier` (a number in the customer's own Telnyx account: Telnyx bills its rent),
`not_charged` (a subscription is on record but has charged nothing in 40 days) or
`no_subscription`, or `phone_system` (the business number of an extension endpoint); `next_renewal_at` is then `null`. `monthly_cost` is the listed price;
`rent` says whether it is charged. A rent that cannot be read is `500`, never "included".

**`carrier_state`** is where an `external` number stands — the state the dashboard shows —
and `null` on a number bought from Yappr, or for a key without `carrier_accounts:read`. The
first state that applies wins: `telnyx_gone` ("No longer in your Telnyx account": a sync
found Telnyx no longer lists it, since `removed_at`; it cannot call; if it is back in Telnyx,
Add back takes it back at once, and the next sync would too),
`removed` ("Removed from this workspace": a disconnect kept it for its call history, since
`removed_at`; it may still be in Telnyx, it cannot call, and `carrier_account.status` is
`disconnected`, an account `GET /carrier-accounts` no longer lists — its `id` still removes
the number; Add back with a connected account's `id` takes it back once that account's
Telnyx lists it),
`not_ready` (Telnyx lists it with a status other than `active`), `paused` (its account is
paused), `blocked` (not configured, and `blockers` names the Telnyx setting that stops
it: `forwarding_always`, `translated_number` or `tech_prefix`), `not_configured` (calls out work while `is_active` is `true`; calls to it still go to `current_connection_name`)
and `ready` (configured: calls to it reach Yappr and its inbound agent answers).
On an `external` number, `sip_inbound_configured: true` means exactly `ready`'s routing,
and `is_active` covers calls **out** only. A sync adds a number on if Telnyx lists it as
active and the account is not paused. `notes` lists the Telnyx voice settings configuring
leaves on (`number_recording`, `forwarding_on_failure`, `call_screening`) and, while the
number is off (`is_active: false`), one note that says why — which decides what switches it
back on:

- `off_until_active` — the sync switched it off: Telnyx does not list it as active (a
  pending port), it left the account, or the account was disconnected. The sync switches it
  back on once Telnyx lists it as active again, on an account that is not paused.
- `off_while_paused` — its carrier account paused. `reactivate` switches these back on, and
  only these; one Telnyx no longer lists as active becomes `off_until_active`.
- `off_by_owner` — an owner or admin switched it off. It stays off until an owner or admin
  switches it back on: a sync or `reactivate` never does.

Calls to a configured number are answered either way.

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
- **Retry safely with `Idempotency-Key`** (optional header, 16–128 letters, digits, `_` or `-`).
  Make a new random UUID for each number you decide to buy and reuse it only to retry that
  purchase. A retry within 24 hours with the same key and the same number charges once: it
  answers the same success body once the purchase went through, `409 PURCHASE_IN_PROGRESS`
  while it is still going through (check `GET /phone-numbers` in a minute), or
  `409 PURCHASE_FAILED` when it did not go through (declined or rolled back). After
  `PURCHASE_FAILED` or any other error, send a new key. A key belongs to one number: the same key with a different number is a
  separate purchase, and that number is bought and charged too. Do not build the key from the
  number or the date — a later re-buy of the same number would replay the old purchase and buy
  nothing. Without the header every request is a new purchase — so always send one from an
  agent that may retry.
- `400 IDEMPOTENCY_KEY_INVALID` — the header is not 16–128 letters, digits, `_` or `-`, or was
  sent more than once; nothing was bought. `409 IDEMPOTENCY_KEY_REUSED` ("This Idempotency-Key
  was already used for a different purchase. Use a new key.") — the same key and number came
  back but the purchase no longer matches the first one (for example the workspace's payment
  account changed); nothing was charged a second time, use a new key.
- The first charge and every monthly renewal come with an invoice emailed to the billing
  email (`GET /billing/invoices`).

**Errors:**
- `400 BAD_REQUEST` — `phone_number` is missing, the body is not JSON, or the number is not
  `+972…` (only Israeli numbers are sold).
- `402 PAYMENT_METHOD_REQUIRED` — no card on file, the saved card is no longer usable, or the
  first charge did not go through. Nothing was bought and no subscription is left running: ask
  the user to add a card (`POST /billing/setup`, or Settings → Billing), then retry. This is not
  `BILLING_ERROR` — a credit top-up does not fix it.
- `403 INSUFFICIENT_SCOPE` — the key does not hold `phone_numbers:purchase`.

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

**Numbers from the customer's own Telnyx account** (`provider: "external"`) take an inbound
agent and an inbound split like any number. The inbound agent answers once the number is
configured (`carrier_state.state: "ready"`, see **POST
/carrier-accounts/{id}/numbers/{phone_number_id}/configure**); until then its calls keep
going where they go in Telnyx. (`INBOUND_NOT_AVAILABLE_ON_EXTERNAL_NUMBER` is retired: it
is no longer answered, on this endpoint or on `PATCH /phone-numbers/:id`.)

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

### POST /phone-numbers/{id}/release

Stop paying for a number bought from Yappr. Takes no body and no query parameters (anything
sent: `400 PHONE_NUMBER_REQUEST_INVALID`).

**Scopes:** `phone_numbers:purchase`

- **Paid up:** kept until the end of the period already paid for, then released. It keeps
  answering and placing calls until then, and its rent does not renew. `GET /phone-numbers`
  shows the date as `scheduled_release_at`.
- **Payment overdue, or no subscription:** released now, and no longer listed.
- **A payment that keeps failing** needs no call: the workspace is emailed, the payment is retried
  automatically for about three weeks while the number keeps working, and if no retry goes through
  the subscription ends and the number is released the same way. A payment that recovers keeps it.
- Releasing a number that is already scheduled answers the same date and changes nothing.
- A released number is gone for good after `release_at`: it cannot be kept, and buying it again
  is a new purchase. Confirm with the user before releasing.

**Response:**
```json
{ "phone_number_id": "uuid", "released": false, "release_at": "ISO8601" }
```
`released: true` and `release_at: null` when it was released now.

**Refusals** (nothing is changed):

| Status | Code | Meaning |
|---|---|---|
| 409 | `NUMBER_IN_CAMPAIGN` | A campaign that has not ended still calls from it: give the campaign another caller number, or stop or delete it, first |
| 409 | `NUMBER_ON_LIVE_CALL` | A call on it is in progress: try again when it ends |
| 409 | `PHONE_SYSTEM_NUMBER` | A `phone_system` number: switch outbound off on its SIP endpoint (`PATCH /sip-endpoints/{id}`, `register.outbound.enabled: false`) or delete that endpoint |
| 409 | `NUMBER_FROM_OWN_CARRIER` | An `external` number (the customer's own Telnyx): remove it with `DELETE /carrier-accounts/{id}/numbers/{phone_number_id}` |
| 404 | `NOT_FOUND` | No such number in this workspace (or already released) |
| 503 | `BILLING_UNAVAILABLE` | Billing or the checks could not be reached: retry in a minute |
| 500 | `PHONE_RELEASE_FAILED` | A release that runs now could not run: retry in a minute |
| 500 | `PHONE_RELEASE_INCOMPLETE` | A release that runs now did not finish at the carrier: Yappr is notified; contact support if the number stays listed |

---

### POST /phone-numbers/{id}/keep

Undo a scheduled release: the number stays and renews as before (`scheduled_release_at` is
`null` again). Works until `release_at`. Takes no body and no query parameters.

**Scopes:** `phone_numbers:purchase`

**Response:**
```json
{ "phone_number_id": "uuid", "released": false, "release_at": null }
```

Keeping a number that was not scheduled, while its subscription runs, answers the same and
changes nothing. `409 RELEASE_NOT_SCHEDULED`: the number has no subscription to keep.
`409 SUBSCRIPTION_ENDED`: it has already ended; buy a new number. `503 BILLING_UNAVAILABLE`:
retry in a minute.

---

## SIP Endpoints

A SIP endpoint lets a customer's own phone system (PBX, contact-center platform,
SIP provider) send calls to a Yappr agent **without** a Yappr phone number. Each
endpoint answers with one agent (`inbound_agent_id`). There are three kinds, chosen
with `auth_mode` at create time; the kind cannot change later. The table compares
`credentials` and `uri`; `register` is for hosted phone systems that only give the
customer an extension account (see **Register as an extension** below).

| | `credentials`: username and password | `uri`: SIP address only (the API default) |
|---|---|---|
| Which agent | Any agent, `workflow_v1` included (publish its workflow first: an unpublished one is refused with SIP `603`) | Any agent, `workflow_v1` included |
| The customer's system gets | `sip_username`, `sip_password` and the server settings in `sip_connection` | one `sip_uri`: `sip:{slug}@yappr-byoc.sip.telnyx.com` |
| Who can call the agent | Only a system with the password. A wrong password is refused with SIP `403` before the call reaches Yappr | Anyone who has the address, billed to the workspace. The slug (~120 random bits) is the only secret |
| What it dials | Any number or extension at the server in `sip_connection`; every call reaches the endpoint's agent | The address only, over UDP/TCP 5060 or TLS 5061 |
| Changing the secret | `POST /sip-endpoints/{id}/rotate-password` (the username stays) | Create a new endpoint, repoint the system, delete the old one |
| Calls at once | `max_concurrent_calls`, 1–8, default 2; one more gets SIP `486 Busy Here` | No per-endpoint limit (Yappr's own limit applies) |

Use SIP endpoints when the customer already has a business line and wants Yappr to
answer specific calls (overflow, after-hours, escalations) while keeping their
existing telephony in place. Use phone numbers when they want Yappr to own a new DID
outright. The two coexist — a single agent can answer calls from both.

**The password is returned once**, in the create and rotate-password responses.
List, get and update never return it, and Yappr keeps no copy. Hand it straight to
whoever configures the customer's system; if it is lost, rotate it.

**Facts for every kind (`credentials`, `uri` and `register`):**
- Caller ID comes from the customer's system, so it is untrusted: the agent gets
  no lead memory (returning-caller context) on these calls. There is no setting to
  change this, in the API or the dashboard.
- **Every kind answers with any agent of the workspace, `workflow_v1` included**
  (`inbound_agent_id`; publish its workflow first: calls to an agent that is switched off,
  or whose workflow has never been published, are refused, on a trunk with SIP `603 Decline`).
  Create and PATCH don't check it. Choose `credentials` unless the customer's
  platform can't answer a password challenge (then `uri`, or `register` if it only
  offers an extension account).
- A `credentials` trunk only brings calls in: it can't place calls, so a transfer to a
  phone number isn't available on its calls. The attempt dials nothing, the caller stays
  on the call, and the call's events get `transfer_failed` with `error_code`
  `UNAVAILABLE_ON_SIP_TRUNK`. A transfer to a SIP address of the customer's own phone
  system (`sip:extension@pbx.example.com`) hands the caller back to it instead; see
  **A transfer to a SIP address** below. A call that arrived on a `uri` endpoint is
  not a trunk call for this: a SIP-address transfer there gets `REFER_ONLY_ON_SIP_TRUNK`
  and the agent keeps helping.
- `is_active: false` refuses new calls before they are answered (a `credentials` or
  `uri` endpoint answers SIP `603 Decline`; on a `register` endpoint
  `register.status` reads `disabled` and the customer's system isn't told).
  Calls in progress continue. Re-route the calls in the customer's system before
  switching an endpoint off or deleting it: not every system tries its next route
  after a `603`.
- The workspace's inbound calling hours (`GET /call-windows`), when switched on,
  apply to these calls too: outside them every call is refused (a `credentials` or
  `uri` endpoint answers `603`).
- In the dashboard, only workspace owners and admins can create, change, delete or
  rotate a `credentials` endpoint; another member gets `403 FORBIDDEN_ROLE`. That code
  is for dashboard sessions only: an API key never gets it, and needs
  `sip_endpoints:manage` instead.
- A `uri` endpoint's `slug` and `sip_uri` are its credential, and a `credentials`
  trunk's `sip_username` is half of its: list and get return them only to a key
  that also holds `sip_endpoints:manage`. A key with `sip_endpoints:read` alone
  (the Read-only preset) gets them as `null`.
- Send only the documented fields and query parameters. Anything else is refused
  by name rather than ignored: `400 SIP_ENDPOINT_REQUEST_INVALID` for a body field
  (or a body that isn't a JSON object), `400 SIP_ENDPOINT_QUERY_INVALID` for a query
  parameter (the list takes `limit` and `offset`; status and every write take none).
- A missing scope is `403 INSUFFICIENT_SCOPE`, naming the scope.

**What a `uri` endpoint does not enforce — say so before handing a URI out:**

- **Clear text unless TLS.** Over UDP or TCP (port 5060) the URI travels in clear
  text between the customer's phone system and Yappr; TLS (port 5061) keeps it off
  the wire. Either way it sits in the system's configuration, logs and SIP traces.
- **No source filtering.** `allowed_source_ips` is stored with the endpoint for the
  customer's records, but no call is checked against it: a call to the URI is
  answered wherever it comes from.
- **The URI is not hidden everywhere.** A call that arrives on an endpoint reads
  `to: null` and carries `sip_endpoint_id` on `GET /calls` and `GET /calls/:id`, and
  its `To` is empty in the export. The dashboard's call logs still show the URI as
  the number called, and the call details tools and webhooks receive carry it as
  `callee_number`.
- **What does limit exposure:** who can read the phone system's configuration,
  `is_active: false` while the endpoint is not in use, and rotating the URI
  (create a new endpoint, repoint the phone system, then delete the old one)
  whenever it may have been seen. A deleted URI gets SIP `603 Decline` and is never
  handed out again.

### GET /sip-endpoints/status

Whether this workspace can create `credentials` endpoints right now: `true` when
trunks are switched on for the workspace and Yappr can take trunk calls right now.
`register_available` is the same for `register` endpoints.

**Scopes:** `sip_endpoints:read`. Takes no query parameters.

**Response:** `200` `{ "credentials_available": true, "register_available": true }`

While it is `false`, creating a `credentials` endpoint is refused, and nothing is
created: `403 SIP_TRUNKS_NOT_ENABLED` (trunks aren't switched on for this
workspace: the customer asks Yappr support) or `409 VOICE_NOT_READY` (for example
during a Yappr update: wait a few minutes). `uri` endpoints and every other route
are unaffected: existing trunks can still be listed, changed, deleted and given a new
password. The voice part of the answer can be up to 60 s old.

---

### GET /sip-endpoints

List the workspace's SIP endpoints, newest first, all kinds. A `register` endpoint carries
a `register` object (see **Register as an extension**).

**Scopes:** `sip_endpoints:read`. Without `sip_endpoints:manage` too, every `uri`
endpoint comes back with `slug` and `sip_uri` set to `null`, and every
`credentials` endpoint with `sip_username` set to `null`.

**Query params:**
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | int | 50 | 1–200; a larger value is capped at 200 |
| `offset` | int | 0 | for pagination |

Any other parameter (a filter such as `status` or `name`) is
`400 SIP_ENDPOINT_QUERY_INVALID`, not answered with every endpoint.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Main office PBX",
      "auth_mode": "credentials",
      "slug": null,
      "sip_uri": null,
      "sip_username": "yp4k7d2m9x1q8w3z",
      "max_concurrent_calls": 5,
      "sip_connection": {
        "server": "sip-a.example.com",
        "alternate_servers": ["sip-b.example.com", "sip-c.example.com"],
        "transports": [
          { "protocol": "tls", "port": 5061, "recommended": true },
          { "protocol": "tcp", "port": 5060 },
          { "protocol": "udp", "port": 5060 }
        ],
        "registration": "optional"
      },
      "inbound_agent_id": "uuid",
      "is_active": true,
      "last_call_at": "ISO8601 | null",
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    },
    {
      "id": "uuid",
      "name": "After-hours",
      "auth_mode": "uri",
      "slug": "after-hours-a1b2c3d4e5f6g7h8i9j0k1l2",
      "inbound_agent_id": "uuid",
      "is_active": true,
      "last_call_at": "ISO8601 | null",
      "allowed_source_ips": null,
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "sip_uri": "sip:after-hours-a1b2c3d4e5f6g7h8i9j0k1l2@yappr-byoc.sip.telnyx.com"
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

---

### POST /sip-endpoints

Create a SIP endpoint.

**Scopes:** `sip_endpoints:manage`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | 1–200 characters, shown in the dashboard |
| `inbound_agent_id` | uuid | yes | An agent in this workspace; it answers every call on the endpoint. Any agent, `workflow_v1` included (publish its workflow first) |
| `auth_mode` | `"credentials"` \| `"uri"` \| `"register"` | no | Default `"uri"`. `"credentials"` is a username-and-password trunk; `"register"` registers as an extension (needs `register`) |
| `register` | object | with `register` | `register` only: see **Register as an extension** |
| `max_concurrent_calls` | int | no | `credentials` and `register` only: 1–8 calls ringing or in progress at once (default 2); the next is refused (`credentials`: SIP `486 Busy Here`; `register`: refused). `null` is refused (400) |
| `slug` | string | no | `uri` only: readable prefix, 2–12 letters, digits and single hyphens, starting and ending with a letter or digit (lowercased); not a reserved word or one followed by a hyphen (`yappr`, `admin`, `internal`, `system`, `api`, `sip`, `trunk`, `root`, `test`, `sudo`, `support`, and a few similar words). Yappr appends a hyphen and 24 random chars. Refused if it does not fit, never rewritten; left out, the prefix is derived from `name` (at most 12 characters) |
| `allowed_source_ips` | string[] \| null | no | `uri` only: up to 50 IPv4/IPv6 addresses, each optionally with a `/prefix`. **Recorded only, never checked.** `[]` and `null` both mean no list |

Any other field — `sip_username`, `sip_password`, `transport`, `require_tls`, a
typo — and a value for the other kind's field are refused with
`400 SIP_ENDPOINT_REQUEST_INVALID`, by name, rather than dropped, and nothing is
created. On `credentials`, Yappr issues the username and password; a `uri`
endpoint has neither.

**Rate limit:** 20 create attempts per workspace in 24 hours that run from the first
attempt, all three kinds together. It counts attempts, not endpoints created, so a failed
attempt can count too.

**Username and password (credentials):** check `GET /sip-endpoints/status` first.

```bash
curl -s -X POST "https://api.goyappr.com/sip-endpoints" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Main office PBX", "inbound_agent_id": "AGENT_UUID", "auth_mode": "credentials", "max_concurrent_calls": 5}'
```

**Response:** `201`: the endpoint (as in the list) plus `"sip_password": "<32 letters and digits>"`, **only this once**.

**SIP address (uri):**

```bash
curl -s -X POST "https://api.goyappr.com/sip-endpoints" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "After-hours", "inbound_agent_id": "AGENT_UUID"}'
```

**Response:** `201`: the endpoint with its `sip_uri`. The customer pastes
`data.sip_uri` into their telephony platform's SIP route with authentication set to
none, over UDP or TCP (5060) or TLS (5061; over UDP or TCP the address crosses the
network in clear text), G.711 (µ-law or A-law) or G.722.

**Errors:**
| Status | `code` | Meaning |
|---|---|---|
| 400 | `SIP_ENDPOINT_REQUEST_INVALID` | Missing or invalid field (e.g. `max_concurrent_calls` outside 1–8, or `null`; a `slug` outside its rules), agent not in this workspace, a field of the other kind or one create doesn't take, or a body that isn't a JSON object |
| 400 | `SIP_ENDPOINT_QUERY_INVALID` | The request has a query parameter; create takes none |
| 403 | `INSUFFICIENT_SCOPE` | Key lacks `sip_endpoints:manage` |
| 403 | `SIP_TRUNKS_NOT_ENABLED` | `credentials` trunks aren't switched on for this workspace; the customer asks Yappr support. Nothing created; `uri` unaffected |
| 400 | `SIP_REGISTER_HOST_INVALID` | `register.server` isn't a public host name or address |
| 403 | `SIP_REGISTER_NOT_ENABLED` | `register` endpoints aren't switched on for this workspace; the customer asks Yappr support. Nothing created |
| 409 | `VOICE_NOT_READY` | `credentials` or `register` not available right now (see `/status`); retry in a few minutes. Nothing created |
| 409 | `SIP_REGISTER_LIMIT_REACHED` | `register`: 5 per workspace reached, or Yappr has no room for another registration right now |
| 409 | `SIP_REGISTER_SETUP_IN_PROGRESS` | `register`: a create repeated with the same `Idempotency-Key` header hasn't finished setting up; wait a minute, list the endpoints, and if it is still switched off delete it and create it again (if the new one fails as "already in use", use a different extension name) |
| 409 | `SIP_REGISTER_EXTENSION_IN_USE` | `register`: another Yappr endpoint registers this extension username. (A name still held at the carrier by a deleted endpoint is not refused here: the create is accepted, and the endpoint then reads `failed`, "already in use") |
| 409 | `CONFLICT` | `uri` address collision (rare): send again |
| 429 | `RATE_LIMITED` | 20 create attempts in the current 24-hour window (a `uri` create answers 429 with no `code`); retry when it ends |
| 500 | `INTERNAL_ERROR` | The endpoint could not be saved. Nothing created; retry |
| 502 | `SIP_TRUNK_PROVISIONING_FAILED` | The username and password could not be set up with the carrier. Nothing created; retry in a minute |
| 502 | `SIP_REGISTER_PROVIDER_ERROR` | `register`: the registration could not be set up with the carrier. Yappr undoes the attempt (nothing created; retry in a minute); if it could not confirm the undo the message says the endpoint was left in the list switched off: delete it, then create it again (if the new one fails as "already in use", use a different extension name) |

---

### GET /sip-endpoints/{id}

Get one endpoint. Same shape as the list. Never returns the password. On a `register`
endpoint it re-reads `register.status` when the stored one is older than 15 s.

**Scopes:** `sip_endpoints:read` (`slug` and `sip_uri` on a `uri` endpoint, and
`sip_username` on a `credentials` one, are `null` unless the key also holds
`sip_endpoints:manage`)

`404 SIP_ENDPOINT_NOT_FOUND` when the id is not an endpoint of this workspace.

---

### PATCH /sip-endpoints/{id}

**Scopes:** `sip_endpoints:manage`

| Field | Type | Kinds | Notes |
|-------|------|-------|-------|
| `name` | string | all | new label, 1–200 characters |
| `inbound_agent_id` | uuid | all | agent must belong to this workspace; answers from the next call on. Any agent, `workflow_v1` included (publish its workflow first) |
| `is_active` | bool | all | `false` = new calls are refused until switched back on (`credentials` and `uri`: SIP `603 Decline`; `register`: `register.status` reads `disabled` and Yappr refuses new calls, but the customer's system isn't told). Re-route the calls in the customer's system first |
| `max_concurrent_calls` | int | `credentials`, `register` | 1–8; `null` is refused (400) |
| `register` | object | `register` | `server`, `username`, `auth_username`, `transport`, `region`, `password`; a changed `username`/`auth_username` needs `password` too. Also `pbx_feature_code` and `pbx_feature_code_hangup_after_secs`, the phone system's transfer code, which stay in Yappr (no password, no carrier change) (see **Register as an extension**) |
| `allowed_source_ips` | string[] \| null | `uri` | replace the recorded list (not enforced); `[]` or `null` clears it |

Send at least one. Not changeable: `auth_mode`, the username, the password (use
rotate-password), the SIP address (a body with `slug` is refused: create a new
endpoint, repoint, delete the old one). A value for the other kind's field, or any
other field the endpoint does not read, returns `400 SIP_ENDPOINT_REQUEST_INVALID`
by name, and nothing is saved. `409 SIP_TRUNK_NOT_PROVISIONED`: the trunk's setup
never finished; delete it and create a new one.

**Response:** `200`: `{ "data": { ...endpoint } }`.

---

### DELETE /sip-endpoints/{id}

**Scopes:** `sip_endpoints:manage`

- `credentials`: Yappr removes the username and password at the carrier first, so
  they stop working within seconds (the customer's system gets SIP `403`), then
  deletes the endpoint. If the carrier can't be reached: `502
  SIP_TRUNK_PROVISIONING_FAILED`, nothing deleted; retry.
- `uri`: from then on its address gets SIP `603 Decline`; calls in progress finish.
  A deleted URI is never handed out again. To rotate a URI, **create first**: create
  a new endpoint, point the phone system at its `sip_uri`, then delete the old one —
  deleting first drops every call until the new URI is in place.
- `register`: Yappr deletes the extension's connection at the carrier, then the endpoint. The
  customer's system isn't told, and the carrier can keep registering the extension on it for
  hours.
  The system keeps routing that extension's calls to the carrier, which rejects them
  meanwhile: remove or disable the extension on it, and re-route its calls, before deleting.
  A deleted endpoint can keep the extension name busy: a new endpoint with the same name is
  accepted, then fails as `failed` ("already in use"). To change anything, PATCH instead of
  deleting and re-creating.

Re-route the calls in the customer's system before deleting. To replace a lost or
leaked password, use rotate-password instead of deleting (on `register`, PATCH
`register.password`).

**Response:** `200` `{ "ok": true }`

`500 INTERNAL_ERROR`: the endpoint could not be loaded or deleted. On a trunk, its
username and password may already have stopped working: send the DELETE again to
finish. `404 SIP_ENDPOINT_NOT_FOUND`, `400 SIP_ENDPOINT_QUERY_INVALID` (any query
parameter) and `403 INSUFFICIENT_SCOPE` as on the other routes.

---

### POST /sip-endpoints/{id}/rotate-password

`credentials` only (`409 NOT_SUPPORTED_FOR_MODE` on a `register` endpoint: PATCH
`register.password`). Issues a new SIP password and returns the endpoint plus
`sip_password`, **once**. Send no body (or `{}`): the password is issued, never
chosen; a body field, or JSON that is not an object, is refused with
`400 SIP_ENDPOINT_REQUEST_INVALID` (a body that is not JSON at all is ignored). The
username stays.

**Scopes:** `sip_endpoints:manage`

- The old password stops working within seconds (calls get SIP `403`); calls in
  progress are not dropped. Enter the new password in the customer's system right away.
- A system that registers learns of it only at its next registration refresh, which
  fails until the new password is in.
- No-gap switch: create a second trunk on the same agent, move the system, delete the old one.

**Rate limit:** 10 attempts per trunk in an hour that runs from the first attempt
(`429 RATE_LIMITED`); a failed attempt can count too.

**Errors:** `409 SIP_ENDPOINT_NOT_CREDENTIALS` (a `uri` endpoint has no password),
`409 SIP_TRUNK_NOT_PROVISIONED` (setup never finished, or no longer set up at the
carrier: delete and recreate), `502 SIP_TRUNK_PROVISIONING_FAILED` (could not be
set or confirmed; `error` says whether the current password still works; retry,
and the password from the next success is the one that works), `404 SIP_ENDPOINT_NOT_FOUND`,
`500 INTERNAL_ERROR` (the trunk could not be loaded; the password did not change).

**Response:** `200`: `{ "data": { ...endpoint, "sip_password": "<new password>" } }`

---

### Register as an extension (`auth_mode: "register"`)

For a hosted phone system that gives the customer only an **extension account**
(server, username, password) and no trunk. Yappr registers to it like a softphone and
the agent answers every call the system routes to that extension. Use a `credentials`
trunk instead whenever the system can add a trunk.

`POST /sip-endpoints` with `"auth_mode": "register"` and a `register` object
(`sip_endpoints:manage`; the workspace must have extension endpoints switched on):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `register.server` | string | yes | The registrar: host name or IP with an optional `:port`; no `sip:` prefix, path or credentials. Resolved when saved: a private, loopback or link-local address, or a Yappr or carrier host, is `400 SIP_REGISTER_HOST_INVALID` |
| `register.username` | string | yes | The extension: 2 to 128 characters; letters, digits, `+`, `-` and `_`, starting with a letter, digit or `+`. A dot, `@` or space cannot be registered; a 3-digit extension such as `101` works. **Unique across Yappr**, first come first served (`409 SIP_REGISTER_EXTENSION_IN_USE` otherwise: with a short extension a clash is likely, so tell the customer to create a dedicated extension with a distinctive name and register that) |
| `register.password` | string | yes | 1–128 characters. Yappr **doesn't store, return or log it**; its carrier holds it to keep registering (about every hour) and to place transfers, so send the new one with PATCH whenever it changes on the customer's system |
| `register.auth_username` | string \| null | no | Only if the system logs in with a user other than the extension (1–128 of `A-Za-z0-9._@+-`) |
| `register.transport` | `"udp"` \| `"tcp"` \| `"tls"` | no | Default `udp` (recommended; TCP and TLS are also accepted) |
| `register.region` | `"middle_east"` \| `"europe"` | no | Default `middle_east`; picks the carrier address in `allow_list`: `192.76.120.75` for the Middle East, `192.76.120.72` for Europe (read the address to allow from `allow_list`) |
| `register.pbx_feature_code` | string \| null | no | The customer's in-call transfer code (`##`, `*2`, `#1`...), used by every transfer to an extension on this endpoint's calls, on every agent (see **The phone system's transfer code**, below). 1–32 of `0-9 * # A-D` and the pauses `w` (0.5 s) / `W` (1 s), at least one key, `{extension}` at most once (otherwise the extension follows the code). Stored trimmed; `null` or `""` = none |
| `register.pbx_feature_code_hangup_after_secs` | int \| null | no | Only with a code, when the code starts an **attended** transfer (the phone system completes it when the extension that pressed it hangs up): Yappr hangs up this many seconds after the code. 1–10; 4 is a good start; `null` = wait for the phone system |

`max_concurrent_calls` (1–8, default 2) applies as on a trunk. `sip_username`,
`sip_password`, `slug` and `sip_uri` are refused (`400 SIP_ENDPOINT_REQUEST_INVALID`).
A workspace holds at most 5 extension endpoints.

```bash
curl -s -X POST "https://api.goyappr.com/sip-endpoints" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Hosted PBX extension", "inbound_agent_id": "AGENT_UUID", "auth_mode": "register",
       "register": {"server": "sip1.example.net", "username": "101", "password": "EXTENSION_PASSWORD"}}'
```

**Response:** `201`, the endpoint with `slug` and `sip_uri` `null` and a `register` object:
`server`, `username`, `auth_username`, `transport`, `region`, `pbx_feature_code`,
`pbx_feature_code_hangup_after_secs` (`null` when unset), `status`, `status_detail`,
`status_checked_at`, `last_activity_at`, `last_activity_kind` and `allow_list` (`sip_ip`,
`sip_ports` `[5060, 5061]`, `rtp_ports` `"16384-32768"`, `note`). The password is not in
the response.

**`register.status`:** `pending` (just created or changed; the carrier is still applying
it: a few minutes. An endpoint that is switched off and still `pending` after a failed
create never finished its setup: delete it and create it again; if the new one fails as "already in use", use a different extension name) · `registering` ·
`registered` · `failed` (`status_detail` says why:
"authentication failed (check the extension and password)", "your phone system is not
reachable", "no answer from your phone system", "extension username already in use", "unknown error") ·
`disabled` · `unknown`. List and get re-read it when older than 15 s (a list of more than
20 extension endpoints serves stored values: check `status_checked_at`). **`registered`
does not prove calls and transfers work**: a wrong password saved later can leave it
`registered` while transfers fail. Always send a test call and a test transfer.

**`unknown` with `status_detail` "we cannot read the carrier status right now (this does not
mean the extension is not working)"** means Yappr can't read the carrier's status at the
moment: it is not `failed` and calls are not stopped. While it lasts, `last_activity_at` and
`last_activity_kind` name the newest call that went through the extension in the last 24
hours and after its settings last changed (a call from before a change used the old
settings): `inbound_call` is a call from the customer's system that reached Yappr through
the extension (counted on arrival, answered or not); `outbound_call` is an answered call the
agent placed out through it, which shows outbound calls work and does not confirm that
incoming calls arrive. That is **evidence that a call went through, never a registration**:
`status` stays `unknown`, and you must not report it as registered. Both are `null` in every
other state, and when no such call exists (an outbound call nobody picked up, or one the
phone system refused, is not one): tell the customer to find the extension in their phone
system's list of registered extensions or devices, or send a test call. Only `GET
/sip-endpoints/{id}` and the list fill them: the answers to create and PATCH carry `null`, so
read the endpoint again. Never fill the gap from the carrier's own connection record: its
registration field reads "Not Registered" for an extension that is carrying calls.

`PATCH /sip-endpoints/{id}` takes `register` with any of `server`, `username`,
`auth_username`, `transport`, `region`, `password`. Changing `username` or
`auth_username` **needs `register.password` in the same request**
(`400 SIP_REGISTER_PASSWORD_REQUIRED`); a password alone is a password change; the
others don't need it. **Send the new password whenever it changes on the customer's
system**: Yappr doesn't keep it, but its carrier holds the last one it was given and
uses it to register and to place transfers, so until you send it transfers fail while
`register.status` can still read `registered`. The status goes back to `pending` for
a few minutes. A change the carrier can't apply keeps the old settings
(`502 SIP_REGISTER_PROVIDER_ERROR`; `409` of the same code while the last change is
still applying). `register.pbx_feature_code` and `register.pbx_feature_code_hangup_after_secs`
are the exception: Yappr's own settings, so a PATCH of only those needs no password, isn't
sent to the carrier (the registration isn't touched), doesn't count toward the 30 changes an
hour and works while the endpoint is off. An omitted one keeps its value; `null` or `""` as
the code removes it and the hang-up time with it; `null` as the hang-up time removes only
that. Faults are `400 SIP_ENDPOINT_REQUEST_INVALID` with `issues[]`: `field_invalid` at
`/register/pbx_feature_code` or `/register/pbx_feature_code_hangup_after_secs`, and
`field_required` at `/register/pbx_feature_code` for a hang-up time with no code sent or
stored.

`rotate-password` on an extension is `409 NOT_SUPPORTED_FOR_MODE`: send `register.password`
with PATCH. `409 SIP_REGISTER_NOT_PROVISIONED`: the registration was never finished or
is gone at the carrier: delete and recreate (if the new one fails as "already in use", use a different extension name).

**Delete or switch off: re-route first.** DELETE removes the extension's connection at the carrier, then the
endpoint, but **the customer's phone system isn't told**: the carrier can keep registering the
extension there for hours, so the system keeps routing the extension's calls to the carrier, which
rejects them meanwhile. While that lasts, a new endpoint with the same extension name is accepted, then reads
`failed` ("already in use"). This also happens with endpoints that never registered, so a wrong password
followed by a delete and re-create can leave the extension name unusable for hours. So **change an extension endpoint with
PATCH; never delete and re-create it.** If a re-create fails as "already in use" right after
a delete, use a different extension name. `is_active: false` tells the
customer's system nothing either (the status reads `disabled`, Yappr refuses new calls). Remove
or disable the extension on their system, and re-route its calls, before either. `502 SIP_REGISTER_PROVIDER_ERROR`
keeps the endpoint: retry.

**Errors specific to this kind:** `403 SIP_REGISTER_NOT_ENABLED` (not switched on: the
customer asks Yappr support), `409 VOICE_NOT_READY` (not available right now),
`409 SIP_REGISTER_LIMIT_REACHED` (create only: 5 per workspace, or Yappr has no room for another registration right now),
`409 SIP_REGISTER_EXTENSION_IN_USE`, `400 SIP_REGISTER_HOST_INVALID`, `409 SIP_REGISTER_SETUP_IN_PROGRESS` (create, same
`Idempotency-Key` header), `502 SIP_REGISTER_PROVIDER_ERROR`. PATCH can also answer
`400 SIP_REGISTER_PASSWORD_REQUIRED`, `409 SIP_REGISTER_NOT_PROVISIONED` and `429 RATE_LIMITED` (30 changes to extension endpoints per hour per workspace).
`GET /sip-endpoints/status` also answers `register_available` and `register_outbound_available`.

#### Calls out through the extension (`register.outbound`)

An extension endpoint can also **place** the agent's calls: Yappr sends the call through the
extension and the customer's phone system dials it on their own plan, showing the caller ID set
for that extension. Switch it on with POST (inside `register`) or PATCH:

```bash
curl -s -X PATCH "https://api.goyappr.com/sip-endpoints/ENDPOINT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"register": {"outbound": {"enabled": true, "caller_number": "+97235550100", "dial_format": "national", "dial_prefix": null}}}'
```

| Field | Notes |
|---|---|
| `enabled` | Required whenever `outbound` is sent. `false` switches off and keeps the number (switched off). `true` also lifts a pause. |
| `caller_number` | E.164, the number the phone system shows. Required the first time. Changing it keeps the same `phone_number_id`. |
| `dial_format` | `national` (default; 05X…, Israeli numbers only) or `e164` (the PBX receives the country code without the plus: 972…; any country it allows). |
| `dial_prefix` | Outside-line prefix: one digit (`0`-`9`), or `null`. |

- GET answers `register.outbound`: `null`, or `{enabled, caller_number, phone_number_id, dial_format, dial_prefix, paused}`; `paused` is `{reason: "phone_system_refused", since, last_sip_code}` after three refusals in a row (campaigns from the number pause too).
- The number appears in `GET /phone-numbers` with `provider: "phone_system"`: give it an `outbound_agent_id` (`PATCH /phone-numbers/:id`), or use it as a campaign's `from_phone_number_id` or `from` on `POST /calls`.
- `max_concurrent_calls` counts incoming and outgoing calls together.
- Yappr's own setting: no password, nothing sent to the carrier, not one of the 30 changes an hour. Switching the endpoint off (`is_active: false`) stops calls out too; on again resumes them.
- Errors: `403 SIP_REGISTER_OUTBOUND_NOT_ENABLED` (not switched on for the workspace: ask Yappr support), `409 VOICE_NOT_READY` (not available yet), `409 PHONE_NUMBER_IN_USE` (the number is already in Yappr), `400 SIP_ENDPOINT_REQUEST_INVALID` with the field at `/register/outbound/<field>`. Switching off always works.
- DELETE of the endpoint removes its number and answers `campaigns_without_number`.

**What the customer must do on their phone system:**

- Use a **dedicated extension that receives calls and can dial only the internal transfer
  destinations**: no outbound, phone-network or international calling. The extension can place calls, so
  limit what it may dial.
- Make the system reachable from the internet and allow `register.allow_list.sip_ip` for
  SIP (5060/5061) and RTP (UDP 16384–32768) in both directions.
- Use an extension username of 2 to 128 characters (letters, digits, `+`, `-`, `_`; a dot, `@` or space cannot be registered; `101` works) that no other Yappr endpoint registers. Usernames are first come first served, so for a short extension advise a dedicated extension with a distinctive name.
- Expect a few minutes before `registered`. Yappr re-registers on a one-hour interval;
  there is no setting for it.
- Change an extension endpoint with PATCH; do not delete and re-create it (a deleted endpoint can keep the extension name busy for hours).

**Transfers on extension calls are not a REFER.** Yappr never sends a SIP REFER on these
calls. A transfer tool's `destination` as
`sip:reception@pbx.example.com` (always write the `sip:` form; a bare extension number is not a supported destination) makes Yappr place a **new call
through the extension** to the extension or queue named by the part before the `@` (the
host is ignored and never dialled), and join the two. The extension needs permission to
dial it; the transfer uses **two channels** on the customer's system; Yappr stays on the
call until one side hangs up. The call is marked `transferred` and billed like a transfer to a
phone number (the connected time at the transfer rate). `transfer_started` carries `method`
`"extension_dialback"` and is recorded when the request is accepted, not when the
phone system answers. **A new call that fails or isn't answered ends the call**: the agent
has stepped out, so `NOT_CONNECTED` (the disconnect reason says why: rejected, busy, unreachable or not answered, or the default "Transfer failed" when the carrier gives no reason) is followed by a hang-up, the
new call has about 25 seconds to be answered, and Yappr ends the call if nothing connected
about 85 seconds after the request ("Transfer never connected"). Only a request the carrier
refuses outright leaves the caller with the agent. Build no fallback that needs the agent
after the hand-off. A phone-number destination is `UNAVAILABLE_ON_SIP_TRUNK` as on a trunk.

**The phone system's transfer code (set once on the endpoint).** Most hosted phone systems
let the extension on a call transfer it by pressing a code: often `##` and then the
extension, sometimes `*2` or `#1`. Set it once as `register.pbx_feature_code` (on create, or
`PATCH /sip-endpoints/{id}` with `{"register": {"pbx_feature_code": "##"}}`; the dashboard's
extension endpoint dialog has the same **Transfer code** field). From then on every transfer
on this endpoint's calls whose destination names an extension a keypad can dial
(`sip:400@pbx.example.com`: up to 32 digits, `*` or `#` before the `@`), on every agent and
engine, presses the code and the extension (`##400`) before anything else: the phone system
moves the caller and hangs up Yappr's side, the person who answers sees the caller's own
number, no second channel is held and no transfer minutes are billed. Nothing is set on the
transfer tools. A destination with a name before the `@` (`sip:reception@...`) can't be
pressed and is dialled back as above. The customer turns on in-call transfer for the
extension Yappr registers as, with RFC 2833 DTMF, and tells you which code their system uses.

- **Fallback:** if the phone system hasn't ended Yappr's side within about 12 seconds of the
  code, the usual dial-back runs. A code that can't be pressed is never saved (`field_invalid`).
- **Attended codes:** `register.pbx_feature_code_hangup_after_secs: 4` (1–10, only with a code;
  the dashboard switch "My phone system completes the transfer when the agent hangs up" sets
  4). For a code that starts an attended transfer (the caller goes on hold, Yappr's leg is
  connected to the extension, and the phone system completes the transfer only when that leg
  hangs up): Yappr hangs up this many seconds after the code (once its keys have played), and
  until then the agent is off the line (silent, not listening). That hang-up is the hand-off
  and is recorded like the phone system's own, even when the end of the leg is reported late
  or not at all (Yappr hangs up once more; an attended code never records
  `FEATURE_CODE_NOT_TAKEN`). **No fallback dial-back**, so test it once.
- **Events:** nothing is recorded when the code is sent. When the phone system ends Yappr's
  side in time (or Yappr hangs up after an attended code), `transfer_started` with `method`
  `"pbx_feature_code"` is recorded at that moment and the call ends there, marked
  transferred, with no `transfer_answered` (Yappr can't see the pickup). Otherwise exactly one
  of: the leg is still up, so the dial-back runs and records the only `transfer_started`
  (`method` `"extension_dialback"`, `fallback_from` `"pbx_feature_code"`); the call ended in a
  way that can't be the phone system (sooner than the keys take to play, after the carrier
  refused them, or from Yappr's side), an ordinary end with `transfer_failed` `CALL_ENDED` and
  no `transfer_started`; the agent's session ended during the wait, so Yappr hangs up and
  records `transfer_failed` `FEATURE_CODE_NOT_TAKEN` (disconnect reason "Transfer failed"). A
  caller who hangs up a few seconds into the wait can't be told apart from the hand-off and
  is recorded as transferred.
- **A transfer with its own code:** a workflow transfer tool may carry `transfer_method`
  `"pbx_feature_code"` with its own `pbx_feature_code` (and hang-up time), used instead of the
  endpoint's, as a pair (see **A transfer tool's own transfer code** under Tools). Only for a transfer that
  needs a different code; there is no per-transfer switch that turns the endpoint's code off.
- **Test it with one call:** ask the agent for the transfer and read the call's events. A
  `fallback_from` means the phone system didn't take the code (off for the extension, a
  different code, or key presses don't reach it).

---

### A transfer to a SIP address

A transfer destination (a workflow agent's transfer tool, under Tools; an agent still on the
previous engine has its transfer tool or a flow `transfer` node) holds either an international number or a SIP address (`sip:` or `sips:`,
form `sip:user@host[:port]`, for example `sip:reception@pbx.example.com`; at most 256
characters, user part required, no password and no `?headers`). On a call that arrived over
a username-and-password trunk (`auth_mode: "credentials"`), a SIP address asks the caller's
own phone system to place the new call (SIP REFER) instead of Yappr dialling. On an
extension call no REFER is sent: Yappr places a new call through the extension (see
**Register as an extension**). A call that arrived on a SIP-address-only endpoint
(`auth_mode: "uri"`) is not a trunk call, so a SIP-address destination there gets
`REFER_ONLY_ON_SIP_TRUNK` and the agent keeps helping. A phone number on a trunk call gets
`UNAVAILABLE_ON_SIP_TRUNK` (a trunk or extension call cannot dial out), and the agent keeps
helping then too.

The customer's phone system must accept REFER, be able to reach the address, and have the
new call answered within about nine seconds. **If the transfer fails the call ends**: the caller is no longer with
the agent, so the agent cannot take them back. Test the address first, with a call through
the trunk.

A hand-off to a SIP address records `transfer_started` (`method` `"sip_refer"`,
`destination` the address with any password and any `?` headers removed; the extension
before the `@` stays) together with `transfer_answered`, and only once the customer's phone
system confirms that it took the call over. Yappr is then out of the call: billing ends at
the hand-off, and the seconds the phone system then takes to place the call are not billed;
there is no second, human segment. The call itself ends `completed` (never `transferred`),
with `transferred_at` and `transfer_target` (the same address) set. The events are in the `events` timeline of `GET /calls/:id`; `transferred_at` and `transfer_target` are fields of the call.

A transfer that never started is a `transfer_failed` call event whose `data.error_code`
is, among other codes, `NO_DESTINATION` (no phone number or SIP address configured), `INVALID_DESTINATION` (not
a valid phone number or SIP address), `UNAVAILABLE_ON_SIP_TRUNK` or
`REFER_ONLY_ON_SIP_TRUNK` (as above); with these the caller stays with the agent. `NOT_CONNECTED`
comes later: the hand-off was accepted but nobody answered (busy, rejected or rang out),
so a call can carry `transfer_started` and then `transfer_failed`; on an extension call
(a dial-back) that failure ends the call. A hand-off to a SIP address can also fail once
the request has gone out, with `error_code` `REFER_FAILED` or `REFER_NO_RESULT`, and then
the call ends. `REFER_FAILED`: the phone system reported a failure; the call ends a fraction
of a second later, with `disconnect_reason` "Transfer refused by the phone system".
`REFER_NO_RESULT`: nothing came back in time (the phone system refused or ignored the
request, or the new call was not answered within about nine seconds); the call ends about
nine seconds after the request, with `disconnect_reason` "Transfer failed".

---

### Customer phone-system settings (credentials)

| Setting | Value |
|---|---|
| SIP server | `sip_connection.server`, or the entry of `alternate_servers` closest to the customer's system. All of them take the same credentials, so another one is the backup route |
| Realm (if asked) | The server name used |
| Transport | TLS 5061 (recommended; TLS 1.2/1.3), TCP 5060, UDP 5060 |
| Username / password | `sip_username` / `sip_password` |
| Registration and keep-alives | **Recommended.** Over TLS/TCP: register the trunk, or send keep-alives (SIP `OPTIONS` every ≤ 30 s, e.g. Asterisk `qualify_frequency`, FreeSWITCH gateway `ping`, Grandstream heartbeat); either keeps the connection open. Over UDP behind NAT or a firewall: `OPTIONS` every ≤ 30 s even if the system registers (a registration refreshes only every few minutes, too seldom to hold a UDP path). Otherwise the agent's hang-up (BYE) may not reach the system, and the caller sits on a silent line until they hang up. Check with a test call of ≥ 2 min that the agent ends (a shorter one passes even with no keep-alives) |
| Codecs | G.711 µ-law or A-law first (the agent's audio is G.711, so no conversion). G.722, G.729 and Opus also work; G.729 costs some sound quality |
| SRTP | Off, or mandatory (RTP/SAVP). Never optional/best effort: the call fails with `488` |
| Number dialled | Any number or extension. Every call reaches the endpoint's agent (a Yappr number dialled too, not that number's agent); nothing is passed on to the phone network. What was dialled is recorded as the number called (letters, digits and `+ * # . _ -` only, up to 64), shown in the dashboard's call log; the API's `to` is `null` for every call on a SIP endpoint. If nothing is left, or it contains the trunk username, it is recorded as `sip-trunk` |
| Transfers | A transfer to a phone number isn't available on trunk calls: nothing is dialled, the caller stays on the call, and the call's events get `transfer_failed` with `error_code` `UNAVAILABLE_ON_SIP_TRUNK`. A transfer to a SIP address of your phone system (`sip:extension@pbx.example.com`) works: your system must accept SIP REFER and have the new call answered within about nine seconds, and if it fails the call ends. Calls that may need a person outside your system go to a Yappr number instead |
| Caller ID | The caller's number in `From` or `P-Asserted-Identity` (PAI wins). If the system sends only the trunk username as the `From` user (a common default), Yappr records the call with no caller number: the API's `from` is `null`, and the dashboard's call log shows "Unknown caller" |
| Simultaneous calls | Set the trunk's channel limit in the customer's system to `max_concurrent_calls` (2 by default, at most 8) |
| No-answer timeout | ~20 s with failover to the next route |
| Same system/IP also uses another trunk at the same carrier, or a shared-IP cloud sender (Twilio, SignalWire, Genesys Cloud) | Send `sip_username` in a header (the header name is on the SIP trunks page of the Yappr docs, docs.goyappr.com/concepts/sip-trunks), or put the username in the `Contact` user part. Plivo, Sinch and Infobip share addresses but document no way to do either: a call could be matched to the wrong trunk, so test the route with Yappr support before real calls |
| TLS trust store (systems that need uploaded roots, e.g. 3CX) | DigiCert Global Root G2 **and** the self-signed ISRG Root X1 (letsencrypt.org/certificates; not a cross-signed copy) |
| Firewall | Allow SIP to and from the server's addresses (the agent's hang-up comes from them), and RTP to and from the carrier's media networks (UDP 16384–32768 on the carrier's side). Ask Yappr support for the current address lists |
| Emergency numbers | Keep them on the customer's regular lines, off every route to the trunk: the carrier never hands those calls to Yappr, so no agent answers them, and Yappr can't say whether they reach emergency services |

**What the customer's system hears:** `200 OK` answered · `403` wrong
username/password or deleted trunk (never reaches Yappr) · `480` the call rang
~20 s and the agent couldn't be connected, or Yappr's usual refusal couldn't be
sent (retry or next route) · `486` trunk
`max_concurrent_calls` (2 by default) or Yappr capacity reached · `488` SRTP offered
as optional · `603` trunk or agent switched off, the agent's workflow never published, outside inbound calling hours (when switched on), out of credit, or
Yappr could not take the call.

**Platforms that can use a trunk** (documented digest auth): 3CX v20 self-hosted
(Generic VoIP Provider template; not 3CX SMB or 3CX-hosted), FreePBX / Asterisk,
FreeSWITCH / FusionPBX, VICIdial, Issabel, Yeastar, Grandstream UCM, Avaya IP
Office, Xorcom CompletePBX, Cisco CUBE, AudioCodes Mediant, Ribbon SBC, Oracle SBC,
Twilio Programmable Voice (`<Dial><Sip username="..." password="...">`),
SignalWire, Genesys Cloud BYOC Cloud; Plivo, Sinch Elastic SIP Trunking and Infobip
(TLS only) too, but test those with Yappr support first (shared sending addresses,
and no documented way to send that header).

**Cannot** (they can't answer a password challenge on calls they send): Twilio
Elastic SIP Trunking origination (use Twilio Programmable Voice instead), Vonage,
Bandwidth, Five9, Amazon Connect, RingCentral, Zendesk Talk. Calls routed by the
carrier-side call routing (call control, forwarding) can't sign in to a
trunk either: use a `uri` endpoint for those. Microsoft Teams Direct
Routing and Zoom Phone only through the customer's own SBC. Anything else: add the
trunk on the customer's PBX, forward calls to a Yappr phone number, or (if it can
dial a plain SIP address) use a `uri` endpoint.

---

## Carrier Accounts (the customer's own Telnyx account)

Let agents call **from**, and answer calls **to**, the numbers the customer already owns
at Telnyx — nothing ported, no Yappr number bought. Yappr places and answers each call on
a Call Control App in the customer's own Telnyx account, with an API key they gave Yappr,
so **Telnyx bills their account**
for the phone minutes and its own fees (call control, media streaming, recording, noise
suppression). **Yappr bills the agent minutes** at its Phone calls price — the same as a
call from a number bought from Yappr, not lowered for the phone minutes Telnyx bills them.
A call with a Palestinian Authority number at either end, which pays a premium price on a
number bought from Yappr, pays the plain Phone calls price here. The agent,
the recording, the transcript and the webhooks are the same as on any other call, and
the recording is copied into Yappr when the call ends.

**The account is the connection; the numbers are ordinary numbers.** Once the Call Control
App is chosen, Yappr **syncs**: it reads every number in the customer's Telnyx account and
adds each one to `GET /phone-numbers` as an `external` number. There is nothing to add one
by one. Calls out from them work at once. Calls *to* one keep going where they go in
Telnyx until it is **configured** — one setting in their Telnyx account (the number's
connection) moves to the account's app, after the customer reads what changes — and then
its inbound agent answers. `DELETE …/configure` ("Stop answering here") puts it back.
An inbound agent on these numbers is no longer refused (`INBOUND_NOT_AVAILABLE_ON_EXTERNAL_NUMBER` is retired).

**A number is in Yappr once.** When several workspaces connect the same Telnyx account (an
agency, several brands), a number one of them already holds is never taken over: the sync
counts it in `held_elsewhere` and the dashboard shows it as in use by another workspace. It
is added to the next workspace that syncs after the holder removes it (Remove from this
workspace, which keeps the holder's call history); the holder's own syncs then skip it.

**Available to every workspace.** There is nothing to switch on: any workspace can
connect its Telnyx account from the dashboard (**Phone numbers → Your carrier**) or
through the routes below. Yappr can switch the feature off for one workspace in an
emergency; that workspace's routes then answer `403 CARRIER_ACCOUNTS_NOT_ENABLED` (body
`{error, code, enabled: false}`) and nothing is sent to Telnyx — contact Yappr support.

**Scopes:** `carrier_accounts:read` (every `GET` but `/carrier-accounts/status`, which any
key reads) and `carrier_accounts:manage` (every other method — `test` included, because it uses the customer's Telnyx key). Every
workspace can grant them, but they are opt-in: no existing key was given them and a new
key does not start with them, so tick the **Your carrier (Telnyx)** scope group in
Settings → API keys. A key without the route's scope gets `403 INSUFFICIENT_SCOPE` naming
the scope — the same status as the emergency switch-off, so branch on `code`. In
the dashboard, only owners and admins can change a carrier account.

| Method | Path | What it does | Daily limit |
|---|---|---|---|
| GET | `/carrier-accounts/status` | `{"enabled": true}` — or `403 CARRIER_ACCOUNTS_NOT_ENABLED` on a workspace Yappr switched off. Needs no scope: any valid key for the workspace reads it, Read-only included; a key limited to some agents is `403 API_KEY_AGENT_SCOPED` (carrier accounts belong to the whole workspace) | — |
| GET | `/carrier-accounts` | `{ "data": [account] }`, numbers expanded, never `webhook_url` | — |
| POST | `/carrier-accounts` | Connect a Telnyx account | 10 |
| GET | `/carrier-accounts/{id}` | `{ "data": account }` — one account; `numbers` is the account's numbers now (a removed number is not in it, but its calls keep `carrier_account` and `carrier_call_id`); `webhook_url` only for a `manage` key | — |
| PATCH | `/carrier-accounts/{id}` | Rename, replace the API key or the public key | 20 |
| DELETE | `/carrier-accounts/{id}` | Disconnect (`?restore_routing=true` first puts configured numbers back) | — |
| POST | `/carrier-accounts/{id}/connection` | Create or choose the Call Control App, then sync | 10 |
| POST | `/carrier-accounts/{id}/sync` | Bring every number in the Telnyx account in. Changes nothing in Telnyx | 48 sync runs (continuing a run is free) |
| POST | `/carrier-accounts/{id}/test` | Check everything, then sync. Places no call | 60 |
| POST | `/carrier-accounts/{id}/reactivate` | Test, then lift a pause | shares `test`'s 60 |
| POST | `/carrier-accounts/{id}/numbers/{phone_number_id}/configure` | Answer the number's calls in Yappr (moves its Telnyx connection) | 200 |
| DELETE | `/carrier-accounts/{id}/numbers/{phone_number_id}/configure` | Stop answering here (puts the connection back) | — |
| DELETE | `/carrier-accounts/{id}/numbers/{phone_number_id}` | Remove from this workspace: any number of the account, its history kept; nothing changes in Telnyx, and this workspace's syncs skip it until Add back | — |
| POST | `/carrier-accounts/{id}/numbers` | Add back: a number this workspace removed (sync lists it in `excluded`), or one it still has as `removed` / `telnyx_gone` (taken back in place, `200`). Sync brings every other number in | 50 |

Limits are per workspace per day; over one is `429 RATE_LIMITED`. On any route,
`503 TELNYX_UNAVAILABLE` means Telnyx did not answer and nothing changed (retry in a
minute), `422 TELNYX_REFUSED_REQUEST` means Telnyx accepted the key but refused that
request (a permission on the key — the account does **not** pause; only a refused key
does), and an id not in this workspace is `404 CARRIER_ACCOUNT_NOT_FOUND`.

**No bulk restore on the public API.** Putting every configured number of an account back
at once, without disconnecting, is kept for emergencies: only Yappr or the workspace owner
can put every number back at once. Admins and other members never can, and no API key can
(the customer asks Yappr support). To hand every number back yourself, call
`DELETE …/numbers/{phone_number_id}/configure` on each, or
`DELETE /carrier-accounts/{id}?restore_routing=true`, which also disconnects.

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
  "last_synced_at": "ISO8601 | null",
  "last_sync_error": "string | null",
  "sync": { "in_progress": false, "run_started_at": "ISO8601", "completed_at": "ISO8601 | null", "seen": 42, "added": 0, "updated": 1, "removed": 0, "not_ready": 0, "held_elsewhere": 0, "held_elsewhere_numbers": [], "held_elsewhere_details": [], "excluded": [] } | null,
  "numbers": [ /* phone-number objects, provider "external", each with carrier_state */ ],
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
  `carrier_account: { id, name, provider, status }`, `ownership_verified_at` — when
  the customer's key last proved it is an active number in their account; `null` means
  Telnyx no longer lists it as active, and it cannot call (a sync that finds it active again
  switches it back on unless it is `off_by_owner`; see `carrier_state.notes`) —
  and `carrier_state` (see **GET /phone-numbers**).
- `last_synced_at`, `sync` and `last_sync_error` are the last sync: when it finished, what
  it found (`in_progress: true` while a large account is still being read in parts; the
  counts are the run's so far), and why it failed — `key_rejected`,
  `telnyx_refused_request`, `too_many_numbers`, `telnyx_unavailable` or `sync_failed`
  (`null` when it worked). A failed sync changes no number.

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

Disconnect. The saved key is deleted and the account's numbers stop working in the
workspace; their call history stays, and nothing changes to the numbers in Telnyx. If
Yappr created the Call Control App, it is deleted from the customer's Telnyx account too
(best effort). The API key is never touched: the customer deletes it in Telnyx. The numbers
no longer have to be removed first (`CARRIER_ACCOUNT_HAS_NUMBERS` is retired).

**The numbers:** one nothing points at is deleted. One with history (a past call, a campaign,
a charge) is kept so the history stays — switched off, `carrier_state.state: "removed"`,
`carrier_account.status: "disconnected"`, reading "Removed from this workspace" (it may
still be in the customer's Telnyx account). Connecting the account again brings back the
ones Telnyx still lists: an `off_until_active` one is switched back on once Telnyx lists it
as active; one an owner or admin had switched off keeps `off_by_owner` and comes back
switched off until an owner or admin switches it on. Add back with a connected account's `id`
also takes a kept number back in place once that account's Telnyx lists it.
Another workspace on the same Telnyx account gets one only after
`DELETE /carrier-accounts/{id}/numbers/{phone_number_id}` (with this account's id).

**Scopes:** `carrier_accounts:manage`

| Query | Notes |
|---|---|
| `restore_routing=true` | First puts configured numbers back on the connection each was on (Stop answering here on each, up to 50 per call), then disconnects. The answer carries `restore: {ok, restored: [{id, number, changed}], failed: [{id, number, code}], remaining}`. Campaigns and live calls are checked first: if either stops the disconnect, no number is moved |

**Response:** `200` `{ "success": true, "id": "uuid", "telnyx_connection_deleted": true | false | null, "restore"? }`
(`null` when the app was not Yappr's to delete). If a number could not be put back
(`restore.failed[].code`: `PREVIOUS_ROUTING_GONE`, `RESTORE_NOT_APPLIED`, `TELNYX_KEY_REJECTED`…) or
`restore.remaining > 0`, nothing is disconnected: the answer is
`409 CARRIER_ACCOUNT_HAS_CONFIGURED_NUMBERS` with the same `restore` — fix the failed ones
in Telnyx, or call again while `remaining` is above 0.

| Status | Code | When |
|---|---|---|
| 409 | `CARRIER_ACCOUNT_HAS_CONFIGURED_NUMBERS` | Numbers still answer in Yappr. Send `?restore_routing=true`, or stop answering on each first — otherwise their callers would reach nobody. With `restore_routing`, read `restore` (above) |
| 409 | `CARRIER_NUMBERS_USED_BY_CAMPAIGNS` | A campaign calls from one of the numbers. Give it another number, or delete it, first |
| 409 | `CARRIER_ACCOUNT_HAS_LIVE_CALLS` | A call on the account is in progress. Retry when it ends |

### POST /carrier-accounts/{id}/connection

Every call from the account's numbers goes through one Call Control App in the
customer's Telnyx account. Send **exactly one** of:

- `{"create": {"outbound_voice_profile_id": "PROFILE_ID"}}` — the default. Yappr creates
  an app named "Yappr" on that profile, with its webhook set. Pick a profile
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

**Response:** `200` `{ "data": account, "sync": { … } | null, "sync_error": { "code", "error" } }` with
`connection` set. Yappr syncs the account's numbers right after (see **POST
/carrier-accounts/{id}/sync**); when that could not run, `sync` is `null` and `sync_error`
says why — the app stays chosen, and a later sync fills the numbers in. The app cannot be swapped afterwards:
`409 CONNECTION_ALREADY_CONNECTED` — disconnect (with `?restore_routing=true` if numbers
are configured) and connect again.

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

### POST /carrier-accounts/{id}/sync

Reads every number in the customer's Telnyx account with their key and brings each one in
as an `external` phone number. **Changes nothing in Telnyx, places no call.** Yappr runs it
on `connection`, `test` and `reactivate`, and once a day; call it after the customer buys,
ports or releases numbers in Telnyx. A workspace has 48 sync runs a day, whatever starts
them; continuing a run already in progress (`complete: false`) is free.

**Scopes:** `carrier_accounts:manage`

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts/ACCOUNT_ID/sync" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.data | {complete, seen, added, removed, not_ready, held_elsewhere}'
```

**Response:** `200` `{ "data": { "synced_at", "complete", "seen", "added", "updated", "removed", "not_ready", "held_elsewhere", "held_elsewhere_numbers", "held_elsewhere_details": [ { "phone_number", "reason" } ], "excluded": [ { "phone_number", "telnyx_number_id" } ], "batch": { counts }, "run": { counts }, "numbers": [ phone_number ] } }` (`synced_at` is `null` while `complete` is `false`)

- **New numbers** can call out at once if Telnyx lists them as active and the account is
  not paused (otherwise they come in with `is_active: false`), and read
  `carrier_state.state: "not_configured"` (or `"not_ready"`).
- **Numbers already here:** only what Telnyx says is refreshed (`carrier_state`). Name and
  agents are never touched. The sync switches a number off when Telnyx stops listing it as
  active or it leaves the account (`off_until_active`), and back on once Telnyx lists it as
  active again — only one it switched off itself: an `off_by_owner` number stays off, and an
  `off_while_paused` one waits for `reactivate`. Any active number can be configured and
  answered, on or off.
- **Statuses:** deleted, ported-out, purchase-failed and port-failed numbers are skipped;
  any other status than `active` is `not_ready`.
- **Gone from Telnyx:** reads `telnyx_gone` ("No longer in your Telnyx account"), never deleted (history
  stays); counted in the summary's `removed`, and only at the end
  of a whole read. On an account read in parts, only when two complete reads in a row miss
  it (a read during which Telnyx's list changed removes nothing), so it can take a second
  complete sync. A number that comes back is un-removed and switched back on (unless it is
  `off_by_owner`, or the account is paused).
- **Held by another workspace:** not added, counted in `held_elsewhere` and listed in
  `held_elsewhere_numbers` (up to 100; it never says which workspace). It is added by the
  first sync after that workspace removes it (Remove from this workspace,
  `DELETE …/numbers/{phone_number_id}`, which keeps its call history there); that
  workspace's own syncs then skip it. `held_elsewhere_details` (`{phone_number, reason}`:
  the `held_elsewhere_numbers`, then the `excluded` ones) says why each kept-out number is
  not here — show the customer the right words:
  - `other_workspace` — another workspace uses it: "In use by another workspace". It comes here after that workspace removes it.
  - `own_removed` — this workspace removed it: "Removed from this workspace", with Add back (below), until another workspace takes it.
  - `pending_release` — another record holds it until it lets it go: a workspace that disconnected the account and keeps it for its call history, another connection of this workspace, or a number Yappr itself holds. It comes here once that record lets it go; nothing to do on this side.
- **Removed from this workspace by the customer:** skipped by every sync of this workspace
  and listed in `excluded` (`{phone_number, telnyx_number_id}`, up to 100). The dashboard
  shows them as "Removed from this workspace" with **Add back**, which is
  `POST /carrier-accounts/{id}/numbers {"number": …}`; from then on the syncs keep it up
  to date again. Once another workspace on the same Telnyx account takes the number (at its
  next sync), Add back answers `409 NUMBER_ALREADY_REGISTERED` until that workspace removes
  it, and the number stays in `excluded` here: tell the customer, never promise it back.
  A number Telnyx lists under a new id (it left and came back) syncs as usual.
- **Large accounts** are read in parts: `complete: false` means sync again, or let Yappr
  read the next part within 5 minutes. More than 10,000 numbers is `422 TOO_MANY_NUMBERS`.
  `run` has every count of the run so far and `batch` those of the last part, including
  `missing`, `dropped`, `skipped_stale`, `invalid` and `excluded`.

| Status | Code | When |
|---|---|---|
| 409 | `CONNECTION_REQUIRED` | No Call Control App chosen yet |
| 422 | `TELNYX_KEY_REJECTED` | Telnyx refused the key. The account pauses (`key_rejected`); no number changes |
| 422 | `TELNYX_REFUSED_REQUEST` | Telnyx accepted the key but refused the listing (a permission). The account does not pause |
| 422 | `TOO_MANY_NUMBERS` | More than 10,000 numbers in the account |
| 429 | `RATE_LIMITED` | 48 sync runs in the workspace today (continuing a run already in progress is free) |
| 503 | `TELNYX_UNAVAILABLE` | Telnyx did not answer. No number changed; `last_sync_error` says so |
| 503 | `SYNC_NOT_READY` | Yappr has not switched number syncing on yet. Nothing changed; retry later. `connection`, `test` and `reactivate` still work and report it in `sync_error` |

### POST /carrier-accounts/{id}/numbers/{phone_number_id}/configure

Answer the number's calls in Yappr. In the customer's Telnyx account, **one setting
changes**: the number's connection moves from where its calls go today to the account's
Call Control App. Yappr checks the number with Telnyx first, makes the change, reads it
back, and remembers the connection it replaced (`carrier_state.previous_connection_name`)
for Stop answering here. Idempotent: on a configured number nothing is sent to Telnyx.

**Scopes:** `carrier_accounts:manage` (in the dashboard: owners and admins)

**Ask first, then show the customer what changes before you send `confirm: true`** — the
dashboard does the same and waits for a click. Send the request once **without** `confirm`
(an empty body): nothing changes, and the answer is `400 CONFIRM_REQUIRED` with `warnings`,
read live from the customer's Telnyx account (voicemail included; if Telnyx does not answer,
the last sync's settings, without voicemail), and `current_connection_name`, where the
number's calls go today. `current_connection_name: null` means no connection **or** already
on Yappr's app: tell them apart by the number's `carrier_state.state` (`ready` is on Yappr's
app), never by the missing name:

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts/ACCOUNT_ID/numbers/PHONE_NUMBER_ID/configure" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '{code, warnings, current_connection_name}'
```

`warnings` can hold `connection_change` (its calls stop reaching `current_connection_name`;
absent when the number is on no connection or already on the app), `number_recording`,
`forwarding_on_failure`, `call_screening` and `voicemail`. Tell the customer:

- Calls to the number stop reaching `carrier_state.current_connection_name` (their office
  system, their PBX…). The number's inbound agent answers instead; **until it has one,
  callers are turned away.**
- Calls to it are then handled like calls to a Yappr number — credit, call time windows
  and Yappr's capacity apply — and a call Yappr turns away does **not** go on to the old
  connection. Suggest a second number first before moving a main business line.
- Unchanged: messaging, emergency address, caller name (CNAM), tags, calls out from their
  own phone system, and the number's own Telnyx settings. Telnyx bills these calls; Yappr
  bills agent minutes.

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts/ACCOUNT_ID/numbers/PHONE_NUMBER_ID/configure" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}' | jq '{state: .data.carrier_state.state, warnings}'
```

**Response:** `200` `{ "data": phone_number, "changed": true, "warnings": [ … ] }` —
`carrier_state.state: "ready"` (`"paused"` while the account is paused because Telnyx
refused calls, which does not stop configuring); `changed: false` when it was already on
the app (nothing sent to Telnyx). `warnings` is the ask-first list read again as the change
was made: `connection_change` when the number moved, and the Telnyx settings Yappr left on —
`number_recording` (Telnyx records these calls too — each call recorded and billed twice;
tell the customer they can turn it off in Telnyx), `forwarding_on_failure`, `voicemail`,
`call_screening`. All but `voicemail` also show in the number's `carrier_state.notes`.

| Status | Code | When |
|---|---|---|
| 400 | `CONFIRM_REQUIRED` | The body is not `{"confirm": true}`: nothing changed. The ask-first answer, with `warnings` (read live from Telnyx) and `current_connection_name` |
| 404 | `NUMBER_NOT_FOUND` | Not a number of this account |
| 409 | `CONNECTION_REQUIRED` | No Call Control App chosen yet |
| 409 | `NUMBER_REMOVED_FROM_TELNYX` | Telnyx no longer lists it |
| 409 | `NUMBER_NOT_READY` | Its Telnyx status is not `active` (a port pending…) |
| 409 | `CARRIER_ACCOUNT_PAUSED` | Paused for a refused key or a missing app — fix and `reactivate` first. A `carrier_rejections` pause does not block this |
| 409 | `NUMBER_ON_YAPPR_PLATFORM` | The number is on a connection Yappr itself uses; Yappr does not move it |
| 409 | `VOICE_NOT_READY` | Yappr cannot answer calls on carrier numbers right now (for example during an update). Nothing changed; retry in a few minutes |
| 422 | `NUMBER_FORWARDS_ALL_CALLS` | Telnyx forwards every call elsewhere. Turn forwarding off in Telnyx, sync, retry |
| 422 | `NUMBER_HAS_TRANSLATED_NUMBER` | Telnyx delivers its calls as another number. Remove it in Telnyx, sync, retry |
| 422 | `NUMBER_HAS_TECH_PREFIX` | Telnyx adds a tech prefix to the dialled number, so Yappr could not match it. Turn the tech prefix off for the number in Telnyx, sync, retry |
| 422 | `TELNYX_REFUSED_CHANGE` | Telnyx refused the change. Nothing changed |
| 422 | `TELNYX_REFUSED_REQUEST` | Telnyx accepted the key but refused to read or change the number (a permission). Nothing changed; no pause |
| 422 | `TELNYX_KEY_REJECTED` | The key is refused; the account pauses |
| 429 | `RATE_LIMITED` | 200 configured in the workspace today |
| 502 | `CONFIGURE_NOT_APPLIED` | Telnyx took the change but the number reads back on another connection. Check it in Telnyx (Numbers → My Numbers), retry |
| 503 | `TELNYX_UNAVAILABLE` | Telnyx did not answer |

The three blocker `422`s before any change match `carrier_state.state: "blocked"` with the reason in
`blockers` — read that first instead of trying.

### DELETE /carrier-accounts/{id}/numbers/{phone_number_id}/configure

"Stop answering here." Puts the number back on `carrier_state.previous_connection_name`,
or on no connection if it had none; its calls go where they went before. Agents stay
assigned, calls out keep working, and the number reads `not_configured` again. A number
whose connection was already moved off the app in Telnyx is recorded and left alone
(`changed: false`). Yappr reads the number back before recording the change.

**Scopes:** `carrier_accounts:manage`

**Response:** `200` `{ "data": phone_number, "changed": true | false }`

| Status | Code | When |
|---|---|---|
| 404 | `NUMBER_NOT_FOUND` | Not a number of this account |
| 409 | `CONNECTION_REQUIRED`, `NUMBER_REMOVED_FROM_TELNYX` | No app on the account, or Telnyx no longer lists the number |
| 409 | `PREVIOUS_ROUTING_GONE` | Telnyx refused to put it back — usually the old connection no longer exists. Its calls still reach Yappr: the customer picks a connection in Telnyx (Numbers → My Numbers), then sync |
| 422 | `TELNYX_KEY_REJECTED` | The key is refused. The customer changes the connection in Telnyx themselves, or fixes the key |
| 422 | `TELNYX_REFUSED_CHANGE`, `TELNYX_REFUSED_REQUEST` | Telnyx refused the change, or the request (a permission). Nothing changed |
| 502 | `RESTORE_NOT_APPLIED` | Telnyx accepted the change but the number still reads back on the app: its calls still reach Yappr. Nothing recorded; retry in a minute |
| 503 | `TELNYX_UNAVAILABLE` | Telnyx did not answer. Nothing changed |

### POST /carrier-accounts/{id}/numbers

**Add back.** A sync brings in every number in the account, so there is no need to add them
one by one. This route brings back a number the workspace took out with Remove from this
workspace (the sync lists those in `excluded` and skips them until one is added back here),
or one the workspace still has as removed (`carrier_state.state` `removed` after a
disconnect, or `telnyx_gone` once Telnyx lists it again). After it, the syncs keep it up to
date again. A number added here is the same as a synced one.

- **Still here as removed** (`removed` or `telnyx_gone`): taken back in place — `200` with
  the number, its call history, name and agents kept (a `friendly_name` or
  `outbound_agent_id` sent replaces them), switched back on unless an owner or
  admin had switched it off or the account is paused. Send a connected account's `id`: a
  kept number moves to it.
- **Removed with Remove from this workspace** (its row went): added again — `201`.
- **`409 NUMBER_ALREADY_REGISTERED` only for a number already live in Yappr** — in this
  workspace, or in another one (for example one that took it after this workspace removed
  it; it stays there until that workspace removes it). Never for a number this workspace
  still has as removed.

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
  from it): then the claim is switched off but kept, and the `409` stands until that
  workspace hands the number over with Remove from this workspace.
- A number added to a `paused` account starts switched off.

**Response:** `201` `{ "data": phone_number }` (`200` when a removed number was taken back in place) — `provider: "external"`,
`ownership_verified_at` set, `monthly_cost: null` (the number stays in, and is billed
by, the customer's Telnyx account).

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_NUMBER`, `INVALID_AGENT`, `INVALID_NAME`, `INVALID_JSON` | Fix the field `error` names (`INVALID_AGENT`: `outbound_agent_id` is not an id) |
| 404 | `AGENT_NOT_FOUND` | `outbound_agent_id` is not an agent in this workspace, naming the field |
| 409 | `CONNECTION_REQUIRED` | No Call Control App chosen yet |
| 409 | `NUMBER_ALREADY_REGISTERED` | Already live in Yappr: in this workspace, or held elsewhere (see above). Never for a number this workspace still has as removed |
| 422 | `NUMBER_NOT_IN_YOUR_TELNYX_ACCOUNT` | Telnyx does not list it as active in this account. Nothing was added |
| 422 | `TELNYX_KEY_REJECTED` | Telnyx refused the saved key |
| 503 | `OWNERSHIP_CHECK_UNAVAILABLE` | Telnyx did not answer while checking another holder. Nothing was added |

### DELETE /carrier-accounts/{id}/numbers/{phone_number_id}

"Remove from this workspace": takes any number of the account out of the workspace — one
Telnyx still lists, one a sync found gone (`telnyx_gone`), or one a disconnect kept for its
history (`removed`, its account `disconnected`).
Nothing changes in the customer's Telnyx account, and the number's past calls and charges
keep their records. From then on **this workspace's syncs skip the number**, so another
workspace connected to the same Telnyx account takes it at its next sync (how a shared
account hands a number over); it comes back here only with Add back
(`POST /carrier-accounts/{id}/numbers`) — until another workspace has taken it, after which
Add back answers `409 NUMBER_ALREADY_REGISTERED` — or as a new number if Telnyx lists it
under a new id after it left the account. A configured number goes back first (`DELETE …/configure`).
`NUMBER_STILL_IN_TELNYX` and `NUMBER_IN_USE` are retired: a live number, or one with history, is removed like any other.

**Scopes:** `carrier_accounts:manage`

**Response:** `200` `{ "success": true, "id": "uuid" }`

| Status | Code | When |
|---|---|---|
| 404 | `NUMBER_NOT_FOUND` | Not a number of this account in this workspace |
| 409 | `NUMBER_STILL_CONFIGURED` | It still answers calls here. Stop answering here (`DELETE …/configure`) first |
| 409 | `NUMBER_IN_CAMPAIGN` | A campaign that has not ended (a draft, scheduled, running or paused one) calls from it. Give the campaign another number, stop it (`POST /campaigns/{id}/stop`), or delete it (`DELETE /campaigns/{id}`), first |
| 409 | `NUMBER_ON_LIVE_CALL` | A call on it is in progress. Retry when it ends |

### POST /carrier-accounts/{id}/test

Checks the account, then syncs its numbers, and **places no call**.

**Scopes:** `carrier_accounts:manage`

**Response:** `200`

```json
{
  "ok": true,
  "checks": [
    { "name": "api_key", "ok": true, "detail": "Telnyx accepts the API key." },
    { "name": "connection", "ok": true, "detail": "The Call Control App is active and points at Yappr." },
    { "name": "outbound_voice_profile", "ok": true, "detail": "Calls may go to: IL, US." },
    { "name": "numbers", "ok": true, "detail": "42 number(s) are in this Telnyx account." }
  ],
  "telnyx": { "connections": [ … ], "outbound_voice_profiles": [ … ] },
  "sync": { "in_progress": false, "seen": 42, "added": 0, "updated": 1, "removed": 0, "not_ready": 0, "held_elsewhere": 0, "…": "…" },
  "numbers": [ { "id": "uuid", "number": "+972XXXXXXXXX", "verified": true } ]
}
```

- `connection` fails when no app is chosen, or the app is gone, switched off, or its
  webhook URL was changed. `outbound_voice_profile` fails when none is attached or it
  is switched off; when it passes, `detail` lists the countries it allows.
- **The `numbers` check is the sync.** `sync` says what it found; it is `null` when the
  key was refused, no app is chosen yet, or the sync failed (`sync_error: {code, error}`
  says why, and the check fails). A number Telnyx no longer lists reads `telnyx_gone` and
  cannot call; found again later, it is listed again and switched back on (unless it is
  `off_by_owner`, or the account is paused).
- `ok` ignores the `numbers` check: a lost number is simply uncallable.
- **A refused key pauses the account here too** (`key_rejected`), exactly as a refused
  dial does — `telnyx` is then `null`. A missing app is reported, not paused, by a test.

### POST /carrier-accounts/{id}/reactivate

"Turn back on". Runs the `test` (and so a sync) first; if every check but `numbers`
passes, it lifts the pause: `status` goes back to `untested`, the refusal count resets, and
calls to configured numbers are answered again. It switches back on only the numbers the
pause switched off (`carrier_state.notes`: `off_while_paused`); one Telnyx no longer lists
as active becomes `off_until_active` (the sync switches it on once Telnyx does). An
`off_by_owner` number stays off.

**Scopes:** `carrier_accounts:manage` (shares `test`'s daily limit)

**Response:** `200` `{ "data": account, "checks": [ … ], "sync": { … } | null, "sync_error"? }`. A failing test is
`422 CARRIER_TEST_FAILED` with the same `checks` — fix what they show in Telnyx, then
call it again.

### Status, and what pauses an account

| `status` | Meaning |
|---|---|
| `untested` | No call has been answered on the app since it was connected or turned back on |
| `active` | The last answered call ran on the app |
| `paused` | Every number on the account is switched off for calls out (`is_active: false`), so campaigns stop instead of burning through leads. `POST /calls` from one of them is `400 INVALID_FROM_NUMBER` |

**A pause and calls *to* configured numbers.** `carrier_rejections` stops calls out only —
configured numbers keep answering. `key_rejected` and `connection_invalid` stop those too:
Yappr cannot use the key or the app, so callers can't get through until the cause is fixed
and the account turned back on (or the customer moves the numbers to another connection in
Telnyx). Tell a customer with configured numbers to treat a key or app pause as urgent.

- **At once:** Telnyx refuses the **key** (a `401`, or its "authentication failed"
  error) on a dial, a command on a call, a sync or a test → `key_rejected`; or the dial
  names a **Call Control App that is gone** → `connection_invalid`.
- **Counted:** any other refusal — one bad destination, a country the outbound voice
  profile does not allow, a caller ID Telnyx will not present, a ringing call ended with
  SIP 401/403/407 — counts once. **Five in a row** pause the account with
  `carrier_rejections`; an answered call resets the count. A `403` on its own is never
  read as a refused key.
- **Not counted:** SIP 404/484/604 on a ringing call — that is the destination number,
  not the account.

Fix the cause in Telnyx (`pause_reason`, `last_error`), then call `reactivate`.

### Answering calls on these numbers

A configured number (`carrier_state.state: "ready"`) is answered like a number bought from
Yappr: its inbound agent (or `inbound_split`) takes the call, the call window, credit and
capacity checks apply, and the call is billed the same way. The call reads
`direction: "inbound"`, `provider: "external"` and carries the `carrier_account`, like a
carrier call out. A call Yappr turns away (no inbound agent, no credit, outside the call
window, at capacity) is declined — it does **not** fall back to the number's old
connection. A call that reaches the account's app for a number that is not in Yappr yet is
declined and the account asks for a sync.

### Calling from these numbers

There is no new call field: the `from` number decides the route. A number on a carrier
account that is not paused works everywhere a Yappr-bought number does for outbound —
`from` on `POST /calls`, a campaign's `from_phone_number_id`, or the number's own
`outbound_agent_id` (set when adding it, or with `PATCH /phone-numbers/:id`).

**When Telnyx refuses a call from one of these numbers.**

- **Before it rings** (Telnyx turns the dial down, refuses the key, or cannot find the
  app): the call is recorded `failed` and is not retried; its `disconnect_reason` says why.
  On a workflow agent `POST /calls` has already answered `202`, and the agent's
  `call.failed` follow-up (if it has one) runs with `call.status: "failed"` — the reason is
  not in its body. An agent not yet on the workflow engine keeps the old behaviour: placed
  right away, `POST /calls` answers **`422`** with the reason in `error` (and no `code`) —
  "Your Telnyx account refused this call…", or "Calls from this number are paused…" when
  the account paused — and **no webhook is sent**; accepted with `202`, or placed by a
  campaign, its `call.failed` webhook carries `data.error_reason` and no
  `data.hangup_cause`. A refusal by the customer's account is
  about the account, not the lead: the number called is never added to do-not-call.
- **While it rings:** the call ends `failed` (`disconnect_reason` says so) — Telnyx's
  verdict is `carrier_rejected` (SIP 401/403/407, counts toward the five) or
  `carrier_number_invalid` (SIP 404/484/604, does not count). Only an agent not yet on the
  workflow engine receives it, as `data.hangup_cause` on `call.failed`; a workflow agent's
  `call.failed` follow-up gets `call.status: "failed"` without it.

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
| `agent_id` | uuid | — | filter by agent; anything that is not a uuid is `400 CALLS_QUERY_INVALID`, and an agent that is not in this workspace is `404 AGENT_NOT_FOUND`, never an empty page. An archived agent still filters: its calls are still its calls |
| `search` | string | — | 2–100 characters: the start of a call id (8 hex characters or more, with dashes where an id has them — the 8 the dashboard shows are enough), a phone number at either end of the call (matched exactly, as `callee` / `caller` are), or part of an agent's or a live lead's name, case-insensitive, archived agents included. Digits that could be either an id or a number are searched both ways. A lead's name is searched only for a key with `leads:read`; for any other key a name matches agents alone, so a name only a lead carries finds no calls. More than 300 matching names is `400 CALLS_QUERY_INVALID` — send more of the name, or `agent_id` / `lead_id` |
| `lead_id` | uuid | — | Calls with that lead — the only way to find a browser call attached to a lead, which has no number at either end. A lead that is not live in this workspace (unknown, or deleted) is `404 NOT_FOUND` |
| `carrier_account_id` | uuid | — | Calls on that carrier account, in both directions: every call Telnyx signed for the account, every call placed from one of its numbers, and every inbound call answered on one — an inbound call on an `external` number counts. Needs `carrier_accounts:read` (without it, `403 INSUFFICIENT_SCOPE`); an account not in this workspace is `404 CARRIER_ACCOUNT_NOT_FOUND` |
| `provider` | `external` \| `telnyx` \| `none` | — | Only calls on that carrier, as each row's `provider` says: `external` (signed for a carrier account, or placed from one of its numbers), `telnyx` (a Yappr number or a SIP endpoint), `none` (browser calls, whose `provider` is `null`). No scope beyond `calls:read`. Anything else is `400 CALLS_QUERY_INVALID` |
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
| `updated_since` | ISO8601 | — | every call **changed** at or after this time, whatever its `created_at`. The filter an incremental sync wants; `from`/`to` are not. Any moment this API prints (`…+00:00`, an `updated_at`, a `revoked_at`) can be sent as it is: a `+` the query string turned into a space is read back as the `+` it was, on `from` and `to` too (URL-encoding it as `%2B` still works) |

An unrecognised `status`, `direction` or `source`, any parameter not in this table, an
`agent_id`, `lead_id` or `carrier_account_id` that is not a uuid, a `search` under 2 or over
100 characters, a `from`/`to`/`updated_since` that is not an ISO 8601
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
that never finishes still reaches a sync windowed on `updated_since`. It also moves when the
call's recording links are revoked (a new `recording_url`) and when its lead is deleted.
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
      "recording_started_at": "ISO8601 | null",
      "duration_seconds": 120,
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "tool_calls_count": 2,
      "ab_variant": "a" | "b" | null,
      "source": "test" | "shared_link" | "api" | "phone_inbound" | "phone_outbound" | "unknown",
      "provider": "external" | "telnyx" | null,
      "carrier_account": { "id": "uuid", "name": "string", "provider": "telnyx", "status": "untested" | "active" | "paused" } | null,
      "carrier_call_id": "string | null",
      "cost_cents": 12,
      "cost_status": "charged" | "not_charged" | "pending",
      "metadata": { "...": "your keys" },
      "analysis": { "status": "done" | "pending" | "skipped" | "failed", "reason": "string | null", "completed_at": "ISO8601 | null" },
      "recording_url": "string — left out, never null, when the call has none",
      "disposition": { "id": "uuid", "label": "string", "color": "#hex" },
      "lead": { "...full lead object with tags — {id} alone without leads:read..." }
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

**Slow reads:** a list that cannot be read inside its own budget (about 15 s) answers `503 {"code":"CALLS_LIST_TIMEOUT"}` with a `Retry-After` header (5). Nothing changed: wait that long and send the same request, or narrow it with `from`/`to` or a smaller `limit`. Every list answer carries a `Server-Timing` header with each step's milliseconds — quote it when reporting a slow read; do not parse the step names.

**Calls that were never placed:** an outgoing call reserved but not dialled is `status: "failed"` with a `disconnect_reason` starting `Not placed:` — e.g. `Not placed: queued to try again` (the request went back to the queue and is placed again under a new call id; do not re-send it), `Not placed: calling service unavailable`, `Not placed: number not in service`, `Not placed: refused by your phone system`. Show it as text; branch on `status`.


**The list row now carries the same `cost_cents`, `failure`, `source`, `shared_link_id`
and `analysis` that `GET /calls/:id` returns** — see that endpoint below for the full
semantics of each. All five (plus `recording_url`, `disposition`, `lead`,
`ab_variant` and `sip_endpoint_id`) are **omitted**, not `null`, on a row that has none — `analysis` is the
exception and is on every row. A month's spend or a failure report is this list summed,
not one `GET /calls/:id` per call; a sync can page this list and decide what to do with
each call — `analysis.status: "done"` means the values are ready on the detail read,
`"pending"` means come back later, `"skipped"`/`"failed"` mean nothing more is coming.
`updated_at` is on every row, and `GET /calls/:id` carries the same value.

The list carries no `transcript`; read that from `GET /calls/:id`.

**Times on the list and the export** follow the rules of `GET /calls/:id`: `started_at` is
never after `ended_at`, and `duration_seconds` is `null` on every call never answered. List
rows carry no `summary` and no `answered_at`.

**A call that arrived on a SIP endpoint** is `source: phone_inbound` with **`to: null`**
and carries **`sip_endpoint_id`**. Its `from` is whatever the customer's phone system
sent as the caller, which may not be a phone number, and `null` when the caller ID was
only a `credentials` trunk's own username. A `uri`
endpoint's URI is its credential, so neither this list, `GET /calls/:id` nor the export
returns it; what a trunk call dialled shows in the dashboard's call log instead. There
is no `sip_endpoint_id` filter; match on the field instead.

**Whose carrier the call ran on — `provider` and `carrier_account`**, on every call read
(this list and `GET /calls/:id`). `provider` speaks `GET /phone-numbers`' words:
`external` — placed or answered on the workspace's own Telnyx account (see **Carrier
Accounts**), which billed its phone minutes; `cost_cents` is Yappr's charge beside that. `telnyx` — Yappr's
carrier: a number bought from Yappr, a SIP endpoint, or a number removed since. `null` — a
browser call, which has no phone side. `carrier_account` is `{id, name, provider, status}`,
the four fields a number's `carrier_account` has, on an `external` call; it is `null` on any
other call and `null` for a key without `carrier_accounts:read` — `provider: "external"`
still says the call ran on the workspace's own account. An account removed since keeps its
`id`, with the other three fields `null`. Filter by account with `carrier_account_id`
(above).

**`carrier_call_id`** — on an `external` call only, absent on every other: the
`call_control_id` Telnyx gave the call on the workspace's own Telnyx account, to find it in
its Telnyx records. `null` when the dial never got one. Any key that reads the call reads
it, `carrier_accounts:read` or not. Yappr does not see the customer's Telnyx bill, so there
is no billed-minutes field.

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
not a page of it and not what changed since it last ran. `search`, `lead_id` and
`carrier_account_id` narrow the file exactly as they narrow the list, under the same scope
rules (a lead's name is searched only for a key with `leads:read`). A file answered for
`updated_since` would carry the whole `from`/`to` window while reading as everything that
changed. This is the dashboard's own **Export CSV**, addressable.

**Scopes:** `calls:read`

**Columns, in this fixed order:** `Started` (ISO 8601, `+00:00`), `Agent` (empty when the
call has no agent — match on empty, not on a translated word), `A/B`, `Direction`,
`Status` (`pending_connection` is a filter value here too), `Disposition`, `From`, `To`
(empty on a browser call; `To` is also empty on a call that arrived on a SIP endpoint),
`Duration` (whole seconds; empty where `duration_seconds` is `null` — a call that never
connected — and `0` only for a 0 s call), `Cost (USD)` (a bare decimal, see below), `Source`, `Shared link ID`
(only on a `shared_link` call), `Call ID` (the join key to `GET /calls/{id}`), `Lead name`
(empty when there is no lead, or it was deleted — and filled only for a key that also holds
`leads:read`: without it the column is empty on every row, and filtering by `lead_id` does
not bring the name back), `Summary`, `Cost status` (`charged`,
`not_charged`, `pending` — exactly `cost_status`), `Ended by` (exactly `ended_by`; empty
when nothing recorded it), `Agent ID` (pivot on this, not on `Agent`: two agents can share
a name), `Provider` (`external`, `telnyx`, or `none` on a browser call — never blank), `Carrier account`
(the account's name on an `external` call, for a key with `carrier_accounts:read`; empty
otherwise), `Carrier call ID` (`carrier_call_id`; empty on every other call) — the first 21
columns always come in this order — then one
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
`Content-Disposition`) carry the call count and their cost. `Content-Disposition` names the
file by its filters, then the window (`calls-agent-<first 8 of the id>-…`); a file filtered
by `carrier_account_id` is named `calls-carrier-<first 8 of the id>-…`, and one filtered by
`provider` `calls-provider-<provider>-…`. A window with only `from` runs to now and is named
to today (`calls-<from>_<today>.csv`); one with only `to` is `calls-until-<to>.csv`. The
export takes `provider` like the list. The file is the calls that existed the moment you
asked — one still streaming never lands half-written.

```bash
curl -L "https://api.goyappr.com/calls/export?agent_id=$AGENT_ID&from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z" \
  -H "Authorization: Bearer $YAPPR_API_KEY" -o september.csv
```

---

### GET /calls/:id

Get full details of a single call, including resolved lead and disposition objects.

**Scopes:** `calls:read`

**Query params:** the five execution-history ones (`execution_limit`, `execution_cursor`,
`execution_phase`, `execution_kind`, `execution_status` — see **`execution`** below) and
`omit`. `?omit=execution` reads the call without its `execution` block: the block is not
read at all, so the answer is faster and far smaller. Use it to poll a call until it
settles. `omit` takes one value, `execution`, sent once, and never beside an `execution_*`
parameter — each of those is `400 CALLS_QUERY_INVALID`.

**`execution_status`** (the response member — not the `execution_status` query parameter,
which filters history rows by their own status) says what `execution` is on this read:
`included` (the whole block), `omitted` (you sent `?omit=execution`), `pending` (the history
did not answer in time; read again for the block, or send `execution_limit` to be told `503`
instead) or `none` (no execution history, and no `execution` member). On `omitted` and
`pending`, `execution` is `{summary: {settlement, is_settled}, refresh_after_ms}` at the full
block's paths, worked out from the call: poll on it.

**Response:**
```json
{
  "id": "uuid",
  "agent_id": "uuid",
  "agent": { "id": "uuid", "name": "string", "archived_at": "ISO8601 | null" } | null,
  "from": "+972...",
  "to": "+972...",
  "direction": "inbound" | "outbound" | "web_call",
  "status": "pending_connection" | "ringing" | "in_progress" | "completed" | "failed" | "no_answer" | "transferred" | "dnc_blocked",
  "failure": { "code": "string", "reason": "string", "stage": "dialing|connecting|conversation|null", "at": "ISO8601 | null" },
  "started_at": "ISO8601",
  "answered_at": "ISO8601 | null",
  "recording_started_at": "ISO8601 | null",
  "ended_at": "ISO8601 | null",
  "duration_seconds": 0,
  "source": "test" | "shared_link" | "api" | "phone_inbound" | "phone_outbound" | "unknown",
  "shared_link_id": "uuid",
  "provider": "external" | "telnyx" | null,
  "carrier_account": { "id": "uuid", "name": "string", "provider": "telnyx", "status": "untested" | "active" | "paused" } | null,
  "carrier_call_id": "string | null",
  "cost_cents": 12,
  "cost_status": "charged" | "not_charged" | "pending",
  "updated_at": "ISO8601",
  "analysis": { "status": "pending" | "done" | "skipped" | "failed", "reason": "string | null", "completed_at": "ISO8601 | null" },
  "transcript": [ { "role": "agent|user", "text": "string", "start": 0, "end": 0 } ],  // start/end: ms from recording_started_at
  "usage": {
    "legs": [ { "engine": "gemini-live|gpt-live", "model": "string", "sessions": 1,
                "input_tokens": 41200, "output_tokens": 9100,
                "audio_input_tokens": 9200, "text_input_tokens": 32000, "audio_output_tokens": 9100,
                "cached_input_tokens": 28400, "audio_seconds": null,
                "backend_model": "string | null",
                "recorded_at": "ISO8601" } ]
  },
  "summary": "string | null",
  "extracted_data": { /* present only when extraction ran — see note below */ },
  "extracted_data_precision": { "<date parameter>": { "precision": "day" | "month" | "unknown", "month": "YYYY-MM | null", "approximate": true } },
  "extracted_data_ranges": { "<number parameter>": { "low": 6, "high": 7 } },
  "follow_ups": { "state": "waiting" | "skipped", "groups": [ { "reason": "string", "steps": ["string"] } ] },
  "recording_url": "string — left out, never null, when the call has none",
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
      "kind": "webhook_tool",   // prompt engine (a call from before the agent was converted)
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
      "kind": "tool_call",      // a workflow agent's tool (node = its step), or a retired flow tool_call node — this example is the flow shape
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

**`agent`** — the call's agent, read with the call, so its name stays readable after the
agent is archived (`GET /agents/:id` answers `404` for an archived agent). With
`agents:read` it is the full agent object (as a campaign embeds it) plus `archived_at`;
without it `{id, name, archived_at}`. `null` when `agent_id` is.

**`started_at` / `answered_at` / `ended_at`** — The call's three moments. `started_at` is
when it was placed — dialled, arrived at your number, or its browser session opened.
`answered_at` — on this read only — is when its audio came up: the person dialled picked up,
your number answered the caller, or the browser connected; `null` on a call that never got
that far. `ended_at` is when the caller or the agent left, or Yappr closed the call.
`duration_seconds` counts from about `answered_at` to the end and is what the call is billed
for; the time before `answered_at` is ringing (or, in a browser, connecting) and is never
billed. Every `message` row in `timeline` is dated `answered_at` + `offset_ms`.
`started_at` is never `null`: a browser session that was never opened reads its
`created_at`. `started_at` is never after `ended_at`. `duration_seconds` is `null` on every
call never answered (`no_answer`, blocked, or a `failure.stage` of `dialing`/`connecting`
with no `answered_at`) and a whole number, `0` included, on every answered call once it has
ended: an `answered_at` wins over the stage its `failure` names. Offer-path rehearsals have
no lead artifact.

**Timestamps** — every one on the call (its fields, every `timeline` row, `failure.at`,
`analysis.completed_at` and the `execution` block) is ISO 8601 in UTC written with a
`+00:00` offset. The number of fractional digits varies: parse it, don't compare strings.

**`updated_at`** — When this call last changed: the same field the list rows carry, so a
sync that pages `GET /calls?updated_since=` and then reads a call by id for its transcript
and analysis keeps the timestamp its loop windows on.

**`metadata`** — The metadata object you attached at `POST /calls` (or at a browser-session
mint). Empty object `{}` if none was provided. Internal bookkeeping is removed; the few
platform keys that stay are listed under **GET /calls** above.

**`lead`** — The lead the call was matched to, with its tags, for a key with `leads:read`.
A key without `leads:read` reads it as `{id}` alone — here and on `GET /calls` rows — and
`search` on `GET /calls` matches no lead names for it. The dashboard's **Standard** preset
has no `leads:read`: add **Read** under **Leads** with **Edit scopes**, or read
`GET /leads/{id}` with a key that holds it. `calls:read` returns personal data on its own —
transcripts, summaries, timeline text, recordings, both phone numbers, `extracted_data`,
delivery bodies; `leads:read` only decides whether `lead` is the full lead or `{id}`.

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
stored as a date would be a guess a CRM books (with `"approximate": true` when the month was
worked out from a length of time ago — "two and a half years ago" — rather than named;
`approximate` is on no other entry); `{"precision": "unknown", "month": null}`
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

**`provider` / `carrier_account` / `carrier_call_id`** — Whose carrier the phone side ran
on: `external` (the workspace's own Telnyx account), `telnyx` (Yappr's) or `null` (a browser
call), the account on an `external` call, and Telnyx's own id for that call — see
**GET /calls** above.

**`analysis`** — Where the call's post-call pass stands: `{ "status": "pending" | "done"
| "skipped" | "failed", "reason": <code|null>, "completed_at": <iso|null> }`, present on
**every** call, list rows included. `summary`, `disposition` and `extracted_data` are
written by that one pass and are **absent, not null**, until it lands — poll
`analysis.status`, never the absence of those keys. `pending` means come back; `done`
means read them (and `done` with no `extracted_data` is a real answer — the pass ran and
the call said none of it, which is what every call made before its parameters existed
will say); `skipped` means nothing is coming and nothing is wrong
(`call_too_short` — under 3 seconds — `call_did_not_complete`, `no_transcript`); `failed`
means nothing is coming and something is wrong (`analysis_failed`, `analysis_unavailable`,
`no_summary` — worth an alert). `done` always comes with a `summary`: a pass that came back
without one on every attempt reads `failed` / `no_summary`, keeps nothing it produced (no
`summary`, `disposition` or `extracted_data`) and runs no `analysis.ready` follow-up (no `call.analyzed`) — stop polling.
That state is recorded on the call, so its `updated_at` moved when it was and
`?updated_since=` returns it; the `analysis` entry of `execution.summary.artifacts` reads
`failed` / `no_summary` too. When a summary is rewritten later (a transcript repair),
`analysis.completed_at` is when that happened. A call handed to a human reads `pending` / `call_in_progress` until
that leg ends; the pass runs after. Expect the values within a minute or two of the call
ending; anything still `pending` after 10 minutes is stuck. Prefer a follow-up on
`analysis.ready` (an After trigger) to polling.

**`summary` language** — `summary` is written in the language the call was held in: read
off the conversation when it is clearly Hebrew or English, else the agent's `language`.
Older calls keep the summary they were given.

**`failure`** — Present only on a call whose `status` is `failed` or `no_answer`, and not
on one ended on purpose from outside it (`ended_by: "operator"` — `POST /calls/{id}/end`, a
web mint's `cancel_url`, an End button): its `ended_by` and `disconnect_reason` already say
why it stopped, and its timeline has no failed phase. A call that completed has **no**
`failure` member at all — check for the member, not for a value in it.

`failure.code` is stable and is what you branch on; `failure.reason` is one sentence for
a person and its wording changes. `failure.stage` is `dialing`, `connecting`,
`conversation` or `null`. `failure.at` is when the failure was recorded, or the call's
`ended_at` when it recorded no moment of its own.

Codes: `no_answer`, `busy`, `rejected`, `cancelled`, `unreachable` (all `dialing`);
`caller_left` — a browser call the caller closed, or navigated away from, before it
connected — `network_blocked` — a browser call the caller's own network never let
connect — `session_expired` — a browser session nobody opened before its token expired —
`voice_connection_failed` — a browser call the voice server refused to connect; the same
answer until the cause is fixed — `preparation_failed` — a dashboard rehearsal whose
before-call steps failed before any call existed — and `voice_unavailable` (all six
`connecting`); a browser session ended through the API
before such an end was recorded as the operator's reads `cancelled` at `connecting` with
`ended_by: "system"`; `call_interrupted` and `transfer_failed` (both
`conversation`); `unknown` when nothing recorded why. Treat a code you do not recognise
as `unknown` rather than as an error in your integration.

The same failure is in `timeline` as a `phase` row with `scope: "call"`,
`status: "failed"` and the same sentence in `error`.

The raw text the platform recorded internally is not returned anywhere on this endpoint —
not in `failure`, and not in `metadata` either, which stays only what you attached at
`POST /calls`. It is the carrier's own cause code, an exception's tail, or a provider's
error class, and it is ours, not yours to read.

**`recording_started_at`** — When the call's recording began, as the carrier stamped it (ISO 8601, `+00:00`). Every `transcript[].start` / `end` is milliseconds from here, so `recording_started_at + start` is when a line was said. It is NOT `started_at` (an outbound call is recorded from its answer, so counting from `started_at` puts every line early by the ring time) and it is within about 2 s of `answered_at`, either side. Set once the recording is saved, a few seconds after the call ends; `null` on a browser call (its recording starts once the browser has connected, shortly after `answered_at`), on a call with no recording yet, and on older calls recorded before the field was added. Also on every `GET /calls` row, and in the webhook `data` of an agent not yet on the workflow engine.

**No transcript during a call.** `transcript` is written once, after the call ends — polling `GET /calls/:id` while the call runs returns none, and no webhook or event carries the conversation live, on phone (inbound or outbound) or browser calls. To act on what a caller agrees to during the call (a callback time, a booking): give the agent an HTTP tool, bound to its conversation, that it must call before confirming (e.g. `scheduleCallback` with inputs `callbackConsent` = "yes" only on explicit agreement, and `callbackTime` ISO 8601 with offset) — the request carries the call under `call` (`call.call_id`, `call.call_metadata`), is sent once with no retry (dedupe on `call.call_id`), and your answer is what the agent says; add a `cancelCallback` tool for a caller who takes it back; then put the same two fields in the agent's `extraction_parameters` so the caller's FINAL answer arrives as the call's `extracted_data` and, in an `analysis.ready` follow-up, as `call.analysis.extracted_data`, and cancel when it is not "yes".

**`ended_by`** — Who ended the call. One of:

| Value | Meaning |
|-------|---------|
| `"caller"` | The far end went away first — the human on the line hung up, or the browser closed the connection (a browser test call's End button included). |
| `"agent"` | The agent chose to end the call: its end-call tool, the End step of its workflow, or its closing line followed by a hangup. |
| `"system"` | Yappr ended it — the silence timeout, the maximum-duration cap, an answering machine, a fault that took the call down, the watchdog, or a browser session that expired unused. |
| `"operator"` | Ended on purpose from outside the call: an End button that actually ended it (a dashboard **phone** test call's), `POST /calls/{id}/end` on a browser session nobody opened (or its mint's `cancel_url`), or Yappr stopping a call found still open after its conversation had ended. Only a deliberate action that ended the call writes it, with `disconnect_reason` `Ended by operator`, and such a call has no `failure`. |
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
`Transfer destination unreachable`, `Transfer never connected`,
`Transfer refused by the phone system` (a SIP-address hand-off the phone system refused),
`Transfer failed`. A handoff that did connect leaves the reason to the call's own ending. Also first-write-wins,
and `null` for short or atypical hangups.

**`cost_cents`** — What the call took out of your workspace's credits. Read it with
**`cost_status`**: `charged` (the recorded charge; final), `not_charged` (`0`, final — the
call failed, went unanswered, was blocked, or had no connected time; a call that ended
more than 24 hours ago with no charge recorded reads this too, because nothing came off the
balance and nothing will) or `pending` (`null` — still running, or ended less than 24 hours
ago with its charge not yet recorded; the only state worth polling). `null` never means
free, and `0` never means not settled yet. `usage`, below, is not a cost: it carries no
price. Totals across calls: `GET /billing/consumption`.

**`usage`** — *Present only when a reading exists.* What the call consumed on the voice model that ran it, reported by the provider itself. It carries no price: what the call cost you is `cost_cents`. One entry in `legs` per engine, summed across every provider session the call spanned — a call whose connection dropped and was rebuilt mid-call is still one entry carrying the whole call.

The two engines report in different units and the leg says which: a Gemini voice reports tokens split by modality (`audio_input_tokens`, `text_input_tokens`, `audio_output_tokens`, `cached_input_tokens`), a GPT voice reports seconds of live audio (`audio_seconds`, with the token fields `null`). Read whichever the leg has rather than assuming. `backend_model` is the reasoning model behind the voice, where the engine has one.

**No `usage` member is not a call that consumed nothing** — a call that never reached the model, and every call from before this shipped, have no reading at all; a zero there would be a measurement that was not taken.

**`transcript` can be rewritten once, later.** Yappr may re-read an older call's recording
one side at a time — a browser call, or a phone call recorded with each side on its own
channel — when its turns had landed on the wrong speaker, and replaces the turns only when
both speakers come back. The summary is then written again from the new turns; the outcome
and the extracted values stay as first sent. The rewrite moves `updated_at` (so an
`updated_since` sync picks it up) but sends no webhook and fires no After step —
`transcript.ready` is sent once, when the transcript first appears. A copy you stored
earlier is not wrong, just older: keep the newer `updated_at`. Turns are in the order they
were said: a short reply said in the middle of the other side's turn splits that turn and
sits where it was said.

Earlier releases also returned `transcript_live`, a second, in-call copy of the turns. It is no longer returned on any call: read `transcript`, which is made from the recording on every call, whichever voice model ran it.

**`tool_calls`** — One row per tool / integration invocation that fired during the call, in firing order. The `kind` field is the discriminator:

- `webhook_tool` — the prompt engine's tool list (a call from before the agent was converted). `request` carries the full HTTP envelope (method/url/headers/body). Auth-related headers are redacted as `"[REDACTED]"`.
- `tool_call` — a workflow agent's tool (`node` is the workflow step that ran it, when recorded; read what was sent from the full-record fields below), or, on an older call, a flow `tool_call` node. On a flow call, for webhook tools, `request.body` is the exact flat payload delivered to the customer endpoint: optional standard metadata, then configured static parameters, then resolved extraction values (later layers win collisions). System/transfer tool nodes retain their resolved action args. `tool_id` and `node` identify which tool and flow node ran. `arg_sources` maps only resolved tool arguments to their mode (`literal` or `ai_extract`).
- `integration_call` — **the retired native calendar/mailbox step.** No workflow agent's call produces it; only an agent not yet moved to the workflow engine still runs that step, until the end of its 30-day notice period. Older calls still carry it and are still returned. Same `request.body`-only shape; `provider`, `action`, `integration_id` record which credential and method ran at the time.

On a call from the retired flow engine, `flow_trace.steps[].tool_call` has the same per-fire data, inlined per visited step in graph order. On a workflow agent's call, join these entries to `timeline`'s `tool` rows by `exchange_id`.

**Each `tool_calls[]` entry's full record** (calls from 21 October 2026, every engine: workflow agents, prompt and flow agents, connected apps, transfers, End). Present only when the call has one; an older call's entries read exactly as before.

| Field | What it is |
|---|---|
| `id` | The record's id = the timeline `tool` row's `exchange_id` = `exchange_id` on the tool's events |
| `engine` | `workflow`, `prompt` or `flow` |
| `tool_type` | `http`, `app`, `transfer` or `end` (`kind` keeps its old meaning: which event stream) |
| `status` | `succeeded`, `failed`, `timeout` (no answer in time; it may still have acted), `unreachable`, `refused` (never sent), `not_sent` (a test held it back), `unknown` |
| `started_at` | When the request left |
| `agent_asked` | The arguments the agent called it with; `null` for a before/after step |
| `request.method`, `request.url`, `request.headers`, `request.body` | The request exactly as it left: the full URL with its query, every header, the body. `request.target` instead of a URL for an app (`Google Calendar · Find event`) or a transfer |
| `request.body_format`, `request.body_bytes`, `request.truncated` | `json`/`text`/`empty`/`binary`; the full size; `true` when only the first 16 KB is kept |
| `response.status`, `response.headers`, `response.body` | The answer: status (`null` when nothing answered), every header, the body — also when it refused or was not JSON |
| `response.body_format`, `response.body_bytes`, `response.truncated`, `response.timed_out`, `response.error_code` | As for the request; `timed_out` when no answer came in time; `error_code` from the `GET /deliveries` list (`downstream_http_error`, `http_timeout`, `http_network_error`, `invalid_json_response`) |
| `agent_was_told` | What the agent got back |
| `masked` | Where a value was replaced by `"[REDACTED]"` (`request.headers.Authorization`, `request.url.query.api_key`, `response.body.access_token`) |
| `details_expired` | `true` after 90 days: `agent_asked`, `agent_was_told` and the record's details are gone; the summary stays |
| `destination_path_withheld` | `true` (else absent) when `request.url` is `scheme://host` only: the key has neither `tools:read` nor `tools:update` |

**Hidden as `"[REDACTED]"`:** the `Authorization`, `Proxy-Authorization`, `Cookie`, `X-Api-Key` headers sent and `Set-Cookie` received; any header, query parameter or JSON key whose name contains token, secret, password, signature, credential, api key, access key, private key or session id, ends in `key` or `session` (`signing_key`, `license_key`, `user_session`; not `public_key`, `primary_key`, `foreign_key`, `sort_key`, `partition_key`), or is exactly `key`, `auth`, `sig`, `otp`, `jwt`, `pwd` or `bearer` (not `token_type`, `total_tokens`, `key_name` and the like; numbers and booleans never); a bearer token, API key (`sk_…`, `AKIA…`, `AIza…`, `ghp_…`) or JWT inside any text; a URL's user and password; every value configured on the tool's headers. **Kept:** the customer's own data — names, phones, emails, addresses.

**Where it went needs a tools scope.** For a Make or Zapier hook the URL's path is the credential. A key with `calls:read` but neither `tools:read` nor `tools:update` reads every `tool_calls[].request.url` (and the raw `tool_called` `events[].data.url`) as `scheme://host`, with `destination_path_withheld: true` — the same rule as `GET /deliveries/{id}`. To debug a tool's path, use a key with `tools:read`.

**`events`** — Full chronological timeline of all call events (tool calls, transcriptions, LLM events, errors, termination). For advanced use cases / low-level analysis. On a call from the retired flow engine, `flow_trace` (below) is the structured view of the same data. Auth headers are also redacted.

**`events` and `flow_trace` are superseded by `timeline`** (below) for anything you are building now. `tool_calls` is where each tool call's full record lives (above); `timeline` stays summaries only, and a `tool` row's `exchange_id` names the matching `tool_calls[].id`.

**`timeline`** — **What happened on the call, as one time-ordered list.** This is the
single read surface for call observability: the same rows the customer sees on the call
log in the dashboard, read from the same place, so your view and theirs can never
disagree. Prefer it over `events` and `flow_trace` for anything you are building now.

Every row carries `kind` and `at`. The rest depends on the kind:

| `kind` | What it is | Fields |
|---|---|---|
| `call` | The call being placed, answered, then ending | `event` (`placed` / `answered` / `ended`); `at` is `started_at` / `answered_at` / `ended_at` |
| `message` | A turn in the conversation | `role` (`agent` / `user` / `voicemail`), `text`, `offset_ms` |
| `phase` | A stage of the call | `lane` (`before` / `during`), `scope`, `status`, `error`, `code` |
| `transition` | The conversation moving | `from_node`, `from_label`, `to_node`, `to_label`, `edge_id`, `edge_condition`, `edge_scope` (`direct` / `global`), `strict` |
| `tool` | One tool invocation | `tool_type`, `name`, `step_id`, `lane` (`before` / `during` / `after`), `status`, `duration_ms`, `attempt_count`, `error`, `failure` |
| `trigger` | An after-call follow-up the workspace authored | `event`, `steps`, `status`, `error` |
| `delivery` | One row of the webhook delivery ledger | `event`, `status`, `response_status`, `attempt_count`, `error_message`, `delivered_at`, `tool_name` |

**A `phase` row's `code`** is the word to branch on when the stage did not work out:
`cancelled`, `expired`, `declined`, `inputs_invalid` or `did_not_finish`; the call's own
failure row (`scope: "call"`) carries the call's `failure.code`. `code` is `null` on a
stage that worked or has not settled. A completed or transferred call's `during` stage
reads `succeeded` whoever ended it: a failed `during` stage goes with a failure. A `before`
stage can stay failed on a call that connected (the agent carried on without it).

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
these rows — each tool call's full record is `tool_calls[]` on the same response, joined by
a `tool` row's `exchange_id`. A failure is one sentence in `error` (or
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
ledger's own `delivered`, `failed`, `pending` or `unknown` (no answer in time; the endpoint
may have acted). A row with no `status` at all means the
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
`artifact`. A group waiting on the analysis (`event: "analysis.ready"`) reads
`artifact_unavailable` — state `skipped`, `execution.summary.follow_up_state: "cancelled"` —
as soon as `analysis` reads `failed` or `skipped` with a `completed_at`: those steps will
not run. Before that it reads `artifact_pending` (state `waiting`). Treat a reason you do
not recognise as `skipped`.

**Rehearsals and leads.** A browser rehearsal (the Test tab, or a
`POST /calls {"type":"web"}` session) has no caller number, so lead processing skips it: no
lead is created or updated, no `lead.created` / `lead.updated` is sent and no `lead.ready`
follow-up runs; the `lead` artifact in `execution.summary.artifacts` reads `skipped` with
`reason_code: "web_call_no_phone"` (other skips: `transcript_too_short`, `no_phone_number`).
The analysis still runs. Processed after all: a Test-tab call with a
simulated phone number, and a session minted with `lead_id` (an `offer` session — a
`call_request` one refuses `lead_id` with `422 WEB_LEAD_UNSUPPORTED`). A dashboard test phone
call is processed like any call.

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
on it.**

**When to stop polling.** Once the call has ended, `analysis.status` and `cost_status` are
no longer `pending`, and nothing in the block is running or due, the block reads
`summary.settlement: "settled"`, `summary.is_settled: true` and `refresh_after_ms: null`,
with `history.complete: true` and `history.gaps: []` when the page you have is all of it
(one page, nothing expired; `history.coverage` says which record it is). Stop polling then;
until then `refresh_after_ms` says how long to wait. For the conversation itself — turns, tools, transfers, webhook deliveries —
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

`GET /calls` adds three integer counters per row, counted from the older engines' raw `events`:
- `tool_calls_count` — tools the prompt engine called (its `tool_called` events). Always 0 for flow agents.
- `flow_steps_count` — node visits on the retired flow engine. 0 for prompt agents. Loops count each visit.
- `flow_tool_fires_count` — tool_call nodes that fired on the retired flow engine. 0 for prompt agents.

A workflow agent's call is not counted this way, so these can read `0` on a call that ran
tools: count its `tool` rows in `timeline` (`GET /calls/:id`) instead.

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
- `recording_url` is a signed link on `api.goyappr.com` carrying `exp` (when it stops
  opening, in Unix seconds) and `sig` (`?exp=…&sig=…`). Use it exactly as returned: a
  changed `exp` or `sig` is refused.
- Opening it needs no key and no `Authorization` header and answers `200` with the audio
  itself — no redirect to follow. `HEAD` answers with the same headers and no body, and a
  `Range` request gets just the bytes it asks for, so an `<audio>` element can seek; a range
  past the end is `416`, with `Content-Range: bytes */<size>` whenever the size can be
  read. `ETag` and `Last-Modified` (the stored file's) are readable cross-origin. The file is
  `audio/ogg` when Yappr recorded the call, `audio/mpeg` when the carrier did — read
  `Content-Type` — and a browser saves it as `recording-<call id>-<YYYY-MM-DD>.<ext>` (the
  day the call started, UTC).
- A `HEAD` without a `Range` answers from Yappr's record of the file, not the audio: it can
  say `200` where a `GET` says `404` (the carrier deleted its file) or `503`. To check that
  the audio can still be fetched, `GET` with `Range: bytes=0-0`.
- It is absent — the key is left out, never `null` — when the call has no recording the link
  can serve (not stored yet, or no longer fetchable). Test for the key, not for `null`. (The
  answer to `POST /calls/:id/recording/revoke` is the exception: it always carries
  `recording_url`, `null` when there is none.)
- A link lasts **7 to 8 days**: `exp` is 00:00 UTC eight days after the UTC day it was
  issued on (a link read on 25 September expires at 00:00 UTC on 3 October), so two reads
  of the call on one day return the same link. It is not permanent —
  for a later play, read the call again; every read issues a current link.
- Anyone holding a link can play the recording until it expires. To take links back, see
  **POST /calls/:id/recording/revoke** below (`calls:create`). In the dashboard, the call's
  panel in Call Logs has **Copy recording link** (the link as it is when pressed, with when
  it expires) and **Revoke recording links**; there is no other link control.
- Until an edge rule is lifted, Python's `urllib` default User-Agent (`Python-urllib/3.x`)
  gets `403` with the body `error code: 1010` on `api.goyappr.com`, on this link and every
  other route; set any other User-Agent (`requests`, `httpx`, curl and Node are not
  affected).

---

### POST /calls

Initiate an outbound call.

**Scopes:** `calls:create`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent_id` | uuid | no | Optional. Omit it and the `from` number decides: its `outbound_agent_id` places the call, or — if that number has an `outbound_split` configured — the split picks between the bound agent and the second one. An explicit `agent_id` always wins over a split; sending one skips split resolution entirely. A `from` number with no agent attached and no resolvable split is refused with `422 AGENT_NOT_RESOLVED` — *"Attach an agent to this phone number or send agent_id"* — nothing is queued or dialed. When a split resolved the agent, the call carries `metadata.ab_variant` (`"a"`/`"b"`); a value you send in `metadata.ab_variant` yourself is dropped and replaced. A retry under the same `Idempotency-Key` reuses whichever agent the original accepted call resolved to — it never re-rolls, even if you change the split in between. |
| `to` | string | yes | Destination phone number — strict E.164 format (see Phone validation below) |
| `from` | string | yes | Caller phone number — strict E.164, must be an active number owned by the company: bought from Yappr, or added from the customer's own Telnyx account (see **Carrier Accounts** above — the call then runs on their Telnyx account) |
| `metadata` | object | no | Stored on the call as its `metadata` — arbitrary key-value pairs, not injected into the agent's instructions. **Sent in real time with every tool request, in the call package as `call.call_metadata`** (see [Tool Webhook Payload](#tool-webhook-payload)) — ideal for carrying internal IDs (appointment_id, contact_id, calendar_id) that tool receivers need without requiring a `GET /calls/:id` round-trip. |
| `variables` | object | no | `Record<string, string>` — substituted into the agent's instructions using `{{VariableName}}` syntax. Also sent with every tool request as `call.call_variables`. |
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
refused by that account, not by Yappr, when Telnyx turns the dial down: the call is
recorded `failed` (its `disconnect_reason` says why) and not retried. On a workflow agent
the request has already answered `202`, and a `call.failed` follow-up gets
`call.status: "failed"`, without the reason. Only an agent not yet on the workflow engine
still answers `422` (reason in `error`, no `code`, **no webhook**) when placed right away,
or sends `call.failed` with `data.error_reason`. On a `paused` carrier account the number is switched
off, so `from` answers `400 INVALID_FROM_NUMBER`. See **Carrier Accounts** above.

**CRITICAL:** `to` and `from` MUST NOT be the same number. This creates an infinite call loop. The API returns 400 but always verify before calling.

**Phone validation (enforced at API and DB layers):**
- Both numbers must match `^\+[1-9][0-9]{7,14}$` — leading `+`, 8–15 digits, no spaces or dashes.
- Israeli numbers (`+972…`) must be exactly 12 or 13 characters total (`+972` followed by an 8-digit landline or 9-digit mobile). Anything longer or shorter is rejected.
- Malformed `to` → `400 invalid_destination` (the one code for a `to` that cannot be dialled). Malformed `from` → `400 INVALID_FROM_NUMBER`. Bad numbers never reach the carrier and never create a `call_log` row.
- On a workflow agent, a well-formed `to` that still cannot be reached is `400 invalid_destination`, checked before the request is accepted: an Israeli number with a leading `0` after the country code, an Israeli mobile, non-geographic or landline number with the wrong number of digits, a mobile prefix no longer in service, or a service number such as 1-800 that cannot be dialled at all. Nothing is placed or charged, and the same number fails identically on every retry.
- `from` may be a `phone_system` number (an extension that calls out through the customer's phone system). Before anything is reserved such a call can be refused with `422`: `PHONE_SYSTEM_OUTBOUND_OFF` (switched off on the endpoint), `PHONE_SYSTEM_OUTBOUND_PAUSED` (the phone system refused the last calls; PATCH the endpoint `{"register": {"outbound": {"enabled": true}}}` once fixed), `PHONE_SYSTEM_NOT_CONNECTED` (endpoint off or not registered), `DESTINATION_OUTSIDE_PHONE_SYSTEM_COUNTRY` (non-Israeli `to` in `national` dial format). All the extension's lines busy → `202 queued`. A call the phone system refuses before it rings fails with `failure.code` `phone_system_refused` (the lead is not blocked).

**`variables` vs `metadata` distinction:**
- `variables` → injected into the agent's instructions before the call starts (use for per-call context the agent should know)
- `metadata` → stored on the call record, not injected into the instructions (use for tracking data — CRM IDs, source, etc.)

**Reserved keys (400 on collision).** The five built-in tokens (`id`, `direction`, `agent_number`, `user_number`, `agent_name`) are platform-supplied — the bot emits them itself at call start. Using any of them as a key in `metadata` is rejected with `400 INVALID_METADATA_RESERVED_KEY`. Pick a different name for your custom field (e.g. `customer_id` instead of `id`, `caller_phone` instead of `user_number`). `recording_started_at` and `recording_ended_at` are written by Yappr from the call's recording; a value sent under either name (any letter case) is dropped, not rejected.

**The flow agents' metadata contract is retired along with `flow_config`** (see
**Flow agents — retired**): a stored flow could reference `{{metadata.<key>}}` inside
`args_template`, and reading `flow_config.metadata.custom_metadata_keys` in advance was
how you found which keys it needed. `GET /agents/:id` leaves `flow_config` out entirely
on a workflow agent (it reads `type: "workflow"`), so that read returns nothing. A workflow document's own tool
bindings declare their inputs explicitly — see **The conversation graph** — so there is
no separate metadata-contract lookup to make before dispatching a call to one.

**Response (an agent not yet on the workflow engine):** `201`
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
| `POST /call-requests` | `calls:create` | Creates a browser request (`{"type":"web","agent_id":…}`) on a workflow agent: nothing is dialled and nothing is charged until it is started (see **Web calls on an agent that prepares**). |
| `GET /call-requests/{id}` | `calls:read` | Current state of one accepted request — a browser one too (`channel: "web"`; see **Web calls on an agent that prepares**) — with `preparation_steps` (below). There is no list: `GET /call-requests` is `405`. |
| `POST /call-requests/{id}/start` | `calls:create` + the request's `x-yappr-call-request-key` | Starts a `ready` browser request with a fresh SDP offer; the same offer again is `replayed: true`. |
| `POST /call-requests/{id}/cancel` | `calls:create` | Stops a request that has not been placed. Already cancelled → `200`, same state. Already failed, expired or a call → `409 CALL_REQUEST_FINAL`, nothing written. |

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
is `before_declined` for a refusal and `request_failed` for anything else. The codes:
`step_failed` (a step failed and its setting stops the call), `before_declined`,
`preparation_interrupted` (Yappr could not finish the steps — our fault; create a new
request), `request_expired`, `request_failed`.

**`preparation_steps`** — on `GET /call-requests/{id}`, phone or browser request alike, and
on the browser's poll: one entry per before-call step, in document order,
`{id, label, status, error_code?, http_status?}`. `status` is `waiting`, `inactive` (waits
for a route to choose it), `running`, `pending` / `unknown` (no final answer yet; settled as
`failed` in a moment, never sent twice), `succeeded`, `failed`, `blocked`, `skipped` or
`not_run` (the preparation ended before it ran). A finished preparation reads only
`succeeded`, `failed`, `blocked`, `skipped` or `not_run`, except after
`preparation_interrupted` (the step it was running keeps its status). `error_code` /
`http_status` come only on a step that did not succeed; the output never does.

A request that dies before anything is dialled publishes no call event, because there is no
call. It publishes the lifecycle event `request.failed` instead, which an After trigger can
run on — the only way to follow up on a request that never became a call.

Cancel deliberately requires `calls:create`, the same permission that created the
request: a read-only key must not be able to stop a call, and the key that may start one
may stop the one it started. **Cancel is not a hangup.** Once placement has been claimed
it returns `409 WORKFLOW_DISPATCH_ALREADY_CLAIMED`; at that point the call, not the
request, is the thing to look at. A request that already failed, expired or became a call
is `409 CALL_REQUEST_FINAL` with `{error, code, status, error_code, call_id}` beside it —
nothing is written; a request already cancelled answers `200` with the same state. The
browser's `cancel_url` answers the same way. A missing or non-UUID id is `404
WORKFLOW_REQUEST_NOT_FOUND`; `503 WORKFLOW_ADMISSION_UNAVAILABLE` is temporary.

---

### POST /calls — web call session (browser SDK)

Mint a short-lived, single-use token for an **in-browser** voice call via the [`@goyappr/client`](https://www.npmjs.com/package/@goyappr/client) SDK. Same endpoint as an outbound call — just set `type: "web"`. **No call is placed** and no phone number is needed; the token is what the visitor's browser uses to connect.

**Scopes:** `calls:create`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | yes | `"web"`. Omit (or `"phone"`) for a normal outbound phone call — fully backward compatible. |
| `agent_id` | uuid | yes | Agent the web caller talks to. |
| `variables` | object | no | `{{Variable}}` values injected into the agent's instructions. |
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
  "cancel_url": "…",
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
the call. `expires_at` is 5 minutes out for `protocol: "offer"` and 15 for
`"call_request"`. Unused, it settles `no_answer` (`failure.code: "session_expired"`,
`ended_by: "system"`, `cost_cents: 0`, `ended_at` = the token's `expires_at`, not the moment
it was read) as soon as it is read after `expires_at` —
`GET /calls/{id}` settles it at any age before it answers, and `GET /calls` and the export
settle the lapsed sessions minted in the last hour (up to 100 a read) before they answer —
and otherwise at the next five-minute sweep. So `?status=pending_connection` can still list
a lapsed session older than that hour, or beyond those 100, until the sweep reaches it. A token a browser spent
on a connection that never came up settles a minute after it expires. Mint on click, not on page load. A `pending_connection` row
holds no line and costs nothing until a browser connects.

**Discarding a session nobody will use — `cancel_url`.** Every mint returns `cancel_url`,
on both protocols. `POST` it with the session token as the `x-yappr-web-token` header and
no body (or `{}`), from your server or from the page you handed the token to; it takes the
token, never the secret key. `200 {"status": "cancelled", "call_id": …}`: the token is
spent, so no browser can use it. An `offer` session's waiting call ends at once as an
operator's end — `ended_by: "operator"`, `disconnect_reason: "Ended by operator"`, no
`failure`, `cost_cents: 0` — exactly as `POST /calls/:id/end` below ends it; a
`call_request` session answers `call_id: null`, and this is the only way to take one back.
Sending it again answers the same. `200 {"status": "expired"}` when the token had already
expired. `409 WEB_SESSION_ALREADY_USED` once a browser used it: end the call it started,
or stop the call request it created with that request's own `cancel_url`.
`400 WEB_SESSION_CANCEL_INVALID` for any other body, naming the fields to remove; `401`
for a missing or unknown token. A cancelled token stays cancelled: a browser that still
presents it is refused `403 WEB_SESSION_CANCELLED` (offer and call request alike), so a page
can tell a session you took back from one that ran out (`403` "This session token has
expired").

**Browser offer refusals.** When the voice server refuses a browser's offer the connect
answers `502 VOICE_CONNECTION_REFUSED` (the same offer gets the same answer; mint again), and
when it does not answer or is busy, `503 VOICE_UNAVAILABLE` (mint again in a moment). Either
way the token is spent and the call reads `failed` with `failure.code`
`voice_connection_failed` / `voice_unavailable` at stage `connecting`.

**Ending an unopened session with the secret key — `POST /calls/:id/end`**
(`calls:create`). For an `offer` session's call still at `pending_connection`: `200
{"id", "status": "no_answer", "ended_at", "ended_by": "operator"}`, final at once —
`GET /calls/:id` then reads `ended_by: "operator"`, `disconnect_reason: "Ended by operator"`,
`cost_cents: 0` and **no** `failure` member, and a browser that later tries the token is
turned away. It takes no body, or `{}`; any other body is `400 CALL_END_INVALID`. It is not
a hang-up: a call a browser opened, a phone call or a settled call is `409 CALL_NOT_PENDING`,
naming its `status`, and nothing changes. A missing call is `404 NOT_FOUND`;
`503 CALL_END_UNAVAILABLE` changed nothing — send it again.

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

**Post-call data (same as phone).** When a web call ends it runs the full post-call pipeline keyed to the call id: **transcript, summary, recording, and disposition** land on the call record (`GET /calls/:id`). The agent's **follow-ups (After steps) run as on a phone call** only on a call made through a call request: an agent with follow-ups mints `protocol: "call_request"` for that reason, because a one-shot `offer` call has no workflow run. There is no live in-browser transcript yet (`onMessage` reserved), but the server-side transcript is available shortly after the call ends (it is generated post-call from the recording — allow a few seconds before fetching `GET /calls/:id`).

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

**2. Poll `status_url`** until `status` is `ready`. The read (here, and
`GET /call-requests/{id}` on the secret-key API) also carries `preparation_steps` — one
entry per authored step, in document order, each with the author's own `label` — so a
waiting caller can be told what is running (statuses under **Call requests**). Step
*results* are never included.

```json
{ "status": "preparing", "preparation_status": "running",
  "preparation_steps": [{ "id": "lookup_caller", "label": "Look up the caller", "status": "running" }] }
```

A step that did not succeed carries `error_code` (what its tool answered —
`downstream_http_error`, `http_timeout`, `output_schema_invalid` and the like), and
`http_status` when its address answered; never the output. A 4xx other than 408 or 429
answers the same way on every retry until the tool changes.

**3. Start it.** `POST {start_url}` — `POST /call-requests/{id}/start` on the secret-key
API (`calls:create`), `POST /web-call/call-requests/{id}/start` from the browser — with a
**fresh** SDP offer — build the peer now, not before the steps ran — and the capability
header. **201** returns
`sdp`, `type`, `pc_id`, `ice_candidate_url` and `call_id`, exactly what the
one-shot connect returns.

A start is one offer: the same offer again returns the same peer
(`replayed: true`), a different one is `409 WORKFLOW_START_ALREADY_CLAIMED`.
`409 WORKFLOW_START_NOT_READY` means poll longer; `410 WORKFLOW_START_EXPIRED`
means create a new request; `503 AT_CAPACITY` claimed nothing, so the request is
still good — wait and start again. `POST {cancel_url}` stops a request nobody is
going to start; on a request that already failed, expired or became a call it answers
`409 CALL_REQUEST_FINAL` and keeps that `status` and `error_code`.

**Creating again with the same key.** `POST /call-requests` (and the page's
`POST /web-call/call-requests` with a session token) sent again with the same
`Idempotency-Key` / token answers `200` with the request as it is now, `replayed: true`,
`status_url`, `cancel_url`, `start_url` — and **no** `start_capability`: keep the one from
the first `202`. This holds in the token's last five minutes too; only a token that never
created a request gets `409 SESSION_TOKEN_EXPIRES_TOO_SOON`.

**Browser call-request refusals.** No `x-yappr-call-request-key` → `401
CALL_REQUEST_KEY_REQUIRED` (on the secret-key `/start` too); `variables` or `metadata` with a
session token or share link → `400 CALL_REQUEST_FIELD_NOT_ALLOWED` (set them on
`POST /calls {"type":"web"}`); an offer-protocol token → `409 WEB_SESSION_PROTOCOL_OFFER`
(send the SDP offer to `POST /web-call`). `POST /turn-credentials` with a cancelled token →
`403 WEB_SESSION_CANCELLED`.

**Browser data plane** (`https://api.goyappr.com`, with a session token, a capability or a
share link — never the secret key): `POST /web-call` (an offer `{sdp, type}` → `201` with
the answer), `POST /turn-credentials` (`iceServers`), `POST /web-call/cancel` and
`POST /web-call/call-requests` take the session token (`x-yappr-web-token`);
`GET /web-call/call-requests/{id}`, `POST /web-call/call-requests/{id}/cancel` and
`POST /web-call/call-requests/{id}/start` take `x-yappr-call-request-key`. `GET /` lists
them under `browser`. `401 UNAUTHORIZED` means no credential, or one Yappr does not know.
The mint's `expires_at` is written with `+00:00`.

**Reading a browser call request back.** The page's `POST /web-call/call-requests` answers
`request_id`; pass it to your server and read `GET /call-requests/{id}` (`calls:read`) —
`channel: "web"`, `status`, `error_code`, `call_id`. A dashboard rehearsal whose before-call
steps failed before any call existed is also written to Call Logs as a `failed` call with
`failure.code: "preparation_failed"` (keyed by the request id).

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
answers `200` with the audio itself, never a redirect, with its own `Content-Type`
(`audio/ogg` or `audio/mpeg`) and a `Content-Disposition` naming
`recording-<call id>-<YYYY-MM-DD>`.
`HEAD` answers the same headers with no body, and `Range` is honoured — `206` with
`Content-Range`, `416` past the end (with `Content-Range: bytes */<size>` whenever the size
can be read) — so a player can read its length and seek.
`Cache-Control: private, no-store`: nothing on the way keeps a copy a revoke could not
reach. A recording covers the conversation, so `duration_seconds` can run a few seconds
longer than it. Never build or edit one — read the call for it.

**Scopes:** none — the link's own signature.

| Status | Code | Why |
|---|---|---|
| 403 | `RECORDING_LINK_EXPIRED` | Past its `exp`. Read the call again for a new link. |
| 403 | `RECORDING_LINK_REVOKED` | The call's links were revoked after this one was issued. Read the call again. |
| 403 | `RECORDING_LINK_INVALID` | Not a link Yappr issued, or it was changed. Use `recording_url` exactly as returned. |
| 404 | `NOT_FOUND` | The call has no recording the link can serve (not stored yet, or no longer fetchable) — for any link to such a call. |
| 503 | `RECORDING_LINK_UNAVAILABLE` | The link could not be checked just now. Try again in a moment. |

These bodies are JSON for an API client; a browser opening a refused link gets a short page
instead.

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
revoking again takes those back as well. The call's `updated_at` moves to `revoked_at`, so a sync on
`GET /calls?updated_since=` picks up the new link instead of keeping the dead one. The
recording itself is not deleted, and the dashboard still plays it.

| Status | Code | Why |
|---|---|---|
| 400 | `RECORDING_REVOKE_INVALID` | A body field or query parameter was sent; `issues[]` names it (`field_unknown` at `/<field>` for a body field). Nothing was revoked. |
| 404 | `NOT_FOUND` | No call with this id in this workspace, or a call of an agent the key is not limited to. |
| 404 | `RESOURCE_ID_INVALID` | The id in the path is not an id. |
| 503 | `RECORDING_LINK_UNAVAILABLE` | Nothing was revoked. Try again in a moment. |

---

## Do Not Call

Per-company DNC list. Outbound call placement (`POST /calls`) and the queue dispatcher both consult this list before dialing — matched destinations get a call-log entry written with `status: "dnc_blocked"` and no carrier leg / no charge.

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
calls outside an enabled window are ended before being answered — no call-log entry, no
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

Dispositions marked `is_protected: true` cannot be deleted — read the flag from `GET /dispositions` rather than assuming which they are: an older workspace was seeded with six protected (`Voicemail`, `Do Not Call`, `Transferred to a Person`, `Unclassified`, `No Answer`, `Failed`), a newer one with all ten defaults. They *can* be renamed, and the platform finds four of them **by name** when it sets them without asking the model — `No Answer` and `Failed` when a call never connected, `Voicemail` when nobody really spoke, `Unclassified` when the analysis itself failed — so renaming one of those four stops that classification from happening at all.

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

Delete a disposition. Returns 403 if disposition is protected. The outcome leaves every
campaign's `stop_disposition_ids` (drafts, launched and archived ones). Only a launched
campaign (scheduled, running, paused, stopped or completed) for which it is the sole way to
stop (no other stop outcome, `stop_on_no_answer` and `stop_on_voicemail` off) refuses:
`409 DISPOSITION_IN_USE`, naming the campaign. Add another outcome with
`PATCH /campaigns/:id` (or archive the campaign), then delete again. Never a `500`.

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
| `email` | string \| null | no | An email address (`name@example.com`), trimmed; `""` or `null` leaves it empty. Anything else is `400 LEAD_REQUEST_INVALID` naming `email`, and nothing is written |
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
| `email` | string \| null | An email address (`name@example.com`), or `null` / `""` to clear it. Anything else is `400 LEAD_REQUEST_INVALID` naming `email`, and nothing is written |
| `tags` | string[] | Replaces all existing tags |
| `tag_ids` | uuid[] | Replaces all existing tags |
| `long_term_context` | string | |
| `metadata` | object | |

**Response:** `200` — full updated lead object, for a key that also holds `leads:read`. A
key with `leads:manage` alone reads back only what it wrote: `{id}`, each field sent as
stored (`tag_ids` reads back as `tags`; `metadata` without the collected values) and
`updated_at`.

---

### DELETE /leads/:id

Soft-delete a lead. Every call it was on moves its `updated_at` and stops carrying `lead`,
so a sync on `GET /calls?updated_since=` picks the change up. A lead's own edits move the
lead's `updated_at`, not its calls'.

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
| POST | `/campaigns/:id/restore` | Bring an archived campaign back (`draft` if never launched, else `stopped`) |
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

List campaigns for the authenticated workspace, newest first. Archived (soft-deleted) campaigns are excluded unless `status` names `archived`: `GET /campaigns?status=archived` lists them, to find one to restore with `POST /campaigns/:id/restore`. Names need not be unique.

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

Foreign keys are expanded to **full objects**, per the API's FK convention — `agent`, `from_phone_number`, and `stop_dispositions` (one full disposition object per id in `stop_disposition_ids`) — as far as the key's scopes reach: `agent` / `split_agent` are the whole agent only for a key with `agents:read`, else `{id, name}`; `from_phone_number` is whole only with `phone_numbers:search`, else `{id, friendly_name, number: null}`, and the campaign's own `from_number` snapshot is then `null` too. The same holds on `GET /campaigns`.

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
  "from_number": "+972... | null",      // the number it calls from: from_phone_number's, or the agent's own when from_phone_number_id is null

  "split": { "agent_id": "uuid", "percent": 30 } | null,
  "calling_window": {},
  "variables": {},

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

### POST /campaigns/:id/restore

Brings an archived campaign back (no body; `campaigns:manage`). Never launched (`started_at`
null) → `draft`, with the contacts the archive retired back to `pending`; launched before →
`stopped` (readable and reported again, never dialled — to call its contacts again, create a
new campaign). `200` with the campaign as `GET /campaigns/:id` returns it. A campaign that is
not archived is `409 CAMPAIGN_NOT_ARCHIVED`, naming its status.

---

### POST /campaigns

Create a campaign. **It always lands as `draft`** — `status` is not writable, and creating never starts dialing. Launching is a separate, explicit call.

**Scopes:** `campaigns:manage`

**Response:** `201` — full campaign object.

**`stop_disposition_ids` is the one field with a default.** Only `name` is required to
create. A create that leaves `stop_disposition_ids` out stores the suggested stop set —
`GET /campaigns/defaults` → `settings.stop_disposition_ids`: every outcome the workspace has
except Callback Requested and the four Yappr assigns (No Answer, Voicemail, Unclassified,
Failed) — Interested, Appointment Set, Not Interested, Issue Resolved, Transferred to a
Person, Wrong Number, Do Not Call, and every outcome the workspace created itself — so a new
campaign stops on Interested. Send `[]` for no stop outcome, or your own ids; either is kept
as sent, and a `PATCH` without the field leaves the set alone. To go back to the suggested
set after `[]`, `PATCH` the ids `GET /campaigns/defaults` returns; `null` is refused. **The stop set is copied at create:** an outcome added later
stops only campaigns created after it — re-apply with `PATCH /campaigns/:id
{"stop_disposition_ids": <GET /campaigns/defaults settings.stop_disposition_ids>}`. The
suggested set includes every outcome the workspace added itself, a "call me back" one too:
take those out before sending. Every other field you leave out stays `null`, and
`POST /campaigns/:id/launch` then answers `422 CAMPAIGN_NOT_READY` naming each one. The
**Suggested** column below is what the dashboard prefills for a person, not what the API
substitutes for you. Send every field on create, or fill the gaps with `PATCH` before
launching — how often to call someone is a decision the platform will not make on your
behalf.

To start from everything the dashboard offers, `GET /campaigns/defaults`
(`campaigns:read`) → `settings`, merge `name`, `agent_id`, `from_phone_number_id` and
`regulatory_basis`, and `POST` it. A lead who says they are interested is then handed to
you by the outcome and its follow-ups, not dialled again; `calling_window` is in the
workspace timezone (Sun–Thu in Israel).

#### Client-writable fields

This exact allowlist applies to both `POST` and `PATCH`. **Any other key — including a typo or a read-only field — is rejected with `400`** and a message listing the writable set. This is deliberate: silently ignoring a misspelled `stop_dispositions` would leave you believing you armed a kill switch when you did not.

| Field | Type | Suggested | Validation / notes |
|-------|------|---------|--------------------|
| `name` | string | — | **Required on create.** Trimmed. **Not unique** — a name another campaign already uses is accepted (`201`), so a retried create makes a second draft. Tell campaigns apart by `id` |
| `description` | string | null | Free text |
| `agent_id` | uuid | — | Required before launch |
| `from_phone_number_id` | uuid | null | The number to call from; must be an active number the workspace owns. Leave it out (or `null`) to call from the agent's own number: a number the agent is the outbound agent of (or either half of its outbound split), else one it answers on; a Yappr number before one on the workspace's own Telnyx account. An A/B split calls from the first agent's number. Left out on an agent with no number → `400 CAMPAIGN_REQUEST_INVALID`, `invalid_from_number` at `/from_phone_number_id` |
| `split` | object \| null | null | Optional two-agent A/B test — `{ "agent_id": "...", "percent": 1-99 }`. `percent` is the **second** agent's share of contacts; `agent_id` on the campaign above takes the rest. See [Testing two agents on a campaign](#testing-two-agents-on-a-campaign) below |
| `calling_window` | object | `{}` | Optional narrowing of the workspace calling hours for this campaign — it can never widen them. `{}` follows the workspace hours; see [retry_rules and calling_window](#retry_rules-and-calling_window) |
| `variables` | object | `{}` | Values for the agent's `{{placeholders}}` on every call the campaign places, strings only. The same for every contact except `FirstName` and `FullName`: each call fills those from its contact's own name (the first word of it / the whole of it), and the campaign's value is only what a contact with no name hears. `CallerPhone`, `CurrentDate`, `CurrentDateTime`, `CurrentTime`, `CallDirection` and `Timezone` are filled automatically and refused |
| `stop_disposition_ids` | uuid[] | the suggested stop set — **also what a create that leaves it out stores** | Array of **disposition ids**, never labels. Left out on `POST`, it is `GET /campaigns/defaults`' set, Interested and the workspace's own outcomes included; `[]` arms no outcome; left out on `PATCH`, the set stays as it is (`null` is refused). Every id must belong to this workspace, or `400`. `No Answer`, `Failed`, `Voicemail` and `Unclassified` are refused (`400`, naming the outcome and the switch to use instead) — see [Stop outcomes the platform assigns](#stop-outcomes-the-platform-assigns) |
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
| 400 | `CAMPAIGN_REQUEST_INVALID` | `split.agent_id` (or `agent_id`) is not an agent in this workspace — `agent_not_found` at that field in `issues[]`, beside every other problem in the body |
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

**A campaign's own opening line** (workflow agents): `POST /agents/{id}/duplicate`, `PATCH`
the copy's `greeting_message`, publish its workflow, `PATCH` it `is_active: true`, then
`PATCH /campaigns/:id {"agent_id": "<copy id>"}`.

---

### DELETE /campaigns/:id

Archive. Sets `status: "archived"`, soft-deletes the row, retires every live contact (`pending`, `scheduled`, `dialing`, `awaiting_disposition` → `excluded`), and expires the campaign's not-yet-claimed queue rows. Calls already in flight complete normally and still bill.

**Scopes:** `campaigns:manage`

**Response:** `200` — `{ "id": "uuid", "status": "archived", "company_id": "uuid" }`

An archived campaign leaves the default `GET /campaigns` list (it is listed with `?status=archived`) and `POST /campaigns/:id/restore` brings it back. To stop dialing while keeping the record readable, use `pause` or `stop`.

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

Each contact's `lead` is the full lead only for a key that also holds `leads:read`;
otherwise it is `{ "id" }`. `to_number_e164` and the enrollment fields are there either way.

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
      "lead": { /* full lead object — { "id" } alone without leads:read */ },
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
| `phone_numbers` | array | Raw numbers. Each item is `{ "phone": "...", "name"?, "email"?, "notes"? }` or a bare string. An `email` that is not an address is dropped — the contact is still enrolled without it — and listed in `invalid_email`. `{{FirstName}}` on its calls is the first word of `name` ("משפחת כהן" → "משפחת"); use `{{FullName}}` for households |

The body reads `lead_ids` and `phone_numbers`, and an entry reads `phone`, `name`, `email`
and `notes`. Any other key (`emial`, `lead_id`, `note`) refuses the whole request with
`400 CAMPAIGN_REQUEST_INVALID`, `issues[]` `{code: "field_unknown", path, message}` with a
"Did you mean email?" hint; nothing is enrolled.

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
  "invalid_email": [ { "row": 2, "phone": "+972501234567", "name": "string", "email": "not-an-address", "reason": "invalid_email" } ],
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
- `invalid_email` — `phone_numbers` entries whose `email` is not an address (`row` from 1, `phone` and `email` as sent, `name` when given, `reason: "invalid_email"`): only the email is dropped — the contact is still enrolled (and in `results`); a new lead is created without an email, a lead you already have is left as it was
- `total_leads` is present whenever a number reached the enrolment step

**Enrolment never refuses the batch over a contact** (an unknown field does — above). A number another live campaign is calling comes back in `in_another_campaign[]` with `campaign_id` and `campaign_name`, and in `results[]` — one entry per number that got past parsing and the do-not-call screen, in the order sent, with `result` `enrolled`, `already_enrolled` or `in_another_campaign`. Everyone else is enrolled. A draft holds no number; launching a draft retires contacts another campaign took meanwhile (`stop_reason: in_another_campaign`).

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
| The agent on this campaign has no phone number to call from… | `PATCH /phone-numbers/:id` with `outbound_agent_id` (give the agent a number), or `PATCH` the campaign with `from_phone_number_id` |
| `regulatory_basis` is required before launching | `PATCH` with one of the five bases |
| Finish configuring the campaign before launching. Not set: … | `PATCH` every field it names — none of these has a default: `max_attempts`, `max_infra_retries`, `retry_no_answer_seconds`, `retry_completed_seconds`, `randomize_retry_time`, `stop_on_no_answer`, `stop_on_voicemail`, `stop_on_unclassified`, `double_dial_enabled`, `double_dial_gap_seconds`, `max_calls_per_day`, `min_seconds_between_calls`, `max_in_flight` |
| Configure at least one stop rule before launching | A non-empty `stop_disposition_ids`, or `stop_on_no_answer` / `stop_on_voicemail` set to `true` |
| The assigned agent no longer exists | Point `agent_id` at a live agent |
| The agent on this campaign is switched off | `PATCH /agents/:id` with `is_active: true`, or pick another agent |
| The agent on this campaign has not been published | `POST /agents/:id/workflow/publish`, then launch |
| An agent on this campaign has no maximum call duration set | `PATCH /agents/:id` with a positive `max_call_duration_secs` on every agent the campaign calls with, the A/B test's second agent included — `0` means the agent has no cap of its own, so each call can run to the platform's 65-minute limit, far above any budget |
| The second agent on this campaign's A/B test is not available | Point `split.agent_id` at an active agent in this workspace, or send `"split": null` |
| The phone number assigned to this campaign is no longer active… | Pick an `is_active` number with `status: "active"`, or `PATCH` `from_phone_number_id: null` to call from the agent's own number |
| This number is not connected to a working Telnyx account in Yappr… | Fix it under Phone numbers → Your carrier, or pick another number |
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
| `from_number_unavailable` | No number to call from: the named number is no longer active (or its Telnyx account stopped working), or none is named and the agent has no number → status `paused_config`; `last_error` says which |
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
- **Keep `Interested` in the stop set** (a create that leaves the set out stores it, as `GET /campaigns/defaults` does), so a lead who said yes is handed over by the outcome's follow-ups instead of being dialled again.
- **There is no built-in "reached a human" rule.** To stop calling people you have already spoken to, create a disposition for that outcome (`POST /dispositions`) and put its id in `stop_disposition_ids`.
- **Outcomes are classified asynchronously after the call ends**, typically within seconds but occasionally much later. A contact sits in `awaiting_disposition` until its outcome arrives, however long that takes — there is no timeout that decides without one, and only that contact waits while the campaign keeps calling everyone else. `stop_on_unclassified` decides what happens when the outcome that arrives is `Unclassified`. The platform will not redial a contact in `awaiting_disposition`, and neither should you.
- **A disposition that is the only stop rule of a launched campaign cannot be deleted.** `DELETE /dispositions/:id` answers `409 DISPOSITION_IN_USE`, naming the campaign, rather than silently disarming your kill switch; anywhere else the outcome simply leaves every campaign's `stop_disposition_ids`. Add another stop outcome first (or archive the campaign). (Protected labels are `403 PROTECTED` anyway, so this bites on custom outcomes.)

### Compliance

- `regulatory_basis` is a required attestation before launch, recorded on the launch audit event together with the enrolled count. It is the artefact that exists when someone asks why a person was called.
- **Enrollment excludes numbers on the do-not-call list** and reports them in `on_do_not_call`. The dispatcher re-checks at dial time.
- **A verbal opt-out is honoured automatically.** When a call is classified as `Do Not Call`, that number is added to the workspace's do-not-call list — workspace-wide, across every agent and campaign, not just this one. This fires even when the classification lands long after the call.
- A number can be dialed by only **one active campaign at a time** — enrolment reports it per number as `in_another_campaign` — so the same person on two lists does not receive double the calls.

### Campaign error codes

| Status | Code / shape | Cause |
|---|---|---|
| 400 | `CAMPAIGN_REQUEST_INVALID` on a create/edit body (message names the field); `CAMPAIGNS_QUERY_INVALID` on a list | Unknown or read-only key (`retry_rules` included), out-of-range value, a `calling_window` that is not an object or sets hours without a `tz`, stop-disposition id from another workspace or a label instead of an id, `No Answer` / `Failed` / `Voicemail` / `Unclassified` in `stop_disposition_ids`, a `budget_cents` below one call's hold, empty PATCH, editing a terminal campaign, enrolling into a terminal campaign, over 1,000 contacts in one enroll |
| 400 | `CAMPAIGN_REQUEST_INVALID` — the references | In the same `issues[]` as every value problem: `invalid_from_number` (`from_phone_number_id` is not an id, or not a phone number in this workspace — made up, another workspace's, or released; send an `id` from `GET /phone-numbers`), `agent_not_found` (`agent_id` or `split.agent_id` is not an agent here, archived included) and `platform_stop_outcome` (at `/stop_disposition_ids/<n>`). They used to be a separate `400 INVALID_FROM_NUMBER` and `404 AGENT_NOT_FOUND`. Nothing was written |
| 404 | `NOT_FOUND` | Campaign not in this workspace (or archived) — on `GET` and `PATCH /campaigns/{id}` too; contact not enrolled. A campaign id that is not a UUID is `404 RESOURCE_ID_INVALID` |
| 409 | `CAMPAIGN_NOT_STOPPABLE` | Stopping a half-built draft — archive it with `DELETE` |
| 409 | `CONFLICT` | Launch raced another campaign for one of the draft's contacts — send it again |
| 422 | `CAMPAIGN_NOT_READY` | Launch preflight failed; `message` names the single blocking cause |
| 422 | `INVALID_SPLIT` | A malformed or out-of-range `split` on create/update — see [Testing two agents on a campaign](#testing-two-agents-on-a-campaign) |

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

List shared links. Optional `?agent_id=` filter: an agent this workspace does not have is
`404 AGENT_NOT_FOUND`, not an empty list; an archived agent's links are still listed.

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
prefixes, scopes, `last_used_at` — and can neither issue nor revoke. It reads personal data:
the email of the teammate who deleted each key (`revoked_by.email` on
`GET /api-keys?revoked=true`), and so does `api_keys:manage`, which reads the same list; the
dashboard marks both **Reads personal data**. It is **not** in the
dashboard's **Read-only** preset (see the presets below); unlike `api_keys:manage` it *can*
be granted through `POST /api-keys`: give it to a job that should watch the inventory and
nothing else.

**Scopes say what a key may do; `agent_ids` says which agents it may do it to.** Scopes
are resource types (`calls:read`, `leads:manage`, …). A key issued without `agent_ids`
reaches the whole workspace, as every key always has; a key issued with them reaches only
those agents — see **Limit a key to some agents** below.

**Dashboard presets.** **Standard** = agents and tools read + create + update, calls read +
create — no `leads:read`, so a Standard key reads a call's `lead` as `{id}` alone and its
`GET /calls?search=` matches no lead names (add **Read** under **Leads** with **Edit scopes**
when an integration needs the contact). **Read-only** = the reads of agents, tools, `phone_numbers:search`, calls,
dispositions, leads, lead tags, campaigns, flows, agent eval, integrations,
tool-connections, shared links, do-not-call and SIP endpoints — no billing, API keys or
affiliates. **Full access** = every scope.

### GET /api-keys · GET /api-keys/:id

Every active key in the workspace, newest first, or one key by id (`404` once revoked).
`?revoked=true` lists the revoked keys instead, newest revocation first: the audit trail.
Each row adds `revoked_at`, `revoked_by` (`{id, email}` of the person who deleted it in the
dashboard) and `revoked_by_key` (`{id, name, prefix}` of the key that revoked it with
`DELETE /api-keys/{id}`); both `null` when not recorded. Records start 22 Sep 2026, and a key
revoked through the API before October 2026 has `revoked_by_key: null`. Narrow it with
`revoked_since` / `revoked_until` (an ISO date-time with a zone, or a date = that whole UTC
day) and page with `limit` + `pagination.next_cursor`, sent back as `cursor` with the same
range (never with `offset`).

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
  ],
  "pagination": { "total": 1, "limit": 1, "offset": 0, "has_more": false }
}
```

`agent_ids` is on every read of a key: `null` = no limit, a list = the only agents it
reaches. `agents` is the same list with each agent's `name` (`null` for an agent that no
longer exists), so the list alone says which client each key belongs to. `expires_at` is
when the key stops working, `null` for one that works until revoked; a key past it answers
`401 EXPIRED_KEY` to every request and **stays listed** until you revoke it. The list takes
optional `limit` (1–100; left out, every key), `offset` and `revoked` (`true` / `false`), and
with `revoked=true` also `revoked_since`, `revoked_until` and `cursor`; it answers
`pagination {total, limit, offset, has_more}` (plus `next_cursor` on the revoked list). Any
other parameter, one sent twice or with no value, a value outside those, or a range or
cursor without `revoked=true` is `400 API_KEY_REQUEST_INVALID`. There is no
update: `PATCH` / `PUT /api-keys/{id}` answer `405`, naming the path sent.

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
/api-keys/{id}` is `405` with `Allow: GET, DELETE` (`Allow: GET, POST` on `/api-keys`),
and its message says where a key is changed: change scopes, agents or the end date in the dashboard
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
`400 API_KEY_AGENT_UNKNOWN`; an empty list is `400 API_KEY_REQUEST_INVALID`. With
`agent_ids`, `POST /api-keys` also refuses every scope a key limited to agents can never use,
because each opens only routes the whole workspace shares — `agents:create`,
`tools:create`, `phone_numbers:*`, `billing:manage`, `dispositions:*`, `leads:manage`,
`lead_tags:*`, `agent_eval:*`, `integrations:*`, `tool-connections:*`, `shared_links:*`,
`do_not_call:*`, `sip_endpoints:*`, `call_windows:manage`, `affiliates:read`, `api_keys:*`
and `carrier_accounts:*` — with `400 API_KEY_REQUEST_INVALID` naming each, and nothing is
issued. `tools:read` and `tools:update` stay usable: with them the key reads and retries its
agents' deliveries.

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
`agent_ids`, a scope a key limited to agents can never use, an `expires_at` without a time
zone or already past, a field the endpoint does not read, or a query parameter that does
not fit: on the list, a list query parameter other than those above, one sent twice or
with no value, a value out of range (`limit` 1–100, `offset` 0 or more, `revoked` `true` or
`false`), or `revoked_since` / `revoked_until` / `cursor` without `revoked=true`; on
`GET /api-keys/{id}`, any query parameter at all); `400 API_KEY_AGENT_UNKNOWN` (an
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
  "monthly_period_start": "ISO8601",
  "upcoming_charges": [
    { "type": "phone_number_rent", "phone_number_id": "uuid", "phone_number": "+972XXXXXXXXX", "amount_cents": 1000, "due_at": "ISO8601" },
    { "type": "auto_top_up", "amount_cents": 2000, "due_at": null, "when_balance_below_cents": 500 }
  ] | null
}
```

`upcoming_charges` is what the card is due to be charged, soonest first: one
`phone_number_rent` per rented number (due on its `next_renewal_at`), then `auto_top_up`
while auto top-up is on. Amounts are before VAT. `[]` when nothing is due; `null` when it
could not be read (the rest of the status still answers).

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

### GET /billing/rates

What a minute of a phone call costs on each voice model, and the flat prices around it.
**Scopes:** `billing:read` (a key limited to agents is `403 API_KEY_AGENT_SCOPED`, as for the rest of billing).

**Response:**
```json
{
  "currency": "usd",
  "voice_models": [
    { "model": "gemini-3.1-flash-live", "name": "Gemini 3.1 Flash Live", "rate_per_minute_cents": 30, "effective_from": "2026-09-01T00:00:00.000Z" }
  ],
  "default_rate_per_minute_cents": 30,
  "browser_call_rate_per_minute_cents": 10,
  "after_transfer_rate_per_minute_cents": 25,
  "ai_training_multiplier": 1
}
```

`voice_models[].model` is the id an agent carries as `model`, in a stable order; its
`rate_per_minute_cents` is the price before `ai_training_multiplier` and `effective_from` when it
took effect (a call is charged the price in force when it ends). A call is charged at the price of
the model it ran on; a call on a model with no price of its own, or whose model is not known, is
charged `default_rate_per_minute_cents`. `browser_call_rate_per_minute_cents` covers browser calls
(dashboard test calls, shared links, browser calls started through the API) and
`after_transfer_rate_per_minute_cents` the part of a call after it is passed to a person.
`ai_training_multiplier` is `2` if the workspace opted out of AI training and `1` otherwise: the
per-minute charge is the listed price times it, and each call's charge is rounded up to the next
cent. To see what a call actually cost, read `GET /calls/{id}`.

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
| `limit` | 100 | 1–500; caps the rows, never the summary. With `format=csv`, 1–1,000. Above is `400 TRANSACTIONS_QUERY_INVALID`, not capped |
| `format` | `json` | `csv` for the statement as a file (below); `Accept: text/csv` with no `format` asks for the file too |

Anything else, a `format` other than `json` or `csv`, a timestamp that is not real, an offset such as `+03:00` or an unknown
name in `timezone`, a `from` after `to` (on the clock the statement is read on), or a
`from` in the future with `to` left out is `400 TRANSACTIONS_QUERY_INVALID`, naming the
parameter. A late-evening charge lands on the next day in an `Asia/Jerusalem` workspace,
exactly as the dashboard's Transaction History shows it.

```json
{
  "data": [
    { "id": null, "type": "usage", "product": "voice_call", "date": "2026-09-23",
      "created_at": "ISO8601", "description": null, "count": 41, "status": "completed",
      "amount_cents": -412, "affects_balance": true, "payment": null },
    { "id": "uuid", "type": "top_up", "product": null, "date": "2026-09-21",
      "created_at": "ISO8601", "description": "Credits top-up", "count": 1,
      "status": "completed", "amount_cents": 5000, "affects_balance": true,
      "payment": { "channel": "checkout" | "auto_top_up" | "saved_card" | null,
                   "invoice_number": "string | null", "receipt_number": "string | null",
                   "total_charged_cents": 5900, "vat_cents": 900, "currency": "usd" } }
  ],
  "summary": {
    "opening_balance_cents": 1210, "credits_in_cents": 5000, "credits_out_cents": 3666,
    "closing_balance_cents": 2544, "card_charges_cents": 5000,
    "card_top_ups_cents": 5000, "card_phone_numbers_cents": 0
  },
  "phone_number_rent": [
    { "phone_number_id": "uuid", "phone_number": "+972XXXXXXXXX", "provider": "telnyx",
      "included": false, "reason": null, "monthly_price_cents": 1000,
      "last_charged_at": "ISO8601 | null", "next_renewal_at": "ISO8601 | null" }
  ],
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
  `card_charges_cents` is every card charge in the window, before VAT:
  `card_top_ups_cents` (paid top-ups, every one even when `has_more`) plus
  `card_phone_numbers_cents` (numbers' first charges and renewals — what `card_charges_cents`
  meant before 2026-10-01). `phone_number_rent` lists every current number with whether Yappr
  charges its rent (the `rent` fields of `GET /phone-numbers`). A workspace with no clock set
  reads UTC. The closing balance of a window
  that runs to now is `GET /billing`'s `balance_cents`, and last month's closing balance is
  this month's opening one.
- Rows are newest first, and the default `limit` (100, max 500) can end before a long
  window's older top-ups: `has_more: true` means rows were left out (`summary` still counts
  them) — use a shorter window, a higher `limit`, or the file. `starting_balance` and
  `usage` rows have `id: null` and `description: null`.
- **`payment`** is on every row: `null` except on a `top_up`, where it is
  `{channel, invoice_number, receipt_number, total_charged_cents, vat_cents, currency}`.
  `channel`: `checkout` (the payment page / `POST /billing/topup`), `auto_top_up` (charged
  when the balance ran low) or `saved_card` (older on-request charges to the saved card);
  `null` when the record does not say. `total_charged_cents` is what the card was charged,
  VAT included (`amount_cents` is the credits, before VAT); `vat_cents` is `null` when the
  VAT was not recorded — even if the total was — and `0` only when it was recorded as 0.
  `invoice_number` is set on invoiced top-ups (automatic ones), `null` at checkout;
  `receipt_number` is the printed card-receipt number when stored, else `null`. Match a
  card-statement line by the row's `date` and `total_charged_cents`. No payment processor
  id is ever returned.
- A `gift` row's `description` is always "Credits from Yappr".

**One row — `GET /billing/transactions/{id}`** (`billing:read`; a key limited to some
agents is `403 API_KEY_AGENT_SCOPED`): the row by the `id` a list row carries, in the list's
shape plus `timezone`, the clock its `date` is on. `?timezone=` picks another clock and is
the only query parameter it takes — anything else is `400 TRANSACTIONS_QUERY_INVALID`. A
`usage` row has no id: the id of one call's charge is `404 NOT_FOUND` (a call's cost is on
`GET /calls/{id}`, and the answer says it is a call's id), a usage charge's id is
`404 NOT_FOUND` too, and so is an id not in this workspace; one that is not a UUID is
`404 RESOURCE_ID_INVALID`.

**As a file — `format=csv`** (or `Accept: text/csv` with no `format`): the dashboard's
Export CSV, line for line — a UTF-8 BOM, the header
`Date,Description,Type,Status,Amount (USD),Credits,Balance after (credits),ID,Balance after (USD),Card charged (USD),VAT (USD),Paid via,Invoice number,Calls`,
the opening balance, the rows oldest first with the balance each one left, the closing
balance and "Figures as of …" on the statement's clock; every line, the last one included,
ends with a newline. Balances are never in `Amount (USD)`, so a sum of it is the window's
movement. Up to 1,000 rows (`limit` lowers it). `ID` joins a row to the JSON; a usage row's
`ID` is its day key `<date>:<product>` (not a transaction id), and a starting balance's is
empty. A top-up carries its payment (`Card charged (USD)` VAT included, `VAT (USD)`,
`Paid via`: Checkout / Automatic top-up / Saved card, `Invoice number`), and a day of calls
has a `Calls` link to `GET /calls/export` for that day's bounds on the statement's clock. A
window with more rows is cut to its newest: the file opens at "Balance before the first row
listed", says it was cut on the next line, and is named `…-partial.csv`. It arrives as an
attachment named `transactions-<first day>_<last day>-<day read>.csv`.

**How a call is charged**, for reconciling a `usage` day against `GET /calls`: per second,
at the per-minute price in force when its charge is written, right after the call ends (a
phone call's price, or a browser call's), rounded up to the next cent. A call passed to a person is one charge in two parts,
so it counts once in a `usage` row's `count`: up to the handoff at the call's own price,
from the handoff to the end at the transfer price; the two parts add up to the call's
length and each is rounded up on its own. A hand-off to a SIP address of the caller's own
phone system has no second part: billing ends at the hand-off (**A transfer to a SIP
address**, under Tools). Both double where AI training is switched off.
A call with a Palestinian Authority number at either end (`+97222`, `+97242`, `+97282`,
`+97292`, `+97256` or `+97259`) is charged a flat premium price instead (under Billing → Prices),
for the whole call — both parts of a handoff — and doubled the same way; a call placed on
the workspace's own Telnyx account (see **Carrier Accounts**) never pays it. The prices are
under Billing → Prices in the dashboard, which lists the premium under "Charged in this
period" once a call has paid it.

**When a price changed.** Prices change at an instant (the dashboard shows it to the
minute, with its zone), and a call pays the price in force when its charge is written —
the call sheet's cost tip says that moment. `GET /billing/rates` reads the current prices.

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

### GET /billing/details — what invoices print

Every payment the workspace makes — a credit top-up, an automatic top-up, a phone
number's first and every monthly charge — comes with **one invoice, emailed to the
billing email when it is paid**. These are the details every invoice prints.

**Scopes:** `billing:manage` (the full email, address and tax ID are personal data;
`GET /billing` shows a `billing:read` key only a masked `billing_email`).

**Response:**
```json
{
  "name": "Acme Ltd",
  "email": "billing@acme.example",
  "address": { "line1": "1 Example St", "line2": null, "city": "Tel Aviv", "state": null, "postal_code": "6100000", "country": "IL" },
  "tax_id": { "type": "il_vat", "value": "000012345" },
  "language": "he"
}
```

A workspace that never set them reads the defaults its invoices would use — the
workspace name, the owner's email, `address: null`, `tax_id: null`, `language: "en"` —
and the read changes nothing. **Invoices are issued in English** whatever `language`
says (`he` only prints dates day first).

### PATCH /billing/details — set what invoices print

**Scopes:** `billing:manage`

Send only what changes; a field left out stays. `null` resets `name` (to the workspace
name) and `email` (to the owner's email), and removes `address` or `tax_id`. Response:
the whole set, as `GET /billing/details` returns it. Only invoices issued after the
change print it — an issued invoice is never rewritten.

| Field | Send |
|-------|------|
| `name` | 1–256 chars |
| `email` | a full email address, ≤ 254 chars |
| `address` | `{ line1, country }` required (`country` = two letters, e.g. `IL`); `line2`, `city`, `state`, `postal_code` optional, ≤ 200 each |
| `tax_id` | `{ type, value }` — one per workspace, a new one replaces the old; spaces are removed from `value` (≤ 64) |
| `language` | `en` \| `he` |

`tax_id.type`: `il_vat` (Israeli VAT / company number — עוסק מורשה, ח.פ.), `eu_vat`,
`gb_vat`, `us_ein`, `ca_bn`, `au_abn`, `ch_vat`, `no_vat`, `ae_trn`, `za_vat`.

```bash
curl -X PATCH "$YAPPR_API_URL/billing/details" \
  -H "Authorization: Bearer $YAPPR_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Acme Ltd","address":{"line1":"1 Example St","city":"Tel Aviv","postal_code":"6100000","country":"IL"},"tax_id":{"type":"il_vat","value":"000012345"}}'
```

**Errors** (all `400`, nothing changed): `BILLING_DETAILS_EMPTY`,
`BILLING_DETAILS_UNKNOWN_FIELD`, `BILLING_NAME_INVALID`, `BILLING_EMAIL_INVALID`,
`BILLING_ADDRESS_INVALID` (no `line1` or no two-letter `country`), `TAX_ID_TYPE_UNSUPPORTED`,
`TAX_ID_INVALID` (not valid for its type — the old tax ID stays on),
`BILLING_LANGUAGE_INVALID`. `502 BILLING_UNAVAILABLE`: some details may have been saved —
read `GET /billing/details`, then try again.

Pass only what the user said. Never invent a business name, address or tax number.

### GET /billing/invoices — every invoice, to view or download

**Scopes:** `billing:read` (a bookkeeping key needs nothing that can top up).

| Query | Default | Notes |
|-------|---------|-------|
| `limit` | `20` | 1–100, else `400 INVOICE_LIMIT_INVALID` |
| `cursor` | — | the previous page's `next_cursor`; one not issued here is `400 INVOICE_CURSOR_INVALID` |

**Response:**
```json
{
  "invoices": [
    {
      "number": "4F2A9C1B-0007",
      "kind": "credits_top_up",
      "description": "Credits top-up",
      "phone_number": null,
      "status": "paid",
      "issued_at": "2026-10-21T08:03:44.000Z",
      "paid_at": "2026-10-21T08:03:44.000Z",
      "currency": "usd",
      "net_cents": 5000, "vat_cents": 900, "total_cents": 5900,
      "refunded_cents": 0,
      "lines": [
        { "description": "Credits top-up", "quantity": 1, "unit_amount_cents": 5000, "amount_cents": 5000 },
        { "description": "VAT (18%)", "quantity": 1, "unit_amount_cents": 900, "amount_cents": 900 }
      ],
      "view_url": "https://…", "pdf_url": "https://…"
    }
  ],
  "next_cursor": "…" | null
}
```

- `kind`: `credits_top_up` | `auto_top_up` | `phone_number` (with `phone_number` in E.164) | `other`.
- `status`: `paid` | `open` (issued, not paid yet) | `uncollectible`. Drafts and voided
  invoices are never listed. `refunded_cents > 0` = (partly) refunded.
- Follow `next_cursor` until `null`; a page may hold fewer than `limit` and still have more.
- Hand `view_url` / `pdf_url` to whoever keeps the books.

---

### POST /billing/topup

Add credits to the account. Creates a hosted Checkout URL for the purchase — it never
charges the saved card in the background; send the user to `checkoutUrl` to confirm the
payment.

**Scopes:** `billing:manage`

**ALWAYS require explicit user confirmation before calling this endpoint.**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `amount_cents` | int | yes | Amount in cents, at least `100` — e.g. `2000` = $20.00 |

**Response:** `200` — `{ "checkoutUrl": "https://…", "sessionId": "string" }`

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

A workflow agent has no `webhook_url`: `PATCH /agents/{id}` refuses `webhook_url`,
`webhook_events` and `webhook_headers` with `400 WORKFLOW_SETTINGS_REQUEST_INVALID`
(`field_unknown`). To notify a URL about a call, create an `http` tool (`POST /tools`) and
bind it to an After trigger in `PUT /agents/{id}/workflow` — see
[Trigger events](#trigger-events-the-workflows-own-names) below.

When an existing agent was converted to the workflow engine, its `webhook_url`,
`webhook_events` and `webhook_headers` were cleared and became follow-ups: **one** HTTP tool
(the same endpoint and headers) and **one** After trigger per subscribed event, so each event
is still sent exactly once. The request body changed shape — three cases:

**1. Agent not yet converted** — still posts from `webhook_url`, exactly as before:
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

**2. Converted agent's follow-up** — the event name stays at the **top level** (the
conversion binds a fixed input named `event`), spelled the way the endpoint read it before:
`call.analyzed` stays `call.analyzed` although its trigger is `analysis.ready`, and
`call.started` keeps its name but is now sent at pickup (trigger `call.answered`).
Everything else is under `call`:
```json
{
  "event": "call.analyzed",
  "call": {
    "version": "1", "phase": "after",
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

**3. Follow-up authored natively** on a workflow agent — the body is `{"call": {…}}` plus the
step's own inputs, with **no** `event` member and no `X-Webhook-Event` header on its first
send (that header is set on tool tests and on retries). Read `call.status` (`completed`,
`failed`, `no_answer`) to tell how the call ended, or give each follow-up its own step and
URL, or bind a fixed `event` input (a `literal`) the way the conversion does.

Where each field of the old body went on a converted agent:

| Not yet converted | Converted follow-up |
|---|---|
| `event` | `event` — unchanged, top level, legacy spelling (a natively authored follow-up has none) |
| `timestamp` | *gone* — it was the sender's clock; the call's own times are `call.started_at` / `call.ended_at` |
| `agent_id`, `company_id`, `call_id` | `call.agent_id`, `call.company_id`, `call.call_id` |
| `data.direction` | `call.call_direction` |
| `data.from_number`, `data.to_number` | `call.caller_number`, `call.callee_number` |
| `data.status`, `data.duration_seconds`, `data.transcript` | `call.status`, `call.duration_seconds`, `call.transcript` |
| `data.disposition` (label string) | `call.disposition` — an **object**; the label is `call.disposition.label` |
| `data.summary` | `call.analysis.summary` |
| `data.extracted_data` | `call.analysis.extracted_data` |
| per-event extras inside `data` (a failure's `error`, a blocked call's reason) | *gone* |

There is no `data` wrapper after the move. A receiver for a converted agent can keep
switching on `event`, but must read every other field from `call`; to serve both shapes,
branch on the presence of `call`.

The `call` object is the same **call package** a workflow tool receives, so it carries
more than the old payload did: the lead, the call's `metadata` and per-call variables,
billing, the recording URL and the full disposition object are all in it. The warning
below about fetching `GET /calls/:id` applies to the old shape only.

**Event reference (legacy names, and the old body's `data`):**

| Event | When it fires | `data` contents |
|-------|---------------|-----------------|
| `call.started` | Call begins (inbound ring or outbound dial) | `direction`, `from_number`, `to_number` |
| `call.answered` | Caller connects, AI starts talking | `direction`, `from_number`, `to_number` |
| `call.ended` | Call finishes | `direction`, `from_number`, `to_number`, `duration_seconds`, `status` |
| `call.no_answer` | Call rings but nobody picks up | `direction`, `from_number`, `to_number` |
| `call.failed` | Call fails to connect or errors | `direction`, `from_number`, `to_number`, `error` |
| `call.dnc_blocked` | Outbound call attempt blocked because the destination is on the company DNC list. No carrier leg, no charge. Fires for both fresh API calls and queued calls that hit DNC at dispatch time. | `direction`, `from_number`, `to_number`, `status`, plus `extra_data: { dnc_reason, dnc_entry_id, queued? }` |
| `transcript.ready` | Transcript saved after call ends (legacy — prefer `call.analyzed`) | `transcript`, plus the call fields below |
| `call.analyzed` | Full AI pipeline complete: transcript + disposition + summary + extraction | `direction`, `status`, `from_number`, `to_number`, `duration_seconds`, `disposition` (label string or null), `summary`, `transcript`, `extracted_data` (object with agent's extraction parameter values, or absent if none configured) |

**Every call event's `data`** also carries `started_at` (call placed), `answered_at` (audio came up; absent until it did) and `recording_started_at` (when the recording began — `transcript[].start` / `end` are ms from here; `null` until the recording is saved, so usually `null` on `call.ended`, and on browser calls), all ISO 8601 with `+00:00`, read exactly as `GET /calls/:id` reads them. `transcript.ready` and `call.analyzed` are sent after the recording is saved, so on a phone call they carry `recording_started_at`.

**Default recommended set:** `call.no_answer`, `call.failed`, `analysis.ready` (legacy:
`call.analyzed`)

### Trigger events (the workflow's own names)

The table above is indexed by the legacy event names, because that's what an agent not yet
converted still sends, and what a converted agent's follow-up still puts in `event`. A
workflow's After trigger is authored against its own
`event` enum instead — most values are the same word, a few are not, and a few exist only
on the workflow side with no legacy equivalent at all:

| Trigger event | Legacy equivalent | Notes |
|---|---|---|
| `call.answered` | `call.answered`, `call.started` | The pickup itself — the **only** event published while the call is still going. |
| `call.ended` | `call.ended` | |
| `call.failed` | `call.failed` | |
| `call.no_answer` | `call.no_answer` | |
| `any_end` | *(none — subscribe to the three above individually on the legacy side)* | Authoring shortcut, not a wire event: `call.ended` + `call.failed` + `call.no_answer`. Includes the unanswered call, so a step on it cannot wait for call data. |
| `request.failed` | `call.dnc_blocked` | The request died before anything was dialled; no call exists. |
| `transcript.ready` | `transcript.ready` | |
| `analysis.ready` | `call.analyzed` | |
| `lead.ready` | `lead.created`, `lead.updated` | |
| `recording.ready` | *(new)* | The legacy webhook never pushed this; you polled `recording_url`. |
| `billing.ready` | *(new)* | |
| `transfer.accepted` | *(new)* | A transfer was accepted; the call is bridged and still going. |
| `transfer.answered`, `transfer.failed` | *(new)* | Accepted by the schema, but nothing publishes them: a follow-up on either never runs. Do not author them. |
| `ai_session.ended` | *(new)* | The AI portion of the call ending, distinct from the call itself ending. |

#### What each event can have

A step's `requires` (and an `artifact` input) may name only what its event can have. This is
what Check and publish hold a document to:

| Event | Call facts in `call` | May wait for (`requires`) | Never available |
|---|---|---|---|
| `call.answered` | before-call members, `call_id`, `started_at`, live `status` | nothing (call still going) | `ended_at`, `duration_seconds`, `ended_by`, `close_reason`, every result |
| `call.ended` | all of them, `status: completed` | `transcript`, `analysis`, `recording`, `lead`, `billing` (each arrives a little later) | `disposition` until the analysis |
| `call.failed` | all of them, `status: failed` | nothing offered; `transcript`, `analysis`, `recording` are refused | `disposition` unless a `Failed` one exists |
| `call.no_answer` | all of them, `status: no_answer` | nothing; all five are refused | every result; `disposition` only if a `No Answer` one exists |
| `any_end` | `status`, `ended_at`, `duration_seconds`, `ended_by`, `close_reason` | nothing (it includes `call.no_answer`); Check warns `after_any_end_waits` | the results of an unanswered call |
| `request.failed` | no call exists | nothing; all five are refused | everything on a call |
| `ai_session.ended`, `transfer.accepted` | whatever the call has then | nothing | ended-call members, every result |
| `transcript.ready`, `recording.ready`, `lead.ready`, `billing.ready` | the ended call | the other four | results still being produced |
| `analysis.ready` | the ended call, plus `analysis` and `disposition` (written with it, so always present) | `transcript`, `recording`, `lead`, `billing` | results still being produced |

Facts are read when the follow-up starts, not when the event fired. `disposition` is
guaranteed on `analysis.ready` only.

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
`pending` \| `unknown`; `unknown` leaves out a row whose retry was delivered, which is
settled), `source` (`live` \| `test`), `retried` (`true` \| `false`: only rows already sent
again — `retried_by` set — or only those not; `?status=failed&retried=false` is the list a
"retry every failure" loop reads, and a page can then hold fewer rows than `limit` while
`has_more` is `true`), `from`, `to` (a real ISO 8601 timestamp on the
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
      "status": "delivered" | "failed" | "pending" | "unknown",
      "response_status": 200,
      "attempt_count": 1,
      "error_message": "string | null",
      "error_code": "http_timeout | ... | null",
      "tool_name": "string | null",
      "retry_of": "uuid | null",
      "retried_by": "uuid | null"
    }
  ],
  "pagination": { "limit": 50, "has_more": true, "next_cursor": "opaque string | null" }
}
```

`status` is the field to branch on: `delivered` — your endpoint accepted it; `failed` — it
did not, after every attempt (for a workflow tool, including a 2xx with a body the tool
could not use); `pending` — it has not settled yet; `unknown` — a workflow tool's request
(or a retry) got no answer in time, so the endpoint may already have acted: check there
first. A workflow tool's timeout recorded before 2026-09-27 reads `unknown` too (a retry
needs `{"acknowledge_unknown": true}`); an agent's own webhook and a legacy webhook tool that
got no answer stay `failed`. `at` is when it settled, and `delivered_at` is the same moment on a `delivered` row
(`null` on a `failed`, `pending` or `unknown` one) — never a separate "was it delivered"
flag. `response_status` is what your endpoint answered
with, `null` when nothing answered at all. `attempt_count` includes the attempt that
settled it, and on a retry counts the whole chain (from 2026-10-01). `error_message` is one
sentence for a person, only on a failure — wording may change, so branch on `status` and
`error_code`, never on the text. `error_code` is the reason as a code: `http_timeout`,
`http_network_error`, `downstream_http_error`, `output_schema_invalid`,
`invalid_json_response`, `response_too_large`, `url_resolves_private` or `delivery_failed`;
`null` when delivered or pending. A retry is a row of its own: `retry_of` is the delivery it
re-sent, and that one's `retried_by` points back — a retry loop skips rows whose
`retried_by` is set. `tool_name` is the
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
| `request.method`, `request.header_names` | The method and header names it was sent with — every header, the platform's own included (from 2026-10-01). Header values are never returned. |
| `request.timeout_ms` | How long the endpoint was given to answer: the limit of the tool revision that sent it (30,000 for an agent's own webhook) |
| `test_id` | The tool test that sent it (`GET /tools/{id}/tests/{test_id}`); `null` for anything else |
| `request.body` | The body as it was sent. A retry re-sends exactly this. For a `GET` tool these fields went as query parameters. |
| `retry_target` | Where `POST /deliveries/{id}/retry` would send it **now**: `destination` (same form), `tool_revision_id`, and `changed` — `true` when that is not where this delivery went. On an older delivery (`request.recorded: false`, so no `request.destination`) `changed` is always `false` and tells you nothing. `null` when the sender is no longer a webhook with an address |
| `response.status` | What your endpoint answered; `null` when nothing answered. |
| `response.body` | What your endpoint answered, as text, at most 2,000 characters. |
| `retry_of` / `retried_by` | The delivery this one re-sent / the retry that re-sent this one. |
| `retryable` | `true` when `POST /deliveries/{id}/retry` would send it: a `failed` delivery your endpoint did not accept, or an `unknown` one (sent only with `{"acknowledge_unknown": true}`). Never one answered 2xx. |
| `exchange` | The delivery's full record (from 21 October 2026): `request` exactly as it left — `method`, the full `url` with its query, every header in `headers`, `body` — and `response` — `status`, every header, `body` (at most 2,000 characters for a webhook delivery), `error`, `timed_out` — with secrets as `"[REDACTED]"` listed in `masked`; `status`, `started_at`, `duration_ms`; `details_expired` after 90 days. `null` for an older delivery. Bodies `null` when `bodies_withheld`; `url` is `scheme://host` when `destination_path_withheld` |
| `bodies_withheld` | `true` when the key lacks `calls:read`: both bodies are then `null`. |
| `destination_path_withheld` | `true` when the key holds neither `tools:read` nor `tools:update`: both destinations are then `scheme://host` (for a Make or Zapier hook the path is the credential). `retry_target.changed` still compares the whole addresses |

**Scopes:** `calls:read` or `tools:read`; the two bodies need `calls:read`, and the
destinations' paths need `tools:read` or `tools:update`.

What is withheld, in both bodies and in a tool test's outcome: a configured header value
(and a Bearer or Basic credential without its scheme) of 6 characters or more reads
`[REDACTED]` wherever it appears — as a value, inside a string, or as a key — and a shorter
one only where it is a whole JSON string (the whole body, or a string value in it), never
inside text, keys, numbers or the call fields Yappr writes itself (`version`, `phase`,
`channel`, `test`, the ids, numbers and times under `call`); the
address's query string, whole, and each query value of 6 characters or more, wherever they
appear. A query value under 6 characters (`v=1`) is never withheld and never hides the same
characters elsewhere, and `Content-Type`, `X-Webhook-Event`, `X-Webhook-Test` and
`X-Webhook-Delivery-Attempt` are not withheld.

**Headers Yappr adds, and deduping on them.** Every delivery (each row here) and every
request a workflow agent's tool makes during a live call carries `X-Webhook-Delivery-Id`
(the delivery's `id`; a retry — and a `call.dnc_blocked` the platform sends again on its
own — repeats the **first** delivery's id), `X-Webhook-Delivery-Attempt` (counted across
retries: a retry of a delivery sent once is `2`), `User-Agent: Yappr-Webhooks/1.0` (unless
the tool sets one), and on a retry `X-Webhook-Retry-Of` (the delivery it re-sends). Tests
carry `X-Webhook-Event: tool.test` and `X-Webhook-Test: true` from the first send. Dedupe
deliveries on `X-Webhook-Delivery-Id`. The exception: the webhook tool of an agent not yet
on the workflow engine, called during a live call, sends only the headers configured on it (no id, no attempt, its
HTTP client's `User-Agent`) — do not dedupe those on these headers. An address is never returned with its query string, fragment
or credentials. `response.body` is `""` for an empty answer, and `null` when nothing
answered, for deliveries made before 2026-09-23, and for a workflow step's refusal or a 2xx
the tool could not use (the status is kept, not the text); a workflow step or tool test
your endpoint accepted keeps what came back (from 2026-09-27), and a retry always keeps the
answer.

### POST /deliveries/:id/retry

Re-sends the stored body once, to where the tool points **now** — read
`retry_target.destination` and `retry_target.changed` on `GET /deliveries/:id` first. `201`
with the new delivery, in the `GET /deliveries/:id` shape (`retry_of` = the original); its
`status` is `unknown` again if the endpoint did not answer in time. Only a `failed` or
`unknown` delivery, and only once per delivery — two racing retries send once. The body is
none, `{}` or `{"acknowledge_unknown": true}`: an `unknown` delivery without it is
`409 DELIVERY_OUTCOME_UNKNOWN` (nothing sent — check the endpoint, then send the flag), and
any other body is `400 DELIVERY_RETRY_INVALID`. Nothing is sent on a refusal:
`409 DELIVERY_NOT_RETRYABLE` (it was accepted — including a 2xx the tool could not use,
which is never retried — or has not settled), `409 DELIVERY_ALREADY_RETRIED` (with
`retried_by`), `409 DELIVERY_SENDER_UNAVAILABLE`. If the retry fails too, retry the retry.

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
| GET /agents/:id/workflow, GET /agents/:id/workflow/versions | `agents:read` |
| PUT /agents/:id/workflow, POST /agents/:id/workflow/validate \| /publish \| /rebind | `agents:update` |
| POST /agents/:id/duplicate | `agents:create` |
| GET /agents/:id/integrations, GET /agents/:id/tools-and-integrations | `agents:read` |
| POST /agents/:id/integrations, PATCH/DELETE /agents/:id/integrations/:integration_id | `agents:update` |
| GET /tools (list/get) | `tools:read` |
| POST /tools (create) | `tools:create` |
| PATCH /tools/:id | `tools:update` |
| DELETE /tools/:id | `tools:update` |
| POST /tools/:id/restore | `tools:update` |
| GET /tools/:id/workflow-revisions | `tools:read` |
| POST /tools/:id/workflow-revisions | `tools:update` |
| GET /tools/:id/bindings | `tools:read` |
| POST /tools/attach | `tools:update` |
| POST /tools/detach | `tools:update` |
| POST /tools/:id/test | `tools:update` |
| GET /deliveries, GET /deliveries/:id | `calls:read` or `tools:read` (bodies need `calls:read`: `tools:read` alone reads deliveries without `request.body` / `response.body` — caller numbers, a campaign contact's name in `call.call_variables`, collected values) |
| POST /deliveries/:id/retry | `tools:update` |
| GET /api-keys, GET /api-keys/:id | `api_keys:read` or `api_keys:manage` (personal data: `revoked_by.email` on `?revoked=true`) |
| POST /api-keys | `api_keys:manage` |
| DELETE /api-keys/:id | `api_keys:manage` |
| POST /agents/:id/extraction/dry-run | `agents:read` |
| GET /phone-numbers (list) | `phone_numbers:search` |
| POST /phone-numbers/search | `phone_numbers:search` |
| POST /phone-numbers/purchase | `phone_numbers:purchase` |
| POST /phone-numbers/configure | `phone_numbers:configure` |
| POST /phone-numbers/{id}/release | `phone_numbers:purchase` |
| POST /phone-numbers/{id}/keep | `phone_numbers:purchase` |
| GET /sip-endpoints (list/get), GET /sip-endpoints/status | `sip_endpoints:read` (a `uri` endpoint's `slug`/`sip_uri` and a trunk's `sip_username` also need `sip_endpoints:manage`, else `null`) |
| POST /sip-endpoints (create) | `sip_endpoints:manage` |
| PATCH /sip-endpoints/:id | `sip_endpoints:manage` |
| DELETE /sip-endpoints/:id | `sip_endpoints:manage` |
| POST /sip-endpoints/:id/rotate-password | `sip_endpoints:manage` |
| GET /carrier-accounts (list/get) | `carrier_accounts:read` |
| GET /carrier-accounts/status | none — any valid key for the workspace (not one limited to some agents) |
| POST /carrier-accounts, PATCH/DELETE /carrier-accounts/:id | `carrier_accounts:manage` |
| POST /carrier-accounts/:id/connection \| /test \| /reactivate | `carrier_accounts:manage` |
| POST /carrier-accounts/:id/numbers, DELETE /carrier-accounts/:id/numbers/:phone_number_id | `carrier_accounts:manage` |
| GET /billing | `billing:read` |
| PATCH /billing (spending limit) | `billing:manage` |
| POST /billing/setup | `billing:manage` |
| POST /billing/topup | `billing:manage` |
| GET /billing/consumption | `billing:read` |
| GET /billing/transactions, GET /billing/transactions/:id | `billing:read` (refused to a key limited to some agents) |
| GET /billing/rates, GET /billing/invoices | `billing:read` |
| GET /billing/details, PATCH /billing/details | `billing:manage` |
| GET /call-windows | none — any authenticated key for the workspace |
| PUT /call-windows | `call_windows:manage` |
| GET /calls (list/get) | `calls:read` |
| GET /calls/export | `calls:read` |
| POST /calls | `calls:create` |
| GET /calls/:id/recording (the signed `recording_url`) | none — the link's signature |
| POST /calls/:id/recording/revoke | `calls:create` |
| POST /agents/:id/test-call, GET /agents/:id/test-call | `calls:create` |
| POST /calls/:id/end (an unopened browser session) | `calls:create` |
| POST `cancel_url` (a web mint's) | none — the session token, as `x-yappr-web-token` |
| POST /call-requests | `calls:create` |
| GET /call-requests/:id | `calls:read` |
| POST /call-requests/:id/start | `calls:create`, plus the request's `x-yappr-call-request-key` |
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
| GET /tool-connections, /tool-connection-auth-attempts/:id, /tool-connections/attempts/:id | `tool-connections:read` |
| POST /tool-connections, /tool-connections/:id/reconnect | `tool-connections:manage` |
| DELETE /tool-connections/:id | `tool-connections:manage` |
| POST /tool-connections/:id/remove | `tool-connections:manage` |
| POST /tool-connections/cleanup | `tool-connections:manage` |
| POST /tool-connections/attempts/:id/cancel | `tool-connections:manage` |
| GET /tool-connections/:id/actions \| /options/:resource \| /agents | `tool-connections:read` |
| POST /tool-connections/:id/actions/prepare, POST /tool-connections/:id/check | `tool-connections:manage` |
| GET /do-not-call (list/get) | `do_not_call:read` |
| POST /do-not-call | `do_not_call:manage` |
| PATCH /do-not-call/:id | `do_not_call:manage` |
| DELETE /do-not-call/:id | `do_not_call:manage` |
| GET /campaigns (list/get/stats), GET /campaigns/defaults | `campaigns:read` |
| GET /campaigns/:id/leads | `campaigns:read` |
| POST /campaigns (create) | `campaigns:manage` |
| PATCH /campaigns/:id | `campaigns:manage` |
| DELETE /campaigns/:id (archive) | `campaigns:manage` |
| POST /campaigns/:id/restore | `campaigns:manage` |
| POST /campaigns/:id/leads (enroll) | `campaigns:manage` |
| DELETE /campaigns/:id/leads/:leadId | `campaigns:manage` |
| POST /campaigns/:id/launch \| /pause \| /resume \| /stop | `campaigns:manage` |

---

# Flow agents — retired

**Flow agents are retired — none can be created.** `type: "flow"` and `flow_config` were the
pre-release procedural shape — a graph of nodes instead of one `system_prompt`.
`POST /agents` answers `410 AGENT_LEGACY_CREATION_GONE` to a body carrying `system_prompt`,
`type` or `flow_config` (create with `name` + `workflow.global_instructions`, or `name` +
`template`), and at release the existing agents were converted onto the workflow engine —
apart from a few held back by the native Google notice period (see **Connected accounts**).
Build the graph in **The conversation graph** above, inside *Canonical workflow
authoring*; [`flow-composition-guide.md`](flow-composition-guide.md) still carries
transition-design and humanization patterns at a conceptual level, but its JSON examples
predate the migration — follow the shapes above, not the ones there.

`agents.type` and `agents.flow_config` remain on a converted agent's row as frozen
history. `GET`/`PATCH /agents/:id` null them out in the response (see *Canonical workflow
authoring*), and `PATCH` refuses a body naming `flow_config` (or `system_prompt`, `type`)
outright for any workflow-engine agent — `400 WORKFLOW_SETTINGS_REQUEST_INVALID` with an
`issues[]` entry per field (`code: "field_unknown"`, e.g. `/flow_config`: "A workflow agent
has no flow_config. Its graph is the workflow document — edit it through Save workflow.").
Nothing is written; it does not silently drop the field.

Three endpoints below `flow_config` were not withdrawn and still answer requests, with a
real gap worth knowing before you reach for them:

- `GET /agents/:id/flow/versions` is read-only — harmless against a converted agent, just
  meaningless, since nothing it shows is what the agent will actually do on a call.
- `POST /agents/:id/flow/test` **refuses** a workflow agent outright:
  `409 WORKFLOW_FLOW_TEST_UNSUPPORTED`, "Rehearsing a workflow agent needs a browser or a
  Web SDK client." It answers that with any body, or none, before reading it (an agent that
  is not there is `404` first). There is no text-only rehearsal of a workflow over the API. Since every
  agent `POST /agents` can create today is a workflow agent, that means every agent you can
  create — a legacy flow agent frozen before this release is untouched, still answering its
  old `400` when it has no `flow_config`. Rehearse a workflow agent for real instead, with
  no phone number but with someone talking in a browser:
  `POST /calls {"type":"web","agent_id":"…"}` returns a single-use `token`, a `protocol`
  (`offer`, or `call_request` when the agent runs steps before it answers) and a
  `connection` block, which a page running `@goyappr/client` connects with; or
  `POST /shared-links` returns a page a person can open and talk to the agent from (the
  dashboard's Test tab is the third way). Each produces a real, transcribed call: read it
  with `GET /calls/{id}` for its analysis, follow-ups and execution. What a server can check
  with no browser at all: `POST /agents/:id/extraction/dry-run` (what the agent collects
  from a transcript you supply) and `POST /tools/{id}/test` (one tool, mock or real).
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
below and call it from a `sequence` step or an `action` node bound to that connection
(conversion drops the old node).

---

# Connected accounts

Calendars, mailboxes and every other third-party account an agent acts on are
connected here. This is the only integration path.

**The `/integrations` endpoints are retired.** `GET /integrations` and
`DELETE /integrations/{id}` answer `410` with `code: ENDPOINT_RETIRED` and will
stop answering entirely in the next release. They listed and revoked the native
Google Calendar / Gmail credentials, which are retired: saving a document with a native
Google step is refused, and an agent that still had one keeps it only until the end of its
30-day notice period (30 days from the day we message the owner) — after that it keeps
answering calls, without that step. When such an agent is converted onto the workflow
engine the native step is **dropped** (the route carries on to where it led), and no
calendar check, event or email is made until Google Calendar or Gmail is connected here as
a connected app (Tools → Connected accounts, `POST /tool-connections`) and the action is
added back to the workflow (*Turning a connected account into a tool*, below) — or the app
is given to the agent as a whole with `POST /agents/{id}/integrations
{"connection_id": "…"}`. Do not retry a `410` — it means permanently gone. Use the table
below instead.

Connection control is available on deployments that enable the workspace connection service. An unavailable service is not permission to fall back to anything: there is nothing to fall back to.

| Endpoint | Scope | Contract |
| --- | --- | --- |
| `GET /tool-apps/connection-options` | `tools:read` | Authentication-configured app slugs/names; discovery is `GET /tool-apps`, neither executes an action. |
| `GET /tool-connections` | `tool-connections:read` | Safe company metadata, 50 records/page, opaque `next_cursor`. Pass the cursor unchanged; it binds company and environment. `?state=` (one record state, or `removed`) and `?toolkit=` (one slug from `GET /tool-apps/connection-options`) narrow it; anything else in the query string is `400 CONNECTION_INVALID`. |
| `GET /tool-connections/{id}` | `tool-connections:read` | Exact account status, with server checks coalesced for 15 seconds. |
| `POST /tool-connections` | `tool-connections:manage` | Body `{ "toolkit": "gmail", "label": "Team mailbox", "locale": "en" }`; returns `201 {connection, attempt, handoff_url}`. Hosted OAuth only; no provider ownership fields or manual secrets accepted here. |
| `GET /tool-connection-auth-attempts/{id}` | `tool-connections:read` | Exact local attempt plus safe connection state. Never infer success from list differences or browser messages. |
| `GET /tool-connections/attempts/{id}` | `tool-connections:read` | The same read under the path the attempt is cancelled at; both answer the same. Takes the attempt id, not the connection id, and no query parameters (`400 CONNECTION_INVALID`). |
| `POST /tool-connections/{id}/reconnect` | `tool-connections:manage` | Body `{ "mode": "replace", "locale": "en" }`; returns a fresh one-time human handoff. For an app connected with a key (`connect.kind: "credentials"`) the link opens the page that asks a person for the new key and replaces it in place at once, with no undo: same connection id, label and bindings, `binding_revision` and `authorization_epoch` each +1. Same-account reauthorization is not yet exposed. |
| `DELETE /tool-connections/{id}` | `tool-connections:manage` | Returns `202 {connection}` after immediate local denial; removal at the connected-app service and manual revocation in the provider account may still be outstanding. Repeated requests do not advance the authorization epoch again. |
| `POST /tool-connections/{id}/remove` | `tool-connections:manage` | Takes a record that is **already disconnected** off the list. `200 {connection}`; repeating it is safe. Not a delete: nothing is disconnected, revoked or erased. |
| `POST /tool-connections/cleanup` | `tool-connections:manage` | No body (or `{}`), no query. Disconnects and takes off the list every connection in the workspace that never had an account and has no sign-in open. `200 {"removed": n}`. Always the whole workspace. |
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

**Replacing the key of a key app.** `POST /tool-connections/{id}/reconnect {"mode":"replace"}`
works the same for an app whose `GET /tool-apps/connection-options` entry has
`connect.kind: "credentials"`, but the handoff page asks the signed-in person for the app's
fields instead of sending them to a sign-in. The key is typed in their browser: it never
travels over the public API, the builder chat or the link. The reconnect body takes `mode` and
`locale` only (`credentials` there is `400 CONNECTION_INVALID`), and a key sent to
`POST /tool-connections` by an API key is `409 CONNECTION_CREDENTIALS_NEED_PERSON`. The link of a key
app opens only that page; there is no hosted sign-in behind it. Before the page says it worked, the
apps Yappr has checked against a live call (Mapbox today) are asked whether they accept the key:
one that refuses it is turned down on the page and nothing changes; for every app the page then
runs the account's check and reads its actions, and says in plain words if either fails. Most apps
have nothing to test the key against, so for them the page can only say "saved, not tested".
**It takes effect at once and Yappr cannot undo it:** the connection keeps its `id`, `label` and
bindings; `binding_revision` and `authorization_epoch` each go up by one; every agent that uses the
connection uses the new key from that moment; and a tool pinned to the old account stops working
until it is rebuilt on the new one. Yappr starts rebuilding the moment the key is replaced (tools made
from the account's action list and tools built by hand on it alike) and an agent that uses several of
them switches in one step: how long it takes grows with the number of tools and agents involved. A
rebuild that fails is tried again by a check every five minutes, waiting longer after each failure, and
a call already in progress keeps failing its app tools until it ends. The old provider account is not
deleted, so the customer revokes the old key in the app. Read
`GET /tool-connections/{id}` afterwards: the new revision, and `check` (from
`POST /tool-connections/{id}/check`) once it has run.

**Reconnecting beside an open sign-in.** A connection holds one open sign-in at a time, and
every connection read carries it as `open_attempt` — `{id, status, expires_at}`, whoever
started it, or `null` — beside `app_name`, the app's display name ("Google Calendar") for
its `toolkit` slug. A reconnect replaces a sign-in nobody has opened yet
(`open_attempt.status: "pending_human"`) and answers `201` with the new `handoff_url`. If a
person is in the middle of one, it answers `409 CONNECTION_ATTEMPT_OPEN` with
`attempt {id, status, expires_at}`: let it finish, or
`POST /tool-connections/attempts/{attempt.id}/cancel` and reconnect again. It is not an
outage — do not retry it blindly.

Give the handoff privately to the intended authorized human, who signs in to Yappr, reviews the target workspace and label, and explicitly claims the browser-bound attempt before receiving the app authorization link. The API key initiator and consenting human are separate identities — a key-started handoff may be claimed by any member of the workspace it is scoped to; a dashboard-started one stays with whoever started it. Treat the URL fragment as a temporary capability: present it only for this consent step; do not log it, persist it in workflow/call data, or include it in voice-agent prompts. Account records belong to the company, not the human who completed consent. Several labeled accounts per app are supported.

Poll the exact attempt with increasing intervals, bounded by `expires_at`. Stop on `completed`, `failed`, `expired`, `cancelled`, or `reconciliation_required`. An attempt's `error_code` says why it ended: `AUTH_SUPERSEDED` (`cancelled`) = a reconnect replaced it before anyone opened its link — use the attempt the reconnect returned. An ambiguous/lost callback exchange must never be redeemed again automatically. `completed` refers to authorization processing; `connection.state` must independently be `ready` before actions can use it. Other states are `disconnected`, `connecting`, `verifying`, `reconnect_required`, and `degraded`.

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

Safe read DTOs expose only local Yappr IDs, toolkit, `app_name`, label, verified provider identity when available, the `open_attempt` above, readiness, decimal-string `binding_revision`/`authorization_epoch`, disconnect progress and timestamps. Replacement increments immutable identity and authorization generations for future bindings; pinned work never silently changes accounts. Disconnect blocks new actions immediately, while already sent actions may finish. Where a `DELETE` settles, in `disconnect_progress`: `record_deleted` — nothing was ever bound to this connection, so there is nothing left to take back (the usual outcome for an authorization that was never finished); `manual_revocation_required` — an account was bound, so a human should remove Yappr's access in the provider account's own app-access settings too; `unknown` — that step needs reconciliation, read the connection again; `pending` — local denial is committed and the upstream step has not reported yet, so read the connection again for its settled value. `none` means the connection has not been disconnected. Connection deletion is not proof that a grant was revoked.

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

Anything not disconnected yet → `409 CONNECTION_STILL_CONNECTED`, naming the
`DELETE /tool-connections/{id}` to send first. That includes a connection whose sign-in was
cancelled or ran out before it ever connected (`state: "connecting"`, `connected: false`,
`open_attempt: null`): its `DELETE` revokes nothing (`disconnect_progress:
"record_deleted"`), then remove it. `POST /tool-connections/cleanup` does both for every
such connection in the workspace — always the whole workspace; it cannot be narrowed to one
key's (to clear only your own, `DELETE` and `remove` each of them). A disconnect advances
`authorization_epoch` only for an account that was bound; a never-bound one stays `"0"`. Somebody
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
   `workflow: {"kind":"app","metadata_id":"<id from 2>","connection_id":"<id from 3>","fixed_inputs":{},"timeout_ms":30000}`.

The tool then behaves like any other: it shows up in `GET /tools/workflow-catalog` once its
revision is promoted and binds to a step exactly like an HTTP tool. A booking journey needs
`GOOGLECALENDAR_FIND_FREE_SLOTS` before `GOOGLECALENDAR_CREATE_EVENT`.

**A calendar read before the call.** The same `GOOGLECALENDAR_FIND_FREE_SLOTS` tool works as a
before-call step, and that is the fastest way to offer times: bind it with
`time_min` = `{"kind":"literal","value":"{{call.time.now.<zone>}}"}` and `time_max` =
`{"kind":"literal","value":"{{call.time.in_days.N.<zone>}}"}` (`<zone>` an IANA zone such as
`Asia/Jerusalem`; `in_days.<n>` takes 1-366 and means the same wall time n days from the moment
the step runs, so the last day is only partly covered). Its result has `busy` (a list of
`{start, end}` in the calendar's wall clock), `available`, `start`, `end` (the window's own end),
`calendar_id`, `timeZone` and `timeZone_note`. Quote
`{{before.<step id>.end|N days from now}}` and `{{before.<step id>.busy|unknown right now}}` in
the conversation step's instructions and tell the agent to offer times from that list, to use
Find free time only for a time after the end (or when the list says unknown), and to write the
same N in `time_max`, the step label and the `end` fallback. A quoted value over 2,048 bytes
counts as no value (about 35 busy events) while the data prepared for the agent still lists up to
64, so choose N by the calendar's load (14 days for up to 2 busy events a day, 7 for up to 4,
3 for up to 10) and do not rely on a fallback. The full journey is *Offering calendar times
without a tool call* in `SKILL.md`.

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

**Webhooks**: none — eval runs emit no webhook; poll the run (or the suite aggregate) as described below.

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

Score formula: `score = sum(weight * passed?1:0) / sum(weight) * 100`. `must_reach_node` reads legacy flow-node ids (`flow_event` turns), so it never passes for an agent built as a workflow — assert with `must_call_tool` or `custom_llm_judge` there.

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
| `suite_run_id` | uuid | Filter by suite execution (the value returned from `POST /agent-eval/suites/:id/run`) |
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

`count` is the number of **charged entries** in a row — one per ledger charge, so on
`voice_call` the number of call charges, not minutes. Days and months are the day a charge
was **debited**. Every charge in the window is counted, however many; if a charge's call or
number cannot be read the report answers `500`, never counting it under nobody.

**Query params:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `from` | ISO8601 | now - 30d | Start of window |
| `to` | ISO8601 | now | End of window, inclusive. A date-only `from` or `to` is a whole day **on the report's clock** (`timezone`, below). `from` after `to` is a `400`. |
| `group_by` | "day" \| "month" \| "total" \| "agent" \| "product" \| "disposition" \| "agent,disposition" \| "source" \| "agent,source" \| "phone_number" | "day" | Bucket granularity; `total` is one row per product for the window (`period: "total"`). Anything else is `400` |
| `product` | enum | (all) | `voice_call` \| `eval_run` \| `phone_number` \| `topup` \| `refund` \| `adjustment`. Anything else (`voice`, `minutes`) is `400 CONSUMPTION_QUERY_INVALID`. |
| `include_topups` | bool | false | Include positive credit purchases. `true` or `false` only |
| `timezone` | IANA name | the workspace's | The clock days, months and date-only windows are read on — by default the workspace's own (the `timezone` set on `PUT /call-windows`, the one the dashboard shows this money on). `timezone=UTC` gives UTC days. An offset such as `+03:00` or an unknown name is `400 CONSUMPTION_QUERY_INVALID` |
| `sort` | `amount` \| `period` \| `name` | `amount` | Largest first; `period` oldest first (only on `day` / `month`); `name` agent, then outcome, then origin, then number, then product, A to Z (not on `day` / `month`) |

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

**`group_by=phone_number`** — one row per number per product, each with `phone_number_id`,
`phone_number` (E.164) and that number's `provider` as `GET /phone-numbers` gives it:
`external` — the workspace's own Telnyx account, which billed the phone minutes itself —
or `telnyx` — a number bought from Yappr. A call's charge goes to the number it used (the
number it called from, or the number that answered it — an inbound call on an `external`
number counts under that number, like one placed from it), a number's monthly rent to that
number. A charge with no number behind it — a browser call, a SIP endpoint call, an eval
run, a top-up — lands in one row per product with `phone_number_id: null`. A removed number
keeps its row and its `phone_number_id` (`phone_number` is the number its calls carry; its
rent keeps the id with `phone_number` and `provider` `null`). A carrier number removed before
2026-09-27 did not keep its id: its calls come back as their own row with
`phone_number_id: null`, `phone_number` set and `provider: "external"` — never in the row
of charges with no number. A call the workspace's carrier number made to one of its own
Yappr numbers counts under that Yappr number (an inbound call there), not the carrier
number. Yappr charges no rent on an `external` number.

**The window.** `to` is inclusive here too (a date-only `to` is that whole day on the
report's clock — the workspace's unless `timezone` says otherwise — where `GET /calls` and
the export read a date-only `to` as a UTC day), and charges are bucketed by when they were debited — a call is debited when it ends. `GET /calls/export` windows on when calls
*started*, with an inclusive `to`. The same `from`/`to` on both reads therefore differs by
the calls that straddle a boundary and by charges with no call behind them, which only this
endpoint has — add `product=voice_call` to compare call spend alone.

---

# Affiliates

Read-only reporting on the workspace's referral program: the companies that signed up
through its referral link, the revenue they were billed, and the commission earned on it.

**There is no write surface.** Yappr enrols partners and sets commission rates, hold periods
and payouts; no endpoint here changes any of them.

**The workspace is always the API key's own.** Neither route takes a company id — not in
the path, the query string or a body; `company_id` in the query is
`400 AFFILIATES_QUERY_INVALID` rather than quietly answering for the key's workspace.

**Money is integer US cents.** Every `*_cents` field (`2500` = $25.00), including
`payout_sent_cents` whatever currency a payout was wired in. Rates are percentages
(`commission_rate_pct`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/affiliates/stats` | Lifetime summary plus a trailing month-by-month breakdown |
| GET | `/affiliates/downline` | One row per enrolled sub-affiliate |

**Scopes:** `affiliates:read` for both. A key without it is `403 INSUFFICIENT_SCOPE`;
`403 AFFILIATE_FORBIDDEN` means affiliate data is not readable for this workspace.

**Earned, payable, paid, outstanding.** `earned` is all commission accrued, including on
revenue still inside the hold (`hold_days`). `payable` is the part of `earned` past the hold
— the number payouts are drawn from. `paid` is payouts sent, voided ones excluded.
`outstanding` = `payable − paid`, and **may be negative**: paid ahead of the hold, not an
error, and not clamped to zero.

**Tiers.** Tier 1 (direct) is the companies that signed up through the workspace's own
link. Tier 2 (override) is the companies referred by a partner Yappr enrolled beneath it.
Most workspaces are tier 1 only: their override fields read `0` and the downline is empty.

---

## GET /affiliates/stats

**Scopes:** `affiliates:read`

**Query params:** `months` — integer 1–60, default 12: how many trailing months `months[]`
covers (`summary` is lifetime whatever it says). Out of range, any other parameter, or one
sent twice or with no value is `400 AFFILIATES_QUERY_INVALID`, naming it.

**Response** (the stats object itself, no `data` wrapper):
```jsonc
{
  "ref_code": "AB12CD34",          // the link is https://app.goyappr.com/signup?ref=AB12CD34
  "commission_rate_pct": 10,       // today's tier-1 rate
  "override_rate_pct": 2.5,        // today's tier-2 rate; 0 with no tier-2 terms
  "hold_days": 30,                 // 0 = payable as soon as earned
  "months_window_months": 12,      // echoes `months`
  "summary": {                     // lifetime
    "clients_invited": 7, "sub_affiliates": 2,
    "referred_revenue_cents": 240000, "override_revenue_cents": 80000,
    "earned_cents": 26000, "direct_earned_cents": 24000, "override_earned_cents": 2000,
    "payable_cents": 21500, "paid_cents": 15000, "outstanding_cents": 6500,
    "earned_before_window_cents": 4000
  },
  "months": [                      // newest first, one row per month, zero-filled
    { "month": "2026-07", "clients_invited": 1, "referred_revenue_cents": 42000,
      "commission_cents": 4400, "direct_commission_cents": 4200, "override_commission_cents": 200,
      "payable_commission_cents": 0, "payout_sent_cents": 5000 }
  ]
}
```

- **The table reconciles.** `earned_before_window_cents` plus the sum of
  `months[].commission_cents` equals `summary.earned_cents` exactly — print the earlier
  bucket beside the months, or the column disagrees with the total.
- **Never re-derive commission from revenue × rate.** The rates are today's; every past
  commission was priced at the rate in force when that customer paid, so after a rate
  change `referred_revenue_cents × commission_rate_pct` does not reproduce
  `direct_earned_cents`. Quote the earned figures; use a rate only for what new revenue
  will earn.
- **A month can be negative.** A refund or chargeback is booked in the month it happens and
  reverses the commission at the rate that originally applied. Keep the negative rows —
  the reconciliation needs them.
- **`clients_invited` counts sign-ups**, including companies that never paid; it is not
  meant to agree with revenue.
- A recent month with revenue and `payable_commission_cents: 0` is the hold, not a gap.

```bash
curl -s "https://api.goyappr.com/affiliates/stats?months=3" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

---

## GET /affiliates/downline

**Scopes:** `affiliates:read`. Takes no query parameters (any is
`400 AFFILIATES_QUERY_INVALID`).

One row per sub-affiliate Yappr enrolled beneath the workspace, driven from the referral
graph rather than from revenue: a partner enrolled yesterday is a row of zeros, not a
missing row. A customer that merely shares its own referral link never appears here. Most
workspaces get `{"data": []}`.

```jsonc
{
  "data": [
    {
      "company_id": "uuid",                // the sub-affiliate's workspace
      "name": "string",
      "ref_code": "EF56GH78",
      "customers": 4,                      // its referred customers that generate an override
      "downline_revenue_cents": 80000,     // the base the override is computed on
      "my_override_cents": 2000,           // the workspace's tier-2 commission through it
      "my_override_payable_cents": 1600,   // the part past the hold
      "my_direct_cents": 900               // tier-1 commission on the partner's own spend
    }
  ]
}
```

`my_direct_cents` (the partner's own spend) and `my_override_cents` (its customers' spend)
are different money: never add them into one figure without saying so.

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
| GET /affiliates/stats | `affiliates:read` |
| GET /affiliates/downline | `affiliates:read` |
