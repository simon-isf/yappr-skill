# Flow Agents — Composition Guide

For procedural conversations (booking, intake, qualification, RSVP) you build a **flow agent**: a graph of nodes where the model itself picks the next transition on every user turn via a `pick_transition` tool call. This guide covers how to design the graph, how transitions work, and how tool-call nodes integrate with the existing `tools` table. For the prompt-agent path, see `SKILL.md` Phase 1A.

For OAuth-backed integrations (Google Calendar) used by tool-call nodes, see [`integrations-guide.md`](integrations-guide.md).

---

## When to use a flow agent

Pick flow when ALL of these are true:
- The conversation has required steps that must run in a specific order
- Specific information must be collected at specific points (slots)
- You want measurable funnel drop-off per step
- Branching logic depends on what the user said in the prior turn

Pick prompt when ANY of these are true:
- The conversation is open-ended / consultative
- The agent's job is fluent natural dialogue, not procedure
- One large system prompt is a better mental model than a graph

You cannot convert between types after creation. The API rejects any attempt to flip `type` on PATCH.

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
| `conversation` | yes | Bot talks; on each user turn the model decides whether to call `pick_transition` (advance) or stay | N user-defined transitions, each with `id`, `label`, `next_step_id`, and a required non-empty `description` (the natural-language trigger the model uses to pick this path) |
| `tool_call` | no | Deterministic tool execution against a row in the `tools` table; routes on result | fixed `success`/`error` + optional `custom[]` (JSONPath-equality matching) |
| `integration_call` | no | Deterministic call to an OAuth-backed integration (Google Calendar, Gmail) — config lives on the node, not in `tools`; routes on result | fixed `success`/`error` + optional `custom[]` (same shape as `tool_call`) |
| `transfer` | no | SIP transfer to another phone | terminal |
| `end` | no | Speak farewell, hang up | terminal |

**Terminal rule.** Only `end` and `transfer` nodes are allowed to be terminal. `conversation`, `tool_call`, and `integration_call` nodes must each have at least one outgoing edge — for `conversation`, any transition; for the deterministic dispatch nodes, the `success` branch must be wired (and you should design an `error` branch too). The save validator rejects flows that violate this — see "Save validation" near the end of this guide.

**For per-call extraction or webhook delivery**, use the agent-level `extraction_parameters` and `webhook_url` / `webhook_events` fields. They apply uniformly to both prompt and flow agents — there is no flow-specific post-end pipeline. Do NOT reach for a "webhook node" or "structured_output node" — they don't exist.

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

**Important**: when `agent.type === "flow"`, the dashboard hides the agent-level `agent_speaks_first` and `greeting_message` fields. Configure both on the Start node instead — there's only one source of truth.

### Transfer / End — node vs system tool

Both are "atomic call actions" that are configurable two ways depending on the agent's trigger model:

| | Prompt agent | Flow agent |
|---|---|---|
| Trigger | LLM **decides** to call the system tool | Flow **routes** to the node |
| Configure via | `tools` table (system tool with `handler: "transfer_call"` or `"end_call"`) | The Transfer / End node itself |
| Same runtime? | Yes — both call into bot.py's `SYSTEM_TOOL_HANDLERS` | Yes |

You don't mix these. A flow agent cannot have the LLM decide to end mid-conversation — there are no LLM-callable tools in conversation nodes. Instead, add a transition like "Caller wants to end the call" → routes to an End node.

### How transitions work in conversation nodes

Each conversation node carries N labeled transitions. On every user turn the model decides whether the user's input matches one of the current step's transitions; if so, it advances to that node, otherwise it stays. **The model picks the transition itself by calling an internal `pick_transition(transition_id)` tool whose enum is built from the flow's transition ids — you don't author or call this tool yourself, you just author the transitions and the runtime registers the schema.**

The model sees, per turn:
- The agent's global `system_prompt`
- The current node's `instructions`
- Recent conversation history
- The current node's outgoing transitions — the runtime feeds each transition's `description` to the model as the trigger for that path (the `label` is dashboard/trace shorthand, not what the model routes on)
- Any global nodes' `global_jump_description` as extra fallback candidates

