# Agent Eval — Implementation Guide

Programmatic regression testing for Yappr voice agents. A persona LLM plays the caller; the production agent LLM plays itself; the conversation is scored against assertions you wrote up front. No phone numbers, no carrier minutes — just LLM tokens.

This guide is task-oriented. Open it whenever the user wants to:

- Test an agent without making real calls
- Catch regressions before they ship (CI integration)
- A/B test two system prompts or two flow_configs
- Audit agent behaviour against compliance phrases
- Investigate "the agent used to handle this case correctly, what changed?"

For exact endpoint shapes see [`yappr-api.md`](yappr-api.md). For flow-agent design fundamentals see [`flow-composition-guide.md`](flow-composition-guide.md).

---

## Mental model

```
Persona  ─┐
          ├─►  Case  ─►  Run  (one case → many runs over time)
Agent    ─┘     │
                └─►  Suite (a case can belong to one suite, or be ad-hoc)
```

| Concept | Stored in | Reusable? |
|---|---|---|
| Persona | `eval_personas` | Yes — one persona, many cases |
| Case | `eval_cases` | A case is bound to one persona + one agent |
| Suite | `eval_suites` | Container — cases reference it via `suite_id` |
| Run | `eval_runs` (+ `eval_run_turns`) | Append-only history. Every execution = one run. |

A run is **always against a specific case**. To run a one-off check, create the case first. To re-run a regression sweep, run the suite that wraps the cases.

---

## Recipe 1: Design a persona

A persona is a reusable caller archetype. Keep them tight; reuse them across many cases.

### Anatomy

| Field | Purpose |
|---|---|
| `name` | Short label ("Frustrated tenant", "Curious shopper") |
| `description` | Optional one-liner |
| `identity_prompt` | Second-person prompt — who they are, what brought them to the call |
| `behavior_traits` | JSON knobs: `patience`, `verbosity`, `cooperation`, `interruption_tendency`, `goal`, `accent`, ... |
| `language` | `he` or `en` — match the agent under test |

### Sample

```bash
curl -s -X POST "https://api.goyappr.com/agent-eval/personas" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Frustrated tenant",
    "description": "Adversarial caller chasing a maintenance issue",
    "identity_prompt": "You are a 38-year-old tenant in Tel Aviv calling about a leaking pipe in your kitchen. This is the third time you have reported it. You are frustrated but not screaming. You have time to talk for 5 minutes.",
    "behavior_traits": {
      "patience": "low",
      "verbosity": "chatty",
      "cooperation": "cooperative",
      "interruption_tendency": "occasional",
      "goal": "Get a maintenance technician scheduled today, not tomorrow"
    },
    "language": "en"
  }'
```

### Persona-design rules of thumb

- **Keep `identity_prompt` under ~120 words.** Long prompts make the persona LLM rigid. The `behavior_traits` knobs do the heavy lifting.
- **Don't pre-write the script.** Describe the goal; let the persona LLM improvise.
- **Adjustable knobs go in `behavior_traits`, not the prompt.** That way one identity → many variants ("frustrated tenant patient version" / "frustrated tenant impatient version") without copy-paste drift.
- **Match language to the agent.** A Hebrew agent paired with an English persona produces a code-switching test, which is fine if that's the test you want.

### When to create multiple personas

Reach for a new persona row when the **identity** changes — different role, different motivation, different relationship to the business. Reach for `behavior_traits` overrides when the same identity should be tested across different moods.

---

## Recipe 2: Build a regression suite

A regression suite is a collection of cases that exercise different paths through your agent. Aim for diversity: happy path, refusal path, ambiguous-intent path, edge-case path.

### Step 1 — create the suite

```bash
curl -s -X POST "https://api.goyappr.com/agent-eval/suites" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Booking agent regression — v1",
    "description": "Pre-deploy regression suite for the booking agent",
    "parallelism": 4
  }' | jq -r .id
```

Capture the suite id. `parallelism: 4` means up to 4 cases run concurrently when you trigger a suite run — a good default for a 10-30 case suite.

### Step 2 — create 3-5 starter cases

A useful starter set covers different failure modes. Below is a worked example for an appointment-booking agent. Copy + adapt.

#### Case A — happy path

```jsonc
{
  "name": "Happy path — caller agrees on first available slot",
  "agent_id": "AGENT_UUID",
  "persona_id": "PERSONA_UUID_COOPERATIVE",
  "suite_id": "SUITE_UUID",
  "scenario": "The persona is responding to a missed call from your business about their recent inquiry. They have 5 minutes and want to book.",
  "success_criteria": [
    { "kind": "must_say",       "phrase": "would Tuesday at 3pm work for you", "match_type": "substring", "weight": 1 },
    { "kind": "must_call_tool", "tool_name": "bookAppointment",                                            "weight": 2 }
  ],
  "max_turns": 20,
  "pass_threshold": 80,
  "tool_policy": "mock"
}
```

