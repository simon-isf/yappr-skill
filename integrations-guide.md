# Integrations Guide — OAuth-backed third-party tools

Yappr's `integrations` feature lets companies connect third-party services via OAuth and reference them from `integration_call` nodes in flow agents. Tokens are encrypted (Supabase Vault key) and refreshed automatically by the bot at call time.

**v1 supports**: Google Calendar, Gmail.

This file is the orientation page. The full action catalog, args, response semantics, and chaining recipes live in:
- [`yappr-api.md`](yappr-api.md) — endpoint reference (action catalog, integration_call node shape, GET/DELETE endpoints).
- [`flow-composition-guide.md`](flow-composition-guide.md) — token interpolation, custom metadata, and the canonical "lookup → confirm → act-by-id" recipe.

---

## How OAuth integrations work

```
1. Customer connects a Google account ONCE via the Yappr dashboard's
   Integrations page. The dashboard handles the OAuth handshake
   (popup → Google consent → callback → encrypted token persistence).
2. The customer's backend calls GET /integrations to discover the
   credential's id.
3. They paste that id into the integration_call node's `integration_id`
   field in their flow_config.
4. On each call that hits the node, the bot fetches a fresh access
   token via a SECURITY DEFINER RPC and calls the Google API.
```

The encryption key lives in Supabase Vault — never in env vars, never returned by any API.

**The public API does not expose a connect endpoint.** Popup orchestration + redirect handling don't fit a REST contract cleanly, so the OAuth handshake lives in the dashboard only. The API exposes list (`GET /integrations`) and revoke (`DELETE /integrations/:id`) — that's the lifecycle surface customers can drive headlessly.

If your customer-onboarding flow is API-only, the human onboarding the company has to log into the dashboard once to connect each Google account they want flows to use. Subsequent operations (creating flows, placing calls, listing/revoking credentials) can all happen via the API.

---

## Discovering a connected credential

```bash
curl "https://api.goyappr.com/integrations?provider=google_calendar" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

Capture the `id` of any row whose `status` is `"active"`. That's your `integration_id` for an `integration_call` node.

The response body contains only public fields (id, provider, account_label, scopes, status, created_at, updated_at). Encrypted tokens and internal operational metadata are never returned.

---

## Wiring an integration into a flow

Use an `integration_call` node — provider + action + args live directly on the node. Full schema and the action catalog (with required/optional args including `calendar_id` and `time_zone`) are in [`yappr-api.md`](yappr-api.md) under "Integration call nodes".

```json
{
  "id": "book",
  "type": "integration_call",
  "provider": "google_calendar",
  "integration_id": "<the id from GET /integrations>",
  "action": "create_event",
  "args_template": {
    "summary":    { "mode": "ai_extract",
                    "description": "Caller's full name plus 'consultation'" },
    "start_time": { "mode": "ai_extract",
                    "description": "ISO-8601 start time the caller agreed on" },
    "end_time":   { "mode": "ai_extract",
                    "description": "ISO-8601 end time, default 30 min after start" }
  },
  "pre_fire_announcement": true,
  "transitions": {
    "success_next_step_id": "confirm_booked",
    "error_next_step_id":   "apologize_and_handoff"
  }
}
```

Tool_call nodes (custom webhooks via the company's `tools` table) can also dispatch but the args live on the tool's `payload_config` instead of the node — see the tool-call section in `yappr-api.md` for the difference.

---

## Failure modes

### Token refresh failure during a call

The bot refreshes tokens on demand under an asyncio.Lock. After 4 consecutive refresh failures (or `invalid_grant` from Google), the integration is auto-marked `status='disconnected'`. Subsequent integration_call nodes fail with `"integration_disconnected"` and route to the `error` branch.

**Mitigation:** wire every integration_call node's `error_next_step_id` to either:
- A handoff conversation node ("Let me have someone call you back")
- A webhook tool that notifies the human team
- An end node that fires a structured post-call webhook

### Permissions revoked at Google

Same effect as a refresh failure. The user reconnects from the dashboard's Integrations page; the OAuth callback finds the existing soft-deleted row (matched by `(company_id, provider, account_label)`) and revives it with fresh tokens.

### Cross-company access attempts

The encryption RPCs are `service_role`-only. The `integration_credentials` table has RLS scoped by company. The bot fetches by `integration_id`; the RPC additionally filters `WHERE deleted_at IS NULL`. Cross-company access is impossible by construction.

---

## Disconnecting

```bash
curl -X DELETE "https://api.goyappr.com/integrations/<integration_id>" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

Best-effort revoke at Google + soft-delete row + null encrypted tokens. Returns 204.

The row stays in the table (soft-delete) so historic `flow_versions` can still resolve their `integration_id`. To re-connect the same Google account, re-run the OAuth flow from the dashboard — the callback revives the soft-deleted row in place.
