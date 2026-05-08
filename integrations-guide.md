# Integrations Guide — OAuth-backed third-party tools

Yappr's `integrations` feature lets companies connect third-party services via OAuth and reference them from flow agent tool-call nodes. Tokens are stored encrypted (Supabase Vault key) and refreshed automatically by the bot at call time.

**v1 supports**: Google Calendar.

For the broader integration catalog (76 providers via service-account / API-key auth — what prompt agents use today), see `integrations/_overview.md`. This guide covers the OAuth-backed flow that **only flow agents can use**.

---

## How OAuth integrations work

```
1. POST /integrations/google-calendar/connect → returns oauth_url
2. Human admin visits oauth_url in a browser, completes Google consent
3. Yappr stores encrypted tokens in the integrations table, returns an integration_id
4. Flow tool-call nodes reference that integration_id via tool config
5. On each call, the bot fetches a fresh access token via SECURITY DEFINER RPC
```

The encryption key lives in Supabase Vault — never in env vars, never in SQL literals.

---

## Headless OAuth contract for AI agents

Coding agents (Claude Code, Codex, Cursor) cannot complete OAuth in a browser. The contract is:

### Step 1 — Initiate

```bash
curl -X POST "https://api.goyappr.com/integrations/google-calendar/connect" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "return_to": "https://app.goyappr.com/integrations" }'
```

Response:
```json
{
  "oauth_url": "https://accounts.google.com/o/oauth2/v2/auth?...&state=...&code_challenge=...",
  "connect_id": "0d3..."
}
```

### Step 2 — Instruct the human

Print the URL clearly and instruct the user (the human running the Claude Code session) to visit it in a browser, approve the consent screen, and return when done. The OAuth state is anchored to the company's first admin user — the admin must be the one completing consent (not, e.g., a billing-only member).

If the company has no admin, the API returns 409 with `"company_has_no_admin"`. The user must connect once via the dashboard first.

### Step 3 — Poll until connected

```bash
# every 10 seconds, max 5 minutes
curl -s "https://api.goyappr.com/integrations?provider=google_calendar" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.data[] | select(.status=="active")'
```

Once the polling sees a row with `status: "active"`, capture its `id`. That's your `integration_id` for tool-call node config.

### Step 4 — Reference from a flow

Add a tool of type `integration` to the company's `tools` table:

```bash
curl -X POST "https://api.goyappr.com/tools" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "createCalendarEvent",
    "description": "Create a calendar event in the company's connected Google Calendar",
    "type": "integration",
    "config": {
      "provider": "google_calendar",
      "integration_id": "<the integration id from step 3>",
      "action": "create_event"
    }
  }'
```

Then reference the returned `tool.id` from a `tool_call` node in your `flow_config`:

```json
{
  "id": "create_event_node",
  "type": "tool_call",
  "name": "Book the appointment",
  "tool_id": "<the tool id>",
  "args_template": {
    "summary": "{{appointment.summary}}",
    "start_time": "{{appointment.start_iso}}",
    "end_time": "{{appointment.end_iso}}",
    "attendees": ["{{lead.email}}"]
  },
  "transitions": {
    "success_next_step_id": "confirm_booking",
    "error_next_step_id": "apologize_and_handoff"
  }
}
```

---

## Google Calendar actions

These map 1:1 to actions in the Google Calendar integration. Use the `action` field on the tool's config to select.

### `create_event`

Create an event on the configured calendar.

| Arg | Type | Required | Notes |
|---|---|---|---|
| `summary` | string | yes | Event title |
| `start_time` | string (ISO 8601) | yes | e.g. `"2026-05-05T14:00:00+03:00"` |
| `end_time` | string (ISO 8601) | yes | |
| `attendees` | array of email strings | no | Adds invitees |
| `description` | string | no | |
| `location` | string | no | |

Returns the created event resource (id, htmlLink, etc.).

### `list_events`

| Arg | Type | Required | Notes |
|---|---|---|---|
| `time_min` | string (ISO) | no | |
| `time_max` | string (ISO) | no | |
| `max_results` | number | no | default 10 |
| `query` | string | no | full-text search |

Returns `{ items: [...], ... }`.

### `check_availability`

Returns `{ busy: [...], available: bool, start, end }`. Use this BEFORE `create_event` to avoid double-booking.

| Arg | Type | Required |
|---|---|---|
| `start_time` | string (ISO) | yes |
| `end_time` | string (ISO) | yes |

Pair this with a custom transition to handle "no availability":

```json
"transitions": {
  "success_next_step_id": "confirm_with_caller",
  "error_next_step_id": "apologize_and_handoff",
  "custom": [
    {
      "id": "no_avail",
      "label": "No availability in requested window",
      "jsonpath": "$.available",
      "equals": "false",
      "next_step_id": "suggest_alternatives"
    }
  ]
}
```

### `cancel_event`

| Arg | Type | Required |
|---|---|---|
| `event_id` | string | yes |

Returns `{ cancelled: true, event_id }`.

---

## Failure modes

### Token refresh failure during a call

The bot refreshes tokens on demand under an asyncio.Lock. After 4 consecutive refresh failures (or an `invalid_grant` from Google), the integration is auto-marked `status='disconnected'`. Subsequent tool-call nodes fail with `"integration is disconnected"` and route to the `error` branch.

**Mitigation:** design every tool-call node's `error` branch to apologize and either:
- Route to a manual handoff conversation node ("Let me have someone call you back to confirm")
- Fire a webhook tool to notify the human team
- End the call with a clear post-end webhook firing

### Permissions revoked at Google

Same effect as a refresh failure — Google returns `invalid_grant`, the integration goes `disconnected`. The user must reconnect via `/integrations` (UI) or re-run the Connect flow.

### Cross-company access attempts

The encryption RPCs are `service_role`-only. The `integrations` table has RLS scoped by company. The bot fetches by `integration_id`; the RPC additionally filters `WHERE deleted_at IS NULL`. Cross-company access is impossible by design, but the test `Phase 9.3` validates this empirically.

---

## Disconnecting

```bash
curl -X DELETE "https://api.goyappr.com/integrations/<integration_id>" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

This:
1. Best-effort POSTs to `https://oauth2.googleapis.com/revoke?token=<refresh_token>` (Google invalidates the grant)
2. Soft-deletes the row (`deleted_at`, `status='disconnected'`, encrypted columns nulled)

Flows with tool-call nodes referencing the disconnected integration will hit their `error` transition on next use.

---

## What's NOT in v1

- Re-grant for additional scopes (full disconnect + reconnect required)
- Per-calendar selection (always uses the user's `primary` calendar — set in the metadata column manually if you need a different one)
- MCP server attachment (deferred to v1.1; the architecture accommodates it as a `tool_type='integration'` with `provider='mcp'` later)
- HubSpot, Salesforce, etc. via OAuth — use service-account/API-key clients in `integrations/` instead, behind webhook tools