#### Case B — refusal path

```jsonc
{
  "name": "Refusal path — caller declines politely",
  "agent_id": "AGENT_UUID",
  "persona_id": "PERSONA_UUID_REFUSING",
  "suite_id": "SUITE_UUID",
  "scenario": "The persona has decided not to move forward. They will say no politely. You should NOT pressure them.",
  "success_criteria": [
    { "kind": "must_not_say",   "phrase": "are you sure",                          "weight": 1 },
    { "kind": "must_not_say",   "phrase": "let me transfer you",                   "weight": 1 },
    { "kind": "must_say",       "phrase": "thanks for letting us know",            "weight": 1 },
    { "kind": "must_not_say",   "phrase": "bookAppointment",                       "weight": 1 }
  ],
  "max_turns": 10,
  "pass_threshold": 100,
  "tool_policy": "mock"
}
```

#### Case C — adversarial / off-topic

```jsonc
{
  "name": "Off-topic — caller asks unrelated question",
  "agent_id": "AGENT_UUID",
  "persona_id": "PERSONA_UUID_DISTRACTED",
  "suite_id": "SUITE_UUID",
  "scenario": "The persona will start by asking about pricing for an unrelated product. The agent should politely decline to answer and steer back to the booking topic.",
  "success_criteria": [
    { "kind": "must_say",       "phrase": "back to your appointment", "weight": 2 },
    { "kind": "custom_llm_judge", "rubric": "The agent must not invent pricing or product information that wasn't in its training instructions.", "weight": 3 }
  ],
  "max_turns": 15,
  "pass_threshold": 80,
  "tool_policy": "mock"
}
```

#### Case D — wrong number

```jsonc
{
  "name": "Wrong number — caller has no context",
  "agent_id": "AGENT_UUID",
  "persona_id": "PERSONA_UUID_WRONG_NUMBER",
  "suite_id": "SUITE_UUID",
  "scenario": "The persona has no idea who is calling and didn't request any service. They will say 'who is this?' or 'I think you have the wrong number'.",
  "success_criteria": [
    { "kind": "must_reach_node", "node_id": "polite_end_node", "weight": 2 }
  ],
  "max_turns": 6,
  "pass_threshold": 100,
  "tool_policy": "mock"
}
```

(Use `must_reach_node` only for flow agents.)

#### Case E — language switch (for bilingual deployments)

```jsonc
{
  "name": "Language switch — caller starts EN, switches to HE",
  "agent_id": "AGENT_UUID",
  "persona_id": "PERSONA_UUID_HE_SWITCHER",
  "suite_id": "SUITE_UUID",
  "scenario": "The persona starts in English, then mid-call switches to Hebrew. The agent should follow.",
  "success_criteria": [
    { "kind": "custom_llm_judge", "rubric": "After the persona switches to Hebrew, every subsequent agent turn is in Hebrew.", "weight": 3 }
  ],
  "max_turns": 14,
  "pass_threshold": 80,
  "tool_policy": "mock"
}
```

### Pass threshold guidance

- **80** (default) — leaves headroom for one weight-1 assertion to flake without failing the case. Right for fuzzy must-say checks.
- **100** — every assertion must pass. Right for hard rules (must_not_say compliance phrases, must_reach safety nodes).

### Step 3 — sanity-run one case before running the whole suite

Always do this before triggering the full suite. It catches typos, over-strict regexes, and personas that don't behave as intended.

```bash
# POST /agent-eval/cases/:id/run blocks up to 60s. If it completes in time,
# response is 200 with the fully-scored EvalRun. If it doesn't, you'll get
# 202 with the latest non-terminal row — fall back to polling.
RUN=$(curl -fsS -X POST "https://api.goyappr.com/agent-eval/cases/CASE_UUID/run" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}')
RUN_ID=$(echo "$RUN" | jq -r .id)

# Inspect transcript
curl -s "https://api.goyappr.com/agent-eval/runs/$RUN_ID/turns" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '.data[] | {turn: .turn_number, role, text}'

# Inspect score breakdown
curl -s "https://api.goyappr.com/agent-eval/runs/$RUN_ID/evaluation" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

If the score is wrong, adjust the assertion (most common fix: tweak `phrase` or weight) and re-run.

---

## Recipe 3: Wire suite runs into CI

Two patterns. Pick by your CI's posture.

### Pattern A — fire and poll (simple, sync)

Right when your CI step blocks until the eval completes. Suitable for suites under ~50 cases.

```bash
#!/usr/bin/env bash
set -euo pipefail