**`transition.description` is required and non-empty** on every conversation transition. Write it as a user-side signal — what the caller said or implied — not as an agent intent. Good: "Caller stated their full name (first and last) clearly enough to record." Bad: "Move to the next step." Empty descriptions are rejected at save with `transition_description_missing`.

It does NOT see other steps' instructions or transitions. **Per-step isolation** is enforced — keep each node's `instructions` focused on this turn's goal.

**Latency:** when a transition fires, the new step's instructions arrive as the function response of the same model turn — there's no extra round-trip. **Cost:** marginal compared to the audio leg.

### How transitions work in tool-call nodes

Tool-call nodes don't go through the conversational routing path. The runtime fires the tool the moment a transition lands on a tool node:
1. Look up the tool by `tool_id` (from the company's `tools` table)
2. Shallow-merge `tool.config` ⊕ `node.config_override` (array replacement)
3. Resolve the tool's args from its own `payload_config` — `static_parameters` (literals) plus `extraction_parameters` (filled by the live agent runtime from the conversation). **`tool_call` nodes have no per-node `args_template`** — args are owned by the tool, so the same tool used by N flow nodes always sends the same shape.
4. Execute deterministically (webhook / system / transfer / integration)
5. Route on the result — **deterministic, exactly one out-edge per fire, no LLM involved**:
   - **`error`** fires only on hard failures: 4xx/5xx, network timeout, integration disconnected, tool deleted/inactive, missing config.
   - Otherwise the dispatcher walks `custom[]` top-to-bottom. **First match wins → loop returns → `success` is NOT also taken.**
   - If no custom matched, **`success`** fires.

The canvas draws all the out-edges (success / error / each custom) but at runtime exactly one is traversed per tool fire. They are mutually exclusive.

If a tool-call node references a tool that has been deleted, deactivated, or belongs to a different company, the dispatcher returns an `error` and the `error` branch fires. Always design an `error` branch.

**`timeout_secs`** (optional, on both `tool_call` and `integration_call` nodes) caps how long the dispatch may run. It accepts a number `>0` and `≤600`; null/missing falls back to the platform default of 30s. On timeout the call routes to `error_next_step_id` — another reason to always wire an `error` branch.

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

## Tool args vs integration args

Two different ownership models — be deliberate about which one you're using.

### `tool_call` nodes — args owned by the tool

`tool_call` nodes have **no `args_template` field**. The tool itself owns its args via `payload_config` on the tool row:

- `payload_config.static_parameters` — literal `{name, value}` pairs always sent unchanged.
- `payload_config.extraction_parameters` — `{name, description}` pairs the live agent runtime fills from the conversation right before the tool fires (the slot binds via the description).

The same tool can be referenced from N flow nodes, and it will send the same shape every time. **Reuse first:** before minting a tool for a node, `GET /tools` and reuse an existing tool if its capability matches; if only the URL, description, or params changed, `PATCH /tools/:id` in place rather than creating another row. Create a NEW tool ONLY when the argument SHAPE genuinely differs across nodes — i.e. two flow nodes need to call the same underlying capability with different args (or use a tool whose webhook backend interprets a runtime-dispatched action key).

A common mistake is to add `args_template` to a `tool_call` node hoping to override the tool's args inline. The schema parser silently strips that field — your override never fires.

### `integration_call` nodes — args on the node via the `ArgValue` union

`integration_call` nodes carry `args_template` directly on the node. Each entry is an `ArgValue` — a discriminated union with two writable shapes plus a string shorthand for literals:

```jsonc
{
  "args_template": {
    // literal — bare string is shorthand for {mode:'literal', value:...}
    "subject": "Your appointment is booked",

    // ai_extract — the live agent runtime extracts this arg from the
    // conversation right before the action fires.
    "to": { "mode": "ai_extract",
            "description": "Caller's email address as they spelled it out" },

    // Tokens work inside any string value:
    //   - {{node.arg}}     — value extracted by an earlier integration_call
    //                        node's ai_extract slot
    //   - {{metadata.key}} — built-in or user-declared per-call metadata
    "start_time": { "mode": "literal", "value": "{{collect_slot.start_iso}}" }
  }
}
```

**Mode rules:**
- `literal` — value sent as-is after token interpolation. Bare-string is shorthand.
- `ai_extract` — `description` is required. Filled by the runtime from conversation context. The `description` itself is also token-interpolated, so prior context can be spliced into the extraction prompt.

### Token interpolation — `{{node.arg}}` and `{{metadata.key}}`

Both `literal.value` and `ai_extract.description` strings are scanned for mustache tokens at dispatch time:

- `{{<node_id>.<arg_name>}}` — value an earlier node AI-extracted from the conversation. Two source shapes are valid:
  - **integration_call source** — the referenced arg must be declared in `ai_extract` mode in that node's `args_template`.
  - **tool_call source** — the referenced arg must be the `name` of an entry in the linked tool's `config.payload_config.extraction_parameters` (those are all AI-extracted at runtime by definition).
  Save-time validation rejects tokens that point at a node id that doesn't exist in the flow; it doesn't double-check tool_call arg names (they live on the tool config, not the flow_config), so a typo there renders to empty string at runtime — design an `error` branch for the downstream node.

  **Tokens carry inputs, not outputs.** `{{upstream.arg}}` resolves to whatever value was *passed in* to that upstream node's `ai_extract` slot (the value the agent extracted from conversation BEFORE that node fired). It does NOT carry the API response of the upstream call. To consume an upstream node's *response* in a downstream arg, use `ai_extract` mode on the downstream node — see "Recipe — chaining a node's response into a later node" below.
- `{{metadata.<key>}}` — per-call metadata. Built-in keys (always available):

  | Key | Value |
  |-----|-------|
  | `id` | The call id (matches `GET /calls/:id`). |
  | `direction` | `"inbound"`, `"outbound"`, or `"web"`. |
  | `agent_number` | The platform's leg of the call (number we own). Direction-aware. |
  | `user_number` | The human's leg. Direction-aware. |
  | `agent_name` | Agent display name. |

  Plus any **user-declared custom keys** listed in `flow_config.metadata.custom_metadata_keys: string[]`. Custom-key values are sourced from the `metadata` dict passed at call dispatch (`POST /calls body.metadata`).

**Missing metadata at runtime resolves to an empty string** — it is NOT a save-time error. The caller is responsible for passing the value at call time.

Save-time validation only catches dangling `{{node.arg}}` references (`args_template_dangling_reference`).

Example — include the caller's number in a confirmation email body so the support team can call back without context-switching:

```jsonc
{
  "id": "send_confirmation",
  "type": "integration_call",
  "provider": "gmail",
  "integration_id": "<gmail integration uuid>",
  "action": "send_email",
  "args_template": {
    "to": { "mode": "ai_extract",
            "description": "Caller's email address" },
    "subject": "Your appointment is booked",
    "body": { "mode": "ai_extract",
              "description": "Friendly confirmation paragraph including the agreed time" },
    // CC the caller's phone number into the email metadata so support
    // can reach them without digging through the call log.
    "cc": { "mode": "literal", "value": "{{metadata.user_number}}" }
  },
  "transitions": {
    "success_next_step_id": "polite_end",
    "error_next_step_id":   "apologize_email_manually"
  }
}
```

### Recipe — accepting caller-supplied custom metadata

When the caller (your dispatch layer) already knows context the agent should use — a customer email pulled from your CRM, an order number, a clinic id — declare a custom metadata key and reference it via `{{metadata.<key>}}`. This avoids asking the caller to spell it out on the call.

1. Declare the key in your flow config:

```jsonc
{
  "flow_config_version": "1",
  "metadata": {
    "custom_metadata_keys": ["CustomerEmail", "OrderNumber"]
  },
  "nodes": [ /* ... */ ]
}
```

> **Reserved names.** `id`, `direction`, `agent_number`, `user_number`, and `agent_name` are platform-supplied built-ins — don't declare them as custom keys. The `POST /calls` (and web-call) endpoints reject `body.metadata` payloads that include any of these names with `400 INVALID_METADATA_RESERVED_KEY`, so a flow that tries to wire one of them through would have no way to receive a value from the dispatcher anyway.

2. Use the token in any `args_template` value:

```jsonc
{
  "id": "send_receipt",
  "type": "integration_call",
  "provider": "gmail",
  "integration_id": "<gmail integration uuid>",
  "action": "send_email",
  "args_template": {
    "to":      { "mode": "literal", "value": "{{metadata.CustomerEmail}}" },
    "subject": { "mode": "literal", "value": "Receipt for order {{metadata.OrderNumber}}" },
    "body":    { "mode": "ai_extract",
                 "description": "Short thank-you including order number {{metadata.OrderNumber}}" }
  },
  "transitions": {
    "success_next_step_id": "polite_end",
    "error_next_step_id":   "apologize_email_manually"
  }
}
```

3. Pass the values when dispatching the call:

```bash
curl -X POST "https://api.goyappr.com/calls" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "<agent_id>",
    "to":   "+972501234567",
    "from": "<your_yappr_number>",
    "metadata": {
      "CustomerEmail": "noa@example.com",
      "OrderNumber":   "A-19281"
    }
  }'
```

If `CustomerEmail` is absent from the metadata dict at call time, the `to` field resolves to an empty string and the integration's own validation will surface the issue at runtime via the node's `error` branch — so always design an `error` branch for nodes that depend on caller-supplied metadata.

#### Contract checkpoint — before declaring this flow "done"

The `custom_metadata_keys` you declare here are a **contract between this flow and every caller that invokes the agent**. There is no save-time validation that the dispatch layer actually passes those keys — the only signal you'll get on a missing key is the empty-string render at runtime. Treat every new custom key as a two-part change:

1. **Flow side** — the steps above (declare + reference the token).
2. **Caller side** — whatever code or human dispatches the agent must include the key in `body.metadata` on `POST /calls`.

When you ship a flow that uses custom metadata, **tell the user explicitly** (or update your dispatch code, if you own it) which keys they must pass. Don't assume they'll discover the requirement from a failed call days later. Example handoff:

> Flow `appointment-confirm` now reads `customer_email` and `appointment_id` from call metadata. Update your dispatcher so `POST /calls` includes:
> ```json
> { "metadata": { "customer_email": "...", "appointment_id": "..." } }
> ```
> Without these keys, the confirmation email node will render an empty `to` and route to its error branch.

Two ways to discover what a saved flow expects (when the dispatch layer is a different person/agent):
- `GET /agents/:id` → `flow_config.metadata.custom_metadata_keys` lists the declared keys.
- Search `flow_config.nodes` for `{{metadata.…}}` tokens — every reference that isn't a built-in (`id`, `direction`, `agent_number`, `user_number`, `agent_name`) is a custom-key dependency.

### Recipe — chaining a node's response into a later node

The most common multi-step flow shape is: **lookup → caller confirms which result is theirs → act on the chosen item by id**. Cancelling an appointment, updating an order, releasing a hold on a payment, rescheduling a delivery — they all share the same skeleton.

The non-obvious part: an upstream node's API response is NOT addressable via `{{tokens}}`. Tokens carry inputs (what the agent passed in), not outputs (what the API returned). To pass a value from one node's response to the next node's input, declare the downstream arg as `ai_extract` mode and write a description that points at the upstream result. The voice agent reads the upstream tool's `response` block from its conversation context (the function_response Live receives is the full sanitized payload — the agent has it verbatim) and fills the downstream slot via `commit_tool_args` at dispatch time.

This pattern is provider-agnostic — it works the same way for `tool_call` (custom webhooks) as it does for `integration_call` (Calendar/Gmail).

**Concrete example — cancel an appointment by name:**

```jsonc
{
  "nodes": [
    {
      "id": "ask_event_window",
      "type": "conversation",
      "instructions": "Ask the caller roughly when their appointment is so we can find it. Once you have a date or short range, transition to find.",
      "transitions": [
        { "id": "have_window", "label": "Have window", "next_step_id": "find" }
      ]
    },
    {
      "id": "find",
      "type": "integration_call",
      "provider": "google_calendar",
      "integration_id": "<integration uuid>",
      "action": "list_events",
      "args_template": {
        "time_min": { "mode": "ai_extract",
                      "description": "ISO 8601 start of the window the caller mentioned" },
        "time_max": { "mode": "ai_extract",
                      "description": "ISO 8601 end of the window the caller mentioned" },
        "max_results": 5,
        "query":       { "mode": "ai_extract",
                         "description": "Caller's full name (used to filter events). Leave empty if they didn't give a name." }
      },
      "transitions": {
        "success_next_step_id": "confirm_which_event",
        "error_next_step_id":   "apologize_lookup_failed"
      }
    },
    {
      "id": "confirm_which_event",
      "type": "conversation",
      "instructions": "Read back the matching events with their date, time, and title. Ask the caller to confirm which one is theirs. If exactly one matched, just confirm that one. If none matched, apologize and end. Once confirmed, transition to cancel.",
      "transitions": [
        { "id": "confirmed", "label": "Caller confirmed", "next_step_id": "cancel" },
        { "id": "none_match", "label": "No matching event", "next_step_id": "apologize_lookup_failed" }
      ]
    },
    {
      "id": "cancel",
      "type": "integration_call",
      "provider": "google_calendar",
      "integration_id": "<integration uuid>",
      "action": "cancel_event",
      "args_template": {
        "event_id": {
          "mode": "ai_extract",
          "description": "The `id` field of the calendar event the caller just confirmed they want to cancel. Pull it verbatim from the previous list_events response — do not re-derive or guess."
        }
      },
      "pre_fire_announcement": true,
      "transitions": {
        "success_next_step_id": "confirm_cancelled",
        "error_next_step_id":   "apologize_cancel_failed"
      }
    }
  ]
}
```

**Why this works:** when the agent enters the `cancel` node, the controller asks Live to fill `event_id`. Live has the entire `list_events` function_response in its context — including the `id` field of every event it just narrated to the caller and the caller's confirmation of which one is theirs. It calls `commit_tool_args(node_id="cancel", args={"event_id":"<the actual id>"})` and the runtime fires the cancel.

**Authoring rules of thumb for this pattern:**

1. **Be explicit in the description.** "The id of the event the caller just confirmed" is unambiguous. "The event id" is not — Live might invent one. Name the *exact* response field (`id`, `order_number`, `customer_id`, etc.) and the conversational anchor ("the one the caller just chose").
2. **Tell Live not to guess.** Phrases like "pull it verbatim from the previous response — do not re-derive" reliably steer it away from hallucinating ids.
3. **Always wire an `error_next_step_id`.** AI extraction has a 3-attempt cap; if Live can't pin the value (e.g. the caller's "yeah the second one" was ambiguous), the runtime routes to error after 3 retries.
4. **Don't skip the confirmation conversation node.** Going `find → cancel` directly works only when the lookup returns exactly one result. With 0 or 2+ results you need a conversation node to disambiguate first.

