# Flow Agents — Composition Guide

> **This describes a retired surface.** `flow_config` and the `POST /agents` /
> `PATCH /agents/:id` bodies that carried it are gone — every agent that existed
> converted onto the workflow engine at release, and creating a new one this way has
> answered `410 AGENT_LEGACY_CREATION_GONE` since before this release. See **Flow
> agents — retired** in [`yappr-api.md`](yappr-api.md) for the exact current state.
> The node catalog, transition heuristics and topologies below are still useful as
> conceptual design guidance, but build the actual graph with `PUT /agents/:id/workflow`
> and the document shape in **The conversation graph** in `yappr-api.md` — not any
> endpoint named in this file.
>
> How the concepts map: a step's transitions are `conversation` edges with a prose
> `condition`; a `tool_call` node is an `action` node whose `result` edges are only
> `succeeded` / `failed` (there are no `custom[]` JSONPath branches — branch inside a
> `sequence` instead); `is_global` nodes are `global_edges[]`; the start node is
> `entry_node_id`; the global `system_prompt` is `global_instructions`; a transfer is an
> `action` node whose binding is a transfer tool. Unlike a flow node, a `conversation`
> step can also offer tools the model calls by its own choice (`available_binding_ids`).

For procedural conversations (booking, intake, qualification, RSVP) a flow agent was a graph of nodes where the model itself picked the next transition on every user turn via a `pick_transition` tool call. This guide covers how the graph was designed, how transitions worked, and how tool-call nodes integrated with the `tools` table — read it for the design patterns, not the endpoints. For the current agent journey, see `SKILL.md` Phase 1A/1B.

For calendars, mailboxes and any other third-party account a tool-call node acts on, see the **Connected accounts** section of [`yappr-api.md`](yappr-api.md).

---

## When a conversation graph helps

Every agent is a workflow agent; the graph is optional inside it. Give the workflow a multi-step conversation graph when ALL of these are true:
- The conversation has required steps that must run in a specific order
- Specific information must be collected at specific points (slots)
- You want measurable funnel drop-off per step
- Branching logic depends on what the user said in the prior turn

Keep it to the global instructions and a single conversation step when ANY of these are true:
- The conversation is open-ended / consultative
- The agent's job is fluent natural dialogue, not procedure
- One set of instructions is a better mental model than a graph

There is no agent type to choose or flip: a `PATCH` naming `type` is refused, and the graph is edited through the workflow document.

---

## Graph anatomy

A flow agent has:
- A **global `system_prompt`** (persona, brand rules, hard constraints) that applies to every node.
- A **`flow_config` JSONB** containing `{ flow_config_version: "1", nodes: [...], metadata?: {...} }`.

Every node has `id`, `type`, `name?`. Type determines the rest.

### Node catalog

| Type | LLM? | Purpose | Outputs |
|---|---|---|---|
| `start` | conditional | Entry point. Owns the "who speaks first" decision (overrides agent-level fields). Auto-advances to `next_step_id`. | single |
| `conversation` | yes | Bot talks; on each user turn the model decides whether to call `pick_transition` (advance) or stay | N user-defined transitions, each with `id`, `label`, `next_step_id`, optional `description` |
| `tool_call` | no | Deterministic tool execution against a row in the `tools` table; routes on result | fixed `success`/`error` + optional `custom[]` (JSONPath-equality matching) |
| `integration_call` | **RETIRED** | Carried a Google Calendar / Gmail credential on the node itself. Gone: saving one is rejected, and an agent whose stored flow still has one cannot take calls. Connect the account under **Connected accounts** and use a `tool_call` node instead. | — |
| `transfer` | no | Transfer to a phone number (not available on trunk or extension calls), or, on username-and-password trunk (`auth_mode: "credentials"`) and extension calls, to a SIP address (`sip:user@host`) | terminal |
| `end` | no | Speak farewell, hang up | terminal |