SUITE_ID="${YAPPR_SUITE_ID}"
THRESHOLD_PASS_RATE="0.90"  # fail the build if pass rate drops below this

# 1. Trigger the suite (returns immediately with suite_run_id)
RUN=$(curl -fsS -X POST "https://api.goyappr.com/agent-eval/suites/$SUITE_ID/run" \
  -H "Authorization: Bearer $YAPPR_API_KEY")
SUITE_RUN_ID=$(echo "$RUN" | jq -r .suite_run_id)
echo "Triggered suite_run_id=$SUITE_RUN_ID"

# 2. Poll the suite-run aggregate until in_flight === 0
while true; do
  AGG=$(curl -fsS "https://api.goyappr.com/agent-eval/suites/$SUITE_ID/runs/$SUITE_RUN_ID" \
    -H "Authorization: Bearer $YAPPR_API_KEY")
  IN_FLIGHT=$(echo "$AGG" | jq '.in_flight')
  if [ "$IN_FLIGHT" = "0" ]; then break; fi
  echo "$IN_FLIGHT run(s) still in flight..."
  sleep 5
done

# 3. Read final aggregate
PASSED=$(echo "$AGG" | jq '.passed')
TOTAL=$(echo "$AGG" | jq '.total_runs')
PASS_RATE=$(echo "$AGG" | jq '.pass_rate')
SCORE_AVG=$(echo "$AGG" | jq '.score_avg')
echo "Suite result: $PASSED/$TOTAL passed (rate=$PASS_RATE, avg score=$SCORE_AVG)"

# 4. Print failing runs so the developer can investigate.
# Suite-aggregate runs[] carry only flat columns (case_id, not an expanded
# case object), so identify failures by case_id + run id. Resolve case_id to
# a human name via GET /agent-eval/cases/<case_id> if you need it.
echo "$AGG" | jq -r '.runs[] | select(.pass_fail==false) | "FAIL: case=\(.case_id) (run \(.id), score \(.score))"'

# 5. Gate the build
if [ "$(echo "$PASS_RATE >= $THRESHOLD_PASS_RATE" | jq)" != "true" ]; then
  echo "Pass rate $PASS_RATE below threshold $THRESHOLD_PASS_RATE"; exit 1
fi
```

### A note on single runs vs suites

`POST /agent-eval/cases/:id/run` (single case) **blocks up to 60 seconds** waiting for the run to finish, then returns the terminal row with `200`. If it doesn't finish in time you'll get `202` plus the latest non-terminal row — keep polling `GET /agent-eval/runs/:id`.

`POST /agent-eval/suites/:id/run` is **always async**. Returns `202` with `suite_run_id` and `run_ids[]` immediately; poll `GET /agent-eval/suites/:id/runs/:suite_run_id` to know when the suite settles. Suites can have many cases, well past any HTTP-request budget.

GitHub Actions sketch (simplified, pattern A):

```yaml
name: Agent eval regression
on:
  pull_request:
    paths:
      - "agents/**"
      - ".github/workflows/agent-eval.yml"

jobs:
  agent-eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Yappr agent eval suite
        env:
          YAPPR_API_KEY: ${{ secrets.YAPPR_API_KEY }}
          YAPPR_SUITE_ID: ${{ vars.YAPPR_SUITE_ID }}
        run: ./scripts/run-yappr-eval.sh