The same shape applies to:
- Looking up a customer by phone number, then updating their record by `customer_id`.
- Listing recent orders, then refunding the chosen one by `order_id`.
- Searching tickets, then commenting on the chosen one by `ticket_id`.
- Any "search → pick → act" UX in voice.

### Recipe — mixing tool_call and integration_call in one flow

Cross-node tokens work in both directions — an `integration_call` can read an upstream `tool_call`'s AI-extracted args, and vice versa. Use this when the dispatch surface for the action lives outside Google (a CRM, your billing system, an SMS provider) but you also want a native Calendar / Gmail action in the same flow.

Concrete example — log the lead in your CRM via a webhook, then book the appointment on Google Calendar using the same email/datetime the agent just extracted:

```jsonc
{
  "nodes": [
    /* … start + gather conversation nodes … */
    {
      "id": "log_lead",
      "type": "tool_call",
      "tool_id": "<crm-webhook tool uuid>",
      // No args_template — tool_call nodes don't carry one. The webhook tool's
      // extraction_parameters define which fields the agent will pull from
      // the conversation. Suppose the tool has extraction_parameters:
      //   - "email"               (required)
      //   - "appointmentDateTime" (required)
      // Both will be AI-extracted at fire time.
      "transitions": {
        "success_next_step_id": "book_calendar",
        "error_next_step_id": "apologize_and_handoff"
      }
    },
    {
      "id": "book_calendar",
      "type": "integration_call",
      "provider": "google_calendar",
      "integration_id": "<calendar credential uuid>",
      "action": "create_event",
      "args_template": {
        // Cross-token into the tool_call node's AI-extracted args.
        // log_lead.email and log_lead.appointmentDateTime are addressable
        // because they're names of extraction_parameters on the linked tool.
        "summary":    { "mode": "literal", "value": "Consultation with {{log_lead.email}}" },
        "start_time": { "mode": "literal", "value": "{{log_lead.appointmentDateTime}}" },
        // Calendar needs an end_time too; ai_extract is fine here since it
        // wasn't captured upstream.
        "end_time":   { "mode": "ai_extract",
                        "description": "ISO 8601 end_time — exactly 30 minutes after start_time {{log_lead.appointmentDateTime}}." }
      },
      "transitions": {
        "success_next_step_id": "say_done",
        "error_next_step_id":   "apologize_and_handoff"
      }
    }
    /* … say_done end node, apologize_and_handoff conversation, etc. … */
  ]
}
```