**Terminal rule.** Only `end` and `transfer` nodes are allowed to be terminal. `conversation` and `tool_call` nodes must each have at least one outgoing edge — for `conversation`, any transition; for the deterministic dispatch nodes, the `success` branch must be wired (and you should design an `error` branch too). The save validator rejects flows that violate this — see "Save validation" near the end of this guide.

**For per-call extraction or webhook delivery**, use the agent-level `extraction_parameters` and a follow-up: an HTTP tool bound to an After trigger (e.g. `analysis.ready`) in the workflow document. `webhook_url` / `webhook_events` are gone — they were cleared when agents were converted, and a follow-up's body is the call package under `call`. Do NOT reach for a "webhook node" or "structured_output node" in the graph — they don't exist.

### Per-step focus (architectural isolation)

Each conversation node operates with ONLY:

1. The agent's global `system_prompt`
2. The current node's own `instructions`
3. Recent conversation history
4. The current node's outgoing transitions

The model does NOT see other steps' instructions or transitions while in step X. This isolation is enforced by the platform — you don't need to (and shouldn't) reference other steps in your instructions. Each step is a self-contained behavioral segment.

Practical implications:
- Don't write "in the next step we'll ask for X" — the next step's instructions handle that. Mentioning it here just confuses the model.
- Don't restate persona / tone in every node's `instructions` — that lives in `system_prompt` and is always present.
- Each node should read like a standalone briefing: "what to accomplish on this turn, given the global persona and what was just said."

### `start` node settings (overrides agent-level for flow agents)

```json
{
  "id": "start",
  "type": "start",
  "agent_speaks_first": true,
  "greeting": "Hi, this is Maya from Acme Wellness…",
  "is_literal": false,
  "next_step_id": "ask_reason",
  "auto_advance": true
}
```

- `agent_speaks_first: true` (default) — bot speaks the `greeting` on connect.
- `agent_speaks_first: false` — bot waits silently for the caller to speak first. The flow still auto-advances to `next_step_id` so the bot is "in" the right conversation node when the user does speak.
- `agent.silence_timeout_secs` still applies in either case — the call hangs up if dead air persists.
- `auto_advance: true` (default, legacy) — the greeting and the first conversation node's instructions are pre-loaded together, so the greeting is delivered "in" the first node's voice. Saves one round-trip but blends greeting with that node's behavior.
- `auto_advance: false` — the greeting is delivered in start-node context only, with no first-conversation-node instructions pre-loaded. After the user's first reply, the flow automatically enters the first conversation node and the bot replies in that node's voice. Use this **"greeting before flow"** pattern when the first conversation node is intent-specific and you want the greeting to stay neutral.

**Important**: a workflow agent has no Start node settings. Its opening is the agent-level `agent_speaks_first` and `greeting_message` (`PATCH /agents/:id`), or a line a Before step supplies; a converted flow agent's start-node greeting was carried into those settings.

### Transfer / End — node vs system tool

Both are "atomic call actions" that are configurable two ways depending on the agent's trigger model:

| | Prompt agent | Flow agent |
|---|---|---|
| Trigger | LLM **decides** to call the system tool | Flow **routes** to the node |
| Configure via | `tools` table (system tool with `handler: "transfer_call"` or `"end_call"`) | The Transfer / End node itself |
| Same runtime? | Yes | Yes |

On the retired flow engine you didn't mix these: a flow agent could not have the LLM decide to end mid-conversation — there were no LLM-callable tools in conversation nodes. Instead, add a transition like "Caller wants to end the call" → routes to an End node. (A workflow `conversation` step can offer tools through `available_binding_ids`, but routing to an `end` node is still the clearer pattern.)

### How transitions work in conversation nodes

Each conversation node carries N labeled transitions. On every user turn the model decides whether the user's input matches one of the current step's transitions; if so, it advances to that node, otherwise it stays. **The model picks the transition itself by calling an internal `pick_transition(transition_id)` tool whose enum is built from the flow's transition ids — you don't author or call this tool yourself, you just author the transitions and the runtime registers the schema.**

The model sees, per turn:
- The agent's global `system_prompt`
- The current node's `instructions`
- Recent conversation history
- The current node's outgoing transition labels (and optional `description` clarifiers)
- Any global nodes' `global_jump_description` as extra fallback candidates

It does NOT see other steps' instructions or transitions. **Per-step isolation** is enforced — keep each node's `instructions` focused on this turn's goal.

**Latency:** when a transition fires, the new step's instructions arrive as the function response of the same model turn — there's no extra round-trip. **Cost:** marginal compared to the audio leg.

### How transitions work in tool-call nodes

Tool-call nodes don't go through the conversational routing path. The runtime fires the tool the moment a transition lands on a tool node:
1. Look up the tool by `tool_id` (from the company's `tools` table)
2. Shallow-merge `tool.config` ⊕ `node.config_override` (top-level replacement; overriding `payload_config` replaces that complete section)
3. Resolve the tool's args from the effective `payload_config` — `static_parameters` (literals) plus `extraction_parameters` (filled by the live agent runtime from the conversation). **`tool_call` nodes have no per-node `args_template`** — args come from the linked tool unless that node deliberately supplies a different `config_override`.
4. Execute deterministically (webhook / system / transfer / integration)
5. Route on the result — **deterministic, exactly one out-edge per fire, no LLM involved**:
   - **`error`** fires only on hard failures: redirect or other non-2xx status, network timeout, integration disconnected, tool deleted/inactive, missing config.
   - Otherwise the dispatcher walks `custom[]` top-to-bottom. **First match wins → loop returns → `success` is NOT also taken.**
   - If no custom matched, **`success`** fires.

The canvas draws all the out-edges (success / error / each custom) but at runtime exactly one is traversed per tool fire. They are mutually exclusive.

If a tool-call node references a tool that has been deleted, deactivated, or belongs to a different company, the dispatcher returns an `error` and the `error` branch fires. Always design an `error` branch.

**Timeouts on a live call.** A tool step's own limit is the only one: the node's `timeout_secs`, or without it the tool's `config.timeout_seconds` + 1 s (other nodes: 30 s). A step that answers after more than 10 seconds, within its limit, gets its result; one past its limit routes to `error` with `tool_timeout_after_<N>s`. A long limit is still a long silence for the caller: keep endpoints answering in a few seconds and on a workflow `action` node give anything slow a `hold_line` (a flow agent's `pre_fire_announcement` became that line at conversion).

**A step's action called out of turn.** If the agent calls a tool step's argument function while its conversation step is still active (skipping the transition), the runtime takes it as that step's transition when the caller has answered in the step and exactly one of its transitions leads there; otherwise it answers with what the current step wants and runs nothing. It never runs a step's action again with the same values, or twice in one caller turn: a repeat after the action ran is answered, not run (a "book another" route back to the same step books again only with the caller's new values). After two such calls with no speech, the agent is asked to say its next line. Nothing to configure.

### Soft-fail results (200 OK, but "no")

A response like `{"available": false}` or `{"status": "no_availability"}` is **still `success`** to the dispatcher — the HTTP call worked. The next node receives the full result dict as a `<tool_result>` block in the LLM context, so in most cases the *next conversation node's LLM* reads it and adapts naturally ("looks like that slot's taken, want to try another time?"). **You do not need a custom branch for that.**

Reach for `custom[]` only when the next node should be **structurally different** for that result shape — different instructions, different downstream tools, different transitions. Examples:
- `$.available == "false"` → route to a `suggest_alternatives` node that calls `list_events` to fetch open slots, instead of going to the `confirm` node.
- `$.status == "rate_limited"` → route to a `defer_and_text_link` node that sends an SMS instead of trying again.

If the only difference is *what the bot says*, let the LLM handle it from the result payload — keep the graph simple.

### JSONPath subset (custom branch `jsonpath`)

The runtime supports a deliberately tiny subset. Root (`$`) is the **tool's parsed response body** — for webhook tools that's `JSON.parse(http_body)`; for integration tools it's the typed dict from the provider client. There is NO access to call metadata, slot values, or transcript from `jsonpath` — only the immediate tool's response.

Supported paths:

| Path | Resolves to |
|------|-------------|
| `$.status` | `result["status"]` |
| `$.data.appointment.id` | nested key drill-down |
| `$.slots[0].time` | array index |
| `$.appointments[2]` | bare array index |

**Not supported**: recursive descent (`$..foo`), wildcards (`$.*`), filter expressions (`$[?(@.x>1)]`). If the webhook nests the field, point at the exact path. Missing key / wrong type at a step / out-of-bounds index → the branch silently does not match (falls through to the next custom, then to `success`).

### Stringification rules for `equals`

The value extracted via `jsonpath` is stringified JSON-style **before** string-comparison to `equals`. You must match this table or the branch will never fire:

| Result value | Write `equals:` |
|---|---|
| `true` (boolean) | `"true"` (lowercase) |
| `false` (boolean) | `"false"` |
| `null` | `"null"` |
| `42` (number) | `"42"` |
| `"booked"` (string) | `"booked"` |

Common mistake: webhook returns `{"duplicate": true}`, author writes `equals: "True"` (capitalized). Silently never matches; runtime falls through to `success` and you debug why the duplicate branch never fires. Always lowercase booleans.

---

## Global nodes (cross-branch jumps)

Conversation, transfer, and end nodes can be marked **`is_global: true`** to make them reachable from any conversation node *without* an explicit edge. The model gets every global node as an extra candidate transition on every turn (encoded in the `pick_transition` enum as `__global_<node_id>`).

Use globals for **cross-branch recovery** and **universal escape hatches** — patterns where wiring an explicit transition into every source node would be repetitive and easy to forget when adding a new node later.

### When to mark a node global

Good uses:
- **Misclassification recovery** — agent went down the tenant branch, user reveals they're actually an owner. Mark `owner_intake` global with description "User reveals they're actually an owner/landlord, not a tenant".
- **Speak-to-human escape hatch** — mark a `transfer` node global with description "User explicitly asks to speak to a human / agent / representative".
- **Do-not-call sweep** — mark an `end` node global with description "User says do not call again, take me off the list, stop calling".
- **Restart / reset request** — "User says they want to start over from the beginning".

Bad uses (use explicit transitions instead):
- Shortcuts within the happy path — "go to confirm" should be a labeled transition, not a global.
- "Always check this" probes — use a regular conversation node early in the flow.
- Anything that should fire predictably on every Nth turn — globals are LLM-evaluated and probabilistic.

### Field shape

```json
{
  "id": "owner_intake",
  "type": "conversation",
  "name": "Owner intake",
  "instructions": "...",
  "transitions": [...],
  "is_global": true,
  "global_jump_description": "User reveals they're actually an owner/landlord, not a tenant"
}
```

`global_jump_description` is **required** when `is_global: true`. The API rejects (400) flows that:
- Set `is_global: true` on `start` or `tool_call` nodes
- Set `is_global: true` without a non-empty `global_jump_description`

### Constraints + best practices

- **Recommended max ≤3 globals per flow.** Each additional global widens the model's candidate space on every turn; too many → false-positive jumps.
- **Write the description as a user-side signal, not an agent intent.** Good: "User says they want to speak to a human". Bad: "Transfer the user". The LLM is matching the *user's last turn* against the description.
- **Globals are a fallback, not a tiebreaker.** The eval prompt explicitly tells the LLM to prefer labeled transitions whenever both could apply. A global jump should only fire when no labeled transition fits AND the user signal clearly matches the global's description.
- **Globals don't apply at tool_call entry.** Tool nodes are deterministic; transition decisions only happen between user turns on conversation nodes. So globals trigger between user turns, not between tool fires.
- **Self-jumps are skipped automatically.** If the current node IS the global node, the runtime won't include it as a candidate.

### Observability

When a global jump fires, the resulting `flow_node_entered` event has:
- `reason: "global jump: <node name>"` (visible in `flow_trace.steps[].reason` on `GET /calls/:id`)

The preceding `flow_eval_decision.decision` looks like `"__global_<node_id>"` (the runtime's internal representation; you generally read the trace not the raw events).

---

## Per-node humanization

Each conversation node's `instructions` field IS a mini-prompt — a focused goal for that step. Apply [`HUMANIZE_PLAYBOOK.md`](HUMANIZE_PLAYBOOK.md) rules **per-node**:
- Stages as goals, not scripts
- One question at a time
- Forbid robotic transitions ("Great!", "Moving on", "Certainly")
- Reference what was actually said
- No queue-the-next-question

The global `system_prompt` covers persona; node `instructions` cover this-step's goal. Don't duplicate persona content in every node.

---

## Designing transitions

Good transition labels are imperative, mutually exclusive, and reflect what the **user** would say or do. The model sees them as choice descriptions when deciding whether to call `pick_transition`.

**Good:**
- "Caller confirmed attendance"
- "Caller declined"
- "Caller wants to be called back later"

**Bad** (vague, overlapping, or agent-perspective):
- "Yes"
- "Continue"
- "Move forward"
- "Go to next"

Always have an "uncertainty" path. If the user is asking a meta question or hedging, the eval will return `"stay"` automatically (it's not in the transition list). Cover the cases where the user gives unexpected answers — usually a `"Caller is unclear / asking back"` transition that loops back to a clarification node.

---

## Tool args

### `tool_call` nodes — args owned by the tool

`tool_call` nodes have **no `args_template` field**. The tool itself owns its args via `payload_config` on the tool row:

- `payload_config.static_parameters` — literal `{name, value}` pairs always sent unchanged.
- `payload_config.extraction_parameters` — `{name, description}` pairs the live agent runtime fills from the conversation right before the tool fires (the slot binds via the description).

The same tool can be referenced from N flow nodes, and it will send the same shape every time. If you need two flow nodes to call the same underlying capability with different args, **create two tools** (or use a tool whose webhook backend interprets a runtime-dispatched action key).

A common mistake is to add `args_template` to a `tool_call` node hoping to override the tool's args inline. The schema parser silently strips that field — your override never fires.

### Arg values, token interpolation and cross-node chaining

These lived on the retired `integration_call` node, whose `args_template`
carried per-arg literal / `ai_extract` modes and `{{node.arg}}` /
`{{metadata.key}}` tokens. A `tool_call` node has no `args_template`: its args
are owned by the tool (`payload_config.static_parameters` and
`payload_config.extraction_parameters`), as described above. For the equivalent
chaining and per-call metadata on the current authoring model, read the
canonical workflow document and the **Connected accounts** section in
[`yappr-api.md`](yappr-api.md).

---

## Worked example — Wedding RSVP with calendar booking

Sketch:

```
start
  └─→ greet_and_ask_attendance (conversation)
        ├─ "Caller confirmed" → ask_date_and_time
        ├─ "Caller declined"   → say_thanks_and_end
        └─ "Caller is unsure"  → schedule_callback

ask_date_and_time (conversation)
  ├─ "Date and time provided" → check_availability
  └─ "Caller wants different week" → suggest_alternatives

check_availability (tool_call, action=check_availability)
  ├─ success — custom $.available == false → suggest_alternatives
  ├─ success                                → confirm_booking
  └─ error                                  → apologize_and_collect_manually

confirm_booking (conversation)
  ├─ "Caller confirmed" → create_event
  └─ "Caller wants to change" → ask_date_and_time

create_event (tool_call, action=create_event)
  ├─ success → send_confirmation_and_end
  └─ error   → apologize_and_collect_manually

send_confirmation_and_end (end)

apologize_and_collect_manually (end)

schedule_callback (end)

say_thanks_and_end (end)
```

The agent-level `extraction_parameters` extracts the booking outcome from
the transcript after the call ends; a follow-up on `analysis.ready` (an HTTP
tool in the workflow's After section) delivers it to the CRM. No graph-level
post-end pipeline.

Each `tool_call` above is a tool bound to a connected calendar account — connect it once under **Connected accounts**, then reference the tool by `tool_id`.

---

## Worked example — Lead qualification with globals

Outbound qualification call for a B2B SaaS lead. Six conversation nodes form the happy path; two globals cover the universal escape hatches that should fire from anywhere — wrong-number and explicit-do-not-call.

```
start (auto_advance: false — neutral greeting first)
  └─→ identify_decision_maker (conversation)
        ├─ "Caller confirmed they handle this area"  → ask_team_size
        ├─ "Caller is not the right person"          → ask_for_referral
        └─ "Caller wants to know more first"         → brief_pitch

ask_team_size (conversation)
  └─ "Caller gave team size" → ask_current_solution

ask_current_solution (conversation)
  ├─ "Caller has a current vendor"  → ask_renewal_window
  └─ "Caller has nothing in place"  → offer_demo

ask_renewal_window / offer_demo (conversation, both eventually) → confirm_demo_slot
confirm_demo_slot (conversation)
  ├─ "Caller agreed on a slot"   → book_demo
  └─ "Caller wants to think"     → schedule_callback_end

book_demo (tool_call → success / error / no_avail)
  ├─ success      → thank_and_end
  ├─ no_avail     → suggest_alternatives
  └─ error        → schedule_callback_end

GLOBAL: wrong_number_end (end, is_global)
  description: "User says they aren't the person we asked for and have no
                connection to that name / number"

GLOBAL: dnc_end (end, is_global)
  description: "User says do not call again, take me off the list,
                stop calling, this is harassment"
```

Skeleton JSON for the two globals + the Start node (rest of the nodes follow the same shape patterns as the wedding example):

```json
{
  "flow_config_version": "1",
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "agent_speaks_first": true,
      "greeting": "Hi, this is Maya from Acme. Do you have a quick moment?",
      "is_literal": false,
      "auto_advance": false,
      "next_step_id": "identify_decision_maker"
    },
    {
      "id": "identify_decision_maker",
      "type": "conversation",
      "name": "Identify decision maker",
      "instructions": "Confirm the caller is the right person to discuss vendor decisions for their team. Ask once, then move on based on the answer.",
      "transitions": [
        { "id": "is_dm",       "label": "Caller confirmed they handle this area",   "next_step_id": "ask_team_size" },
        { "id": "not_dm",      "label": "Caller is not the right person",            "next_step_id": "ask_for_referral" },
        { "id": "wants_pitch", "label": "Caller wants to know more first",           "next_step_id": "brief_pitch" }
      ]
    },

    /* ... ask_team_size, ask_current_solution, ask_renewal_window, offer_demo,
           confirm_demo_slot, book_demo, suggest_alternatives,
           ask_for_referral, brief_pitch, thank_and_end,
           schedule_callback_end ... */

    {
      "id": "wrong_number_end",
      "type": "end",
      "name": "Wrong number — apologize and end",
      "is_global": true,
      "global_jump_description": "User says they aren't the person we asked for and have no connection to that name / number",
      "farewell": "Sorry to bother you, have a good day.",
      "is_literal": true
    },
    {
      "id": "dnc_end",
      "type": "end",
      "name": "Do not call",
      "is_global": true,
      "global_jump_description": "User says do not call again, take me off the list, stop calling, this is harassment",
      "farewell": "Understood, I'll remove you from the list. Goodbye.",
      "is_literal": true
    }
  ]
}
```

Why globals here:
- Wrong-number and explicit-DNC could come up at any point in qualification. Wiring an explicit transition into all six conversation nodes is repetitive and easy to forget when adding step seven.
- Both globals are written as **user-side signals** ("User says…"), not as agent intents.
- Both terminate the call cleanly — no need to come back.
- Two globals total → well under the recommended `≤3` ceiling.

Pair with agent-level `extraction_parameters` (`team_size`, `current_vendor`, `renewal_window`, `demo_booked`) and a follow-up on `analysis.ready` (an HTTP tool in the After section, which reads them at `call.analysis.extracted_data`) to push the qualification result to the CRM after the call ends.

---

## Save validation — what makes a flow saveable

**Historical.** `POST /agents` and `PATCH /agents/:id` with `flow_config` used to run this graph validator and answer `400 FLOW_INVALID`. Neither accepts `flow_config` now (`410 AGENT_LEGACY_CREATION_GONE` on create, a `400` naming the field on a workflow agent's `PATCH`). Check a workflow document with `POST /agents/:id/workflow/validate` — it answers `422 WORKFLOW_VALIDATION_FAILED` with its own issue codes. The rules below are kept as design guidance.

Quick checklist (the old validator codes are in parentheses):

- Exactly one `start` node (`no_start`, `multiple_starts`); its `next_step_id` is wired (`start_unwired`).
- Every `conversation` node has non-empty `instructions` (`instructions_missing`) and at least one outgoing transition (`terminal_not_allowed`).
- Every `tool_call` node has a `tool_id` (`tool_id_missing`) and a wired `success_next_step_id` (`success_not_wired`). `tool_call` nodes have no `args_template` field — args come from the tool's `payload_config`.
- A flow may not contain an `integration_call` node. It is retired: the save is rejected, and an agent whose stored flow still has one cannot take calls. Delete the node and rebuild the step as a `tool_call` on a connected account.
- Every `transfer` node has a `transfer_to` (`transfer_to_missing`); a value starting `sip:`/`sips:` must be a valid SIP address (`transfer_to_invalid_sip`): `sip:user@host[:port]`, at most 256 characters, with a user part and no password or `?` headers. A SIP address works only on calls that arrived over a username-and-password trunk (`auth_mode: "credentials"`) or an extension endpoint; on any other call, including a SIP-address-only (`uri`) endpoint, the transfer is refused (`REFER_ONLY_ON_SIP_TRUNK`) and the agent keeps helping the caller. A phone number on a trunk or extension call is refused the same way (`UNAVAILABLE_ON_SIP_TRUNK`). A hand-off that was accepted and then fails ends the call, and the agent cannot take the caller back. On an extension call the new call is placed through the extension to the part before the `@`; always write the `sip:` form, because a bare extension number is not a supported destination (a flow save only returns the `transfer_to_invalid` warning).
- **Only `end` and `transfer` nodes may be terminal.** Anything else with no outgoing edge → `terminal_not_allowed`. The flow must contain at least one reachable `end` or `transfer` (`no_terminal`).
- All `next_step_id` references resolve (`unknown_target_node`); every node is reachable from `start` (`unreachable_node`).

If you're scaffolding a workflow programmatically against the API, the cheapest way to debug it is to validate once, read every entry in `issues[]`, and address them all in one follow-up `PUT /agents/:id/workflow`.

## Saving and versioning

A workflow is saved as a draft with `PUT /agents/:id/workflow`, checked with `POST /agents/:id/workflow/validate`, and goes live with `POST /agents/:id/workflow/publish`. Each publication is an immutable version, listed with `GET /agents/:id/workflow/versions`. `GET /agents/:id/flow/versions` only shows a converted agent's frozen pre-release history.

---

## Testing without placing a real call

There is no text-only rehearsal of a workflow over the API: `POST /agents/:id/flow/test` answers `409 WORKFLOW_FLOW_TEST_UNSUPPORTED` for a workflow agent. Rehearse with a web call (`POST /calls {"type":"web"}`, someone talking in a browser) or a test call.

---

## What's NOT in v1

- Per-node STT/TTS/LLM swap (one set per call)
- Multi-agent / agent handoff
- The `transfer` node ends the call flow with a hand-off (see the transfer rules in "Save validation"); for cross-flow handoff use a webhook tool that triggers the next flow externally.