```

### Cost guard

A typical 30-case regression suite runs in 1-3 minutes wall-clock and costs well under a dollar. Set `parallelism` lower if you want to throttle spend on every PR.

---

## Recipe 4: Read the evaluation output

`GET /agent-eval/runs/:id/evaluation` returns the score roll-up:

```json
{
  "score": 100,
  "pass_fail": true,
  "results": [
    { "assertion": { "kind": "must_say", "phrase": "Tuesday at 3pm", "weight": 1 }, "passed": true,  "weight": 1, "reason": "matched at turn 7" },
    { "assertion": { "kind": "must_call_tool", "tool_name": "bookAppointment", "weight": 2 }, "passed": true, "weight": 2, "reason": "fired at turn 8" },
    { "assertion": { "kind": "must_not_say", "phrase": "guarantee", "weight": 1 }, "passed": true, "weight": 1, "reason": null }
  ]
}
```

The math: passed weight 4 / total weight 4 → score = 100. Always read the `score` field directly rather than recompute it client-side — the formula may evolve.

### Reading the run row

`GET /agent-eval/runs/:id` carries operational context:

| Field | What it tells you |
|---|---|
| `status` | `completed` (ran clean) vs `failed` (worker hit an error) vs `cancelled` |
| `pass_fail` | Whether `score >= case.pass_threshold` |
| `termination_reason` | `agent_ended` (clean), `persona_goodbye`, `max_turns`, `timeout`, `error`, `cancelled` |
| `duration_ms` | Wall-clock time |
| `total_cost_cents` | Exact amount debited |
| `agent_overrides` | If non-null, the run used overrides — useful for A/B audits |

---

## Recipe 5: Debug a failing assertion

When a run says `pass_fail: false`, walk it methodically.

### Step 1 — pull the turns

```bash
curl -s "https://api.goyappr.com/agent-eval/runs/$RUN_ID/turns" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '.data[] | {n: .turn_number, role, text, tools: .tool_calls}'
```

### Step 2 — pull the evaluation

```bash
curl -s "https://api.goyappr.com/agent-eval/runs/$RUN_ID/evaluation" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '.results[] | select(.passed==false)'
```

### Step 3 — diagnose by failure mode

| Failure mode | Symptom | Common fix |
|---|---|---|
| Assertion phrase too strict | `must_say` fails even though the agent obviously said the right thing | Loosen `phrase`, switch to regex, or use `custom_llm_judge` with a rubric instead |
| Assertion phrase too loose | `must_not_say` flags a substring inside an unrelated word | Tighten with regex, add word boundaries, or use `case_sensitive: true` |
| Persona too rigid | The persona never reaches the topic the agent needs | Trim `identity_prompt`, broaden `behavior_traits.cooperation` |
| Persona too cooperative | Refusal-path case never refuses | Add explicit refusal stance to the persona's `goal` for that case (use a per-case override or a separate persona) |
| Agent missing a tool call | `must_call_tool` fails | Inspect agent.system_prompt / flow_config for missing tool guidance; re-run after fix |
| Flow agent skips a node | `must_reach_node` fails | Pull `flow_event` rows from `/turns` — find the conversation node where the wrong transition fired, inspect `flow_eval_decision.reasoning` |
| `termination_reason: max_turns` | Conversation ran out | Either raise the case's `max_turns`, simplify the persona's goal, or shorten the agent's per-step instructions |
| `status: failed` | Worker hit an unrecoverable error | Check `error` field — usually a malformed `flow_config`, missing tool, or insufficient balance |

### Step 4 — fix and re-run

Re-run the same case after fixing:

```bash
curl -s -X POST "https://api.goyappr.com/agent-eval/cases/CASE_UUID/run" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

If you want to test a fix without committing it to the agent, use `agent_overrides`:

```bash
curl -s -X POST "https://api.goyappr.com/agent-eval/cases/CASE_UUID/run" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_overrides": {
      "system_prompt": "<draft prompt with the fix>"
    }
  }'
```

The override is recorded on the run row, so you can always trace back which config produced which result.

---

## Common gotchas

- **`tool_policy: "mock"` is the right default for CI.** All tools return synthetic success — free, deterministic, no third-party calls. Only switch to `real` for occasional pre-prod sanity checks.
- **Mixed-policy via `allowlist`.** Useful when you've added one new tool that you want to validate end-to-end while everything else stays mocked.
- **`must_reach_node` only works for flow agents.** Using it on a prompt-mode agent fails the assertion every time.
- **Personas drift over time.** When the agent under test grows new capabilities, revisit your personas — an old "frustrated tenant" persona might no longer trigger the new path you care about.
- **Don't share personas across very different agents.** A persona tuned to a booking agent will give garbage results against an unrelated support agent.
- **No webhooks for eval runs.** Eval runs do not emit webhooks — poll `GET /agent-eval/runs/:id` (or `GET /agent-eval/suites/:id/runs/:exec_id` for suites) instead. Single `POST /agent-eval/cases/:id/run` already blocks up to 60s and returns the result inline if it finishes in time.
- **Cancelled runs are still partially billed.** Any turns produced before the cancel signal landed are debited.

---

## Pricing summary

User-facing rate card (what gets charged to your credit balance):

| Role | Input | Output |
|---|---|---|
| Agent | $2 / 1M tokens | $10 / 1M tokens |
| Persona | $1 / 1M tokens | $4 / 1M tokens |

A typical 10-turn case runs $0.005-$0.05. A 50-case regression suite under $1.

After-the-fact spend visibility:

```bash
curl -s "https://api.goyappr.com/billing/consumption?product=eval_run&group_by=day" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

---

## Migration: from "test by phone" to agent eval

If the user currently tests by calling their own number every time they change a prompt, the migration is:

1. **Capture 5-10 representative calls** they currently rely on for QA. Listen back, note (a) the caller's intent, (b) the desired agent behaviour, (c) what would constitute a "fail".
2. **Convert each into a case**: persona = the caller, scenario = the framing, success_criteria = the items from (b)+(c).
3. **Group into a suite.** Trigger it before each prompt change. Compare scores before/after.

This usually moves a 30-minute manual test cycle into a 2-minute automated one, and surfaces regressions the human ear missed.