What the runtime does: when `book_calendar` enters, it sees that `summary` and `start_time` are literals that reference slots from `log_lead` — those were filled by the webhook tool's AI extraction step. They're already in slot storage; the tokens interpolate from cache without re-prompting. Only `end_time` is `ai_extract` and unknown, so Live asks the caller (or derives from start_time) before firing. Single voice prompt, two services touched.

### Recipe — robust AI extraction with error fallback

When a node has `ai_extract` args, the runtime gives the agent up to 3 chances to surface each value from the conversation before giving up. If you don't wire an `error` branch, a stubborn caller can deadlock the flow. Every flow with `ai_extract` args MUST have its error_next_step_id wired.

```jsonc
{
  "nodes": [
    {
      "id": "book_event",
      "type": "integration_call",
      "provider": "google_calendar",
      "integration_id": "<calendar credential uuid>",
      "action": "create_event",
      "args_template": {
        "summary":    { "mode": "ai_extract", "description": "Short title for the appointment, like 'Consultation with Sarah Cohen'." },
        "start_time": { "mode": "ai_extract", "description": "ISO 8601 start, in the caller's timezone (Israel = UTC+3). If the caller said 'tomorrow at 3', convert it." },
        "end_time":   { "mode": "ai_extract", "description": "ISO 8601 end, exactly 30 minutes after start_time." }
      },
      "transitions": {
        "success_next_step_id": "say_done",
        "error_next_step_id":   "graceful_handoff"
      }
    },
    {
      "id": "graceful_handoff",
      "type": "conversation",
      "name": "Apologise and take down info for callback",
      "instructions": "Apologise: we couldn't pin down the booking details over the call. Ask the caller for the easiest way to reach them — phone or email — and tell them someone will follow up within 2 business hours. Keep it warm, no blame.",
      "transitions": [
        { "id": "got_contact", "label": "Caller agreed to callback", "next_step_id": "handoff_end", "description": "User gave their preferred contact and is OK with a callback" }
      ]
    },
    { "id": "handoff_end", "type": "end", "farewell": "Thank you — we'll be in touch shortly. Have a good day." }
  ]
}
```

