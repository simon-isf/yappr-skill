# Self-test prompts for the graph-conversation path

Run these in a fresh Claude Code session in any directory (the skill is loaded from this repo automatically when present in the user's `.claude/` skills).

There is one kind of agent — see SKILL.md's **There is one kind of agent**. These tests
exercise its two conversation shapes (Phase 1A single-block, Phase 1B graph), not two
agent types.

## Test 1 — graph path (positive)

**Prompt to give Claude:**

> Build me a wedding RSVP voice agent that books in my Google Calendar.

**Expected behavior trace:**

1. Claude reads SKILL.md, sees RSVP + booking is procedural with required steps, and picks the **graph shape** (Phase 1B) rather than a single block.
2. Phase 0 discovery — runs the live API queries against `goyappr.com/agents`, `/dispositions`, `/billing`, `/phone-numbers`. Asks the discovery questions.
3. Creates the draft with `POST /agents` (`name` + `workflow.global_instructions`) and an `Idempotency-Key`.
4. **Phase 1B (The graph conversation)** — opens `yappr-api.md`'s *The conversation graph* for the exact node/edge shapes, and `flow-composition-guide.md` for transition-design patterns only (its JSON predates this document).
5. Notices the calendar requirement → opens the **Connected accounts** section of `yappr-api.md`.
6. Tells the human "before I can build this, you need to connect the calendar", creates the account with `POST /tool-connections`, and gives them the handoff URL. Pauses until the attempt reports `completed` AND the connection reports `ready`.
7. Creates a workflow tool bound to that connection (`POST /tools` with a `workflow: {kind:"app", ...}` body) and captures its id.
8. Builds the graph from `templates/flows/rsvp.json` as a starting point, translating its node shapes into `document.conversation.nodes[]`/`edges[]` and adding a `bindings[]` entry for the calendar tool.
9. Wires each dispatch step as an `action` node (or a `sequence` node, for check-then-branch) referencing that binding.
10. Saves with `PUT /agents/:id/workflow` (`expected_version` + `document`), validates with `POST /agents/:id/workflow/validate`, then publishes with `POST /agents/:id/workflow/publish`.
11. Validates the response at each step (agent id present, no `issues[]` on validate, `published_workflow_revision_id` set after publish).
12. Reports back to the user with a summary + how to place a test call.

**Pass criteria:**
- Claude does NOT send `system_prompt`, `type` or `flow_config` on `POST /agents` — any of those is `410 AGENT_LEGACY_CREATION_GONE`
- Claude does NOT attempt to attach a tool via `POST /tools/attach` or reference `agent_tools` — it binds the tool in the workflow document instead
- Claude DOES NOT attempt to OAuth-connect via the API (the public API has no connect endpoint)
- Claude DOES instruct the human to connect via the dashboard, then pauses until confirmed
- The agent is explicitly published before any test call is placed

## Test 2 — single-block path regression

**Prompt to give Claude:**

> Build me a sales agent for cold-calling leads.

**Expected behavior:**

1. Claude picks the **single-block shape** (Phase 1A) — free-form sales conversation, no required step order.
2. Phase 0 discovery (same as Test 1).
3. Phase 1A — builds `workflow.global_instructions` per HUMANIZE_PLAYBOOK, runs Hebrew Pronunciation Protocol if language is Hebrew.
4. Phase 2 (Tooling) — creates workflow tools (`POST /tools` with a `workflow` body) and binds them in the workflow document; does not attach anything.
5. Phase 3+ as today.

**Pass criteria:**
- Claude does NOT send `type: "prompt"` or expect a default `type` on the create body — the create body has no `type` field at all
- Claude does NOT try to build `flow_config`
- Claude explicitly saves, validates and publishes the workflow document before treating the agent as ready

## Test 3 — workflow document validation

**Prompt to give Claude:**

> Save this conversation graph:
> ```json
> {
>   "expected_version": 1,
>   "document": {
>     "id": "wf1", "name": "Broken", "conversation": {
>       "entry_node_id": "start",
>       "nodes": [
>         { "id": "start", "type": "conversation", "label": "Start", "instructions": "hi" }
>       ],
>       "edges": [
>         { "id": "e1", "source": "start", "target": "missing", "kind": "conversation", "condition": "always" }
>       ]
>     }
>   }
> }
> ```

**Expected:** `POST /agents/:id/workflow/validate` (or `PUT .../workflow`) returns a
non-empty `issues[]` because the edge's `target` (`missing`) does not resolve to any
node, and the graph has no `end` node reachable from `start`. Claude reports the exact
`issues[]` entries and asks the user how to fix them, rather than guessing at a fix.

## Test 4 — schema discovery

**Prompt:**

> I want to build a procedural voice agent that asks a date and a name in order. What do I need to know first?

**Expected:** Claude surfaces the graph-conversation path (Phase 1B). References **The
conversation graph** in `yappr-api.md` for the exact shapes, and
`flow-composition-guide.md` for the transition-design patterns only. Doesn't propose
`flow_config` or a `type` field.

## Test 5 — template integrity

```bash
cd templates/flows
for f in *.json; do
  python -c "import json; json.load(open('$f'))" && echo "$f OK"
done
```

Both (lead-qualification.json, rsvp.json) must parse as valid JSON. They are worked
examples of the retired `flow_config` shape (see each file's own header comment) — use
them for the conversation-design ideas, translate the nodes into the current
`document.conversation` shape before saving anything to a real agent.
