# Self-test prompts for the flow-agents path

Run these in a fresh Claude Code session in any directory (the skill is loaded from this repo automatically when present in the user's `.claude/` skills).

## Test 1 — flow path (positive)

**Prompt to give Claude:**

> Build me a wedding RSVP voice agent that books in my Google Calendar.

**Expected behavior trace:**

1. Claude reads SKILL.md, sees the decision tree, picks **flow agent** (RSVP + booking is procedural with required steps).
2. Phase 0 discovery — runs the live API queries against `goyappr.com/agents`, `/dispositions`, `/billing`, `/phone-numbers`. Asks the discovery questions.
3. Sets `agent_type: flow` in DISCOVERY CONFIG.
4. **Phase 1B (Flow Agent Creation)** — opens `flow-composition-guide.md` for guidance.
5. Notices the GCal requirement → opens `integrations-guide.md`.
6. Posts to `/integrations/google-calendar/connect`, prints the `oauth_url`, instructs the human to complete consent.
7. Polls `/integrations` until a row appears with `status='active'`. Captures the `integration_id`.
8. Loads the `templates/flows/booking-google-calendar.json` template OR builds from scratch using `templates/flows/rsvp.json` as a starting point.
9. Creates the GCal tools via `POST /tools` (one per action: check_availability, create_event), gets the tool_ids.
10. Substitutes the `<TOOL_ID_*>` placeholders in the chosen template with real ids.
11. Creates the agent via `POST /agents` with `type: "flow"`, `flow_config: {...}`, the global `system_prompt`, `language: "he"`.
12. Validates the response (200, agent.id present, agent.type="flow").
13. Reports back to the user with a summary + how to place a test call.

**Pass criteria:**
- Claude does NOT try to use the Tools tab pattern (Phase 2)
- Claude DOES NOT try to complete OAuth itself in a browser
- Claude DOES print the `oauth_url` and pause for the human
- The final agent has type="flow" and a non-null flow_config

## Test 2 — prompt path regression (negative for flow)

**Prompt to give Claude:**

> Build me a sales agent for cold-calling leads.

**Expected behavior:**

1. Claude reads the decision tree, picks **prompt agent** (free-form sales conversation).
2. Phase 0 discovery (same as Test 1).
3. Phase 1A — builds the system prompt per HUMANIZE_PLAYBOOK, runs Hebrew Pronunciation Protocol if language is Hebrew.
4. Phase 2 (Tooling) — creates webhook tools, attaches them to the agent via `POST /tools/attach`.
5. Phase 3+ as today.

**Pass criteria:**
- Claude does NOT try to build a `flow_config`
- The agent is created with `type: "prompt"` (default — no `type` field in payload, or explicit `type: "prompt"`)
- Existing prompt-agent journey is byte-identical to before this change

## Test 3 — flow_config validation

**Prompt to give Claude:**

> Create a flow agent with this config:
> ```json
> {
>   "type": "flow",
>   "name": "Broken",
>   "system_prompt": "test",
>   "flow_config": {
>     "flow_config_version": "1",
>     "nodes": [
>       { "id": "start", "type": "start", "next_step_id": "missing" },
>       { "id": "real_node", "type": "conversation", "instructions": "hi", "transitions": [] }
>     ]
>   }
> }
> ```

**Expected:** API returns 400 with `flow_config_invalid` because `start.next_step_id="missing"` doesn't resolve. Claude reports the error clearly and asks the user how to fix.

## Test 4 — schema discovery

**Prompt:**

> I want to build a procedural voice agent that asks a date and a name in order. What do I need to know first?

**Expected:** Claude surfaces the flow-agents path. References `flow-composition-guide.md`. Mentions the per-node transition pattern. Doesn't dive into prompt-agent territory.

## Test 5 — template integrity

```bash
cd /Users/user/yappr-skill/templates/flows
for f in *.json; do
  python -c "import json; json.load(open('$f'))" && echo "$f OK"
done
```

All three (booking-google-calendar.json, lead-qualification.json, rsvp.json) must parse as valid JSON.

For server-side schema validation, use the api-v1 endpoint:

```bash
curl -X POST "https://api.goyappr.com/agents/<existing-flow-agent>/flow/test" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq '{ flow_config: . , transcript: [], mock_tool_results: {} }' booking-google-calendar.json)"
```

Returns `200` with a step trace if the schema is valid, `400` otherwise.