How it plays out for a non-cooperative caller:
- **Attempt 1**: agent asks "What time works for you?". Caller: "Whatever's good."
- **Attempt 2**: agent re-asks more directly. Caller: "I don't know, you tell me."
- **Attempt 3**: agent tries once more with a concrete suggestion. Caller dodges.
- **Result**: runtime routes to `graceful_handoff`. Agent apologises and takes the callback info — no dead air, no awkward looping.

The 3-attempt cap is per node entry. If the same node fires twice in a call (a loop), each entry gets its own 3 attempts.

**Authoring rules of thumb for ai_extract:**
1. **Write descriptions like prompts**, not labels. `"Caller's email, spelled out one character at a time"` extracts more reliably than `"email"`.
2. **Splice context with tokens.** `description: "ISO 8601 end time — exactly 30 minutes after {{check.start_time}}"` gives the agent the upstream value to anchor against.
3. **Always wire an `error_next_step_id`.** Even on tiny flows. Voice is unpredictable.

---

## Worked example — Wedding RSVP with calendar booking

See [`templates/flows/booking-google-calendar.json`](templates/flows/booking-google-calendar.json) for the full JSON. Sketch:

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
the transcript after the call ends; `webhook_url` (with
`webhook_events: ["call.analyzed"]`) delivers it to the CRM. No flow-level
post-end pipeline.

Templates ship with this exact structure: [`templates/flows/booking-google-calendar.json`](templates/flows/booking-google-calendar.json).

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

Pair with agent-level `extraction_parameters` (`team_size`, `current_vendor`, `renewal_window`, `demo_booked`) and `webhook_url` + `webhook_events: ["call.analyzed"]` to push the qualification result to the CRM after the call ends.

---

## Recipe — Schedule an appointment and confirm by email

Two `integration_call` nodes wired together: one to book the calendar event, one to send the confirmation email. The conversation collects the slot, a Calendar `check_availability` call gates the booking, and on success a Gmail `send_email` follows up. This is the canonical "do something in the world AND tell the user about it" pattern with first-class integration nodes — no webhook tools required.

```
start
  └─→ greet_and_ask_when (conversation)
        └─ "Caller gave a date/time" → check_availability

check_availability (integration_call, google_calendar.check_availability)
  ├─ success                                → confirm_booking
  ├─ success — custom $.available == false  → suggest_alternatives
  └─ error                                  → apologize_and_handoff

confirm_booking (conversation)
  ├─ "Caller confirmed"   → create_event
  └─ "Caller wants to change" → greet_and_ask_when

create_event (integration_call, google_calendar.create_event)
  ├─ success → send_confirmation
  └─ error   → apologize_and_handoff

send_confirmation (integration_call, gmail.send_email)
  ├─ success → polite_end
  └─ error   → apologize_email_manually   (still ends the call cleanly,
                                           but flags the missing email
                                           via extraction_parameters)

polite_end / apologize_and_handoff (transfer) / suggest_alternatives (conversation) / ...
```

Skeleton `flow_config` for the integration nodes (the conversation/end/transfer nodes follow the patterns from the wedding example above):

```json
{
  "flow_config_version": "1",
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "agent_speaks_first": true,
      "greeting": "Hi, this is Maya. What day and time would work for your appointment?",
      "is_literal": false,
      "auto_advance": true,
      "next_step_id": "greet_and_ask_when"
    },

    /* greet_and_ask_when (conversation) — collects appointment.start_iso /
       appointment.end_iso / appointment.start_human into slot_values */

    {
      "id": "check_availability",
      "type": "integration_call",
      "name": "Check calendar availability",
      "provider": "google_calendar",
      "integration_id": "8c2b1e1a-7c4d-4e1f-9a2b-3c4d5e6f7a8b",
      "action": "check_availability",
      "args_template": {
        "start_time": { "mode": "ai_extract",
                        "description": "ISO-8601 start time the caller proposed" },
        "end_time":   { "mode": "ai_extract",
                        "description": "ISO-8601 end time, default 30 minutes after start" }
      },
      "pre_fire_announcement": true,
      "transitions": {
        "success_next_step_id": "confirm_booking",
        "error_next_step_id":   "apologize_and_handoff",
        "custom": [
          {
            "id": "busy",
            "label": "Slot is taken",
            "jsonpath": "$.available",
            "equals": "false",
            "next_step_id": "suggest_alternatives"
          }
        ]
      }
    },

    /* confirm_booking (conversation) */

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
        // Reuse the times we already extracted in check_availability.
        "start_time":  { "mode": "literal",
                         "value": "{{check_availability.start_time}}" },
        "end_time":    { "mode": "literal",
                         "value": "{{check_availability.end_time}}" },
        "attendees":   { "mode": "ai_extract",
                         "description": "Caller's email address as a single-element array" },
        "description": "Booked via inbound call"
      },
      "pre_fire_announcement": true,
      "transitions": {
        "success_next_step_id": "send_confirmation",
        "error_next_step_id":   "apologize_and_handoff"
      }
    },

    {
      "id": "send_confirmation",
      "type": "integration_call",
      "name": "Send confirmation email",
      "provider": "gmail",
      "integration_id": "1d4e2f3a-9c8b-4d6e-8f1a-7b2c3d4e5f6a",
      "action": "send_email",
      "args_template": {
        // Reuse the email captured during create_event.
        "to":      { "mode": "literal", "value": "{{create_event.attendees}}" },
        "subject": "Your appointment is booked",
        "body":    { "mode": "ai_extract",
                     "description": "Friendly confirmation paragraph including the agreed time and a thank-you" }
      },
      "pre_fire_announcement": true,
      "transitions": {
        "success_next_step_id": "polite_end",
        "error_next_step_id":   "apologize_email_manually"
      }
    },

    /* polite_end (end), apologize_and_handoff (transfer or end),
       suggest_alternatives (conversation), apologize_email_manually (end) */
  ]
}
```

Notes:
- Both Calendar nodes reference the **same `integration_id`** because the same connected account owns the underlying calendar.
- The Gmail node has its own `integration_id` (could be a different account).
- `pre_fire_announcement: true` covers latency on the dispatch — the platform plays a short hold message while the action runs, so the pause doesn't feel dead. The copy is platform-controlled (no per-node text).
- The `check_availability` `$.available == false` custom branch is the typical "soft-fail that needs a structurally different next node" — sending the user to `suggest_alternatives` instead of `confirm_booking`.
- Always design an `error` branch on every dispatch node. Network blips and disconnected integrations happen; you don't want the call to dead-end.

---

## Save validation — what makes a flow saveable

`POST /agents` (with `flow_config`) and `PATCH /agents/:id` (with `flow_config`) run a full graph validator before persisting. Any failure returns `400 { "error": "FLOW_INVALID", "issues": [...] }` listing every problem found — fix all of them and re-save.

Quick checklist (the validator codes that back each rule are in parentheses):

- Exactly one `start` node (`no_start`, `multiple_starts`); its `next_step_id` is wired (`start_unwired`).
- Every `conversation` node has non-empty `instructions` (`instructions_missing`) and at least one outgoing transition (`terminal_not_allowed`). Every transition has a non-empty `description` (`transition_description_missing`) — the natural-language trigger the model reads to pick that path.
- Every `tool_call` node has a `tool_id` (`tool_id_missing`) and a wired `success_next_step_id` (`success_not_wired`). `tool_call` nodes have no `args_template` field — args come from the tool's `payload_config`.
- Every `integration_call` node has a valid `provider` (invalid → `schema_invalid` at zod parse), a valid `action` for that provider (`action_invalid`), an `integration_id` (`integration_id_missing`), and that integration is `active` in your company with a matching provider (`integration_not_in_company`). It also needs `success_next_step_id` wired (`success_not_wired`). Required action args must be present in `args_template` (`args_template_missing_required`); `ai_extract` args need a `description` (`args_template_missing_description`); every `{{node.arg}}` token must resolve to an existing `integration_call` node and an `ai_extract` arg on that node (`args_template_dangling_reference`). `{{metadata.key}}` tokens are NOT validated at save time — missing values resolve to empty string at runtime.
- Every `transfer` node has a `transfer_to` (`transfer_to_missing`).
- **Only `end` and `transfer` nodes may be terminal.** Anything else with no outgoing edge → `terminal_not_allowed`. The flow must contain at least one reachable `end` or `transfer` (`no_terminal`).
- All `next_step_id` references resolve (`unknown_target_node`); every node is reachable from `start` (`unreachable_node`).

If you're scaffolding flows programmatically against the API, the cheapest way to debug a save is to send it once, read every entry in `issues[]`, and address them all in one follow-up PATCH.

## Saving and versioning

Every PATCH to `flow_config` auto-creates a row in `flow_versions` (deduped by SHA-256 content hash). List with `GET /agents/:id/flow/versions`. Versions are immutable — you cannot delete one. Restore a prior version with `POST /agents/:id/flow/restore { version_id }` (see `yappr-api.md`) — one call, no need to fetch the version's `flow_config` first.

---

## Testing without placing a real call

`POST /agents/:id/flow/test` is a hermetic simulator: feed it a synthetic transcript + mocked tool results, get back a step trace. v1 uses a deterministic keyword-overlap heuristic for transition selection (free, fast, CI-safe) — it does not invoke the production routing model. Use it for smoke testing flow logic; for measuring real-call routing behavior, run a live test call.

---

## What's NOT in v1

- Per-node STT/TTS/LLM swap (one set per call)
- Per-node tool gating for prompt agents
- MCP server attachment (deferred to v1.1)
- Multi-agent / agent handoff
- The `transfer` node currently uses the same SIP transfer mechanism prompt agents use; for cross-flow handoff use a webhook tool that triggers the next flow externally.
