---
name: yappr-agent-builder
description: Build, configure, and launch complete Yappr AI voice agent systems end-to-end — one kind of agent (the workflow agent), with one editor for what happens before, during and after the call; prompt and flow agents can no longer be created. Use when users want to create a voice agent, design a conversation flow with branching, connect Google Calendar / scheduling, set up outbound call dispatch, configure post-call automation, manage leads, or go live with a phone number. Discovery-driven — queries the live account before asking the user anything.
---

# Yappr Super Voice AI Agent Builder

This skill takes a coding agent through building a complete, production-ready voice AI system on Yappr — from discovery through agent creation, tooling, call dispatch, post-call automation, and going live. Every decision flows from what the user tells you and from live data fetched from their account.

---

## How to Use This Skill

This skill is organized into phases. Work through them sequentially. Each phase's output feeds the next.

**Before writing any code or making any API call**, run Phase 0 discovery — query the live account and ask the user the questions. The answers determine everything that follows.

### Journey — connect an AI app with account sign-in

When the user is working through a Yappr MCP connector, use that authenticated
connection. Do not ask them for a Yappr API key or require this skill to be
installed again. The remote endpoint is `https://mcp.goyappr.com/mcp` (`POST /mcp`),
with Streamable HTTP and OAuth account authorization. The person chooses a
workspace and approves its permissions on Yappr's own sign-in screen.

1. Check the connected workspace with `whoami`, then use the individually
   described MCP tools available to that connection. Discovery before questions
   still applies, using only the resources the connection may read.
2. `yappr.read` reads setup and call statistics; `yappr.build` creates agents and
   edits drafts. `yappr.manage` enables live workspace operations only when the
   client requests it and the person explicitly approves it. Do not assume an
   older read/build connection has management access.
3. Follow the same create, read, save, check and publish journey below. Confirm
   with the person before publishing, calling people, launching campaigns, or
   buying or releasing numbers; consequential tools require an explicit
   confirmation argument as well.
4. Call content is a separate permission. Respect call-content redaction and
   agent limits, and never work around a refused operation with another key.
5. Connecting a business app may return a sign-in or setup URL. Have the person
   open it and enter credentials in Yappr or the app provider's own page. Do not
   request API keys, passwords, payment-card details, or one-time codes in chat.
6. Subscription and credit purchases stay in Yappr. Explain an unavailable
   entitlement without starting checkout through the connector. The app's
   directory policies and account settings may restrict available operations.

The dashboard's **Build with AI** panel opens a published directory listing when
available and otherwise provides that app's custom connection instructions.
Claude and ChatGPT listings require separate platform review; never imply a
listing is approved or has a Verified badge until that is confirmed.
Connections can be inspected and revoked under **Settings → API keys → AI apps**.
See the **MCP account connection** section in `yappr-api.md` for protocol details.

### One kind of agent

There is one kind of agent. Never ask the user to choose a prompt or a flow type:
follow discovery, then POST /agents with a name and either your own
workflow.global_instructions or a `template` (`inbound`, `qualify`, `reminder`) as
documented in yappr-api.md. Never ask whether the agent is inbound or outbound either:
an agent has no direction. The phone number it is bound to decides that. Keep an
Idempotency-Key across identical retries. Read the server-owned draft, edit Before/During/After, and explicitly Save/validate/publish.
Strict Mode starts off. Creation/publication alone does not establish runtime readiness
or authorize test calls. Archive is distinct from reversible deactivation.

Use the **Canonical workflow authoring** reference in `yappr-api.md` for the full
document and safe tool catalog. Preserve exact JSON numbers and explicit false,
zero, null and missing values. Request/stored schemas describe separate input
sources; they do not themselves store runtime input. Sequence children are private
tool DAG steps with explicit dependencies, not grouped conversations or recursively
nested sequences. Intrinsic End stays outside the tool catalog.

Read, Save, Check and Publish are distinct operations. Carry the original draft
version through each write; review a conflict instead of silently re-reading and
overwriting. Explain Strict-mode semantic changes before publication: with Strict
off, conversational route/order/availability are guidance, but explicit sequence
dependencies remain enforced. Accepted runs retain their frozen published artifact.
Read ordinary settings with `GET /agents/:id/settings`; preserve its exact
`updated_at` as `expected_updated_at` on settings PATCH. Never route voice or
analysis settings through legacy graph fields, and never treat a successful save
as proof that a real call or provider connection is ready.

### Journey — build a workflow agent end to end

The whole build, in the order that works. Every step has a dashboard way and an API way
on the same draft, so a person and an API key can take turns on one agent.

1. **Create the draft.** Dashboard: **Agents → New agent** (name, call language, what it
   should do in plain words). API: `POST /agents` with `name`, `language` (default `he`; send
   `en` for English) and `workflow.global_instructions` — or `template` — and an
   `Idempotency-Key` header. The answer is a draft: nothing is published, Strict Mode is off,
   and the starter holds one conversation step and a closing route.
2. **Open the canvas.** Dashboard: the agent's **Workflow** tab is one canvas in three columns,
   Before the call, During the call and After the call, and it saves as you go. The other tabs
   are **Tools & integrations**, **Settings** and **Call logs**. The header says where the agent
   stands (*Live · version 3* or *Changes not live yet*) beside **Test** and **Publish**; the
   **⋯** menu holds **Check workflow**, **Versions**, **Strict mode** and **Share a test link**.
   API: `GET /agents/{id}/workflow` returns `draft.version` and `draft.document`; edit the
   document and `PUT` it back whole with `expected_version` set to the version you read. A
   `409 WORKFLOW_CONFLICT` means someone saved first: re-read and merge, never overwrite blind.
3. **Write the conversation** (Phase 1A for one block of instructions, Phase 1B for a graph of
   steps), and set the opening line, voice and call limits as ordinary settings
   (`GET /agents/{id}/settings`, then `PATCH /agents/{id}` with `expected_updated_at`).
4. **Give it tools.** Dashboard: **Tools & integrations** on the agent; sign in to apps first
   under **Tools → Connected accounts** in the sidebar. API: the **Unified Tools journey** above —
   `POST /tools`, wait until `workflow.status` reads `current`, then add a `bindings[]` entry
   and reference it from a step — or hand it a whole connected app with
   `POST /agents/{id}/integrations`. Google Calendar and Gmail are connected apps.
5. **Check.** **⋯ → Check workflow**, or `POST /agents/{id}/workflow/validate` with
   `{"expected_version": <draft.version>}`. A `422 WORKFLOW_VALIDATION_FAILED` lists every
   problem in `issues[]` (`code`, `path`, `message`, and `node_id` for a step); fix them all,
   save, check again.
6. **Publish.** **Publish**, or `POST /agents/{id}/workflow/publish` with the same
   `expected_version`. `expected_version` counts saved drafts and the answer's
   `revision.version` counts publications, so they differ. Until you publish, callers hear the
   last published version, so editing a live agent is safe.
7. **Hear it.** Publish first (an unpublished agent cannot be tested), and ask the user: a test
   call is a real call and is billed like one.
   Dashboard: **Test → In the browser** or **By phone**, or **⋯ → Share a test link** to send a
   colleague or client a link that opens a browser call. API: `POST /agents/{id}/test-call`
   with `{"to": "+972501234567"}` rings the user's own phone. Test calls show in **Call logs**,
   marked as tests.
8. **Put it on a number and call it.** `PATCH /phone-numbers/{id}` with `inbound_agent_id` and
   `outbound_agent_id` (the number carries the direction, not the agent), then
   **Calling a workflow agent** below for `POST /calls`.
9. **Read what happened.** `GET /agents/{id}/workflow/versions` lists publications newest first
   (`version`, `draft_version`, `content_hash`, `published_at`); **⋯ → Versions** is the
   dashboard's version list. Calls are read as in PHASE 4, **Journey — read what happened on a call**.

### What each phase actually runs

Before, During and After are not three lists that run "around" the call; each has its
own contract and the author needs it stated before they place a step.

**Before** runs before the caller and the agent are connected. On an inbound call it
runs after the call arrives and before it is answered, inside a short platform window —
30 seconds at most today — and the caller hears ringing until it finishes. On an
outbound call it runs before the dial, inside five minutes. `before.on_failure`
decides what an over-run or a failure means: `continue_with_available` answers or dials
with whatever Before produced — including when the window ran out, not only when a step
failed — and `stop_admission`, the default, refuses the call outright: the inbound caller is
never answered, and an outbound request ends `failed` without dialling.
Keep Before to what the agent must know in order to open its mouth; chaining several
tools that may each take the full tool timeout will not fit an inbound window. Publication
refuses a chain that fits neither window. A document with before-call steps may still offer
the web channel: the browser call is created, prepared and then started by the caller, the
same way an outgoing call is — the mint's `protocol` reads `call_request` instead of
`offer` (see PHASE 3B).

A before-call step can also **refuse the call itself**: route `on_succeeded` or
`on_failed` to `"#decline"` (on failure the step must also continue on failure). An
inbound caller is then never answered, and an outbound call is never dialled — the
request ends `failed` with `preparation_status: "declined"` and
`error_code: "before_declined"`, and no call record is created. That is the place to put
a blocklist check or an "already a customer, do not cold-call" rule: it costs nothing and
leaves no call to explain. `"#decline"` is the only route a before-call step may take,
and no lifecycle *step* takes a condition — a sequence is where step conditions belong; a whole follow-up takes one on its trigger (`when`, see After below).

**During** is the conversation, and it ends on *any* ending, a caller hangup included.
When the caller hangs up the conversation stops immediately, actions already in flight
finish and record their result, nothing new is dispatched, and the phase is over. Do not
design a During step that assumes the caller is still there when it returns.

**After** runs for the ending that actually happened. A trigger matches its event
exactly, so a follow-up on `call.ended` does not run for `call.no_answer` — on an outbound
list that is most of the calls. Use `any_end` when one follow-up should cover every
ending: it stands for `call.ended`, `call.failed` and `call.no_answer` together. Use
`request.failed` for a request that died before anything was dialled; no call exists, so
it is the only trigger that runs for it. A `<artifact>.ready` event — transcript,
recording, analysis, lead, billing — starts its follow-up only for a result that was
actually produced, so a call nobody answered runs the endings it matches and none of the
readiness triggers. Name the endings you handle; do not assume the happy path.

`any_end` includes the call nobody answered, which never has a transcript, analysis,
recording, lead or billing — so a step on `any_end` must not wait for any of them
(`requires` empty). Every follow-up whose event matches (and whose `when` holds) runs, with no "first match":
`any_end` plus `call.no_answer` both run when nobody answers. See "A different follow-up
for each ending" in PHASE 4.

**To run a follow-up for some calls only, give its trigger a `when` ("Only if").** It is
the same condition shape a sequence step uses (`compare`, `all_of`, `any_of`, `not`),
over `{"kind":"call","path":"/status"}` compared with a `literal`. Read only what the
event guarantees: how the call ended (`/status` — on `any_end` only —, `/ended_by`,
`/duration_seconds`) on an ending; the disposition (`/disposition/id`) and a collected
field (`/analysis/extracted_data/<name>`) on `analysis.ready` only; `/call_direction` and
`/channel` almost anywhere. Anything else is refused at validate (`trigger_filter_unavailable`,
`_type`, `_value`) with the field, the event and where to move it. A call that does not
match skips the whole follow-up (it is done, not failed); every follow-up whose event and
condition match runs, so "otherwise" is a **second follow-up whose `when` is
`{"kind":"not","condition":<the first one's when>}`. "Interested → book a call, others →
nothing" is one `analysis.ready` trigger with `/disposition/id` `eq` the id of Interested
(read the ids from `GET /dispositions`). A filter on `analysis.ready` never sees a call
whose analysis never settled; if those matter, add a plain `any_end` follow-up. A fact the
call does not have makes its comparison false, so use `exists` / `not_exists` to test for it.

**What a workflow agent may promise.** On every call the platform tells the agent what it
can really do: the labels of its During tools and of its After steps, with whatever the
call's channel excludes (a transfer on a browser call, a phone-only step) listed as not
available on this call. It is also told it cannot send a text message, WhatsApp, e-mail or
calendar invite, call anyone back or notify anyone unless a listed step does it or its
instructions say a person will, and to state no opening hours, prices or availability that
are not in its instructions, the call data or a tool result. So when a customer wants the
agent to promise a confirmation, build the sending as a real After step and give it a clear
label (the agent promises it by that label); do not write the promise into the prompt on its
own, and do not ask for a WhatsApp the agent cannot send. An agent with no tools gets no such
block. The platform's own Hebrew guidance no longer suggests "a confirmation will arrive on
WhatsApp" as a phrase.

### Unified Tools journey

For workflow-owned agents, use the **Unified versioned Tools** contract in
`yappr-api.md`: HTTP endpoints, connected-app actions and separately named transfers
share the same tool registry and builder picker. Intrinsic End is not a tool. Do not
attach them through a legacy tool attachment, graph overrides or the legacy direct tester.

**To let an agent use a connected app during calls, give it the whole app** —
`POST /agents/{id}/integrations {"connection_id": "<account>"}` — see *Give an agent an app*
below (part of *Give an agent tools & integrations*). Never hand-build one tool per action for that. A per-action app tool is only for a
before-call or follow-up step, an `action` node or a sequence step:

Discover apps with `GET /tool-apps`, resolve an explicit dated action version, and read
its complete input/output schemas and eligibility before creating an app tool. Bind a
ready, explicitly labeled company account and only supported typed fixed fields. A
catalog listing does not prove authorization or supported execution semantics. Use
`GET /tool-apps/connection-options` for authentication-ready choices; send an expiring
connection handoff only to the intended human, never into voice prompts or call logs.

Create with an Idempotency-Key, then poll the returned tool until materialization
finishes. Updates create immutable candidates: preserve the old head until all affected
follow-current workflows validate. Explicit pins and accepted runs stay fixed. Omit
private URL/headers to retain them; never save a sanitized display URL as an endpoint.
An update changes only what it sends: every field you leave out — `description`, `effect`,
`timeout_ms`, `method`, the call package — keeps its value, while a stored header left out
of a `headers` object you *did* send is removed (that is the delete syntax; `null` keeps a
stored value you cannot see). A create whose name another tool already carries still
succeeds and answers `warnings[]` with `tool_name_in_use` — match tools by `id`. Before
rotating a credential, `GET /tools/{id}/bindings` lists every agent that uses the tool and
whether the new revision reaches it.

A tool that already exists from the earlier `type`/`config` bodies carries no contract.
Add one with `POST /tools/{id}/workflow-revisions` before a workflow can use it: read
`GET /tools/{id}/workflow-revisions` first and send the highest `revision` you see as
`expected_revision` (`null` when there is none). Only endpoint-calling and transfer tools
can take one. The body carries the contract and nothing else — identity and private
endpoint configuration stay on the tool, and a transfer is always returned as
during-phone-only whatever you asked for. Revisions are immutable and additive; a
workflow that pinned an earlier one keeps it until it is published again.

Start standalone tests with mock policy by default, representative typed input and a
fresh Idempotency-Key. Poll the exact tool/test; retain the key/body after a lost
response. An allowlisted test requires authorization for that saved binding's real
effect. Unknown outcomes require reconciliation, not automatic repetition — `unknown` means
no answer came back (its delivery reads `unknown` too); an HTTP endpoint that answered 4xx or 5xx makes the test `failed`, and the
test's `delivery_id` is the delivery to send again with `POST /deliveries/{id}/retry`; a 2xx
the tool could not use reads `failed` (`output_schema_invalid`, `invalid_json_response`,
`response_too_large`) and is never sent again — fix the tool's Outputs and run a new test (a connected-app
action that fails on the app's side still reads `unknown` until it is reconciled). Transfer
tests are mock-only and confer no live-call authority. Unavailable services do not
authorize a legacy fallback or a real call; observe the deployment's readiness gates.

**What the agent is told about a tool's outcome.** On a live call every answer a workflow
agent's tool gives reaches the model with a plain note on what it means: *done* (say so in one
short sentence, from the answer only), *did not happen* (say so plainly, take back an earlier
"done", promise nothing later unless the instructions give a way; this includes a request the other
side turned down outright, such as an app that rejected it), *not confirmed* (a write whose
answer never came, or came but could not be read: neither "done" nor "failed", and do not run it
again unless the caller asks), *requested, not finished*, and for a lookup *use only what it says*
or say it could not get it. These are instructions to the model; how closely a voice model follows
them is measured, not guaranteed. Write step text with that in mind: "if booking fails, offer another
time" now has a clear failure to act on, so also say what to do when it is not confirmed
(usually: say you cannot confirm it right now and take the caller's details). The note follows the
tool's declared effect, so declare a lookup `effect: read`; a tool declared `write` that is named
FIND, SEARCH, LIST or GET, or calls with GET, is read as a read. A call whose session stops while the
line is still up no longer leaves the caller on a silent line: when the model keeps trying to end
it, the line is hung up once the goodbye has played.

Your endpoint receives `X-Webhook-Delivery-Id` on every delivery and on every request a
workflow agent's tool makes during a call, and a retry repeats the first delivery's id: make
the endpoint dedupe on it. (An agent not yet converted, `execution_version: "legacy"`, sends
only a webhook tool's configured headers, so those cannot be deduped this way.) A loop that retries failures reads
`GET /deliveries?status=failed&retried=false` and branches on `error_code`, never on
`error_message`.

**New journey — where a tool's arguments come from.** `bindings[].inputs` maps each
field of a tool's `input_schema` to one source: `{"kind":"model","path":"/field"}` (the
agent collects it; conversation only, one top-level name), `literal`, `request` (a value
sent in `variables` on `POST /calls`, declared in the document's `request_schema`),
`sequence` (inside a sequence), `step` (another step's output, `scope` `local` / `before` /
`during`), `artifact` (After only) and `extract` (After only: "read it from the finished call
by description", below). `artifact` is how what the agent was set up to collect reaches a
tool — `{"kind":"artifact","artifact":"analysis","path":"/extracted_data/<parameter>"}`,
with `"requires": ["analysis"]` on the step (see PHASE 4); `extract` is for a value nothing
collected: `{"kind":"extract","instruction":"the time slot the caller agreed to"}`. Do not use `stored`: nothing writes saved context, so it is empty on every call;
a required input whose only source it is (no `fallback`) is refused by Check and publish
(`422 WORKFLOW_VALIDATION_FAILED`, `stored_context_has_no_writer`, `node_id` = the step —
the save keeps the draft), and an optional one gets it as a warning. Every source except `model` and
`literal` takes `{"fallback":{"value":…}}`. Never write
`ai_extract` in a document — it is a runtime label. Full prose and a complete validated
document: `/concepts/tool-inputs` and `/examples/complete-workflow.json` in the docs
repo.

**Argument lists need an object root.** A tool's `input_schema`, the document's
`request_schema` and `stored_schema`, and a sequence's `input_schema` / `output_schema`
must each be `{"type":"object", …}`. The refusal reads *"Tool inputs must declare an
object root."* whichever of the five it was; when its `path` is empty, it is one of the
document's two.

### A sequence that checks before it acts

The pattern most accounts want first: look something up, then do different work
depending on what came back, in one sequence rather than three conversation nodes.

Take availability-then-book. Step `check` calls the availability tool. Step `book`
carries `"when": {"kind":"compare","source":{"kind":"step","scope":"local","step_id":"check","path":"/slots"},"op":"is_not_empty"}`
and `"depends_on": ["check"]`, so it runs only when something came back. Step `book`
also carries `"on_succeeded": "#end"`, which finishes the sequence the moment the
booking lands. Step `offer_callback` carries the mirror condition — the same source
with `is_empty` — and takes the other path.

Two rules decide whether it publishes. The sequence's public output is mapped from
whichever step actually ran, and both of those steps can be skipped, so every required
output field mapped from them needs a declared `fallback` or must be optional —
otherwise publication fails with `branch_dependent_source`. And a step that reads
another step's output must be downstream of it, by `depends_on` or by a route;
otherwise `input_dependency`. Both are publish-time, so check the draft before you
promise the customer a call: `POST /agents/:id/workflow/validate` returns the exact
JSON pointer of the step or condition part to change.

See **Branching inside a sequence** in `yappr-api.md` for the full grammar, the
operator rules and every issue code.

**Tool sequences in the dashboard.** A workflow's `sequences[]` can now be managed from
the agent's Workflow tab without touching the API. The During phase carries a **Tool
sequences** panel that lists every sequence with its step count, renames one in place,
and deletes one that no conversation node references (a sequence a `sequence` node still
points at cannot be deleted — delete the node, which removes the sequence with it).
Inside a sequence, steps can be reordered, and a step's `when` guard can be edited either
through the plain-language rows or directly as JSON, which is the only way to author the
nested `all_of` / `any_of` / `not` shapes the row builder cannot represent. Adding a
sequence from the toolbar while a conversation step is selected also creates the
conversation edge into it; added with nothing selected, the node is flagged as
unreachable until the author connects it.

### Saying a before-call result out loud

A before-call result reaches the agent as context already, but the agent picks its own
words for it. When a specific value has to land in a specific sentence, quote it: write
`{{before.<step_id>.<field>}}` inside a conversation node's `instructions`, or inside
`global_instructions`, and the value is substituted when the call starts. Dots go deeper
(`{{before.availability.slots.0.time}}`), and `|` gives the words to use when there is no
value (`{{before.availability.summary|I don't have times in front of me}}`) — without one
the reference simply disappears rather than being read out as braces.

Two rules decide whether it publishes, and both are worth stating to the customer before
you promise the wording. The step id must be a before-call step and the field must be one
the tool behind it declares, or publication rejects the sentence rather than the call
rejecting it later. And a reference belongs in instructions only — a step label, a route
condition or a tool's own description is refused, because nothing substitutes those.
Write it exactly as shown: lowercase, no spaces inside the braces.

**Opening with the customer's own sentence.** A workflow agent's opening line
(`greeting_message`, an agent setting) may carry the same reference, and it is said word
for word as the call connects. The pattern for "greet the caller with what our system knows":
an HTTP tool that asks the customer's server about the caller (input `phone` as the fixed
value `"{{call.caller_number}}"`, output declaring e.g. `greeting`), a Before step running it
with `before.on_failure: "continue_with_available"`, then
`PATCH /agents/{id}` `{"greeting_message": "{{before.lookup.greeting|Hello, thanks for calling.}}"}`
and Check/Publish. With no value the fallback is said; with no fallback the rest of the line;
a line left empty opens in the agent's own words; braces are never said. Check/Publish
validate the line against the document's Before steps (same `placeholder_*` codes, at path
`/settings/greeting_message`). Documented for inbound and outbound phone calls.

### Offering calendar times without a tool call

A booking agent that looks at the calendar after the caller says yes goes quiet for
seconds at the worst moment. Read the calendar once, before the call, and let the
conversation offer times from that list. Build every calendar-booking agent this way by
default, and apply it when you edit one that checks availability during the call.

1. Choose N, the window in days, by how busy the calendar is. The busy list goes into the
   agent's instructions and a long one does not work (see the limit below), so keep it under
   about 30 busy events: ask the customer roughly how many appointments and meetings the
   calendar has on a normal day. Up to 2 a day: N = 14. Up to 4 a day: N = 7. Up to 10 a day:
   N = 3. If they cannot say, use 7. For a calendar that is booked most of the day, do not
   build this: keep Find free time in the conversation as before and say why.
2. Give the agent the calendar as a whole integration so its conversation steps can use Book an
   event: `POST /agents/{id}/integrations` with `{"connection_id": "<a ready connected account
   from GET /tool-connections>"}` (add `"expected_version": <draft.version>` after an earlier
   save; `409 INTEGRATION_ALREADY_ASSIGNED` means it already has it, so skip the step).
3. Make a connected-app tool for the calendar's `GOOGLECALENDAR_FIND_FREE_SLOTS` action
   (`yappr-api.md`, *Turning a connected account into a tool*) and add it as a **before-call
   step** with a window written as relative times, so it moves with the day:
   `time_min` `{"kind":"literal","value":"{{call.time.now.<zone>}}"}` and `time_max`
   `{"kind":"literal","value":"{{call.time.in_days.N.<zone>}}"}` with N written in, where
   `<zone>` is the workspace's time zone (`Asia/Jerusalem`). Give the step a plain id such as
   `free_time` and a label that names the window with the same N (`Free time, next N days`): the
   agent reads both.
4. In the conversation step's `instructions`, in the agent's language and voice, quote the end
   of the window and the `busy` list and give the rule: *"Busy times from now until
   `{{before.free_time.end|N days from now}}`: `{{before.free_time.busy|unknown right now}}`. A
   time before that end that does not overlap any of them is free. Offer times from this list
   and check a time against it; do not use Find free time for a time before that end. Use Find
   free time only for a time after it, or when the list says unknown right now."* The window
   ends at the same time of day N days on, so its last day is only partly covered: that is why
   the rule names the end the data carries and never "these N days". Write the same N in
   `time_max`, in the label and after the `|` of the `end` reference, so they always agree: a
   larger number in the instructions than the window that was read tells the agent a day is free
   when nothing was checked. Book an event stays the one tool call of a normal booking. Never
   write instructions that run Find free time "to make sure" a time is free; that is the wait
   this removes.

Say the trade-offs to the customer when you set it up. The step adds about a second, once,
before the first word, in place of a multi-second wait after the caller says yes. The list is
read when the call starts, so a time someone else books during the call is not in it (the
calendar does not refuse an overlapping booking). A quoted value over 2,048 bytes counts as no
value, so a `busy` list longer than about 35 events reads as `unknown right now` in the
instructions; the data prepared for the agent still lists up to 64 events and tells it they need
no fetching, so do not promise that a busy calendar goes back to checking during the call: size
the window so it never has to. A workspace whose calls do not run the newest voice engine
refuses relative times when you publish (`call_placeholder_time_unavailable`): do not write a
fixed window, which is wrong from tomorrow; keep Find free time in the conversation. Validate
with `POST /agents/{id}/workflow/validate`, and test with a call before and after: nothing
should call Find free time between the caller's choice of a time and the question for their
name. The dashboard has no preset for this step yet, so a person builds it by hand (a separate
Find free time tool, a before-call step and the instruction text) or asks the builder chat.

### Calling a workflow agent

Publish before you call: an unpublished workflow agent returns
`409 WORKFLOW_UNPUBLISHED`. `POST /calls` then answers `202`, not `201` — the call is
accepted first and placed afterwards. Treat that `202` as success, not as backpressure.

Always send an `Idempotency-Key`, and keep the identical body and key across retries. A
`503 WORKFLOW_ADMISSION_UNAVAILABLE` means no call was placed; retry the same request
rather than composing a new one. Never fall back to a second `POST /calls` to "make
sure" — that is how a duplicate call happens.

Follow the returned `request_id` with `GET /call-requests/{id}`, not by listing calls: a
call record does not exist until `call_id` appears on the request. Poll with bounded
backoff up to `expires_at`, stop on `dispatched`, `failed`, `expired` or `cancelled`,
and treat `dispatch_unknown` as unresolved rather than failed. A `failed` carrying
`error_code: "before_declined"` is the agent refusing the call, not a fault — never retry
that one; change the rule, or the number. Stop a call that has not
gone out with `POST /call-requests/{id}/cancel`; it is not a hangup, and it stops
working once placement has been claimed. Pin a batch to one tested published version
with `workflow_revision_id` when a mid-batch publication would change behaviour. See
**Call requests** in `yappr-api.md`.

### Duplicating an agent to A/B test a change

The house shape for "I found a setup that works, let me try a variation without
touching it": duplicate → edit the copy → publish → route a number or a split to
it.

Read the source agent first — its settings and its current draft — so you know
what the copy inherits before you make it. Duplicate with
`POST /agents/{id}/duplicate` and an `Idempotency-Key`, sending only the fields
you want to override (usually just `name`); everything else, including the
workflow document and its tool bindings, comes from the source. The copy answers
no calls yet: it is created both unpublished and switched off, on purpose, so a
copy can never quietly start taking traffic.

Change what you actually want to test on the copy — a prompt line, a voice, a
step in the workflow — then publish it explicitly, the same as any other agent.
An unpublished copy is not "receiving less traffic"; it is receiving none.

Never re-POST `/agents/{id}/duplicate` without reusing the same `Idempotency-Key`
across a retry: a new key makes a second, independent copy, not a fixed version
of the first. And by default a copy is not isolated from its source's tools — its
bindings pin the exact tool revisions the source uses, so editing or archiving one
affects both agents. For a copy that goes to a second client, send `fork_tools: true`
(needs `tools:create` too): each shared tool is copied as `"<tool> (copy)"` and the copy's
bindings move to it. Header values are never copied, so `PATCH` each forked tool that
reports `needs_values` before publishing the copy.

Full field-by-field detail — what is copied, what is deliberately skipped, the
tool-reference-invalid case, idempotency scoping — is in
**POST /agents/:id/duplicate** in `yappr-api.md`.

### A/B test two agents on a number: duplicate → change one thing → publish → set the split → read the panel

The five-beat sequence that actually finishes what "Duplicating an agent"
above starts — a variation you can compare on real traffic, not just a copy
sitting unused:

1. **Duplicate** the agent you want to test against, per the journey above —
   `POST /agents/{id}/duplicate` with an `Idempotency-Key`.
2. **Change one thing** on the copy — a prompt line, a voice, a step in the
   workflow. One variable at a time, or the comparison at the end answers
   nothing about which change mattered.
3. **Publish** the copy. Skip this and the split you set in the next step
   silently does nothing: an unpublished (or inactive) second agent means
   every call keeps going to the first one, and the call record says so with
   `metadata.ab_variant_fallback: true`. There is no error to catch here —
   check the flag, don't assume silence means it worked.
4. **Set the split** — `PATCH /phone-numbers/{id}` with
   `inbound_split`/`outbound_split: { "agent_id": "<copy's id>", "percent": N }`
   for calls that come in or go out on that number, or `split` on
   `POST /campaigns` / `PATCH /campaigns/{id}` for a campaign. `percent` is
   always the **new** agent's share — the original keeps the rest. An
   explicit `agent_id` on `POST /calls` always wins over a number's
   `outbound_split`, and a campaign contact is pinned to whichever agent it
   got on its first attempt, so a redial never re-rolls it.
5. **Read the panel** — the phone-number page's per-variant summary, once it
   ships; today, from the API, that is `GET /calls?ab_variant=a` and
   `?ab_variant=b` (calls, `disposition`, `duration_seconds`), or
   `GET /campaigns/{id}/stats` for a campaign. Every call also carries
   `ab_variant` on its own record.

Anti-patterns:
- **Never assume an unpublished copy is receiving traffic.** It is receiving
  none, by design — see step 3.
- **An explicit `agent_id` on `POST /calls` always wins.** A split is only
  ever consulted when the request omits `agent_id`.
- **Campaigns never use the phone-number split, and phone numbers never use
  the campaign split** — they are two independent `split` configurations, set
  and read separately, even when the campaign dials from a split number.
- **Turning a variant off is not the same as ending the test.** Deactivating
  the losing agent still leaves it pinned to whatever it already answered
  (campaigns) or leaves the split configured and silently falling back
  (numbers); to actually end the test, clear the split itself
  (`inbound_split`/`outbound_split`/`split: null`).

Endpoint detail — request/response shapes, the percent-inversion rule,
refusal codes — is in **PATCH /phone-numbers/:id**, **POST /calls** and
**Testing two agents on a campaign** in `yappr-api.md`.

### There is one kind of agent

**A new agent is a workflow agent, and nothing else can be created.** `POST /agents` takes
`name` plus `workflow.global_instructions`; a body carrying `system_prompt`, `type` or
`flow_config` answers `410 AGENT_LEGACY_CREATION_GONE`. Never ask the user to choose
between a prompt agent and a flow agent, and never fall back to the old body after a
failed create — there is no field to fix and no retry that succeeds.

**Existing agents were converted onto the workflow engine.** An agent that existed before
this release was converted as part of it (`execution_version: "workflow_v1"`), whatever it
looked like when it was created; the few still reading `"legacy"` are held only while a
retired native Google step runs out its 30-day notice period (Step 1B.3). On a converted
agent `GET /agents/:id` reads `type: "workflow"` and has no `system_prompt`, `flow_config`,
`webhook_url`, `webhook_events` or `webhook_headers` key at all, and a `PATCH /agents/:id`
carrying one is refused (`400`, naming where it moved: the instructions and graph to the
workflow document, a webhook to an After follow-up — see *Canonical workflow authoring* in
`yappr-api.md`). If
you meet a mention of "prompt agent" or "flow agent" anywhere outside this sentence,
including a few sections still further down in this file, read it as history, not as a
second kind of agent you might be building or managing today.

What the old choice used to decide is now one document. An open-ended conversation is one
conversation step with Strict Mode off. A procedure with required steps in order is a
graph of steps with Strict Mode on — and it is the same agent, the same editor and the
same endpoints either way, so the decision is no longer made at create time and no longer
permanent. Start from the shape the caller needs and change it later.

For the how-to on building that graph, see **PHASE 1B** below for the journey and **The
conversation graph** in `yappr-api.md` for its exact shapes —
[`flow-composition-guide.md`](flow-composition-guide.md) still carries the conversational
design patterns (transitions, globals, humanization) at a conceptual level, but it
describes a retired surface — its endpoints and JSON examples predate this document and
no longer work; follow the shapes above instead. For calendars, mailboxes and every other third-party
account an agent acts on, open the **Connected accounts** section of
[`yappr-api.md`](yappr-api.md).


### Core files in this skill directory

| File / Directory | When to open it |
|------|----------------|
| `yappr-api.md` | Anytime you need an exact endpoint shape, request/response fields, validation rules, or error codes |
| `HUMANIZE_PLAYBOOK.md` | When writing or reviewing any agent's instructions — research-backed principles for voice AI dialogue |
| `flow-composition-guide.md` | **Retired surface** — its endpoints no longer work; open only for the node catalog, transition heuristics and topology patterns as conceptual design reference |
| `agent-eval-guide.md` | **Programmatic regression testing** — how to design personas, build cases + suites, wire suites into CI, debug failing assertions. Open whenever the user wants to test agents without making real calls. |
| `yappr-api.md` → *Connected accounts* | Connecting a calendar, mailbox or any third-party account an agent acts on, and the human authorization handoff |
| `yappr-api.md` → *Give an agent a whole connected app* | Letting an agent use a connected app's actions on calls, in one request |
| `SKILL.md` (this file) | The journey guide — what to build, in what order, and why |
| `integrations/_overview.md` | Decide which integration to use for a given task — maps use cases to file names |
| `integrations/{name}.md` | Auth, base URL, all key endpoints, gotchas, and rate limits for a specific platform |
| `templates/integrations/{name}.ts` | **Ready-to-use Deno TypeScript client** for that platform — import directly into edge functions |

### Shared Integration Clients

Every integration has a typed TypeScript client in `templates/integrations/`. Use them instead of writing raw `fetch` calls.

**Import pattern** (from a Supabase edge function or template function):

```typescript
import { HubSpotClient } from "../../integrations/hubspot/index.ts";
// or copy the file into your edge function's directory

const crm = new HubSpotClient(Deno.env.get("HUBSPOT_TOKEN")!);
const contact = await crm.createContact({ email: "customer@example.com", phone: "+972501234567" });
```

**Available clients** (76 total — one per integration):

| Category | Clients |
|---|---|
| Messaging | `greenapi-whatsapp`, `whatsapp-business`, `viber`, `slack`, `discord`, `microsoft-teams` |
| SMS | `twilio-sms`, `vonage-sms`, `sinch` |
| CRM | `hubspot`, `pipedrive`, `monday-com`, `zoho-crm`, `salesforce`, `freshsales`, `copper-crm`, `close-crm`, `kommo-crm`, `intercom`, `apollo-io`, `keap`, `drift`, `gohighlevel`, `activecampaign`, `wix-crm` |
| Scheduling | `google-calendar`, `cal-com`, `calendly`, `acuity-scheduling`, `mindbody`, `square-appointments`, `booksy`, `setmore`, `simplybook-me`, `zoho-bookings`, `zoom` |
| Israeli market | `green-invoice`, `icount`, `priority-erp`, `cardcom`, `meshulam`, `pelecard`, `bit-pay`, `tranzila` |
| Lead sources / Forms | `facebook-lead-ads`, `tally-forms`, `typeform`, `jotform`, `google-lead-forms`, `linkedin-lead-gen`, `tiktok-lead-gen`, `google-forms-sheets` |
| Email & Marketing | `resend-email`, `sendgrid`, `mailchimp`, `klaviyo`, `mailerlite`, `brevo`, `convertkit` |
| Automation | `make-com`, `n8n`, `zapier`, `pluga` |
| Data / Spreadsheets | `google-sheets`, `notion`, `airtable`, `supabase` |
| E-commerce | `shopify`, `woocommerce` |
| Helpdesk | `freshdesk`, `zendesk` |
| Project management | `asana`, `clickup`, `jira` |
| HR | `hibob` |
| Enrichment | `clearbit` |

The slugs above are integration client module names in this directory, not Yappr
connected-app slugs. When you connect an app through Yappr (`POST /tool-connections`),
use the slug exactly as `GET /tool-apps/connection-options` returns it — Google Calendar
is `googlecalendar`, with no hyphen. A slug from this table, or from `GET /tool-apps`,
is a different list and fails at `POST /tool-connections` with
`409 CONNECTION_APP_UNAVAILABLE`.

**Client constructor patterns** — each client takes credentials + an optional `fetchFn` for testing:

```typescript
// Simple API key
new HubSpotClient(apiKey)
new MailerLiteClient(apiKey)

// Subdomain-scoped
new FreshdeskClient(apiKey, subdomain)
new ZendeskClient(subdomain, email, apiToken)
new KommoClient(subdomain, accessToken)
new ActiveCampaignClient(accountUrl, apiKey)

// Multi-credential
new GreenApiClient(instanceId, apiToken)
new WixCrmClient(apiKey, siteId)
new AcuitySchedulingClient(userId, apiKey)
new MindbodyClient(apiKey, siteId, username, password)

// OAuth (caller manages token refresh)
new ZohoCrmClient(accessToken, datacenter)
new SalesforceClient(accessToken, instanceUrl)
new KeapClient(accessToken)

// Auto-refreshing token (managed internally)
new GreenInvoiceClient(apiId, apiSecret)   // 30-min JWT, auto-refreshes
new ICountClient(companyId, username, password)  // session-based, auto-refreshes
new SimplyBookMeClient(company, loginName, password)  // X-Token, auto-refreshes
new ZoomClient(accountId, clientId, clientSecret)  // 1h OAuth, auto-refreshes

// Webhook-based (no class, export functions)
// facebook-lead-ads: verifyFacebookSignature(), parseFacebookLeadPayload()
// tally-forms: verifyTallySignature(), parseTallyPayload()
// typeform: verifyTypeformSignature(), parseTypeformWebhookPayload()
// linkedin-lead-gen: verifyLinkedInSignature(), parseLinkedInWebhookPayload()
// tiktok-lead-gen: verifyTikTokSignature() + TikTokLeadApiClient
// google-lead-forms: parseGoogleLeadFormPayload()
// zapier, n8n, make-com, pluga: webhook sender clients
```

**Dependencies:**

75 of 76 clients are **zero-dependency** — they use only Deno's built-in Web APIs (`fetch`, `URL`, `Headers`, `URLSearchParams`, `crypto`). No install step, no `node_modules`.

The single exception is `mailchimp.ts`, which uses `npm:md5` to compute subscriber hashes. In Deno 2, `npm:` specifiers are resolved automatically — no manual install required. Just make sure the project's `deno.json` includes:
```json
{ "nodeModulesDir": "auto" }
```
This is already set in `templates/integrations/deno.json`. If you copy `mailchimp.ts` into a Supabase edge function project, that project's `deno.json` will handle it — Supabase's Deno runtime resolves `npm:` imports natively.

**Type-checking:**

```bash
# From templates/integrations/ — verifies all clients compile cleanly
deno check *.ts
```

### Principle: Execute, Don't Teach

When a user asks you to do something, DO IT — don't explain how they could do it themselves. You have full API access. Create the agent, attach the tool, trigger the call. The only exceptions are genuinely destructive actions (deleting/deactivating) where you confirm first, and billing charges where you always get explicit approval.

### Principle: Discovery First

Never guess at what the user needs. Query the live account before asking anything. Present what you find ("you already have 2 agents and 3 tools — here's what they are"), then ask only the questions that the account data doesn't already answer.

### Principle: Verify After Changes

After any state-changing operation (create, patch, attach, delete), silently verify it worked using the appropriate GET endpoint. Report the confirmed result, not just the success response.

---

## Version Check (run every session)

Before doing anything else, check if a newer version of this skill is available:

1. `git -C <skill-directory> fetch origin main --quiet`
2. `git -C <skill-directory> rev-parse HEAD` — local commit
3. `git -C <skill-directory> rev-parse origin/main` — remote commit
4. If they differ: *"A new version of the Yappr Agent Builder skill is available. Would you like to upgrade?"*
5. If yes: `git -C <skill-directory> pull origin main --ff-only`
6. If no: continue with current version, don't ask again this session
7. If they match: proceed silently

---

## PHASE 0: Discovery

**Run this before asking the user anything.** Make 3 API calls in parallel, then present what you found, then ask your questions.

### Step 0.1 — Live Account Discovery

Run these simultaneously:

```bash
# Fetch existing agents
curl -s "https://api.goyappr.com/agents" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '[.data[] | {id, name, voice, language, is_active}]'

# Fetch existing dispositions
curl -s "https://api.goyappr.com/dispositions" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '[.data[] | {id, label, is_protected}]'

# Fetch billing status and phone numbers
curl -s "https://api.goyappr.com/billing" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
curl -s "https://api.goyappr.com/phone-numbers" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '[.data[] | {id, number, status, inbound_agent_id, outbound_agent_id}]'
```

Summarize what you found and present it to the user before asking any questions. Example:

> "I've checked your account. You have 2 agents (Maya — Hebrew, Michal — Hebrew), 3 phone numbers (one unassigned), and a $45.20 balance. Your dispositions are: Interested, Not Interested, Callback Requested, Appointment Set, No Answer, Failed, Voicemail, Wrong Number, Do Not Call.
>
> Now — tell me about the voice agent system you want to build."

If this is a fresh account (no agents, no tools), say nothing about it — just go straight to the questions.

### Step 0.2 — Discovery Questions

Ask these in a natural conversation, not as a form. Group related questions. Adapt based on what you already know from the account data.

**Business & call type:**
1. What is the primary goal of this agent? (appointment booking / lead qualification / outbound sales / inbound support / survey / other)
2. Will calls come in, go out, or both? (This decides how the **numbers** are bound in Phase 5 — `inbound_agent_id` to answer, `outbound_agent_id` or `agent_id` on `POST /calls` to place — not how the agent is created. One agent can do both.)
3. Language: Hebrew, English, or both?
4. Do you need multiple agents for different use cases — e.g., a sales agent and a support agent with different instructions, voices, or tools?

**Persona & voice:**
5. Agent name, role, and company context (one sentence: "Maya, sales rep at Acme Ltd")
6. Gender and tone: professional / warm / energetic / authoritative / calm?
7. Any required phrases or forbidden phrases?

**Tools & systems:**
8. What should the agent do during a call? (book appointment / log lead / check availability / transfer to human / update CRM / send WhatsApp)
9. What scheduling system, if any? (Google Calendar / Calendly / Cal.com / Monday / custom API / none)
10. What other systems need updating after calls? (HubSpot / Monday / Pipedrive / Google Sheets / none)
11. Post-call messaging? (WhatsApp via Green API / email / none)
12. Do you have a Supabase project? (if yes: URL, anon key, service key — needed for call queue and edge function templates)

**Lead intake:**
13. Where do leads come from? (Facebook Lead Ads / website form / CRM export / automation platform / manual)
14. Expected daily call volume? (1–50 / 50–500 / 500+)
15. Should the agent remember returning callers across multiple calls? (lead memory)

**Post-call routing — for each non-protected disposition found in 0.1:**
16. What should happen on each disposition? Ask per-disposition:
    - Appointment Set: send confirmation message to the caller?
    - Not Interested: mark as do-not-call?
    - Callback Requested: auto-schedule a follow-up call?
    - Interested (but no booking): notify sales team? How?
17. No Answer: retry? How many attempts? What intervals?

### Step 0.3 — Discovery Config Object

After gathering answers, output a discovery config you'll use throughout the remaining phases. This is your working document — update it as you learn more.

```
DISCOVERY CONFIG
================
Agents needed: [list each agent with its purpose, language, tone]
Starting point: template inbound / qualify / reminder, or own instructions (one per agent)
Call direction: inbound / outbound / both (bound on the number, not the agent)
Languages: he / en
Tools needed: [list tool names and their integrations]
Scheduling system: [name or none]
Lead source: [source name]
Daily volume: [range]
Lead memory: yes / no
Supabase available: yes (url: ...) / no
Post-call routing:
  - Appointment Set → [action]
  - Not Interested → [action]
  - Callback Requested → [action]
  - No Answer → retry [N] times, [interval] apart
Dispositions to create: [any gaps between current dispositions and what's needed]
```

---

## PHASE 1: Agent Creation

For each agent identified in discovery, run this phase. If multiple agents are needed, complete one at a time.

> **Creating an agent** is always the same call: `POST /agents` with `name` plus
> `workflow.global_instructions`, or `name` plus a `template` (`inbound`, `qualify`,
> `reminder`) to start from the dashboard's starter text. A body asking for the old prompt
> or flow kind is refused with `410`. Create the draft that way, then build what the two
> sections below describe inside its workflow document.

**One agent, two shapes of conversation.** Every agent is a workflow agent, and the
two sections below are how you fill its document in, not two kinds of thing to choose
between:
- **Phase 1A** — one block of instructions and a single conversation step. Start here;
  it is what `workflow.global_instructions` is for.
- **Phase 1B** — a graph of steps, when the call has distinct stages the agent must
  move through in order. Its design material is in
  [`flow-composition-guide.md`](flow-composition-guide.md); build it as the workflow
  document's conversation graph, and add its tools through the Unified Tools journey
  above rather than through an attachment.

---

## PHASE 1A: The single-block conversation

For each agent identified in discovery, run this phase. If multiple agents are needed, complete one at a time. What follows is content-authoring guidance — the words that go in `workflow.global_instructions` and, for a graph, in a conversation node's `instructions` — the same craft either way.

### Step 1.1 — Check for Existing Agents

Already done in Phase 0. If the user wants to update an existing agent instead of creating a new one:

1. Fetch its settings with `GET /agents/:id`, its instructions, steps and follow-ups with
   `GET /agents/:id/workflow`, and what it can use with `GET /agents/:id/tools-and-integrations`
   (see `yappr-api.md`)
2. Present the current config in plain language: instructions, voice, tools, follow-ups (a
   converted agent's old `webhook_url` is now an After follow-up)
3. Ask what they want to change
4. Settings (voice, greeting, VAD, call guards): `PATCH /agents/:id` with only the changed
   fields. Instructions, steps, tools and follow-ups: edit the workflow document, save it with
   `PUT /agents/:id/workflow`, then validate and publish (Step 1B.4) — `system_prompt`,
   `flow_config` and `webhook_*` on a PATCH are refused
5. Verify via GET after the change

### Step 1.2 — Write the Instructions (`workflow.global_instructions`)

**Before writing the instructions, read `HUMANIZE_PLAYBOOK.md`.** Then apply these rules:

- Write stages as goals, not scripts
- Include an explicit threading instruction
- Forbid fake acknowledgment
- Forbid robotic transition phrases ("Great!", "Moving on", "Certainly", "Of course")
- Emotional acknowledgment instruction: reference what was specifically said
- One question at a time, then stop
- End every turn on a question or hook, not a flat statement — except the closing line before hanging up, which stays a warm statement
- No markdown, no bullet points — voice only
- Use XML section tags for complex agents (see below)

**Recommended structure for complex agents (outbound sales, multi-step flows):**

```
<identity>
Who the agent is, what company they represent, tone and speech style.
</identity>

<context>
Background the agent needs. Pre-loaded variables go here.
{{CurrentDateTime}}
{{LeadName}}
{{AvailableSlots}}
</context>

<goals>
1. Goal one
2. Goal two
3. Goal three
</goals>

<critical_rules>
- One question at a time. Never queue the next question before getting an answer.
- Before moving forward, address what was actually said — not the expected answer.
- Never say "Great!", "Moving on", "Certainly", or "Of course".
- If the caller goes off-topic, answer fully, then bridge back: "Anyway, going back to..."
</critical_rules>

<tools>
Instructions for when and how to call each tool.
</tools>

<conversation_flow>
Stages as goals.
</conversation_flow>

<objection_handling>
How to respond to common objections.
</objection_handling>
```

**For simple agents** (inbound support, FAQ, short-lived): a few focused paragraphs are fine. No XML required.

**Hebrew agents:** after drafting the prompt, run the Hebrew Pronunciation Protocol (Step 1.3).

### Step 1.3 — Hebrew Pronunciation Protocol

Required for all Hebrew agents (`language: "he"`). Do this silently — no user confirmation needed.

**Step 1:** Scan the drafted prompt for pronunciation risks:
- Agent name (if Hebrew — e.g., נועה, חיים, מיכל)
- Company or business name
- Product or service names
- Place names (cities, streets, neighborhoods)
- Any word with ח, כ/ך, or unusual vowel patterns

**Step 2:** Transliterate each risk word using these rules:

| Sound | Rule | Example |
|-------|------|---------|
| Gutturals ח, כ/ך | → `kh` (guttural, like Scottish "loch") | חיים → KHAI-eem |
| `a` | → `ah` | שבת → sha-BAHT |
| `i` | → `ee` | ישראל → yis-ra-EHL |
| `e` | → `eh` | ארץ → EH-rehtz |
| `o` | → `oh` | שלום → sha-LOHM |
| `u` | → `oo` | לחיים → le-KHAI-eem |
| Stress | ALL CAPS on stressed syllable | פגישה → pgi-SHA |
| Ayin ע / Aleph א | Omit or use natural English vowel | עמי → ah-MEE |

**Step 3:** Append this block at the end of the instructions:

```
## Pronunciation Guide — Phonetic Spellings (Read These Exactly)
When saying any of the following words or names, use ONLY the phonetic spelling shown.
Never use the Hebrew script or standard English spelling — always use the phonetic version:

- [Word] → "[phonetic]"

Remember: ALL CAPS = stressed syllable. "kh" = guttural (like "loch"), not "k" or "h".
```

Skip common English words and everyday Hebrew words (שולחן, פגישה, חשבון). Skip numbers — the server handles those.

### Step 1.4 — Variable Injection Strategy

Use `{{VariableName}}` syntax directly in `workflow.global_instructions`. Variables are substituted before the call begins.

**Built-in variables (always available — no setup needed):**

| Variable | Value |
|----------|-------|
| `{{CallerPhone}}` | Caller's phone number (E.164) |
| `{{CurrentDate}}` | Today's date in the call's time zone, `YYYY-MM-DD` (e.g., `2026-03-21`) |
| `{{CurrentTime}}` | Current time in the call's time zone, `HH:MM` |
| `{{CurrentDateTime}}` | Current date and time in the call's time zone, ISO with its UTC offset (e.g., `2026-03-21T14:05:00+02:00`) |
| `{{CurrentDateTime.Asia/Jerusalem}}` | The same clock in an explicit zone (dot notation); no offset (e.g., `2026-03-21T14:05:00`) |
| `{{CallDirection}}` | `"inbound"`, `"outbound"`, or `"web_call"` |
| `{{Timezone}}` | The call's time zone (IANA name) |

**One clock per call.** The call's time zone is the `Timezone` variable when the call sets one (`POST /calls`, in `variables`), otherwise the workspace time zone from Settings (`UTC` if it was never set). The agent's own instructions state the same zone and its offset today ("Current date and time: 2026-03-21 14:05, Saturday, Asia/Jerusalem (UTC+02:00)"), and `CurrentDate`, `CurrentTime`, `CurrentDateTime` and `Timezone` read it too, so a prompt never has two clocks. Writing a different zone or a fixed offset in the prompt ("Israel is UTC+3") does not change it and goes stale at the next clock change; set the workspace time zone instead. A workspace whose zone was never chosen is `UTC` or the zone its browser had at signup, so check it in Settings before relying on an agent's spoken time. Once the agent has spoken, the call's `metadata` records the zone it ran in: `timezone`, `timezone_source` (`call_variable`, `workspace` or `fallback`), and `timezone_unconfirmed: true` when that zone is `UTC` taken from the workspace. A `timezone` key you attach yourself is kept.

**Custom variables:** any `{{VariableName}}` you add to the prompt. Must be supplied in the `variables` dict when creating the call (`POST /calls`). See Appendix D for the pre-fetch pattern.

**When to use variables vs. tools:**

| | Variables | Tools |
|---|-----------|-------|
| Timing | Injected once, before call starts | Called during the call |
| Use for | Context the agent needs to know from the start | Actions to take based on conversation |
| Examples | Lead name, available slots, date | Book appointment, log lead, end call |

### Step 1.5 — Voice Selection

**Never ask the user to choose a voice.** Pick one based on use case and persona, then mention it briefly ("I'll give it a warm, friendly voice"). Only change if the user pushes back.

See Appendix A for the full voice selection guide.

Default: `Michal` when use case is unclear.

### Step 1.6 — VAD Presets

Use the right preset for the call type. See Appendix B for values.

- Consultative (medical, legal, slow-paced) → Consultative preset
- Sales / energetic → Sales preset
- Outbound (often noisy environments) → Outbound preset
- High-volume / fast → High-volume preset

### Step 1.7 — Call Guard Presets

Set limits to prevent runaway calls. See Appendix C for values.

- Outbound sales → Outbound sales preset
- Inbound support → Inbound support preset
- Lead qualification → Lead qualification preset

### Step 1.8 — API Calls to Make

**Create the draft** — use the file-based payload approach (required for Hebrew/special characters). `name` plus `workflow.global_instructions` is all a create needs — `language`, `description`, `authoring_locale`, `greeting_message` (needs `agents:update` too) and `model` are optional, anything else is `400` (or `name` plus `template` — `inbound`, `qualify` or `reminder` — for the dashboard's starter text, never both); a legacy field (`system_prompt`, `type`, `flow_config`) answers `410 AGENT_LEGACY_CREATION_GONE`:

```bash
IDEMPOTENCY_KEY=$(python3 -c 'import uuid; print(uuid.uuid4())')
python3 -c "
import json
payload = {
    'name': 'Agent Name',
    'language': 'he',
    'workflow': {'global_instructions': '...'}
}
with open('/tmp/agent-payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False)
"
curl -s -X POST "https://api.goyappr.com/agents" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/agent-payload.json | jq .
```

The key goes in the `Idempotency-Key` **header** only — an `idempotency_key` in the body
is `400` ("Remove idempotency_key"), like any field the create does not take. Use double
quotes around every header that carries a `$VARIABLE`: in single quotes the shell sends
the literal text `$YAPPR_API_KEY` and the request is refused as an invalid key. If the
response is lost, send the same file with the same `$IDEMPOTENCY_KEY` — you get `200` and
the same agent, never a second one.

Save the returned `id`. This starts Strict Mode off, with an empty Before/After and no
publication — see **PHASE 1: Agent Creation** above.

**Set voice, language extras, VAD and call guards** with `PATCH /agents/:id` — they are
ordinary settings, not part of the workflow document:

```bash
curl -s -X PATCH "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"voice": "Michal", "agent_speaks_first": true, "greeting_message": "..."}'
  # VAD / call guards: include only if deviating from defaults (Steps 1.6/1.7)
```

**There is no end_call tool to attach.** Intrinsic End is not a tool and never was
one to add — every workflow agent can end the call as a plain outcome of its
conversation graph or a Before-call `"#decline"`, with nothing to create, find or
attach. If you are looking at an agent that still has a legacy tool attachment named
`end_call`, that agent predates this and the attachment is inert — do not recreate the
pattern.

### Step 1.9 — Disposition Gap Check

Compare dispositions needed (from discovery config) against dispositions that already exist (from Phase 0). Create any that are missing:

```bash
curl -s -X POST "https://api.goyappr.com/dispositions" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "Appointment Set", "color": "#22c55e"}'
```

**Default dispositions already seeded per company** (do not recreate):
Interested, Not Interested, Callback Requested, Appointment Set, Issue Resolved, Voicemail, Wrong Number, Do Not Call, No Answer, Failed

Seeded labels carry `is_protected: true` and refuse delete (older workspaces have six, newer all ten, so read the flag from `GET /dispositions` rather than this list). They can be renamed, but the platform finds No Answer, Failed, Voicemail and the others it sets by name, so leave their labels alone.

No Answer and Failed are set by the platform, Voicemail also when the call had no real back-and-forth; the AI classifier picks the rest. If the post-call analysis fails, the call gets `Unclassified`.

---

## PHASE 1B: The graph conversation

**Only if the call has distinct stages.** If one block of instructions covers the
conversation, you are done in Phase 1A — continue to Phase 2.

A staged agent replaces one large block of instructions with a graph of steps inside the
workflow document's `conversation` object — the same document Phase 1's intro points
at, saved with `PUT /agents/:id/workflow` and read back with `GET /agents/:id/workflow`.
Routing between conversation nodes happens automatically: on every user-turn boundary the
model evaluates what the user just said against the current node's outgoing edges and
either advances or stays — advisory under Strict Mode off, enforced once you turn it on.
Deterministic nodes route on their tool's result (and, with Strict Mode on, on what it
answered), never on the model. This pattern
matches what Retell.ai and nlpearl.ai ship.

The exact document shape — `conversation.entry_node_id`, `nodes[]`, `edges[]`,
`global_edges[]`, and the four node types (`conversation`, `action`, `sequence`, `end`) —
is **The conversation graph** in `yappr-api.md`, under *Canonical workflow authoring*.
[`flow-composition-guide.md`](flow-composition-guide.md) still carries the transition-
design, globals and humanization patterns below at a conceptual level; its JSON examples
predate this document and use the retired `flow_config` field names — follow the shapes
in `yappr-api.md`, not the JSON there.

### Step 1B.1 — Design the global instructions

`workflow.global_instructions` is the graph's persona, brand rules and hard constraints,
layered with each conversation node's own `instructions` at runtime. Apply HUMANIZE_PLAYBOOK
rules — same as Step 1.2 above.

### Step 1B.2 — Sketch the graph

Identify the steps. For each one decide:
- **`conversation` node** (the model talks): `instructions` for what the bot is trying to
  accomplish, plus `available_binding_ids` for any tool the model may call by its own
  choice while there. Routing out is a `conversation`-kind edge per labeled transition —
  the model picks one based on what the user just said (or stays, or ends, when Strict
  Mode is off).
- **`action` node** (deterministic): one tool, by `binding_id` — this covers what used to
  be a separate tool-call node and a separate transfer node; a transfer is simply the
  binding behind an `action` node being a transfer tool. A transfer tool's `destination`
  is a phone number or, for calls that arrived over a SIP trunk (a username-and-password
  SIP endpoint), a SIP address (`sip:user@host`) that hands the caller back to the
  customer's own phone system (their system must accept SIP REFER and have the new call
  answered within about nine seconds; if the transfer fails the call ends and the agent
  cannot take the caller back; test it first; see **A transfer to a SIP address** in
  `yappr-api.md` → Tools). On a call that arrived over an extension endpoint
  (`auth_mode: "register"`) a SIP address works differently: no REFER, Yappr places a new
  call through the extension to the extension before the `@`, and stays on the call; with
  the phone system's transfer code set once on the endpoint (`register.pbx_feature_code`,
  register journey step 8 below) Yappr presses the code and the extension instead and leaves
  the call, with nothing to set on the tool. Route its outcome with `result` edges (`outcome: "succeeded" |
  "failed"`), never with a labeled transition. When the next step depends on what the tool
  *answered* (availability says book / offer another time / transfer), turn Strict Mode on
  and put a `when` on one `succeeded` edge per answer, plus one `succeeded` edge without a
  `when` for every other answer: the platform picks the edge from the answer, not the model.
  Shape and refusals: **Routing on what a tool answered** in `yappr-api.md`; the dashboard
  shows these edges but cannot author them, so write them through the API.
- **`sequence` node**: `sequence_id` pointing at a private, tool-only `ToolSequence` in
  `document.sequences[]` — use it for "check, then branch on what came back" in one node
  rather than three conversation nodes; see **A sequence that checks before it acts**
  above for the branching grammar.
- **`end` node**: terminal, and the only terminal kind besides a transfer's own `action`.
- **Post-call extraction and automation**: there is no `webhook` or `structured_output`
  node. For per-call extraction use the agent-level `extraction_parameters` field; for
  post-call automation add an After trigger to the workflow document — see PHASE 4,
  "Post the call to your system".

### Step 1B.2a — Greeting before the graph

The greeting is `agent_speaks_first` / `greeting_message` on `PATCH /agents/:id`, same as
Phase 1A — the graph does not override them per-node. Design the entry node's
`instructions` to pick up cleanly after whatever the greeting says, rather than assuming
the caller heard node-specific framing in it.

### Step 1B.2b — Globals (escape hatches reachable from any node)

For escape hatches that should be reachable from any conversation node (transfer-to-human,
end-on-DNC, wrong-number, "user reveals they're actually X" misclassification recovery),
add a `global_edges[]` entry — `target` plus a prose `condition` — instead of wiring an
explicit edge from every source node. See [`flow-composition-guide.md`](flow-composition-guide.md)'s
section on globals for the design patterns; the field names there are pre-migration, but
the "reachable from anywhere, offered as an extra candidate every turn" behavior is the
same idea.

### Step 1B.3 — Connect a calendar or mailbox (if scheduling or email is involved)

For deployments with workspace connected accounts enabled, use the **Connected accounts** journey in [`yappr-api.md`](yappr-api.md). Discover configured apps with `GET /tool-apps/connection-options`, create an explicitly labeled account with `POST /tool-connections`, and give the expiring Yappr handoff to an authorized human. An API key cannot provide OAuth consent. Poll the exact returned auth-attempt ID with bounded backoff; `completed` authorization is distinct from `connection.state: ready`. Keep provider IDs, OAuth state and handoff capabilities out of tools, prompts, call history and logs. Replacement is explicit and applies to future bindings; disconnect blocks new actions without pretending to revoke every provider grant.

**Connecting an app is two steps.** `POST /tool-connections` answers **201** with
`connection`, `attempt` (a `tool-connection-auth-attempt`) and a `handoff_url` — the 201
means the account exists and a human still has to authorize it, never that the
connection is ready. Open `handoff_url` in the same tab; it is a page in the dashboard,
so take its path and fragment and keep your own origin if the two ever differ. Poll
`GET /tool-connection-auth-attempts/{id}` with the exact `attempt.id`; it settles into
`completed`, `failed`, `expired`, `cancelled` or `reconciliation_required` — `completed`
is not the same as the connection being ready, which is `connection.state: ready`. The
dashboard's own handoff page offers **Cancel request** so a person can call off an
authorization they started, right where the connect flow left them, and the same action
is now public: `POST /tool-connections/attempts/{id}/cancel` — the exact `attempt.id`
`POST /tool-connections` or `reconnect` returned, never the connection id. It frees the
slot the attempt held against the ten-open-per-key ceiling immediately, rather than
waiting the ten minutes an ignored attempt takes to expire on its own; already
cancelled, completed, failed or expired attempts answer `200` unchanged, so calling it
again is always safe. It only calls off the authorization — the connection record stays,
and a provider grant that already completed still needs `DELETE /tool-connections/{id}`
plus revoking Yappr in the provider's own account settings.
`POST /tool-connections/{id}/reconnect {"mode":"replace"}` issues a fresh link when you
need to replace the account instead; without `"mode": "replace"` it is
`400 CONNECTION_REPLACEMENT_REQUIRED`. A reconnect replaces a sign-in nobody has opened yet;
one a person is in the middle of answers `409 CONNECTION_ATTEMPT_OPEN` naming it
(`attempt.id`) — let it finish, or cancel it and reconnect. Every connection shows the
sign-in still open on it as `open_attempt` (or `null`), and `app_name` is the app's display
name ("Google Calendar") beside the `toolkit` slug.

**Replacing the key of an app that is connected with a key** (`GET /tool-apps/connection-options`
shows `connect.kind: "credentials"` for it: Mapbox, Pipedrive and the like). The key is never
yours to handle. Send `POST /tool-connections/{id}/reconnect {"mode":"replace"}` (just `mode` and
`locale`: `credentials` there is `400 CONNECTION_INVALID`) and give the `handoff_url` to a signed-in
member: the page asks them for the new key and says how many agents use the account. Never ask the
customer to paste a key into chat, a prompt or a request body, and never put one in a URL; an API key
cannot send one either (`POST /tool-connections` with `credentials` is `409 CONNECTION_CREDENTIALS_NEED_PERSON`).
The connection stays the same record (`id`, `label` and bindings kept; `binding_revision` and
`authorization_epoch` each go up by one). **Say plainly that it takes effect at once and cannot be
undone from Yappr:** every agent that uses the connection uses the new key from that moment, and a
wrong key leaves it broken until a person enters a working one (the old key, if it still works).
Tools built on the old key stop working until they are rebuilt on the new one. Yappr starts rebuilding them the
moment the key is replaced (hand-made tools included) and an agent that uses several of them switches
in one step: how long it takes grows with the number of tools and agents involved. A rebuild that
fails is tried again by a check that runs every five minutes, waiting longer after each failure. Tell
the customer that calls to an agent using the account can fail in that short window, and that a call
already in progress keeps failing its app tools until it ends. The old provider account is not
deleted: they revoke the old key in the app. For the few apps Yappr can test on the spot (Mapbox
today) a key the app refuses is turned down on the page and nothing changes; for the others the page
can only say the key is saved but not tested, and a wrong one shows on the first call. Afterwards read
`GET /tool-connections/{id}` (`binding_revision` moved) and run `POST /tool-connections/{id}/check`
to see that the app answers; `not_checked` is not the same as working.

**Connecting an app opens one authorization at a time.** Starting another one calls off
the one that was left open; if the one in the way was opened in a different browser or
by another member, the handoff page says so and offers to call those off and carry on. A
link that cannot be used says which it is — expired, called off, already finished,
already opened, or one this workspace cannot open.

**Cleaning up abandoned connections.** `GET /tool-connections?state=disconnected&toolkit=<slug>`
lists them (`?state=` takes one state at a time; a filtered page can be short and still
carry `next_cursor`). `POST /tool-connections/{id}/remove` takes an already-disconnected
record off the list — `?state=removed` still reads it back — and each row's `created_by.id`
tells your own key's records from a person's. Anything not disconnected is
`409 CONNECTION_STILL_CONNECTED`, naming the `DELETE` to send first — including a
connection whose sign-in was cancelled or ran out before it ever connected (`connecting`,
`connected: false`, `open_attempt: null`), whose `DELETE` revokes nothing.
`POST /tool-connections/cleanup` disconnects and removes every such never-connected record
at once, but always for the whole workspace — to clear only your own, `DELETE` and `remove`
each. See **Connected accounts** in `yappr-api.md`.

**The native OAuth integrations are retired.** `GET /integrations` and `DELETE /integrations/{id}` answer `410` with `code: ENDPOINT_RETIRED` — they listed and revoked credentials that no longer exist. There is nothing to fall back to when a connection fails — retry the connection, never reach for the old path. Saving a document with a native Google step is refused. An agent that still had one keeps it only until the end of its 30-day notice period (30 days from the day the owner is messaged), and after that keeps answering calls without it. When an agent is converted onto the workflow engine the native step is **dropped** (the route carries on to where it led): no calendar check, event or email is made until the owner connects Google Calendar or Gmail as a connected app (Tools → Connected accounts, `POST /tool-connections`) and the action is added back to the workflow, or the app is given to the agent as a whole. Connect the calendar or mailbox as a connected account, then give it to the agent with `POST /agents/{id}/integrations` (below); a `sequence` step or an `action` node bound to the connection is only for work that must run at a fixed point.

### Give an agent tools & integrations

Everything an agent can use on calls is one thing, **Tools & integrations** — say it that way to
the user (never "the Integrations tab" or "the Tools tab"): connected apps (one line each,
"Google Calendar · Clinic": the app, then the account), **Webhook** (a saved HTTP tool),
**Call transfer** (phone calls only) and **End call** (built in, always on). Each is on every
step of the conversation, or only on the steps of the workflow that use it.

1. **Read first:** `GET /agents/{id}/tools-and-integrations` — one list grouped by integration,
   with each action's input sources and, for step-only entries, the steps in `used_in`. Answer
   "what can this agent use?" from it, one line per entry.
2. **An app** (calendar, mailbox, CRM): the steps below.
3. **A webhook or call transfer on every step:** `POST /agents/{id}/integrations
   {"tool_id": "<saved tool id>", "expected_version": <draft_version>}` (find the tool with
   `GET /tools`; a call transfer needs the agent to take phone calls). **On some steps only:**
   bind it on those steps in the workflow document instead (Step 1B.4).
4. **Where each input comes from** (which calendar, the caller's number, the time the caller
   wants): Fixed (`literal`), From the call (`request`, or an earlier step; not `stored`, which nothing writes), AI (`model`) or Choose from a
   list (`model` with `options`) — see *Action inputs* in [`yappr-api.md`](yappr-api.md).
   Configuration (calendar, time zone, duration) is Fixed; what the caller says is AI.
5. Publish when the write answers `live: false` (`POST /agents/{id}/workflow/publish`).

#### Give an agent an app

The user says "give this agent my Google Calendar" (or Gmail, HubSpot, any connected app):

1. `GET /tool-connections?toolkit=googlecalendar&state=ready` — pick the account. One ready
   account: use it. Several: ask which (by `label`). None: connect one first (Step 1B.3 above).
2. Optional: `GET /tool-connections/{id}/actions` to show what the agent will be able to do
   (`default: true` rows) and offer "more actions".
3. `POST /agents/{id}/integrations {"connection_id": "...", "expected_version": <draft.version>}`
   — add `"actions": [...]` only to narrow or widen the defaults (an availability-only agent:
   `GOOGLECALENDAR_FIND_FREE_SLOTS`, `GOOGLECALENDAR_EVENTS_LIST`).
4. Read `live`. `true`: done, the next call can use it. `false`: `not_live_reason` says why —
   usually publish with `POST /agents/{id}/workflow/publish`. `503` with `Retry-After`: the
   app's actions were still being prepared; send the same request again.
5. Tell the agent in its instructions when to use the app ("check free time before offering a
   slot; never book without the caller's yes") and, for Sheets/monday.com/Slack, which
   sheet/board/channel. The functions themselves are added for you.

Change the actions later with `PATCH /agents/{id}/integrations/{integration_id}`, remove with
`DELETE`. An agent with separate per-action tools for the account shows them in
`separate_action_tools`; `replace_action_tools: true` on the POST swaps them when `switchable`.
Previous-engine agents answer `422 AGENT_ENGINE_UNSUPPORTED`.

For a scheduling agent, read the calendar in a before-call step instead of during the call; see *Offering calendar times without a tool call* above.

### Step 1B.4 — Build the graph

Read the draft with `GET /agents/:id/workflow`, add your nodes/edges to `document.conversation` and your tool bindings to `document.bindings[]`, then save with `PUT /agents/:id/workflow` carrying the `expected_version` you just read. `POST /agents/:id/workflow/validate`, sent the `draft.version` the save answered with, checks that **saved** draft — it cannot check a document you have not saved, so save first — and neither saves nor publishes; `POST /agents/:id/workflow/publish` makes it live. See *Canonical workflow authoring* in `yappr-api.md` for the exact request/response shapes and every `issues[]` code.

### Step 1B.5 — Tools come from the same registry as Phase 2

There is no separate attachment step and no tool-attachment join for a graph node. A node's
`binding_id` (on an `action` node) or `available_binding_ids` (on a `conversation` node)
references an entry in the workflow document's own `bindings[]`, each pointing at a
`tool_revision_id` from the **Unified Tools journey** above. Create the tool via `POST /tools`
(Phase 2.1), then add a binding for it in the document you save in Step 1B.4.

**Continue to Phase 3 (Call Dispatch)** — that phase is unaffected by which conversation
shape the agent uses.

---

## PHASE 2: Tooling

The Unified Tools journey above is how a tool reaches an agent: an explicit versioned
binding, published with the workflow. This phase is about what to build and how to build
it well — the tool's own design, its payload and its endpoint — not about attaching it.

Tools are webhook endpoints the agent can call during a conversation. This phase has two layers:

- **Layer 1 — Blueprint**: what tools to build and why (platform-agnostic)
- **Layer 2 — Implementation**: actual code, using Supabase edge functions if available

### Layer 1 — Tool Philosophy

Apply these rules before deciding what tools to build:

**Rule 1: Bundle secondaries.** Booking an appointment + sending a WhatsApp confirmation + updating the CRM = one edge function, one Yappr tool. The agent sees ONE tool (`bookAppointment`). Secondary actions happen inside the function invisibly. This reduces tool calls, which reduces latency and complexity.

**Rule 2: Pre-fetch + CRUD safeguard.** Pre-fetch calendar availability at dispatch time → inject as `{{AvailableSlots}}` variable. This reduces how often `checkAvailability` is called during the call. But `checkAvailability` MUST still exist as a tool — pre-fetched slots can be stale, and the caller may ask about a time not in the list. The variable is the fast path. The tool is the fallback.

**Rule 3: Full CRUD when the domain is relevant.** If the use case involves appointments → build `checkAvailability`, `bookAppointment`, and (if inbound/support) `cancelAppointment` and `rescheduleAppointment`. Don't create tools that won't be used, but don't skip the safeguards.

**Rule 4: Ending is intrinsic, not a tool.** There is nothing to attach — every workflow agent can end the call as a plain outcome of the conversation. Write explicit trigger conditions in the instructions (farewell said, goal achieved, caller asked to hang up) so the model ends promptly instead of stalling.

### Layer 2 — Tool Decision Tree

| Use case | Tools to create |
|----------|----------------|
| Appointment booking | `checkAvailability` (always), `bookAppointment` (always), `cancelAppointment` (if inbound), `rescheduleAppointment` (if inbound) |
| Lead qualification only | `logLead` — bundle: save lead + apply tags + update CRM |
| Human escalation | `transferToHuman` |
| Outbound sales + CRM | `logOutcome` — bundle: save disposition + update CRM + trigger notification |
| Post-call WhatsApp | Bundle into `bookAppointment` or `logOutcome` — not a standalone tool |

**When Supabase is available:** write each tool as a Deno edge function. The Yappr tool's `workflow.configuration.url` points to the edge function. The edge function handles all secondary actions and responds back to Yappr.

**Use the shared integration clients** from `templates/integrations/` — don't write raw `fetch` calls. Copy the relevant `.ts` file into your edge function's `_shared/` directory or import it relatively:

```typescript
// supabase/functions/book-appointment/index.ts
import { GoogleCalendarClient } from "../_shared/integrations/google-calendar.ts";
import { GreenApiClient } from "../_shared/integrations/greenapi-whatsapp.ts";
import { HubSpotClient } from "../_shared/integrations/hubspot.ts";

const calendar = new GoogleCalendarClient(Deno.env.get("GOOGLE_ACCESS_TOKEN")!);
const whatsapp = new GreenApiClient(Deno.env.get("GREEN_API_INSTANCE")!, Deno.env.get("GREEN_API_TOKEN")!);
const crm = new HubSpotClient(Deno.env.get("HUBSPOT_TOKEN")!);
```

The client constructor's optional `fetchFn` parameter means the same code works in tests (injected mock) and production (real `globalThis.fetch`).

**When Supabase is not available:** give the user the webhook URL pattern and the expected payload shape. They wire up their own backend.

### Step 2.1 — Creating Tools via Yappr API

Use the **Unified Tools journey** above for the exact request: `POST /tools` with
`{name, description, workflow: {kind:"http", input_schema, output_schema, configuration,
effect, timeout_ms}}` and an `Idempotency-Key`. Design-wise, still decide the same things
per tool — name, description, and the fields it needs:

```bash
python3 -c "
import json
payload = {
    'name': 'bookAppointment',
    'description': 'Book an appointment. Call only after the caller has confirmed a specific date, time, and their full name.',
    'workflow': {
        'kind': 'http',
        'input_schema': {
            'type': 'object',
            'properties': {
                'callerName': {'type': 'string', 'description': 'Full name of the caller as stated'},
                'preferredDate': {'type': 'string', 'description': 'Requested appointment date in natural language'},
                'preferredTime': {'type': 'string', 'description': 'Requested appointment time in natural language'},
                'serviceType': {'type': 'string', 'description': 'Type of service or appointment requested'}
            },
            'required': ['callerName', 'preferredDate', 'preferredTime'],
            'additionalProperties': False
        },
        'output_schema': {'type': 'object'},
        'configuration': {'url': 'https://YOUR_EDGE_FUNCTION_URL', 'method': 'POST', 'headers': {}},
        'effect': 'write',
        'timeout_ms': 30000
    }
}
with open('/tmp/tool-payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False)
"
IDEMPOTENCY_KEY=$(python3 -c 'import uuid; print(uuid.uuid4())')
curl -s -X POST "https://api.goyappr.com/tools" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/tool-payload.json | jq .
```

As with agents, the key is the header, never a body field (the body takes `name`,
`description` and `workflow` only).

**Tool naming rules:**
- Name MUST be camelCase English: `bookAppointment`, `logLead`, `checkAvailability`
- No snake_case, no spaces, no Hebrew in the name
- Descriptions can be in Hebrew
- Webhook targets must be final public HTTP(S) URLs; localhost, cloud-metadata hosts, non-global literal or DNS-resolved addresses, mixed public/private DNS answers, and redirects are rejected, so configure the final destination directly
- Custom `Authorization` / `Content-Type` headers are supported, but routing and framing headers (`Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Expect`, `Keep-Alive`, `Proxy-*`, `TE`, `Trailer`, `Upgrade`) are rejected

**Reach the agent, not by attaching — by binding.** Add `{id, tool_revision_id}` to the
workflow document's `bindings[]` (Step 1B.4/1B.5 above), then reference that binding's
`id` from a conversation node's `available_binding_ids` or an `action` node's
`binding_id`. There is no `POST /tools/attach` call and no `execution_order` in the
unified model — order comes from where the binding sits in the graph, not a number.

### Step 2.2 — Writing Tool Instructions

The platform auto-registers a bound tool's name, description and input schema with the model — for every `available_binding_ids` entry on a conversation node and every `action` node's `binding_id`. Bindings resolve at session start, so a tool/binding edit applies on the next call, not the one in flight. Do NOT repeat the schema in the prompt, and never instruct the model to wrap fields in `args` or send a node id.

What you MUST write in the `<tools>` section of the instructions (`workflow.global_instructions`, or the conversation node that offers the tool):
- **When to call the tool** — specific conditions that must ALL be met
- **When NOT to call the tool** — guard rails
- **How to pass information** — always in natural language, exactly as the caller said it
- **What to say before/after** — e.g., "tell the caller you're checking availability"

**Example `<tools>` section:**
```
<tools>
You have access to the following tools. Only invoke a tool when ALL conditions are met.

## bookAppointment
Invoke only when:
- The caller has confirmed a specific date AND time
- The caller has given their full name
- The caller explicitly said they want to book
Before invoking, say: "One moment, let me check availability."
Pass dates and times in natural language exactly as the caller said them ("Tuesday at three", not "2026-04-08T15:00").

</tools>

<ending>
End the call as soon as:
- The caller says goodbye, bye, talk later, or similar
- The call goal has been achieved and farewell has been said
After your farewell words, end the call — do not wait.
</ending>
```

Ending the call is not a tool (Rule 4 above): write *when* to end it as plain instructions,
as in `<ending>`, and never describe an `endCall` tool the agent does not have.

### Step 2.3 — Test the Tool Webhook

A tool created in Step 2.1 is a workflow tool: its test takes `{phase, channel, inputs,
policy}` and an `Idempotency-Key`, answers `202` with a `test_id` to poll, and is mock by
default — see **Standalone saved-tool tests** in `yappr-api.md`. Only a real test
(`"policy": "allowlist"`, `"allowed_binding_ids": ["test_tool"]`) reaches the endpoint, and
once it settles it shows up in `GET /deliveries?source=test&tool_id=…`.

After creating each tool, test delivery for real:

```bash
IDEMPOTENCY_KEY=$(python3 -c 'import uuid; print(uuid.uuid4())')
curl -s -X POST "https://api.goyappr.com/tools/TOOL_ID/test" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phase": "during", "channel": "phone", "inputs": {"callerName": "Dana Cohen", "preferredDate": "Tuesday", "preferredTime": "three"}, "policy": "allowlist", "allowed_binding_ids": ["test_tool"]}' | jq .
# 202 with test_id — poll until it settles:
curl -s "https://api.goyappr.com/tools/TOOL_ID/tests/TEST_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

- `succeeded` → show the user what was sent and answered: `GET /deliveries/{delivery_id}` → `exchange`
- `failed` → `error_code` says why: `downstream_http_error` (the endpoint answered 4xx/5xx, in `outcome.http_status`), or `output_schema_invalid` / `invalid_json_response` / `response_too_large` (it answered 2xx with something the tool's Outputs cannot use); `blocked` → nothing was sent (e.g. `url_resolves_private`); `unknown` → no answer came back, so check the endpoint before sending it again. Never ask the user to expose configured request headers
- A legacy `type`/`config` tool (made before workflow tools) is tested with no body and answers at once — see `yappr-api.md`

### Step 2.4 — What the Tool Webhook Receives

When the agent invokes the tool during a real call, Yappr sends the tool's declared inputs (what the model filled in) at the top level and the call it is serving under `call` — the **call package** — to `workflow.configuration.url`. `POST` / `PUT` / `PATCH` / `DELETE` use a JSON body; `GET` uses the same fields as query parameters, with objects/arrays (`call` included) serialized as compact JSON strings, and has no body:

```json
{
  "callerName": "Dana Cohen",
  "preferredDate": "Tuesday",
  "preferredTime": "three",
  "call": {
    "version": "1",
    "phase": "during",
    "company_id": "uuid",
    "agent_id": "uuid",
    "agent_name": "string",
    "call_id": "uuid",
    "call_direction": "outbound",
    "caller_number": "+972...",
    "callee_number": "+972...",
    "call_metadata":  { "...": "exactly what you passed to POST /calls body.metadata" },
    "call_variables": { "LeadName": "...", "AppointmentDate": "..." },
    "channel": "phone",
    "started_at": "ISO8601"
  }
}
```

Read `call.phase` first: a member the phase cannot know is absent (a before-call request has no `call_id`). A tool test adds `"test": true` inside `call`, with `call_id` and `agent_id` `null`. `"include_call_context": false` in the tool's contract sends the inputs alone.

Two critical fields for multi-tenant / CRM-integrated setups:

- **`call.call_metadata`** — forwards in real-time whatever you passed as `metadata` when creating the call. This is the right place for CRM IDs (appointment_id, contact_id, calendar_id) that the tool receiver needs to route updates back to the correct record. The agent NEVER sees these (they don't go into the instructions).
- **`call.call_variables`** — the same `{{VariableName}}` values that were injected into the agent's instructions. Useful when the tool receiver wants to echo the lead's name into a Slack alert, an outbound WhatsApp, etc. — without re-fetching the call.

**Tool webhooks are synchronous and real-time.** No `GET /calls/:id` round-trip required — everything the receiver needs arrives in one payload. This is what separates tool webhooks, fired mid-call, from event webhooks fired after it: a legacy `call.analyzed` payload carries the call's content (transcript, summary, disposition label, extracted values) but not its context — no lead, metadata or cost — and needs `GET /calls/:id` for those. A workflow's own After triggers do not have that gap; see [The trigger's payload is not minimal](#the-triggers-payload-is-not-minimal) below.

See [yappr-api.md — Tool Webhook Payload](yappr-api.md) and the `CallPackage` schema in the OpenAPI document for the full field reference.

---

## PHASE 3: Call Dispatch

How calls get initiated. Choose the right pattern based on the user's lead source and volume.

### Layer 1 — Three Dispatch Patterns

**Pattern 1: Direct API**
Best for: low volume, ad-hoc calls, testing, simple automation.
The caller calls `POST /calls` directly from their server, script, or automation.

```bash
curl -s -X POST "https://api.goyappr.com/calls" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "AGENT_ID",
    "to": "+972XXXXXXXXX",
    "from": "+972YYYYYYYYY",
    "metadata": { "lead_id": "...", "source": "facebook" },
    "variables": {
      "LeadName": "ישראל כהן",
      "AvailableSlots": "ב׳ 10:00, ג׳ 14:00"
    }
  }'
```

CRITICAL: `to` and `from` must never be the same number.

The agent is a workflow agent, so this answers `202` with a `request_id`, not a call: send an `Idempotency-Key` and follow the request as in **Calling a workflow agent** above.

**One number, many agents.** The `from` field is a per-call override. Any active number in the company can be paired with any agent — the phone number's `outbound_agent_id` only picks the agent when a call sends no `agent_id` (and seeds the dashboard default); it does not constrain the API. Users do NOT need to buy a separate number for each agent. Reuse a single outbound number across every agent; just change `agent_id` per call.

**Pattern 2: Supabase Call Queue**
Best for: high volume, scheduled/batched outbound, retry logic, deduplication.
A `call_queue` table in Supabase holds pending calls. A cron job or edge function drains the queue, fetching pre-call data and calling the Yappr API per lead.

```typescript
// dispatch-calls.ts (Supabase edge function or Node.js script)
// 1. Fetch pending leads from queue
// 2. For each lead, fetch pre-call data (calendar slots, CRM context)
// 3. Format variables
// 4. POST /calls with variables injected
// 5. Mark lead as dispatched in queue
```

If Supabase is available, scaffold this function. The schema for the queue table:

```sql
create table call_queue (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  agent_id uuid not null,
  phone_number text not null,
  variables jsonb default '{}',
  metadata jsonb default '{}',
  status text default 'pending', -- pending, dispatched, failed
  attempt_count int default 0,
  scheduled_for timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz default now()
);
```

**Pattern 3: Automation Platform (Make / n8n)**
Best for: lead sources that already use Make/n8n (e.g., Facebook Lead Ads → Make → Yappr).
A Make scenario or n8n workflow fires when a new lead arrives, pre-fetches data, and calls the Yappr API.

Walk the user through the Make/n8n HTTP module configuration:
- Method: POST
- URL: `https://api.goyappr.com/calls`
- Headers: `Authorization: Bearer {{YAPPR_API_KEY}}`
- Body: JSON with `agent_id`, `to`, `from`, `metadata`, `variables`

### Step 3.1 — Variable Pre-Fetch

When using Pattern 2 or 3, pre-fetch data BEFORE calling the Yappr API and inject it as variables. See Appendix D for the full pre-fetch pattern.

The most common pre-fetched variables:
- `{{AvailableSlots}}` — formatted string of open calendar slots for the next 2–3 days
- `{{LeadName}}` — lead's name from the CRM or lead source
- `{{CompanyName}}` — company context if serving multiple clients

---

## PHASE 3B: Web calls in the browser (@goyappr/client)

When the user wants voice **on their own website** (not a phone call), use the browser SDK instead of `POST /calls` with `to`/`from`:

1. **Server mints a session** — `POST /calls {type:"web", agent_id}` with the secret API key (optionally `lead_id` and `metadata`). Returns `201 { type: "web", call_id, token, expires_at, cancel_url, agent_id, agent_name, protocol, connection }` — `connection` is `{ host, base_url, web_call_url, call_requests_url, turn_credentials_url, api_key }`; the browser needs `token` and `connection` (see **POST /calls — web call session** in `yappr-api.md`). Nothing is dialled and the secret key stays on the server, but on `protocol: "offer"` the call already exists: `GET /calls/{call_id}` reads `pending_connection` until the browser connects (on `"call_request"` `call_id` is `null` — see below), and an unused session settles `no_answer` (`session_expired`, cost 0) as soon as it is read after the token expires (or at the next five-minute sweep) — so mint on click, not on page load. To take back a session nobody will use, `POST` the mint's `cancel_url` with the token as `x-yappr-web-token` and no body (or `{}`) — on both protocols, and the only way on a `call_request` session; an `offer` session's call then ends as an operator's end (`ended_by: "operator"`, no `failure`, cost 0), exactly as `POST /calls/{id}/end` ends it with the secret key. A token taken back that way is refused `403 WEB_SESSION_CANCELLED` if a browser still presents it (one that simply ran out is `403` "This session token has expired").
2. **Browser connects** — `npm install @goyappr/client`, then `YapprConversation.startSession({ token, connection })`. The developer owns the UI; the SDK handles mic + WebRTC. Controls: `setMicMuted`, `setVolume`, `getInputVolume`/`getOutputVolume`, `endSession`; callbacks `onStatusChange`, `onModeChange`, `onConnect`, `onDisconnect`, `onError`.

Billing, voice, and language come from the agent config — same as any call. Audio-only in preview (no live transcript yet).

A workflow agent whose published workflow runs before-call steps **or has follow-ups (After steps)** serves browser calls through a different exchange: the mint succeeds with `protocol: "call_request"` instead of `"offer"`, and the browser must create a call request, poll it, then start it (see **Web calls on an agent that prepares** in `yappr-api.md`). A browser that tries the one-shot `offer` connection on such an agent is refused with `409 workflow_preparation_required` before the token is spent — nothing is lost; switch to the exchange `protocol` names rather than republishing. Always follow `protocol`; never infer it from the workflow. On a `call_request` session `call_id` is `null` (the request reports it once it starts), and `lead_id` is refused with `422 WEB_LEAD_UNSUPPORTED`; to read such a session from your server, have the page pass you the `request_id` its call request answered and read `GET /call-requests/{id}` (`calls:read`, `channel: "web"`). A browser offer the voice server refuses is `502 VOICE_CONNECTION_REFUSED` (the same offer gets the same answer), one it cannot take right now `503 VOICE_UNAVAILABLE`; either way mint a new session.

## PHASE 4: Post-Call Automation

What happens after a call ends. Configure this based on per-disposition routing answers from Phase 0.

### Layer 1 — Post the call to your system (After triggers)

There is no agent-level `webhook_url` / `webhook_events` to configure — every agent this
skill creates is a workflow agent (Phase 1), and `PATCH /agents/:id` with `webhook_url` is
refused (`400 WORKFLOW_SETTINGS_REQUEST_INVALID`). So "notify my system when X happens" is two
ordinary API calls: create the HTTP tool, then bind it into the workflow document's
`after` array, one trigger per event. An existing agent that had those fields had them
cleared when it was moved to the workflow engine: its endpoint is now one HTTP tool plus one
After trigger per event it subscribed to, and the body it receives changed shape (see
[The trigger's payload is not minimal](#the-triggers-payload-is-not-minimal)).

1. Create the tool once (Step 2.1). There is nothing to restrict: `POST /tools` takes no
   `allowed_phases` (sending one is refused as a field the `http` variant does not take),
   and a tool becomes an after-call step by being bound there. Read it back with
   `GET /tools/{id}`: confirm `after` is in `workflow.current.allowed_phases`, and take the
   **revision id**, `workflow.head_revision_id` (the matching row's `id` on
   `GET /tools/workflow-catalog` is the same value). `POST /tools/{id}/workflow-revisions`
   is only for importing a tool made with the old `type`/`config` body — it is not how a new
   tool gets a phase.
2. In the same `PUT /agents/:id/workflow` document you already have open (Phase 1), add a
   `bindings` entry naming that **revision id** — never the tool id, which is refused as
   `422 WORKFLOW_REFERENCE_INVALID` — and one `after` trigger per event:
   ```json
   {
     "bindings": [
       { "id": "notify-endpoint", "tool_revision_id": "TOOL_REVISION_ID" }
     ],
     "after": [
       { "id": "on-analyzed", "event": "analysis.ready",
         "steps": [{ "id": "post", "label": "Send the call results", "binding_id": "notify-endpoint" }] },
       { "id": "on-no-answer", "event": "call.no_answer",
         "steps": [{ "id": "post", "label": "Send the call results", "binding_id": "notify-endpoint" }] }
     ]
   }
   ```
   Every step needs a `label` alongside `id` and `binding_id` — a step missing it is
   refused by the save, `422 WORKFLOW_DOCUMENT_INVALID` with `issues[0].path`
   `/after/0/steps/0/label` (the trigger's and the step's positions), and nothing is
   written.
3. Publish. A trigger step is validated the same as any other step —
   `POST /agents/:id/workflow/validate` returns the exact JSON pointer to fix.
   A trigger's `event` takes the workflow's own names (`analysis.ready`, not the legacy
   `call.analyzed`): a legacy name is refused at `/document/after/<n>/event`, by validate
   and publish if not by the save.

**Sending what the call collected.** The agent's extraction values are the `analysis`
artifact's `extracted_data`, and they reach a tool through the binding's `inputs` with an
ordinary artifact source — the step needs `"requires": ["analysis"]`:

```json
"inputs": {
  "preferred_day": { "kind": "artifact", "artifact": "analysis", "path": "/extracted_data/preferred_day" },
  "collected":     { "kind": "artifact", "artifact": "analysis", "path": "/extracted_data" }
}
```

Put such a step on `analysis.ready`. On `call.no_answer` or `call.failed` it cannot get
what it needs, because an unanswered or failed call has no analysis: validate and publish
refuse it as `artifact_never_produced`. On `any_end` (which includes both) validate
cannot refuse it, because a finished call is a fine place to wait — it answers with the
`after_any_end_waits` warning instead, and the step is blocked on every unanswered call.
Move it to `analysis.ready`, or leave `requires` empty.

#### A different follow-up for each ending

An ending decides what a follow-up can know, so the way to "do this if nobody answers,
that if it went well" is **one follow-up per ending**, each with its own steps. Build it
as separate `after` triggers in the same `PUT /agents/:id/workflow` document:

```json
"after": [
  { "id": "missed", "event": "call.no_answer",
    "steps": [{ "id": "text-owner", "label": "Text the owner a missed call", "binding_id": "sms-owner" }] },
  { "id": "done", "event": "call.ended",
    "steps": [{ "id": "mail", "label": "Email the summary", "binding_id": "email-summary",
               "requires": ["transcript", "analysis"] }] },
  { "id": "broken", "event": "call.failed",
    "steps": [{ "id": "alert", "label": "Tell ops a call failed", "binding_id": "alert-ops" }] }
]
```

- The three endings never happen on one call, so those follow-ups are alternatives:
  exactly one runs.
- What a step may wait for depends on the event: `call.ended` all five of `transcript`,
  `analysis`, `recording`, `lead`, `billing`; `<result>.ready` the other four; `any_end`,
  `call.no_answer`, `call.failed` and `request.failed` none. `call.no_answer` and
  `request.failed` are refused for any wait, `call.failed` for transcript, analysis and
  recording (`artifact_never_produced`). The full table is in `yappr-api.md`, "What each
  event can have".
- Do not mix `any_end` with a specific ending unless both should run or an "Only if" tells
  them apart; the dashboard says "both run on the same call", the API does not warn.
- A follow-up can carry one optional condition, its `when` ("Only if"), and "otherwise" is a
  second follow-up on the opposite condition. "Interested -> book a call, anyone else ->
  nothing" is one `analysis.ready` follow-up with a `when` on `/disposition/id` (see "To run a
  follow-up for some calls only" above). A *step* of a follow-up still cannot carry a
  condition (`guard_phase`). The disposition is guaranteed on `analysis.ready` only; on the
  ending events it is written a moment after them, and only if the workspace has a
  disposition labelled exactly `No Answer` or `Failed`.
- `transfer.answered` and `transfer.failed` are accepted by the schema but nothing
  publishes them: a follow-up on either never runs. Do not author them.
- Verify through `GET /calls/{id}` (the timeline) and `GET /deliveries`, not by reading
  the document back.

Every parameter is a key on every call, and one the conversation never covered is `null`,
so a `fallback` never fires: declare a single-field input nullable
(`"type": ["string", "null"]`), or send the whole `/extracted_data` into one input declared
`"type": "object"`. Before publishing, `validate` warns `input_constant_placeholder` when a
**required** input is frozen to a stand-in such as `n/a` or `TBD`, and
`stored_context_has_no_writer` when an optional input reads `stored`, which nothing fills
(a required one with no `fallback` is refused outright). Each
parameter may carry a `type` — `text` (the default), `number`, `yes_no` or `date` — and
`POST /agents/{id}/extraction/dry-run` reads a transcript you supply for them without a
call, so a parameter set can be checked in CI. The same values also land on the lead,
read-only, as `lead.extracted` (merged across that person's calls).

**Reading a value from the call by description (`extract`).** When no extraction parameter
exists for what an After step needs — the time slot the caller agreed to, for a calendar
event — put one sentence on the input itself instead of setting up a parameter first:

```json
"inputs": {
  "summary":        { "kind": "literal", "value": "Visit" },
  "start_datetime": { "kind": "extract", "instruction": "the time slot the caller agreed to" },
  "end_datetime":   { "kind": "extract", "instruction": "the time it ends, only if the caller named an end time later than the start" }
}
```

in an After step, with nothing else to declare: the step waits
for the call's analysis on its own (no `requires`), the analysis answers every description
in the one model call that writes the summary, and the step is published only to a voice
engine that reads it (`extract_unavailable` otherwise — fill the input with a fixed value
until then). Members: `instruction` (required, one sentence, up to 500 characters, any
language), `type` (optional — `text`, `number`, `yes_no`, `date`, `datetime`; left out it
follows the tool's input: `format: date-time` is `datetime`, an integer or number is
`number`, a boolean is `yes_no`, any other string `text`), `on_missing` and `fallback`.
A `datetime` is the day plus the clock time **in the workspace's time zone**, sent as an
ISO time with that zone's offset on that date.

**What happens when the call did not say it — nothing is ever sent on a guess.** Missing
means: not said; a time with no AM/PM or morning/afternoon that nothing in the call
settles (“at five”); two candidate slots with none agreed; a day or time the call
contradicts itself on (the analysis is told to answer null for it, for example an end before
the start; no code compares the two); an end that is only the start said again (a question
that asks for an end and gets exactly the moment another question got is read as no end);
an answer the input would refuse. Then:

- `fallback: {"value": …}` — the step runs on that fixed value;
- `on_missing: "skip"` — the step is skipped (the default for a **required** input); a
  skipped step is not a failure: the phase still succeeds, the call shows the step as
  **Skipped** with the reason, and a step that depends on it is skipped too;
- `on_missing: "fail"` — the step fails (its own `on_failure` decides whether the phase stops);
- an **optional** input with neither is left out.

`fallback` and `on_missing` together are `extract_missing_policy`. An analysis that
**failed** blocks the step (`artifact_unavailable`) whatever you chose, so a lost booking
is loud. Check refuses: `extract_unavailable_phase` (a before-call step, a conversation
step or a sequence child), `extract_type_unsupported` (a list, an object, an input with no
declared `type`, or a `type` the input cannot take), `extract_instruction_empty`,
`extract_too_many` (over 64 different descriptions). On `call.no_answer`, `call.failed` or
`request.failed` it is `artifact_never_produced` like any step waiting for the analysis; on
`any_end` it compiles and an unanswered call skips the step. A calendar's End is best left
optional with the instruction above (an end the caller named): a duration like “for an hour”
is not turned into an end time, so that case sends no end and the calendar's default length
applies. Test it with a call and read the call's timeline: the step's row lists each input
with what it read (`outcome` `read` / `fallback` / `missing`; the public timeline omits the
value, `tool_calls[]` has what was sent). Do not use it for a value the agent already
collects: that is the `artifact` source above, and it also lands on the call's `extracted_data`.

**Where a call's results go, in the dashboard.** Extraction parameters on an agent only
decide *what* is pulled out of the call; they do not decide where it lands — that is the
After trigger above. In the dashboard this is one shortcut — After call → **Notify URL /
send webhook** — which creates the tool and one trigger per event you tick. Each delivery
is `{"call": {…}}`, with no `event` member (see below); see `yappr-api.md` → **Webhook Events**.

**Event reference:** see "What each phase actually runs" above for the full vocabulary,
and `yappr-api.md`'s Webhook Events → "Trigger events (the workflow's own names)" for the
complete list with every value. The ones that matter most here:

| Event | Fires when | Legacy name, if you're used to it |
|-------|---------------|----------|
| `call.no_answer` | Nobody picks up | `call.no_answer` |
| `call.failed` | Connection error | `call.failed` |
| `analysis.ready` | Full AI pipeline completes: transcript + disposition + summary | `call.analyzed` |
| `call.answered` | The call is picked up — fires *while the call is still going*, not after | `call.answered` / `call.started` |

**Recommended default trigger set:** `call.no_answer`, `call.failed`, `analysis.ready`.

**Who ended the call (`ended_by`)** — `GET /calls/:id` returns an `ended_by` field that distinguishes hang-up causality: `"caller"` (the human hung up, or the browser closed), `"agent"` (the bot chose to hang up), `"system"` (the platform ended it — e.g. voicemail detection, max duration, a fault, a browser session that expired unused), `"operator"` (an end from outside the call on purpose: a dashboard phone test call's End, `POST /calls/{id}/end` or a mint's `cancel_url` on a browser session nobody opened, or Yappr stopping a stuck call — such a call has no `failure`), `"unknown"`, or `null` when nothing recorded it — a call still running, or a finished one nobody could attribute, so check `status` before reading `null` as live. Useful for retry and analytics logic so you don't auto-retry calls the user intentionally ended. First-write-wins — once set, it isn't overwritten.

### Journey — read what happened on a call

When a customer asks *why didn't my system get this booking* — or *did the agent
actually call my endpoint* — read the call, not the logs:

```
GET /calls/:id   →   timeline[]
```

One time-ordered list, and it is the same list the customer is looking at on the call
log in the dashboard, so you and they are never reading two different stories.

1. Filter `timeline` for `kind === "delivery"` — that is the whole webhook ledger for
   the call. `status`, `response_status`, `attempt_count` and `error_message` say whether
   their endpoint took it, and what it said when it didn't.
2. Filter for `kind === "tool"` to see every tool the call ran, typed by `tool_type`:
   `http` (a webhook tool — method and host, the size sent, the status back), `app` (a
   connected-app action — the app, the action, and the account it used), `transfer`
   (where it handed off), `end` (why the call stopped).
3. Filter for `kind === "transition"` to follow the conversation from step to step, with
   the author's own condition for the route that fired.
4. `kind === "trigger"` rows are the after-call follow-ups the workspace authored — the
   `event` that opened each one and the steps inside it. A follow-up that is **missing**
   from the timeline is explained by the call's `follow_ups` member: `state: "waiting"`
   (its result is not ready — read the call again later) or `"skipped"`, with a `reason`
   per group — `browser_test` (a dashboard test call that ran without the workflow),
   `no_workflow_run`, `artifact_pending`, `artifact_unavailable` (the analysis failed or
   was skipped — those steps will not run), `artifact_late`. No `follow_ups` member means
   nothing needs explaining. An `analysis` reading `failed` / `no_summary` kept nothing —
   no summary, outcome or extracted values — and no `call.analyzed` follows: stop polling.
   A browser rehearsal has no caller number, so it creates or updates no lead and runs no
   `lead.ready` follow-up.

A failure is already a sentence in `error` / `error_message`. Read it to the customer as
it stands; do not translate it into internal vocabulary, and do not branch on its wording
— branch on `status`, which is `succeeded`, `failed` or `pending` on every row that has
one, and `delivered` / `failed` / `pending` on a delivery. Payloads, URLs, headers and
credentials are deliberately not in the timeline; for what a tool sent and got back,
read the same response's `tool_calls[]` (each entry's full record, below), and for a
delivery open it by its `id` — `GET /deliveries/{id}` → `exchange`.

Field-by-field reference: `yappr-api.md` → **GET /calls/:id** → `timeline`.

### Recipe — why did my tool fail?

Every tool call on a call carries its full record, on every kind of agent (calls from
21 October 2026): `GET /calls/:id` → `tool_calls[]`. A timeline `tool` row's
`exchange_id` is the matching `tool_calls[].id`.

1. Find the entry: by `tool_name`, or by the timeline row's `exchange_id`.
2. Read `status`: `failed` (it answered and refused, or answered something unusable),
   `timeout` (no answer in time — it may still have acted; check the other system
   before retrying), `unreachable` (nothing answered at the address), `refused` (never
   sent: an address that is not allowed, or arguments the tool turned away),
   `not_sent` (a test that held the request back).
3. Compare `request` with `response`: `request.method`, `request.url` (the full URL with
   its query), `request.headers`, `request.body` — what left — against
   `response.status`, `response.body` and `response.error_code`
   (`downstream_http_error`, `http_timeout`, `http_network_error`,
   `invalid_json_response`). The body is there also when the endpoint refused or did not
   answer JSON. Tell the customer what their endpoint answered, in its own words.
4. `agent_asked` is what the agent called the tool with, `agent_was_told` what it got
   back — read both when the agent said something odd after the tool ran.
5. `"[REDACTED]"` values are secrets hidden on purpose (auth headers, keys, tokens, a
   URL's password, the tool's configured header values), and `masked` lists where. Do not
   ask the customer for them and do not treat them as the bug. Their own data in a
   payload (names, numbers) is shown as is.
6. A body past 16 KB is cut: `truncated: true`, and `body_bytes` is the full size.
   Records are kept 90 days; after that `details_expired` is `true` and the bodies are
   gone. A webhook delivery's record is `GET /deliveries/{id}` → `exchange`.

**The recording.** `recording_url` opens with no key and plays the audio directly, but it
is a signed link that **expires after 7–8 days** — never store it as the recording's
permanent address. Store the call `id` and read the call again when someone wants to
listen. A link that leaked (pasted into a ticket or a chat) is taken back with
`POST /calls/:id/recording/revoke`; that call's `updated_at` moves, so a sync on
`updated_since` picks up the new link.

**Finding it in the dashboard.** The Call Logs page answers at `/call-logs` (and at
`/calls`, which redirects there). Its filters live in the address — `from`, `to` (both
`YYYY-MM-DD`, read as whole days in the workspace timezone), `outcome` (comma-separated
disposition ids, or `none` for calls with no outcome) and `q` (what the search box holds: a
phone number, part of an agent's or a lead's name, or the start of a call ID) — so a
filtered view can be linked, bookmarked or built by hand. Either end of the window may be
given on its own: `from` alone runs to today, `to` alone runs back 30 days. "Export CSV"
writes every call the filters match — including the agent and A/B dropdowns on the page,
which are not part of the address — not only the page on screen. `GET /calls/export`
below is the same button, addressable. From the API, `GET /calls?search=` is the same box:
the 8 characters of a call ID the dashboard shows find that call, and `?lead_id=` finds a
browser call attached to a lead (it has no number to search by).

### Journey — export a month of calls as a file

When the user wants to hand a client, a bookkeeper or themselves a month of calls as one
file — not read through the API one page at a time — reach for the export endpoint
instead of paging `GET /calls` and building a CSV yourself:

```
GET /calls/export?agent_id=...&from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z
```

It takes the same filters `GET /calls` does, and writes the same columns the dashboard's
own **Export CSV** button does, in the same order — the file you build here and the one a
person downloads from the screen carry the same fields. Every line under the headings is
one call: there is **no `Total` line** in the file, so a column sum or a pivot is right as
it stands. What the calls cost together is the **`X-Total-Cost-USD`** response header, and
**`X-Total-Rows`** is how many calls the file holds. That is also why it replaces
joining `GET /calls`, [`GET /billing/consumption`](yappr-api.md) and
`GET /dispositions` by hand: one file already has the cost and the outcome together.

1. `limit`, `offset`, `cursor` and `updated_since` are refused, not ignored — an export
   is one whole window of call starts, not a page of it and not "what changed since". To
   read pages as JSON, or the calls that changed since your last run, use `GET /calls`
   (`cursor`, `updated_since`). The file carries each call's `Call ID`, so its rows join
   back to `GET /calls/{id}`.
2. One export tops out at **10000 rows** (`400 CALLS_EXPORT_TOO_LARGE`, naming the
   count) rather than being truncated — a file cut short would carry wrong totals
   that say nothing about it. Split a bigger one by month.
3. End each window on the **first of the next month** (`to=2026-10-01T00:00:00Z`)
   rather than guessing a last day. `to` is inclusive, so a call started at exactly that
   boundary lands in **both** neighbouring files — drop the duplicate on `Started`
   before adding two files' `X-Total-Cost-USD` values together, or end a window a second
   earlier and accept the opposite risk instead.
4. `Cost (USD)` is `0.00` on a call that ended without a charge (failed, unanswered,
   blocked, never connected) and blank only while its charge is still pending. The
   file's own `Cost status` column (`charged` / `not_charged` / `pending`, exactly
   `cost_status` on `GET /calls`) says which: `pending` is worth waiting for, and none
   stays `pending` more than a day after its call ended. `Ended by` and `Agent ID` are
   columns too — pivot on `Agent ID`, since two agents can share a name.
5. Columns come in a fixed order, then one `Extracted: <field>` column per collected field
   in the window — read those by heading. The dashboard's own Export CSV has the same
   fields in the same order but translated headings and an extra local-time `Started`
   column, so read a dashboard file by position.

Field-by-field reference: `yappr-api.md` → **GET /calls/export**.

### Journey — a monthly report from export + consumption

When the user wants last month's report — what the calls were and what they cost — read
two things for the same window, with a key that holds only `calls:read` and
`billing:read`:

```
GET /calls/export?from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z
GET /billing/consumption?from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z&group_by=agent,source
```

1. **The file is the call list**: one row per call with its agent, outcome, duration,
   `Cost (USD)` and `Source`, and no total line — the month's call cost is the
   `X-Total-Cost-USD` response header (`curl -D headers.txt …` keeps it). Filter it the
   way `GET /calls` is filtered — `?agent_id=` for one client's agent, `?source=` for one
   origin.
2. **Consumption is the money**: `group_by=agent,source` gives one row per agent per
   origin — `test` (the workspace's own rehearsals), `shared_link`, `api`, `phone_inbound`,
   `phone_outbound` — so rehearsal spend is separated from the calls that were paid for
   without exporting once per source. `group_by=agent,disposition` gives cost and outcomes
   on the same row instead. Charges with no call behind them (a number's monthly rent, an
   eval run) come back with `source: null`. `group_by=phone_number` gives the spend per
   number instead, each row with the number's `provider` — `external` for a number on the
   customer's own Telnyx account. `product` narrows it to one of `voice_call`,
   `eval_run`, `phone_number`, `topup`, `refund`, `adjustment` — anything else (`voice`) is
   `400 CONSUMPTION_QUERY_INVALID`, and so is `?agent_id=` (there is no agent filter; group
   by agent instead).
3. **The two totals will not match to the cent, and that is not an error.** The export
   windows on when calls *started*; consumption windows on when charges were *debited* (a
   call is debited when it ends). They also read days on different clocks: the export's
   bounds are exact instants (a date-only `to` there is a UTC day), while consumption reads
   days and date-only bounds on the **workspace's** clock unless you pass `timezone=UTC`.
   Send the same full timestamps to both, as above, and both windows are the same
   instants. Calls that straddle midnight on the 1st, and charges with no call, make the
   difference. Say so in the report rather than forcing the two to agree.
   For the balance itself — opening, every top-up and refund, closing — read
   `GET /billing/transactions?from=2026-09-01&to=2026-09-30` (its days are on the workspace's
   clock, like consumption; add `timezone=UTC` for UTC days).
4. **Month to date** is `monthly_spend_cents` on `GET /billing` — reported whether or not a
   spending limit is set, measured from `monthly_period_start` (the 1st, 00:00 UTC).
5. Over 10000 calls in the month, the export refuses (`400 CALLS_EXPORT_TOO_LARGE`) —
   split the window, and de-duplicate on `Started` where two windows meet.

### Journey — reading webhook deliveries across many calls

When the user asks "did my webhook actually fire this week" or "which calls' webhooks
failed last night" — across many calls, not one — `GET /deliveries` is the endpoint,
not paging `GET /calls/:id` and filtering each call's `timeline` yourself:

```
GET /deliveries?status=failed&from=2026-09-21T00:00:00Z&to=2026-09-22T00:00:00Z
```

Each row is the same `delivery` row a call's own `timeline` carries, field for field,
plus the `call_id` it happened on — the same parser reads both. Filter by `tool_id`, by
`agent_id` (deliveries the agent sent itself, **and** deliveries its tools sent on its
calls — a workflow agent sends through its tools, so both count), by `call_id` to
confirm one call's webhook fired, by `status` (`delivered` / `failed` / `pending` /
`unknown` — rows still `pending` are listed too; `failed` is the delivery-health query, and
`unknown`, a request that got no answer in time, is the one to check on your side), or by `source`:
`live` is real traffic (a call, or a lead event, which can have `call_id: null`), `test` is
a tool test you ran that actually reached the endpoint — a legacy webhook tool's test at
once, a workflow tool's real `allowlist` test once it settles; a mock test writes nothing
— or anything sent on a call the dashboard opened to rehearse an agent.
Use `?source=live` for a delivery-health report, and `?source=test&tool_id=…` to answer
"did my test reach the endpoint?". Page with `pagination.next_cursor` until
`has_more` is `false` — cursor, not offset, because the log keeps growing while a long
read is in flight, and an offset would silently skip or repeat rows. Send `cursor` only
once you actually have one — like every filter here, an empty value is refused. Cursors
are signed: one built by hand, edited, taken from `GET /calls`, or saved before signing
began is `400 DELIVERY_CURSOR_INVALID` rather than a silent restart from the top — a job
that keeps a cursor between runs reads the first page again on that `400`. A key with
`calls:read` or `tools:read` can read them.

To see why one failed, open it: `GET /deliveries/{id}` returns the body that was sent,
where it went (`request.destination`, without query string or credentials) and what the
endpoint answered (header values `[REDACTED]`; bodies need `calls:read`, the address's path
needs `tools:read` or `tools:update`). Once the endpoint is fixed,
`POST /deliveries/{id}/retry` (`tools:update`) sends that same body once more to where the
tool points **now** — check `retry_target.destination` and `retry_target.changed` first,
since that is not always where the delivery went. Only a `failed` delivery, once — or an
`unknown` one, after you checked the endpoint, with `{"acknowledge_unknown": true}` (without
it: `409 DELIVERY_OUTCOME_UNKNOWN`, nothing sent). A delivery answered 2xx is never retried.

Field-by-field reference: `yappr-api.md` → **Deliveries**.

### The trigger's payload is not minimal

A trigger step's request is the same [call package](yappr-api.md) every workflow tool
gets: `{"call": {…}}` plus the step's own inputs. A follow-up you author (or the dashboard's
Notify URL shortcut creates) has **no `event` member**, so read `call.status` (`completed`,
`failed` or `no_answer`) to tell how the call ended, or give each follow-up its own URL or a
fixed `event` input. An agent **converted** from `webhook_url` is the exception: its
follow-ups also send a top-level `event` spelled as the endpoint read it before
(`call.analyzed` stays `call.analyzed` although the trigger is `analysis.ready`;
`call.started` is now sent at pickup). Everything else from the old body moves under `call`
— `call_id` → `call.call_id`, `data.direction` → `call.call_direction`, `data.from_number` /
`data.to_number` → `call.caller_number` / `call.callee_number`, `data.summary` /
`data.extracted_data` → `call.analysis.summary` / `call.analysis.extracted_data`,
`data.disposition` → `call.disposition.label` — and the `data` wrapper, `timestamp` and the
per-event extras (a failure's `error`) are gone. Unlike the legacy `call.analyzed`
webhook this replaces, `call` already carries the lead object, the `call_metadata` and
`call_variables` from call creation, billing, the recording URL and the full disposition
object (`{id, label}`, not just the label string) — see the phase table in `yappr-api.md`
for exactly which members are populated by the time an `after` trigger runs. There is no
required `GET /calls/:id` follow-up fetch for anything in that package; only reach for it
when you need something the package genuinely does not carry, such as the lead's full
history rather than the lead attached to this call.

### Step 4.1 — Disposition Routing Architecture

Based on the per-disposition routing answers from Phase 0, wire up a routing handler in the receiver your After follow-ups post to:

```typescript
// webhook-handler.ts — body: {"call": {...}} plus the step's own inputs.
// A converted agent also sends a top-level `event` (e.g. "call.analyzed"); one you author does not.
async function handleFollowUp(body: { event?: string; call: CallPackage }) {
  const { call } = body;
  if (call.status === 'no_answer') return handleNoAnswer(call); // Step 4.2
  if (!call.analysis) return; // not the analysis.ready follow-up (e.g. call.failed)

  const disposition = call.disposition?.label ?? null; // an object {id, label}, not a string

  // No GET /calls/:id needed: call_metadata and call_variables are in the package, and
  // `lead` is too once the step waits for it ("requires": ["lead"])
  switch (disposition) {
    case 'Appointment Set':
      await sendWhatsAppConfirmation(call.lead, call.call_metadata);
      await updateCrmAppointmentSet(call);
      break;

    case 'Not Interested':
      await markDoNotCall(call.lead);
      break;

    case 'Callback Requested':
      await scheduleFollowUpCall(call.lead, hoursFromNow(4));
      break;

    case 'Interested':
      await notifySalesTeam(call);
      break;

    case null:
      // Classification failed — log for manual review
      await flagForManualReview(call);
      break;
  }
}
```

If Supabase is available, scaffold this as an edge function.

### Step 4.2 — Retry Logic for No-Answer

Configure based on discovery answers. Standard retry pattern:

```typescript
// The call.no_answer follow-up (call.status === 'no_answer'), routed from handleFollowUp above.
// An unanswered call has no results (no lead object), but lead_id, the numbers and call_metadata are there.
async function handleNoAnswer(call: CallPackage) {
  const leadKey = call.lead_id ?? call.callee_number;

  // Check attempt count (store in call_queue or lead metadata)
  const attempts = await getAttemptCount(leadKey);

  if (attempts < MAX_RETRIES) {
    await scheduleRetryCall(call, RETRY_INTERVALS[attempts]);
  } else {
    await markLeadExhausted(leadKey);
  }
}

const MAX_RETRIES = 3; // from discovery config
const RETRY_INTERVALS = [
  4 * 60 * 60 * 1000,  // 4 hours after first no-answer
  24 * 60 * 60 * 1000, // 24 hours after second
  48 * 60 * 60 * 1000, // 48 hours after third
];
```

---

## PHASE 5: Going Live

### Step 5.1 — Phone Number Setup

Check what's already there (done in Phase 0). If the user needs a new number:

**Search:**
```bash
curl -s -X POST "https://api.goyappr.com/phone-numbers/search" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}' | jq .
```

Present the list with numbers and pricing. Ask which they want.

**Confirm before purchasing:** *"Purchasing [number] will start a $10/month recurring charge on your saved card. Shall I go ahead?"*

**Purchase** — send an `Idempotency-Key` (16–128 letters, digits, `_` or `-`) so a retry after
a timeout charges once and orders one number. Make a new random UUID for each number the user
decides to buy, and reuse it only to retry that same purchase:
```bash
IDEMPOTENCY_KEY=$(python3 -c 'import uuid; print(uuid.uuid4())')   # once per number bought

curl -s -X POST "https://api.goyappr.com/phone-numbers/purchase" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+972XXXXXXXXX"}' | jq .
```

Retried within 24 hours with the same key **and the same number**, it answers the same success
body once the purchase went through, `409 PURCHASE_IN_PROGRESS` while it is still going
through (check `GET /phone-numbers` in a minute — do not send a new key), or `409 PURCHASE_FAILED`
when that purchase did not go through (declined or rolled back). After `PURCHASE_FAILED` or any
other error, send a new key. A key belongs to one number: the same key with a **different** number is a
separate purchase, and that number is bought and charged too. Never build the key from the
number or the date — buying the same number again later would replay the old purchase and buy
nothing.

The purchased number may differ from what was selected (race condition fallback). Always show the `phoneNumber` from the response.

`402 PAYMENT_METHOD_REQUIRED` means there is no usable card (none saved, the saved one stopped working, or the first charge was declined). Nothing was bought. Tell the user to add a card in Settings → Billing, then retry the same purchase.

**Assign:**
```bash
# Get the number's internal UUID
curl -s "https://api.goyappr.com/phone-numbers" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.data[] | select(.number == "+972XXXXXXXXX") | .id'

# Assign agents — use snake_case field names (camelCase returns 400)
curl -s -X POST "https://api.goyappr.com/phone-numbers/configure" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number_id": "UUID",
    "inbound_agent_id": "AGENT_ID",
    "outbound_agent_id": "AGENT_ID"
  }' | jq .
```

Status `pending_requirements`: regulatory approval needed (Israeli numbers, 1–3 business days). Number is reserved and subscription is active — it will start working once approved.

**Note on `outbound_agent_id`:** it is the agent that places a call from this number when `POST /calls` sends no `agent_id` (a number with none, and no split, answers `422 AGENT_NOT_RESOLVED`), and the dashboard's default when the user presses "Call" on the number's page. It does NOT restrict which agent can initiate outbound calls from this number via the API: an explicit `agent_id` always wins, and `POST /calls` accepts any `agent_id` + any active company-owned `from` number combination per request. Do not recommend purchasing extra numbers just to run multiple agents — one outbound number is enough to serve all agents.

**Note on `inbound_agent_id`:** this one DOES matter — it's the agent that answers when someone calls this number. It is a real 1:1 binding. If two agents need to handle inbound, they need two numbers.

**Binding from the workflow side.** A workflow agent has no direction of its own and no field for its numbers: the NUMBER carries the binding, so "give this agent a number" is `PATCH /phone-numbers/ID` with `inbound_agent_id` and/or `outbound_agent_id` (`null` unbinds; same fields as `/phone-numbers/configure`). It takes effect at once, takes the number from whichever agent had it without warning, and fails the number's calls if the agent is inactive or unpublished, so read `GET /phone-numbers` first, say which agent is being replaced, and publish before you bind. The workflow document's `channels` (`phone`, `web`, both by default) says which ways in the agent allows — `phone` covers incoming and outgoing together, `web` needs no number — and a call on a channel the published version leaves out fails at preparation as `artifact_unavailable`. Do not remove a channel to make an agent "inbound-only"; see **How calls reach the agent** in `yappr-api.md`.

**Releasing a number the user no longer needs:** confirm first (*"Releasing [number] stops its $10/month charge. It keeps working until the end of the period you already paid for, then it is gone for good. Shall I go ahead?"*), then:
```bash
curl -s -X POST "https://api.goyappr.com/phone-numbers/UUID/release" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```
`released: false` with `release_at` means it is kept until that date (shown as `scheduled_release_at` on `GET /phone-numbers`); `released: true` means it was released now (payment overdue, or no subscription). Undo before that date with `POST /phone-numbers/UUID/keep`. A campaign still calling from the number (`409 NUMBER_IN_CAMPAIGN`) or a call in progress (`409 NUMBER_ON_LIVE_CALL`) blocks the release: move the campaign to another number first. A number from the customer's own Telnyx account or phone system is never released here (`yappr-api.md` → Phone Numbers → `POST /phone-numbers/{id}/release`).

### Step 5.1b — Option B: inbound from the customer's own phone system (no Yappr number needed)

When the customer already has a business line and a phone system they want to keep, route calls from that system to a Yappr agent through a SIP endpoint instead of buying a Yappr number. Use this when:

- The customer wants Yappr to answer overflow / after-hours / escalated calls without changing the number their customers dial
- The customer is piloting Yappr on a subset of routes before committing to porting
- The customer maintains their own queue / IVR / switchboard and wants AI as the last step

This path is independent of Yappr-bought numbers — a single agent can answer calls from both, and they share the same billing, concurrency cap, and call-log storage. The PSTN inbound flow (Step 5.1 above) is unaffected.

Every kind answers with any agent of the workspace, `workflow_v1` included (publish its workflow first: an agent that is switched off, or whose workflow was never published, takes no calls, and a trunk refuses them with SIP `603`). Full reference: `yappr-api.md` → SIP Endpoints.

- **A username-and-password trunk** (`auth_mode: "credentials"`, steps 1–3 below) for any agent, unless the customer's platform can't answer a password challenge (list below); then a SIP address endpoint. Yappr issues a SIP username and password; the customer's system sends calls to the server in `sip_connection.server` with them, and a wrong password is refused before the call reaches Yappr. A trunk only brings calls in: it can't place calls, so **a transfer to a phone number isn't available on trunk calls** (an attempt dials nothing and the caller stays). A transfer to a **SIP address of the customer's own phone system** is: make `sip:extension@pbx.example.com` the transfer tool's `destination` (`yappr-api.md` → SIP Endpoints → A transfer to a SIP address) and Yappr asks that system to place the new call. It works on trunk calls (as a SIP REFER) and on extension calls (Yappr places a new call through the extension, Step 5.1b), but not on a SIP address endpoint (a SIP-address transfer there gets `REFER_ONLY_ON_SIP_TRUNK`, and the agent keeps helping). On a trunk call the customer's system must accept SIP REFER and have the new call answered within about nine seconds, and if the transfer fails the call ends, so test it first. To hand callers to a person outside the customer's phone system, send those calls to a Yappr number (Step 5.1) instead.

- **An extension endpoint** (`auth_mode: "register"`, see **Register as an extension** below) when the customer's hosted phone system gives them only an extension account (server, username, password) and no way to add a trunk. Yappr registers to it like a softphone and the agent answers the calls routed to that extension. It needs more of the customer than a trunk does (a dedicated extension, a firewall rule, a few minutes of registration), so prefer a trunk whenever the system can add one.

A SIP address endpoint works with any agent, but its address is a bearer secret: anyone who has it can dial the agent, billed to the workspace.

**1. Check that trunks are available:**

```bash
curl -s "https://api.goyappr.com/sip-endpoints/status" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
# {"credentials_available": true}
# false = trunks aren't switched on for this workspace (a create answers 403 SIP_TRUNKS_NOT_ENABLED:
# the customer asks Yappr support to switch them on), or Yappr can't take trunk calls right now
# (a create answers 409 VOICE_NOT_READY: wait a few minutes and check again)
```

**2. Create the trunk:**

```bash
curl -s -X POST "https://api.goyappr.com/sip-endpoints" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Main office PBX", "inbound_agent_id": "AGENT_UUID", "auth_mode": "credentials", "max_concurrent_calls": 5}'
```

The response is the endpoint wrapped in `data`: `sip_username`, `sip_connection` (`server`, `alternate_servers`, `transports`) and `sip_password`. **The password is shown only in this response.** Hand it straight to whoever configures the customer's system, and don't write it to logs or files. If it is lost, `POST /sip-endpoints/{id}/rotate-password` issues a new one (the username stays). `max_concurrent_calls` (1–8, default 2; `null` is refused) caps simultaneous calls on this trunk; one more gets SIP `486 Busy Here`. A field the trunk doesn't take (`sip_username`, `sip_password`, `slug`, `transport`, a typo) is refused with `400 SIP_ENDPOINT_REQUEST_INVALID`, by name, and nothing is created.

**3. Give the customer these settings:**

| Setting | Value |
|---|---|
| SIP server | `sip_connection.server`, or the entry of `alternate_servers` closest to the customer's system. All of them take the same credentials, so another one is the backup route; realm, if asked = the server name used |
| Transport | TLS 5061 (recommended), or TCP / UDP 5060 |
| Username / password | `sip_username` / `sip_password` |
| Registration and keep-alives | **Recommended.** Over TLS/TCP: register the trunk, or send keep-alives (SIP `OPTIONS` every ≤ 30 s, e.g. Asterisk `qualify_frequency`); either keeps the connection open. Over UDP behind NAT or a firewall: `OPTIONS` every ≤ 30 s even if the system registers (a registration refreshes only every few minutes). Otherwise the agent's hang-up may not reach the system, and the caller sits on a silent line until they hang up. Check with a test call of ≥ 2 min that the agent ends (a shorter one passes even with no keep-alives) |
| Codecs | G.711 µ-law / A-law first (the agent's audio is G.711, so no conversion). G.722, G.729 and Opus also work; G.729 costs some sound quality |
| SRTP | Off, or mandatory. Never "optional" — that call fails with `488` |
| Number dialled | Any number or extension; every call reaches the trunk's agent (even a Yappr number dialled goes to the trunk's agent, not that number's). What was dialled is recorded as the number called (letters, digits and `+ * # . _ -` only, up to 64), shown in the dashboard's call log; the API's `to` is `null` for every call on a SIP endpoint. If nothing is left, or it contains the trunk username, it is recorded as `sip-trunk` |
| Transfers | A transfer to a phone number isn't available on trunk calls: nothing is dialled, the caller stays on the call, and the call's events get `transfer_failed` with `error_code` `UNAVAILABLE_ON_SIP_TRUNK`. A transfer to a SIP address of the customer's phone system (`sip:extension@pbx.example.com`) works: their system must accept SIP REFER and have the new call answered within about nine seconds, and if it fails the call ends |
| Caller ID | The caller's number in `From` or `P-Asserted-Identity` (PAI wins). If the system sends only the trunk username as the `From` user (a common default), Yappr records the call with no caller number: the API's `from` is `null`, and the dashboard's call log shows "Unknown caller" |
| Simultaneous calls | Set the trunk's channel limit in the customer's system to `max_concurrent_calls` (2 by default) |
| No-answer timeout | ~20 s, with failover to the next route |
| Same system/IP also on another trunk at the same carrier, or a shared-IP cloud sender (Twilio, SignalWire, Genesys Cloud, Plivo, Sinch, Infobip) | A call could be matched to the wrong trunk: send `sip_username` in a header (the header name is on the SIP trunks page of the Yappr docs, docs.goyappr.com/concepts/sip-trunks) or put it in the `Contact` user part; Plivo, Sinch and Infobip document neither, so test the route with Yappr support before real calls |
| Firewall | Allow SIP to and from the server (the agent's hang-up comes from it), and RTP to and from the carrier's media networks (UDP 16384–32768 on the carrier's side) |

Keep emergency numbers on the customer's regular lines, off every route that uses the trunk: the carrier never hands those calls to Yappr, so no agent answers them, and Yappr can't say whether they reach emergency services.

If the workspace's inbound calling hours are switched on (`GET /call-windows`), they apply to trunk calls too: outside them every trunk call gets `603`, after-hours overflow included.

**Platforms that can use a trunk:** 3CX v20 self-hosted (Generic VoIP Provider template; 3CX SMB / 3CX-hosted can't), FreePBX / Asterisk, FreeSWITCH / FusionPBX, VICIdial, Issabel, Yeastar, Grandstream UCM, Avaya IP Office, Xorcom CompletePBX, Cisco CUBE, AudioCodes Mediant, Ribbon SBC, Oracle SBC and, for a cloud sender with shared sending addresses, Twilio Programmable Voice (`<Dial><Sip username="..." password="...">sip:NUMBER@SERVER</Sip></Dial>`, with `SERVER` = `sip_connection.server`), SignalWire and Genesys Cloud BYOC Cloud (send `sip_username` in a header, see the row above), and Plivo, Sinch Elastic SIP Trunking and Infobip (TLS only), which document no such header: test those with Yappr support first.

**Platforms that can't** (no password challenge on calls they send): Twilio Elastic SIP Trunking origination (use Twilio Programmable Voice instead), Vonage, Bandwidth, Five9, Amazon Connect, RingCentral, Zendesk Talk. Microsoft Teams Direct Routing and Zoom Phone work only through the customer's own SBC. For these: add the trunk on the customer's PBX, forward calls to a Yappr number (Step 5.1), or use a SIP address endpoint if the platform can dial a plain SIP address.

**What the customer's system hears:** `403` wrong username/password (or deleted trunk) — the call never reaches Yappr · `480` the call rang ~20 s and the agent couldn't be connected, or Yappr's usual refusal couldn't be sent (retry or next route) · `486` trunk limit (`max_concurrent_calls`, 2 by default) or Yappr capacity reached · `488` SRTP offered as optional · `603` trunk or agent switched off, the agent's workflow never published, outside inbound calling hours (when switched on), out of credit, or Yappr couldn't take the call. Before a trunk is switched off or deleted, re-route its calls in the customer's system: not every system tries its next route after a `603`.

**Register as an extension (`auth_mode: "register"`).** The customer's hosted system gives only an extension account. In the dashboard: Phone Numbers > SIP Endpoints > Create SIP Endpoint > Register as an extension (only workspace owners and admins can create one: `403 FORBIDDEN_ROLE`). Full reference: `yappr-api.md` → SIP Endpoints → Register as an extension. A workspace can have up to 5 extension endpoints (`409 SIP_REGISTER_LIMIT_REACHED`), one endpoint per extension, and the registrar must be a public host name or address (`400 SIP_REGISTER_HOST_INVALID`). `rotate-password` isn't available on an extension (`409 NOT_SUPPORTED_FOR_MODE`): send the new password with PATCH `register.password`.

1. **Check availability:** `GET /sip-endpoints/status` → `register_available`. `false` means a create answers `403 SIP_REGISTER_NOT_ENABLED` (the customer asks Yappr support) or `409 VOICE_NOT_READY` (wait a few minutes). A create can also answer `502 SIP_REGISTER_PROVIDER_ERROR`: usually nothing is created (retry), but if the message says the endpoint was left switched off, delete it and create it again (if the new one fails as "already in use", use a different extension name).
2. **Get these from the customer, in one message:** the registrar (`host[:port]`), the extension username, its password, whether the system logs in with a different user (`auth_username`), the transport (UDP is the default and the recommended one), and which region is nearer (`middle_east` default, `europe`), and, if the agent will transfer callers to extensions, the phone system's in-call transfer code and whether the transfer completes only when the extension that pressed it hangs up (step 8). Ask them to create a **dedicated extension that receives calls and can dial only the internal transfer destinations**: no outbound, phone-network or international calling, so the extension can never be used to place calls elsewhere. Their phone system must offer **G.711 µ-law (PCMU)**, the codec the agent answers extension calls with (without it the test call fails); DTMF tones work. The extension username is 2 to 128 characters, starts with a letter, digit or `+`, and uses only letters, digits, `+`, `-` and `_` (a dot, `@` or space cannot be registered; a 3-digit extension such as `101` works) and one no other Yappr endpoint registers. Usernames are unique across Yappr, first come first served, so with a short extension a clash (`409 SIP_REGISTER_EXTENSION_IN_USE`) is likely: ask the customer to create a dedicated extension with a distinctive name (letters, digits, `-` or `_`) and register that one.
3. **Create it** (the password goes only in the request body; never write it to a file or log it):

```bash
curl -s -X POST "https://api.goyappr.com/sip-endpoints" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Hosted PBX extension", "inbound_agent_id": "AGENT_UUID", "auth_mode": "register",
       "register": {"server": "sip1.example.net", "username": "101", "password": "EXTENSION_PASSWORD"}}'
```

4. **Give the customer the firewall rule** from `data.register.allow_list`: allow `sip_ip` for SIP (5060, 5061) and RTP (UDP 16384–32768), both directions, and make the system reachable from the internet. The Middle East address is `192.76.120.75` and the Europe address is `192.76.120.72`; always read the one to allow from `allow_list`.
5. **Wait for `registered`:** poll `GET /sip-endpoints/{id}` and read `register.status`. `pending` and `registering` last a few minutes (about a minute and a half before the first attempt, longer after a change); an endpoint that is switched off and still `pending` after a failed create never finished its setup: delete it and create it again (if the new one fails as "already in use", use a different extension name). `failed` carries `status_detail`: an authentication failure means the extension or password is wrong (fix it with PATCH `register.password`, and `register.username` only together with the password), "not reachable" means the server or firewall, "no answer" means the port or firewall, "extension username already in use" means pick another extension (also right after deleting an endpoint: see step 9). `unknown` means the status can't be read right now: read it again in a moment. If `register.last_activity_at` is set (read the endpoint again: the answers to create and PATCH always carry `null`), a call went through the extension in the last 24 hours, after its settings last changed (`last_activity_kind`: `inbound_call`, "carried a call", or `outbound_call`, "outbound calls work", which does not confirm incoming calls): tell the customer what that call shows, and that it comes from a call, not from a registration check (never say it is registered). With no such call, send them to their phone system's list of registered extensions or devices, or a test call.
6. **`registered` is not proof.** Send a **test call** to the extension (the agent must answer and the call must appear in `GET /calls`), and if the agent transfers, a **test transfer**: a wrong password saved later can leave the status `registered` while transfers already fail.
7. **Transfers:** there is no REFER on extension calls. A transfer tool destination `sip:reception@pbx.example.com` (always write the `sip:` form; a bare extension number is not a supported destination) places a new call through the extension to the part before the `@` (the host is ignored). The extension must be allowed to dial it, the transfer uses two channels on the customer's system, and the call stays connected until one side hangs up. The call is marked `transferred` and billed like a phone-number transfer. **A new call that fails or isn't answered ends the call** (about 25 seconds to answer; `NOT_CONNECTED`, then a hang-up): build no fallback that needs the agent afterwards. A phone-number destination is refused (`UNAVAILABLE_ON_SIP_TRUNK`).
8. **Set the transfer code (once, if the agent transfers to extensions):** the in-call transfer code from step 2 (often `##`, sometimes `*2` or `#1`; the customer's phone system provider knows), and whether the transfer completes only when the extension that pressed it hangs up (an attended transfer). Send it with the create, or `PATCH /sip-endpoints/{id}` with `{"register": {"pbx_feature_code": "##"}}`, adding `"pbx_feature_code_hangup_after_secs": 4` for an attended code (in the dashboard: the extension endpoint's **Transfer code** field and the switch "My phone system completes the transfer when the agent hangs up"). It needs no password, doesn't touch the registration, and covers every transfer on this endpoint's calls to an extension a keypad can dial (`sip:400@...`), on every agent: set nothing on the transfer tools. The customer turns on in-call transfer for the extension, with RFC 2833 DTMF. A blind code the phone system doesn't take within about 12 seconds falls back to the dial-back of step 7; an attended code has no fallback, so make a test transfer and check its `transfer_started` reads `method` `"pbx_feature_code"` (a `fallback_from` means the code wasn't taken). Give a single transfer tool its own code only when it needs a different one (`yappr-api.md` → Tools → **A transfer tool's own transfer code**).
9. **Changing and removing:** The last password sent to Yappr is the one used to stay registered (about every hour) and to place transfers. So every password change on the customer's system, and every username change, is a PATCH carrying `register.password`: until it is sent, transfers fail while `register.status` can still read `registered`. To change the agent, the call limit, the server, the password or anything else, PATCH the endpoint: never delete and re-create it. Delete only when the extension is no longer needed, and before that remove or disable it on the customer's system and re-route its calls: neither a delete nor a switch-off tells it. After a delete the carrier can keep registering the extension there for hours, so the system keeps routing its calls to the carrier, which rejects them meanwhile, and a new endpoint with the same extension name is accepted, then reads `failed` ("already in use") while that lasts. This also happens with endpoints that never registered, so a wrong password followed by a delete and re-create can leave the extension name unusable for hours. If a re-create fails that way, use a different extension name. After a switch-off the status reads `disabled` and Yappr refuses new calls.

**Call out through the customer's phone system** (an extension endpoint the agent should also place calls from, so the person called sees the business number):

1. **Check availability:** `GET /sip-endpoints/status` → `register_outbound_available`. `false` means switching it on answers `403 SIP_REGISTER_OUTBOUND_NOT_ENABLED` (the customer asks Yappr support) or `409 VOICE_NOT_READY`.
2. **Ask the customer, in one message**, to have their phone system provider: let the extension call out to **Israeli numbers only** (no international or premium numbers), set its outgoing caller ID to the business number, confirm the extension's call limit, and say whether numbers are dialled `05X…` or `+972…` and whether an outside-line prefix (such as `9`) is needed.
3. **Switch it on:** `PATCH /sip-endpoints/{id}` with `{"register": {"outbound": {"enabled": true, "caller_number": "+972...", "dial_format": "national"}}}` (`yappr-api.md` → SIP Endpoints → Calls out through the extension). The number then appears in `GET /phone-numbers` with `provider: "phone_system"`.
4. **Use the number:** make it the agent's outbound number (`PATCH /phone-numbers/{id}` `outbound_agent_id`), a campaign's `from_phone_number_id`, or `from` on `POST /calls`.
5. **Test:** one call from the agent to a number you control; read `GET /calls/{id}`. `failure.code: "phone_system_refused"` means the phone system refused it (check its outbound rights and the dial format). Three refusals in a row pause it (`register.outbound.paused`): fix it, then PATCH `enabled: true`.

**SIP address endpoint** (for a platform that can't answer a password challenge). Create it without `auth_mode`:

```bash
curl -s -X POST "https://api.goyappr.com/sip-endpoints" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "After-hours", "inbound_agent_id": "AGENT_UUID"}'
```

The response is the endpoint wrapped in `data`, and `data.sip_uri` is everything the customer needs; there is no username or password. `slug` is optional: the readable start of the address, 2–12 letters, digits and single hyphens (lowercased), starting and ending with a letter or digit, and not a reserved word (e.g. `yappr`, `admin`, `internal`, `system`, `api`, `sip`, `trunk`, `root`, `test`, `sudo`, `support`) or one followed by a hyphen. A slug that does not fit is refused with `400 SIP_ENDPOINT_REQUEST_INVALID`, never rewritten. Leave it out and the prefix is derived from `name` (at most 12 characters). Any field the endpoint does not read (`sip_password`, `transport`, `require_tls`, `max_concurrent_calls`, a typo) is refused the same way, by name.

The customer pastes the URI as the SIP destination in their PBX/CPaaS route, with authentication set to none ("none" or "anonymous"), over UDP or TCP (port 5060) or TLS (port 5061). Over UDP or TCP the URI crosses the network in clear text, so use TLS where the system supports it; either way it sits in their configuration, logs and SIP traces. Codecs: G.711 (µ-law or A-law) or G.722. The URI contains a 24-char random suffix (~120 bits): anyone with it can dial the agent, billed to the workspace — treat it like an API key. The URI cannot be changed; to rotate access, create a new endpoint, point the phone system at its `sip_uri`, then delete the old one — in that order, so no call is dropped (calls to a deleted address get SIP `603 Decline`).

Concrete example pastes for common platforms:
- **Twilio Studio** — set the "Connect Call To" SIP value in the appropriate widget to `sip_uri`
- **Twilio TwiML** — `<Dial><Sip>{{sip_uri}}</Sip></Dial>` (no `username`/`password` attributes)
- **Asterisk** — `Dial(SIP/<slug>@yappr-byoc.sip.telnyx.com)` from your dialplan
- **FreeSWITCH** — `<action application="bridge" data="sofia/external/<sip_uri>"/>` in the relevant XML route

**`allowed_source_ips` is a record, not a filter.** The field is stored with a SIP address endpoint (up to 50 IPv4/IPv6 addresses, each optionally with a `/prefix`), but no call is checked against it: a call to the URI is answered wherever it comes from. Never tell the customer it blocks other sources. What actually limits exposure: who can read the phone system's configuration, `is_active: false` while the endpoint is not in use (calls are then refused before they are answered), and rotating the URI whenever it may have been seen.

**Caller-ID note.** On every kind (trunk, SIP address and extension) the caller's number comes from the customer's system, so it is untrusted: Yappr **skips lead-memory lookups and returning-caller recognition** on every call arriving via a SIP endpoint. There is no setting to turn that on, in the API or the dashboard.

**Reading these calls back.** A SIP-endpoint call is `source: phone_inbound` with `to: null` and carries `sip_endpoint_id`; its `from` is whatever the phone system sent as the caller, which may not be a phone number, and `null` when the caller ID was only the trunk's own username (a `credentials` trunk). On a SIP address endpoint the calls API and the export never return the URI, but the dashboard's call logs show it as the number called, and the call details the agent's tools and webhooks receive carry the address as `callee_number` — so anyone who can read those can read the credential. On a trunk, the dashboard's call log shows what was dialled instead.

**Pre-launch checklist for SIP endpoints:** all the standard items in Step 5.2 still apply, plus:

- [ ] The trunk's agent is switched on and, if it runs a workflow (`workflow_v1`), its workflow is published (otherwise its trunk calls get `603`)
- [ ] `GET /sip-endpoints/status` returned `credentials_available: true` before the trunk was created (if it stays `false`, the customer asks Yappr support to switch trunks on)
- [ ] The password was handed over once and entered in the customer's system (it can't be shown again; rotate if lost)
- [ ] The customer's route uses `sip_connection.server`, TLS 5061 (or TCP/UDP 5060), G.711 first, SRTP off or mandatory, and a ~20 s no-answer timeout with failover
- [ ] Over TLS/TCP the system registers the trunk or sends `OPTIONS` keep-alives every ≤ 30 s; over UDP behind NAT or a firewall it sends `OPTIONS` every ≤ 30 s (registration alone refreshes too seldom). A test call of at least 2 minutes that the agent ends also ends on the customer's system
- [ ] The trunk's channel limit in the customer's system matches `max_concurrent_calls` (2 by default, at most 8)
- [ ] The customer's system sends the caller's number in `From` or `P-Asserted-Identity`, not just the trunk username
- [ ] A test call from the customer's system reaches the agent (the call appears in the dashboard call log, and via `GET /calls`)
- [ ] For a trunk, the customer knows a transfer to a phone number isn't available: a hand-back goes to a SIP address of their own phone system (it must accept SIP REFER and answer the new call within about nine seconds; if it fails the call ends, so test it first), and calls that may need a person elsewhere stay in their system or go to a Yappr number instead. A SIP address endpoint's calls are not trunk calls: a SIP-address transfer isn't available there
- [ ] For an extension endpoint (`register`): `register_available: true` first; a dedicated extension (no outbound, phone-network or international calls; it may dial only the internal transfer destinations) and a phone system that offers G.711 µ-law (PCMU); the firewall allows `allow_list.sip_ip` for SIP and RTP; the extension username is unique across Yappr; `register.status` reached `registered`; a test call and a test transfer both worked (`registered` alone proves nothing); if the agent transfers to extensions, the phone system's transfer code is set on the endpoint (with the hang-up time for an attended code) and the test transfer recorded `method` `"pbx_feature_code"`; and the customer knows a failed transfer ends the call, to send Yappr the new password whenever it changes on their system, to re-route the extension before deleting or switching off the endpoint, and to change an extension endpoint with PATCH, not delete and re-create it (a deleted endpoint can keep the extension name busy for hours)
- [ ] If the workspace's inbound calling hours are on, they cover the hours the trunk takes calls
- [ ] The customer understands the caller-ID trust model (untrusted, no lead memory)
- [ ] The endpoint is marked `is_active: true`
- [ ] Emergency numbers are not routed to the endpoint
- [ ] Revocation recipe is known: trunk → `rotate-password` (or delete); SIP address → create a new endpoint, repoint the phone system, then delete the old one (deleting first drops calls until the new URI is in place)
- [ ] For a SIP address endpoint: the customer knows `allowed_source_ips` is not enforced, and uses TLS where the system supports it

### Step 5.1c — Option C: the customer's own Telnyx numbers, calls out and in (no Yappr number needed)

Use this when the customer already owns numbers at Telnyx and wants agents to call **from** them, answer calls **to** them, or both: their numbers, their Telnyx account, nothing ported or bought. The carrier account is only the connection; once it is set up, every number in their Telnyx account appears in `GET /phone-numbers` as an ordinary `external` number with the same inbound/outbound agent fields. Full reference: **Carrier Accounts** in `yappr-api.md`.

**Who bills what.** Telnyx bills the customer's own account for the phone minutes at their rates, Telnyx's own fees (call control, media streaming, recording, noise suppression) and the numbers themselves; none of it appears on the Yappr bill. Yappr bills the agent minutes at its Phone calls price (Billing → Prices), the same as a call from a number bought from Yappr — not lowered for the phone minutes Telnyx bills them, in or out. One exception: a call with a Palestinian Authority number at either end pays a premium price on a Yappr number, and the plain Phone calls price here. Say this before they connect — it is the first question they will have.

**0. Give the key the carrier scopes.** Carrier accounts are available to every workspace — nothing to switch on. The scopes are opt-in, though: no key has them by default. In Settings → API keys, create a key with the **Your carrier (Telnyx)** group ticked (`carrier_accounts:read` and `carrier_accounts:manage`); without them every carrier route but one answers `403 INSUFFICIENT_SCOPE` naming the scope, and `carrier_state` on phone numbers reads `null`. The one is `GET /carrier-accounts/status`: it needs no scope, so any key for the workspace (not one limited to some agents) can ask whether the feature is on. That is the key, not the feature: widen the key's scopes, don't rotate it. (A `403` with the code `CARRIER_ACCOUNTS_NOT_ENABLED` means Yappr switched the feature off for this workspace in an emergency — contact Yappr support. Branch on `code`, never on the status alone.)

**1. Prerequisites in Telnyx.** The customer does these in their Telnyx portal; confirm each one before calling the API:

- [ ] The account is verified to **Level 2**. Level 1 allows calls inside the US only; Level 2 turns on international calling, Israel included.
- [ ] An **outbound voice profile** allows every country the agents will call. A new profile allows only the US and Canada, and a call anywhere else is refused. Set a **channel limit** and a **daily spend limit** on it: they cap what a leaked key could spend.
- [ ] A **dedicated API key for Yappr** (Account Settings → API Keys → Create API Key — Telnyx shows it once). Telnyx keys cannot be limited to certain actions, so this one is for Yappr alone; switching it off in Telnyx stops Yappr's calls from the account at once — and, once numbers are configured, stops Yappr answering them.
- [ ] The account's **public key** (Keys & Credentials → Public Key). Optional but recommended: Yappr uses it to check that call events really come from their account.

The Telnyx key is a full-access credential to the customer's account: take it once, send it once, never echo it back or write it into a file or log.

**2. Connect the account.**

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Main Telnyx", "api_key": "TELNYX_API_KEY", "public_key": "TELNYX_PUBLIC_KEY"}' | jq '{id: .data.id, profiles: .telnyx.outbound_voice_profiles}'
```

Telnyx checks the key before anything is saved: `422 TELNYX_KEY_REJECTED` stores nothing (have them check the key is active and paste it again). The response lists their outbound voice profiles and apps, and a `webhook_url` — a secret, needed only if they bring their own app in the next step.

**3. Choose the Call Control App.** Default: let Yappr create one on the profile whose `allowed_destinations` cover the countries the agents call.

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts/ACCOUNT_ID/connection" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"create": {"outbound_voice_profile_id": "PROFILE_ID"}}' | jq '{connection: .data.connection, sync}'
```

Yappr creates an app named "Yappr" and never changes their profile. Alternative: `{"connection_id": "…"}` for an app they made just for Yappr, with its webhook URL set to exactly the account's `webhook_url`, a profile attached, and switched on.

**4. Sync — the numbers come in on their own.** Choosing the app runs the first sync; its summary is `sync` on that response. There is no per-number add step: `POST …/numbers` is only **Add back**, for a number the workspace removed (below). Run it again after the customer buys, ports or releases numbers in Telnyx; Yappr also syncs daily. A workspace has 48 sync runs a day, whatever starts them; continuing a run already in progress (`complete: false`) is free, and past the limit it answers `429 RATE_LIMITED`.

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts/ACCOUNT_ID/sync" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.data | {complete, seen, added, not_ready, held_elsewhere}'
```

- `complete: false` — a large account is read in parts: call it again until `true`. On the connection response the first sync's summary says `in_progress: true` instead; `sync_error` there means the sync did not run (the app is still chosen) — fix what it says and call `/sync`.
- `held_elsewhere > 0` — some of their numbers are already used by **another workspace** in Yappr (an agency or a sister brand on the same Telnyx account). Those are never taken over, and the sync does not say which workspace holds them; each is added here by the first sync after that workspace removes it (Remove from this workspace, which changes nothing in Telnyx and keeps that workspace's call history). That workspace's own syncs then skip it.
- `held_elsewhere_details[].reason` says why each kept-out number is not here: `other_workspace` (another workspace uses it — "In use by another workspace"), `own_removed` (this workspace removed it — "Removed from this workspace", with Add back until another workspace takes it) or `pending_release` (another record holds it until it lets it go: a workspace that disconnected the account and keeps its history, another connection of this workspace, or a Yappr number). Say only `other_workspace` is "in use by another workspace".
- `excluded` — numbers this workspace removed (`DELETE /carrier-accounts/ACCOUNT_ID/numbers/PHONE_NUMBER_ID`, "Remove from this workspace"). Every sync skips them so another workspace can take them. To bring one back, **Add back**: `POST /carrier-accounts/ACCOUNT_ID/numbers` with `{"number": "+972…"}` (`201`). Once another workspace on the same Telnyx account has taken it, Add back answers `409 NUMBER_ALREADY_REGISTERED` until that workspace removes it — never promise it back. A number the workspace still has as `removed` or `telnyx_gone` comes back through the same call, in place (`200`).
- Read the numbers with `GET /phone-numbers` (filter on `carrier_account.id`) and look at each `carrier_state.state`: `not_configured` (the usual start), `blocked` (a Telnyx setting in `blockers` stops it being answered — forward-all, a translated number or a tech prefix; they change it in Telnyx, then sync), `not_ready` (Telnyx status not active yet), `telnyx_gone` (Telnyx no longer lists it: "No longer in your Telnyx account"; Add back takes it back once Telnyx lists it again). A number with `is_active: false` says why in `carrier_state.notes`: `off_until_active` (not active in Telnyx, or it left and came back: the sync switches it back on once Telnyx lists it as active — nothing to do), `off_while_paused` (the account paused: `reactivate` switches it back on) or `off_by_owner` (an owner or admin switched it off: it stays off until an owner or admin switches it back on; a sync or `reactivate` never does).

**5. Assign agents.** Like any number: `outbound_agent_id` to call out from it, `inbound_agent_id` (and optionally `inbound_split`) to answer it — `PATCH /phone-numbers/PHONE_NUMBER_ID`. Calls out work immediately. An inbound agent does nothing until step 6: calls to the number still ring wherever they ring in Telnyx.

**6. Configure the numbers the agent should answer** — only with the customer's go-ahead, per number. This changes **one setting** in their Telnyx account: the number's connection moves to the account's app, so its calls come to Yappr. First send the request once without `confirm` (an empty body): nothing changes, and the `400 CONFIRM_REQUIRED` answer carries `warnings`, read live from their Telnyx account — `connection_change` (its calls leave `current_connection_name`), `number_recording`, `forwarding_on_failure`, `call_screening`, `voicemail`. `current_connection_name: null` is no connection **or** already on Yappr's app: the number's `carrier_state.state` says which (`ready` is on Yappr's app). Then tell them in plain words:

- Calls to that number stop reaching `carrier_state.current_connection_name` (their office system or PBX) and the inbound agent answers instead. **Until it has an inbound agent, callers are turned away.**
- Their callers now depend on Yappr: credit, the workspace's call time windows and Yappr's capacity apply, and a call Yappr turns away does **not** go on to the old connection. For a main business line, suggest trying a second number first and keeping credit topped up.
- Messaging, emergency address, CNAM, tags and calls out from their own phone system are untouched. The ask-first `warnings` list the number's own Telnyx settings that stay on — `number_recording` means every call would be recorded and billed twice (they can turn it off in Telnyx), and `voicemail` that Telnyx voicemail stays on.
- They can undo it any time ("Stop answering here").

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts/ACCOUNT_ID/numbers/PHONE_NUMBER_ID/configure" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}' | jq '{state: .data.carrier_state.state, warnings}'
```

`state: "ready"` means calls to it now reach the agent. `409 VOICE_NOT_READY` means Yappr can't answer carrier numbers at this moment (retry in a few minutes); `422 NUMBER_FORWARDS_ALL_CALLS` / `NUMBER_HAS_TRANSLATED_NUMBER` / `NUMBER_HAS_TECH_PREFIX` mean a Telnyx setting blocks it (the number reads `blocked`); `409 NUMBER_NOT_READY` means Telnyx doesn't list it as active yet. Every refusal leaves their Telnyx account unchanged.

**Undo — Stop answering here.** `DELETE /carrier-accounts/ACCOUNT_ID/numbers/PHONE_NUMBER_ID/configure` puts the number back on `carrier_state.previous_connection_name` (or none). `409 PREVIOUS_ROUTING_GONE` means that connection no longer exists: the customer picks one in Telnyx (Numbers → My Numbers). To hand every configured number back and disconnect in one go, `DELETE /carrier-accounts/ACCOUNT_ID?restore_routing=true` (up to 50 numbers a call; a `409 CARRIER_ACCOUNT_HAS_CONFIGURED_NUMBERS` carries `restore` with what failed and what remains — call again or fix those in Telnyx). After a disconnect, numbers with call history stay in `GET /phone-numbers` as `removed` (their `carrier_account.status` is `disconnected`) and the dashboard shows them "Removed from this workspace" — they may still be in Telnyx; connecting the account again brings back the ones Telnyx still lists, switched back on once Telnyx lists them as active, except one an owner or admin had switched off (`off_by_owner`): it comes back switched off. Add back (`POST /carrier-accounts/NEW_ACCOUNT_ID/numbers` with the number) takes a kept one back in place (`200`) as soon as that account's Telnyx lists it.

**7. Test.** `POST /carrier-accounts/ACCOUNT_ID/test` places no call, checks the key, the app and the profile (its `detail` lists the allowed countries), and syncs. Fix any failed check in Telnyx and test again.

**8. Use and verify.** Numbers work as `from` on `POST /calls`, a campaign's `from_phone_number_id`, or an agent's outbound number. For a configured number, one real call **to** it should reach the inbound agent and appear in `GET /calls` as `direction: "inbound"` with its `carrier_account`. The account reads `untested` until the first answered call, then `active`. Every call on the account also carries `carrier_call_id` — the `call_control_id` Telnyx gave it — to match the call against the customer's own Telnyx records (Yappr does not see their Telnyx bill); `GET /calls/export?carrier_account_id=…` writes it in the `Carrier call ID` column.

**9. Watch for a pause.** `GET /carrier-accounts/ACCOUNT_ID` → `status: "paused"` switches every number off for calls out, so campaigns stop and `POST /calls` from those numbers answers `400 INVALID_FROM_NUMBER`. Only a refused key or a missing app pauses at once; any other refusal (a country the profile does not allow, one bad destination, a caller ID Telnyx will not present) counts once, and five in a row pause it. **What it means for calls to configured numbers:** a pause for refused calls (`carrier_rejections`) leaves them answered; `key_rejected` or `connection_invalid` means Yappr can't answer them either — urgent for the customer. Read `pause_reason` and `last_error`, fix the cause in Telnyx, then `POST /carrier-accounts/ACCOUNT_ID/reactivate` — it tests (and syncs) first and answers `422 CARRIER_TEST_FAILED` with the checks still failing. It switches back on only the numbers the pause switched off (`off_while_paused`); an `off_by_owner` number stays off.

**A call refused before it rings.** On a workflow agent `POST /calls` has already answered `202`: the call request ends `failed` with `error_code` `request_failed` (read it with `GET /call-requests/{id}`) and its call is `failed`. A follow-up's body carries no reason. (`422` with the reason in `error`, and `call.failed` with `data.error_reason` from the queue, are what an agent not yet on the workflow engine gets.) Make sure the caller's code reads the request's outcome.

**Pre-launch checklist for carrier accounts:** all the standard items in Step 5.2 still apply, plus:

- [ ] `POST /carrier-accounts/{id}/test` returns `ok: true`, and the profile's allowed countries cover every destination
- [ ] The last sync is `complete: true`, and every number the customer expects is in `GET /phone-numbers` (none of theirs in `held_elsewhere` by surprise)
- [ ] Every number used for calls out shows `ownership_verified_at` set and `is_active: true`
- [ ] Every number that should be answered has an inbound agent and `carrier_state.state: "ready"`, and the customer agreed to the change for each one (and knows about any `number_recording` note)
- [ ] One real call from a carrier number was answered, and one real call to each configured number reached the agent
- [ ] The customer knows Telnyx bills the phone minutes, where to turn the account back on (Phone numbers → Your carrier) if it pauses, and how to stop answering a number (its page → Stop answering here)

### Step 5.2 — Pre-Launch Checklist

Before telling the user they're live, verify each item:

- [ ] Agent exists and `is_active: true` (GET /agents/:id)
- [ ] The workflow is published (`published_workflow_revision_id` is set). There is no `end_call` tool to attach — ending the call is intrinsic (Step 1.8)
- [ ] All tools created, bound in the workflow document, and tested (`POST /tools/:id/test`; a real test that reached the endpoint shows in `GET /deliveries?source=test`)
- [ ] `GET /billing` → `monthly_budget_reached` is `false`, or outbound calls will answer `402 SPEND_BUDGET_REACHED`
- [ ] Phone number is active (or pending regulatory approval with explanation)
- [ ] Phone number is assigned to the correct agent(s)
- [ ] Billing balance is above $5 (GET /billing)
- [ ] An After trigger + HTTP tool is bound and published for each post-call event the customer needs (PHASE 4)
- [ ] `call.no_answer` and `analysis.ready` are among the triggered events, if post-call automation is needed
- [ ] Any custom variables used in the instructions are documented — caller must supply them at call creation time
- [ ] Dispositions needed for routing are created

### Step 5.3 — Test the Agent

Two options — offer both:

**Option A: Web Call (recommended — no phone needed)**

```
https://app.goyappr.com/he/agents/AGENT_ID
```

Direct link to the agent's page in the Yappr dashboard. On its Test tab, press "Start test
call" to speak with the agent in the browser — this needs a **published** workflow; an
unpublished agent's Test tab offers "Publish now" / "Go to the workflow" instead of a call, so publish first
(`POST /agents/:id/workflow/publish`, Step 1B.4) if it is not live yet. To rehearse the
same way without a browser click, mint a session with `POST /calls {"type":"web"}` (see
**PHASE 3B** above) or hand out a `POST /shared-links` page. **Do not** reach for
`POST /agents/:id/flow/test` to rehearse a workflow agent — it is the retired flow
simulator and answers `409 WORKFLOW_FLOW_TEST_UNSUPPORTED` for every agent this skill
creates: rehearsing a workflow agent needs a browser or a Web SDK client, and there is no
text-only rehearsal over the API (see **Flow agents — retired** in `yappr-api.md`). A
server with no browser can still check what the agent collects
(`POST /agents/:id/extraction/dry-run`) and each tool (`POST /tools/{id}/test`).

**Option B: Phone Call (rings the user's own phone; no purchased number needed)**

Check for custom variables in the instructions. Any `{{VariableName}}` not in the reserved list (`CallerPhone`, `CurrentDate`, `CurrentTime`, `CurrentDateTime`, `CallDirection`, `Timezone`) must be supplied as test values.

```bash
IDEMPOTENCY_KEY=$(python3 -c 'import uuid; print(uuid.uuid4())')
curl -s -X POST "https://api.goyappr.com/agents/AGENT_ID/test-call" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+972XXXXXXXXX",
    "variables": {
      "LeadName": "ישראל",
      "AvailableSlots": "יום שני 10:00, יום שלישי 14:00"
    }
  }'
```

There is no `from`: Yappr calls from one of the workspace's numbers, or from a Yappr test line when it has none (`GET /agents/AGENT_ID/test-call` says which). It needs `calls:create`, is billed as an ordinary outbound call (`source: "test"`), and answers `202` with a `request_id`: poll `GET /call-requests/{id}` until `call_id` is set, then read `GET /calls/{id}`. `409 WORKFLOW_UNPUBLISHED` means publish first.

### Step 5.4 — Monitoring

After launch, check recent calls:

```bash
curl -s "https://api.goyappr.com/calls?limit=20&agent_id=AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '[.data[] | {id, status, direction, duration_seconds, disposition}]'
```

If the user reports the agent cutting callers off → increase `vad_stop_secs` (PATCH /agents/:id; an agent on `gpt-live` does not read the VAD fields)
If the agent responds too slowly → decrease `vad_stop_secs`
If the agent triggers on background noise → increase `vad_confidence`

---

## PHASE 6 (optional): Campaigns — Bulk Outbound Dialing

**Run this phase only when the user wants a list dialed for them** — "call these 800 leads", "run a renewals campaign", "dial my CSV until someone answers", "retry no-answers three times over two days". For one-off or event-driven calls, stay with Phase 3 (`POST /calls`).

A campaign is a **managed dialer over your leads**: you enroll contacts, arm stop rules, set pacing, and launch. The platform then hands eligible contacts to the ordinary outbound queue, minute by minute, until every contact has stopped or run out of attempts. Full endpoint reference: [yappr-api.md — Campaigns](yappr-api.md).

Three things to say to the user before you build one, because they surprise people:

1. **A campaign call is an ordinary outbound call** — same queue, same weight, same billing as `POST /calls`. Pacing controls only how fast the campaign *hands calls in*; it never gets priority, and it never bypasses the do-not-call list, business hours, the credit floor, or the concurrency cap.
2. **A number can be dialed by one active campaign at a time**, workspace-wide. Two overlapping lists will not double-call the same person.
3. **Nothing dials until you explicitly launch.** `POST /campaigns` always creates a `draft`.

### Prerequisites (check these first — they are the launch preflight)

| Requirement | How to check |
|---|---|
| An agent, with a **positive** `max_call_duration_secs` | `GET /agents/:id` — `0` means the agent has no cap of its own, so each call can run to the platform's 65-minute limit; campaigns refuse it, because that worst case is far above any budget |
| An active from-number | `GET /phone-numbers` — needs `is_active: true` and `status: "active"` |
| A reachable workspace calling window | `GET /call-windows` — this is the schedule the campaign obeys; confirm its `timezone` too (set it with `PUT /call-windows`) |
| Credit above the call floor | `GET /billing` |
| A compliance basis the user can attest to | Ask (see Step 6.4) |
| An agent that does **not** depend on per-contact custom `{{Variables}}` | A campaign's `variables` are the same on every call it places, except `{{FirstName}}` and `{{FullName}}`, which each call fills from its contact's own name (the campaign's value is only what a contact with no name hears). Any other per-contact value, like a custom `{{AvailableSlots}}`, cannot vary by contact. Built-ins (`{{CurrentDate}}`, `{{CallerPhone}}`, `{{Timezone}}`, …) still work, and per-contact context belongs in the lead's memory (`notes` at enroll → `long_term_context`). If the prompt genuinely needs per-lead pre-fetched values, dispatch with Phase 3 Pattern 2/3 instead of a campaign |

### Step 6.1 — Create the draft

Name is the only field required to create. `stop_disposition_ids` is **the one field with a default**: left out, the draft stops on the suggested outcomes (`GET /campaigns/defaults`, Interested included); `[]` arms none. Every other field you leave out stays `null`, and launch refuses with `422 CAMPAIGN_NOT_READY` naming it. Pass what you already know now; every field is PATCH-able later, and Steps 6.3–6.4 fill the rest.

```bash
curl -s -X POST "https://api.goyappr.com/campaigns" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "March renewals",
    "description": "Existing customers, renewal due in April",
    "agent_id": "AGENT_ID",
    "from_phone_number_id": "PHONE_NUMBER_ID"
  }' | jq '{id, status, name, from_number}'
```

`from_phone_number_id` is optional: leave it out and the campaign calls from the agent's own number (the number the agent is the outbound agent of, else the one it answers on); `from_number` in the answer is the number it will call from. An agent with no number and no `from_phone_number_id` is refused with `400 CAMPAIGN_REQUEST_INVALID` (`invalid_from_number` at `/from_phone_number_id`): give the agent a number with `PATCH /phone-numbers/:id` (`outbound_agent_id`), or send the number to call from.

Save the returned `id` into the Phase 0 `EXISTING RESOURCES` block. `status` is `draft` — guaranteed, not incidental.

- Names are **not** unique: a name another campaign already uses is accepted (`201`), so a retried create makes a second draft. `GET /campaigns` first and PATCH the existing draft rather than minting a near-duplicate — this is the create-vs-edit gate again. Tell campaigns apart by `id`.
- `400` naming a field → the writable allowlist is strict, and **unknown or read-only keys are rejected, never ignored**. If you sent `status`, `spent_cents`, or a misspelling like `stop_dispositions`, fix the key and retry.

### Step 6.2 — Enroll contacts

Two inputs, usable in the same request, capped at **1,000 contacts per request** (send several requests for a bigger list). Enrolling works on a `draft` **and** on a `running` campaign — you can top up a live list.

**From existing leads** (use this when the leads are already in Yappr, e.g. imported earlier or created by a lead-source integration):

```bash
# Resolve ids first. GET /leads filters by tag name (?tag=) or id (?tag_id=), plus
# limit/offset/search. An unknown tag is 404 LEAD_TAG_UNKNOWN, never an empty page.
curl -s "https://api.goyappr.com/leads?tag=Renewal&limit=100" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq -r '[.data[].id]'

curl -s -X POST "https://api.goyappr.com/campaigns/CAMPAIGN_ID/leads" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"lead_ids": ["LEAD_ID_1", "LEAD_ID_2", "LEAD_ID_3"]}' | jq .
```

**From raw phone numbers** (use this for a CSV or a list the user pasted — leads are created or matched for you):

```bash
python3 -c "
import json
payload = {'phone_numbers': [
    {'phone': '0501234567', 'name': 'ישראל כהן', 'notes': 'Renewal due 12 April, prefers mornings'},
    {'phone': '+972521234567', 'name': 'Dana L.', 'email': 'dana@example.com'},
    '0539876543'
]}
with open('/tmp/enroll.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False)
"
curl -s -X POST "https://api.goyappr.com/campaigns/CAMPAIGN_ID/leads" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/enroll.json | jq .
```

Each item is `{phone, name?, email?, notes?}` or a bare string. Numbers are canonicalized before anything is written, so `0501234567` and `+972501234567` are the same person and cannot be enrolled twice. `notes` becomes that lead's long-term memory (injected into the agent's prompt on the call) — a genuinely useful place for "renewal due 12 April".

**Always read the report back to the user.** The response is itemized, never a bare success:

```json
{ "enrolled": 412, "already_enrolled": 3, "leads_created": 380, "leads_matched": 35,
  "invalid_phone": [ { "phone": "05012" } ], "on_do_not_call": ["+972501234567"],
  "not_found": [], "total_leads": 1042 }
```

- `on_do_not_call` — excluded at enroll time. Say so explicitly: these people will not be called, and that is correct.
- `invalid_phone` — unparseable numbers. Show the samples so the user can fix their list.
- `already_enrolled` — re-enrolling is idempotent, so a sync script can be naive.
- `in_another_campaign` / `results[]` — enrolment never refuses the batch. A number another live campaign is calling comes back in `in_another_campaign[]` with `campaign_id` and `campaign_name`, and in `results[]` (one entry per number: `enrolled`, `already_enrolled`, `in_another_campaign`). Tell the user which campaign holds each one. A draft holds no number; launching a draft retires contacts another campaign took meanwhile (`stop_reason: in_another_campaign`).

### Step 6.3 — Pick stop rules by disposition **id**

This is the most consequential configuration step and the easiest to get wrong. A stop rule answers: *"once we learn this about a contact, stop calling them."*

Read the workspace's outcomes first:

```bash
curl -s "https://api.goyappr.com/dispositions" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | {id, label, is_protected}]'
```

Then arm the set **by id**:

```bash
curl -s -X PATCH "https://api.goyappr.com/campaigns/CAMPAIGN_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "stop_disposition_ids": ["DO_NOT_CALL_ID", "NOT_INTERESTED_ID", "WRONG_NUMBER_ID", "APPOINTMENT_SET_ID", "INTERESTED_ID"],
    "stop_on_no_answer": false,
    "stop_on_voicemail": true,
    "stop_on_unclassified": false,
    "max_attempts": 3
  }' | jq '{stop_disposition_ids, stop_on_voicemail, max_attempts}'
```

**Why ids and not labels.** Labels are per-workspace text and are renameable; ids are stable. A stop set stored by label would silently disarm the moment somebody renamed "Not Interested". The API only accepts ids, and every id must belong to this workspace (otherwise `400`).

**Keep `Interested` in the stop set.** Left out, a lead who said yes is dialled again up to `max_attempts` — the worst call to repeat. Stop on it and hand the lead over with a follow-up on the outcome (After triggers, Phase 4). A create that sends no `stop_disposition_ids` already stops on it, and `GET /campaigns/defaults` includes it — so when you send your own set, keep it in.

**`No Answer`, `Failed`, `Voicemail` and `Unclassified` cannot go in `stop_disposition_ids`.** The platform assigns them by itself — `No Answer` on every unanswered ring, `Failed` on every dial that did not go through, `Voicemail` and `Unclassified` even on a call someone answered — so in a stop set one would retire the contact the first time it lands, before any retry. The API refuses them: `400 CAMPAIGN_REQUEST_INVALID`, naming each outcome and the switch to use, and nothing is written. Use the booleans instead, which are evaluated on the call's **outcome class** rather than its label:

| Instead of putting this in the stop set | Use |
|---|---|
| `No Answer` | `stop_on_no_answer: true` (usually `false` — normally you *want* to retry an unanswered call) |
| `Voicemail` | `stop_on_voicemail: true` |
| `Unclassified` | `stop_on_unclassified` — `false` retries the contact, `true` retires it |
| `Failed` | nothing — a failed dial is retried until `max_attempts`; a call that never went out at all is retried on the separate `max_infra_retries` budget and never uses an attempt |
| "we reached a human, we're done" | a disposition of your own for that outcome (`POST /dispositions`), its id in `stop_disposition_ids` — there is no built-in human-connect rule |

A launch needs at least one stop rule — a non-empty `stop_disposition_ids`, or `stop_on_no_answer` or `stop_on_voicemail` set to `true`. A create that leaves `stop_disposition_ids` out arms the suggested set: every outcome the workspace has except Callback Requested and the four Yappr assigns (No Answer, Voicemail, Unclassified, Failed) — Interested, Appointment Set, Not Interested, Issue Resolved, Transferred to a Person, Wrong Number, Do Not Call, and every outcome the workspace created; `[]` arms none. To go back to it after `[]`, `PATCH` the ids `GET /campaigns/defaults` returns (`null` is refused). The three booleans have no default: send all three. A campaign whose whole point is "keep calling until they book" should arm the real outcome set, or people who already said no will be redialled until the attempt cap.

**Two independent stop conditions, whichever fires first:** `max_attempts` and the stop set. Everything that isn't a stop outcome retries after `retry_completed_seconds`, and an unanswered call retries after `retry_no_answer_seconds`.

### Step 6.4 — Configure pacing and the compliance basis

```bash
curl -s -X PATCH "https://api.goyappr.com/campaigns/CAMPAIGN_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "regulatory_basis": "existing_customer",
    "max_calls_per_day": 150,
    "min_seconds_between_calls": 45,
    "max_in_flight": 2,
    "max_attempts": 3,
    "max_infra_retries": 3,
    "retry_no_answer_seconds": 900,
    "retry_completed_seconds": 14400,
    "randomize_retry_time": false,
    "double_dial_enabled": false,
    "double_dial_gap_seconds": 90,
    "budget_cents": 5000
  }' | jq '{regulatory_basis, max_calls_per_day, max_in_flight, budget_cents}'
```

| Control | Sensible starting point | Why |
|---|---|---|
| `max_calls_per_day` | 150–200 | Resets on the workspace's own calendar day |
| `min_seconds_between_calls` | 30–60 | Spacing between admissions |
| `max_in_flight` | 2 (max 8) | How many attempts this campaign may have outstanding. It is **self-restraint, not a capacity grant** — the platform's shared outbound lanes are the real ceiling, so raising it does not make the campaign faster once the queue is busy |
| `max_attempts` | 3 | Per-contact dial cap |
| `retry_no_answer_seconds` | 900 | Redial gap after nobody picks up |
| `budget_cents` | the amount the user is comfortable spending | Enforced against spend **plus** in-flight reservations, so a campaign can't blow the cap with calls already dialing. The workspace's own monthly limit (`PATCH /billing`) is a different number and can also pause the campaign as `paused_budget` |
| every other configuration field | send it | None has a default — `max_infra_retries`, `randomize_retry_time`, `double_dial_enabled`, `double_dial_gap_seconds` included; launch names any still `null` |

**`regulatory_basis` is required before launch** — one of `lawful_basis_confirmed` (a single attestation that there is consent or another lawful basis for everyone on the list — what the dashboard records), `consent`, `existing_customer`, `non_marketing`, `registry_screened`. Ask the user which is true; do not pick for them. It is recorded on the launch audit event with the enrolled count, and it is the artefact that exists if anyone later asks why a person was called.

**When the campaign may dial** is bounded by the workspace call windows (`GET`/`PUT /call-windows`). A campaign's own `calling_window` (`{tz, days, start, end}` — `tz`, an IANA zone name, is required once any of the others is set) can narrow those hours for this one campaign, never widen them.

### Step 6.5 — Launch

```bash
curl -s -X POST "https://api.goyappr.com/campaigns/CAMPAIGN_ID/launch" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '{status, error, message, started_at}'
```

`200` with `status: "running"` means it's live. A `422` means nothing changed and one specific thing is missing — see the preflight table below. Fix it and re-launch; there is no partial launch state.

### Step 6.6 — Poll `/stats` and interpret `last_tick_result`

The pacer ticks **once a minute**, so poll every 30–60s. Anything faster tells you nothing new.

```bash
curl -s "https://api.goyappr.com/campaigns/CAMPAIGN_ID/stats" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '{status, last_tick_result, last_error, calls_today, max_calls_per_day,
         attempts_in_flight, leads_by_status, spent_cents, budget_cents}'
```

`leads_by_status` is your progress bar; `last_tick_result` is the machine-readable answer to **"why is nothing happening right now"**. Translate it for the user instead of showing the raw token:

| `last_tick_result` | What to tell the user | Action |
|---|---|---|
| `admitted` | Calls are going out | none |
| `no_eligible_leads` | Everyone is either done or waiting for their next retry slot | none — check `leads_by_status` |
| `spacing` | Pacing gap between calls | none (lower `min_seconds_between_calls` to speed up) |
| `max_in_flight` | The campaign's own concurrency cap is full | none; raising it rarely helps |
| `daily_cap_reached` | Today's cap is used up; resumes tomorrow | raise `max_calls_per_day` if they want more today |
| `outside_call_window` | Outside business hours; resumes at the next opening | check `GET /call-windows` if the hours look wrong |
| `no_reachable_call_window` | No calling hours are configured at all → status `paused_config` | fix `PUT /call-windows`, then `resume` |
| `insufficient_credit` / `no_billing_account` | Balance too low → status `paused_insufficient_credit` | top up; **it resumes by itself** |
| `credit_reserve_would_breach_floor` | Balance can't cover the next call's worst case | top up |
| `budget_exhausted` | The campaign's own budget cap is reached → `paused_budget` | raise `budget_cents`, then `resume` |
| `from_number_unavailable` | No number to call from (the named number went inactive, or none is named and the agent has no number) → `paused_config`; `last_error` says which | assign an active number (or give the agent one), then `resume` |
| `agent_has_no_duration_cap` | The agent's max call duration was set to `0` (no cap of its own) → `paused_config` | set a positive `max_call_duration_secs`, then `resume` |
| `platform_admission_disabled` | The platform paused new campaign admissions; in-flight calls continue | wait; report it if it persists |
| `resumed_credit_ok` | Auto-resumed after a top-up | none |
| `completed` | Every contact is done | report the outcome breakdown |
| `error` | The tick errored — read `last_error` | report it (see Reporting Issues) |

To report outcomes, pull the contact list and, for detail, the calls themselves:

```bash
curl -s "https://api.goyappr.com/campaigns/CAMPAIGN_ID/leads?status=completed_success&limit=50" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | {phone: .to_number_e164, name: .lead.name,
                    outcome: .last_disposition.label, attempts: .attempt_count}]'
```

### Step 6.7 — Pause, resume, stop, archive

```bash
curl -s -X POST "https://api.goyappr.com/campaigns/CAMPAIGN_ID/pause"  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .status
curl -s -X POST "https://api.goyappr.com/campaigns/CAMPAIGN_ID/resume" -H "Authorization: Bearer $YAPPR_API_KEY" | jq .status
curl -s -X POST "https://api.goyappr.com/campaigns/CAMPAIGN_ID/stop"   -H "Authorization: Bearer $YAPPR_API_KEY" | jq .status
curl -s -X DELETE "https://api.goyappr.com/campaigns/CAMPAIGN_ID"      -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Find one person on this campaign by the number you know — any format, or 3+ digits of it
curl -s "https://api.goyappr.com/campaigns/CAMPAIGN_ID/leads?phone=050-123-4567" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.data[] | {lead_id, status, stop_reason}'

# Remove one person from this campaign (addressed by lead_id, terminal)
curl -s -X DELETE "https://api.goyappr.com/campaigns/CAMPAIGN_ID/leads/LEAD_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

- `pause` is a **manual** pause and stays paused through a top-up — only `paused_insufficient_credit` auto-resumes. Resuming is explicit.
- `stop` is terminal and excludes every not-yet-dialed contact. Calls already in flight finish and still bill.
- `DELETE /campaigns/:id` archives: the campaign disappears from `GET /campaigns` and all live contacts are retired. **Confirm with the user first.** It comes back only partly: `GET /campaigns?status=archived` finds it and `POST /campaigns/:id/restore` brings it back — as a `draft` with its retired contacts `pending` again if it never launched, but as `stopped` (never dialled again) if it did. Prefer `pause` or `stop` when they just want the dialing to end.
- **The stop set is copied when the campaign is created:** an outcome added to the workspace later stops only campaigns created after it. To add it to an existing campaign, `PATCH /campaigns/:id` its `stop_disposition_ids` from `GET /campaigns/defaults` (take any "call me back" outcome out first). Deleting an outcome takes it out of every campaign's stop set; it is refused (`409 DISPOSITION_IN_USE`) only for a launched campaign it is the sole way to stop.
- **A campaign with its own opening line**: duplicate the agent, `PATCH` the copy's `greeting_message`, publish, switch it on, then `PATCH /campaigns/:id {"agent_id": "<copy id>"}`. `{{FirstName}}` is the first word of the contact's name, so use `{{FullName}}` for a household ("משפחת כהן").
- Excluding a contact removes them **from this campaign only**. To suppress a person everywhere, add them to the do-not-call list (`POST /do-not-call`).

### Failure modes you will actually hit

**`422 CAMPAIGN_NOT_READY` on launch/resume.** One blocking cause per response, in `message`. Nothing changed; fix and re-launch.

| Message | Fix |
|---|---|
| Assign an agent before launching | `PATCH` with `agent_id` |
| The agent on this campaign has no phone number to call from… | `PATCH /phone-numbers/:id` with `outbound_agent_id`, or `PATCH` the campaign with `from_phone_number_id` |
| `regulatory_basis` is required before launching | `PATCH` with `lawful_basis_confirmed` / `consent` / `existing_customer` / `non_marketing` / `registry_screened` — ask the user which is true |
| Finish configuring the campaign before launching. Not set: … | `PATCH` every field it names — none of them has a default (only `stop_disposition_ids` does) |
| Configure at least one stop rule before launching | A non-empty `stop_disposition_ids`, or `stop_on_no_answer` / `stop_on_voicemail` set to `true` |
| The assigned agent no longer exists | Point `agent_id` at a live agent (`GET /agents`) |
| An agent on this campaign has no maximum call duration set | `PATCH /agents/:id` with a positive `max_call_duration_secs` on every agent the campaign calls with, the A/B test's second agent included — `0` = no cap of the agent's own (only the platform's 65-minute limit), which campaigns refuse because that worst case is far above any budget |
| The second agent on this campaign's A/B test is not available | Point `split.agent_id` at an active agent in this workspace, or send `"split": null` |
| The phone number assigned to this campaign is no longer active | Pick a number with `is_active: true` and `status: "active"` |
| This workspace has no upcoming calling window | `PUT /call-windows` — windows, and the workspace `timezone` if it is wrong, in the same request |
| Enroll at least one contact before launching | `POST /campaigns/:id/leads` — and check the enroll report: everything may have been filtered as DNC or invalid |

**`in_another_campaign` on enroll.** A number can only be dialed by one campaign at a time, workspace-wide — the guard that stops the same person being called twice as fast. Enrolment never refuses the batch for it: each such number is reported in `in_another_campaign[]` with the `campaign_id` and `campaign_name` that holds it, and everyone else is enrolled. To move those contacts here, finish or stop the other campaign, or exclude them there, then enroll again. `409 CONFLICT` on launch means another campaign took one of the draft's contacts at the same instant — nothing changed; launch again and that contact is skipped.

**`paused_insufficient_credit` auto-resumes; `paused` does not.** When the balance falls under the floor the campaign parks itself as `paused_insufficient_credit` and the tick re-checks every minute — after a top-up (checkout, auto-topup, or credit added by an admin) it returns to `running` on its own, with `last_tick_result: "resumed_credit_ok"`. Do not call `launch` in a loop, and do not tell the user to relaunch. Every **other** paused state (`paused`, `paused_budget`, `paused_infra`, `paused_config`) needs an explicit `resume` after the cause is fixed — deliberately, so a human pause is never undone by a payment. Read `pause_reason` (on the campaign and `/stats`) to know where the fix is: `campaign_budget` → raise `budget_cents`; `workspace_spend_limit` → raise the monthly limit (`PATCH /billing`); `call_placement_failures` (`paused_infra`) → one contact's call failed to go out more than `max_infra_retries` times, nobody lost their place, resume once calls go out; `configuration` (`paused_config`) → fix the setting `last_tick_result` names.

**`awaiting_disposition` means "wait", not "stuck".** Outcomes are classified asynchronously after the call ends — usually within seconds, occasionally much later. A contact sits in `awaiting_disposition` until its outcome arrives, however long that takes — there is no timeout that decides without one, and only that contact waits while the campaign keeps calling everyone else. When the outcome that arrives is `Unclassified`, `stop_on_unclassified` decides whether to retire or retry it. **Never redial a contact in this state** and never "help" by placing a `POST /calls` to that number: the platform is deliberately holding it, and a manual dial can call somebody who already asked you to stop. If a user reports "it's stuck", check `attempts_in_flight` and `last_tick_result` before concluding anything.

**Other errors:** `400` naming a field means the writable allowlist rejected a key or a value range — fix the request, never work around it by re-creating the campaign. `400 Campaign is completed/stopped/archived` means you're editing a terminal campaign; create a new one.

**Parsing campaign errors.** `422 CAMPAIGN_NOT_READY` carries the code in `code` (repeated in `error`) and the human text in `message` — `{"error": "CAMPAIGN_NOT_READY", "code": "CAMPAIGN_NOT_READY", "message": "Assign an agent before launching"}`. Branch on `code`, and always surface `message` to the user — it names the one thing to fix.

### Report it like this

When a campaign is live, tell the user: how many contacts enrolled (and how many were excluded as DNC/invalid), the stop rules in plain language ("we stop calling someone once they book or say no"), the pace ("up to 150 calls a day, one every 45 seconds, within your 09:00–19:00 hours"), the spend cap, and how they'll know it's done. Then verify with `GET /campaigns/:id/stats` and quote the real numbers back — never just the launch response.

---


## Managing Existing Resources

When a user asks to change, view, or manage something — always fetch and present the options first, then act on their selection. Never ask them to provide an ID manually.

### Agents

```bash
# List agents
curl -s "https://api.goyappr.com/agents" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | {id, name, voice, language, is_active}]'

# Get full config
curl -s "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Patch ordinary settings only (voice, model, language, greeting_message, is_active,
# call guards, VAD, extraction_parameters, ...) — only changed fields. The instructions,
# conversation graph, tools and follow-ups are the workflow document: GET/PUT
# /agents/AGENT_ID/workflow, then validate and publish. On a workflow agent (every new
# agent and every converted one) a PATCH naming system_prompt, type, flow_config, tools or
# webhook_url/webhook_events/webhook_headers is refused (400
# WORKFLOW_SETTINGS_REQUEST_INVALID, each field named in issues[]).
curl -s -X PATCH "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"voice": "Maya"}'

# Archive (irreversible — to pause an agent instead, PATCH {"is_active": false})
curl -s -X DELETE "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

### Tools

```bash
# List workflow tools (page with next_cursor)
curl -s "https://api.goyappr.com/tools?workflow=true&limit=50" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | {id, name, kind: .workflow.kind, status: .workflow.status}]'

# Get full config
curl -s "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Patch a workflow tool: carry name, kind, both schemas and the two head tokens from a
# fresh GET, plus only what changes. Every field left out keeps its value. Inside a
# headers object you do send, null keeps a stored value and a stored header you leave
# out is removed — so list every header you want to keep.
curl -s "https://api.goyappr.com/tools/TOOL_ID" -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '{name, workflow: {kind: .workflow.kind,
          input_schema: .workflow.current.input_schema,
          output_schema: .workflow.current.output_schema,
          configuration: {headers: {"Authorization": null, "X-Client": "client-42"}}},
         expected_head_revision_id: .workflow.head_revision_id,
         expected_head_generation: .workflow.head_generation}' > /tmp/tool-patch.json
curl -s -X PATCH "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/tool-patch.json | jq '.workflow.status'

# Which agents use it, and does a rotation reach them
curl -s "https://api.goyappr.com/tools/TOOL_ID/bindings" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | {agent_name, tool_revision_policy, rotation_reaches}]'

# Test it. A workflow tool takes phase, channel, inputs and an Idempotency-Key, answers
# 202 with a test_id to poll, and is mock by default (nothing is sent)
curl -s -X POST "https://api.goyappr.com/tools/TOOL_ID/test" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"phase":"after","channel":"phone","inputs":{"order_id":"example-order"},"policy":"mock"}' | jq .

# The tools an agent uses are its workflow document's bindings —
# GET /tools?agent_id= lists legacy attachments only
curl -s "https://api.goyappr.com/agents/AGENT_ID/workflow" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.draft.document.bindings'

# To take a tool off an agent, remove its binding (and every step that names it) from the
# document, PUT it back, validate, publish. POST /tools/detach answers
# 409 WORKFLOW_TOOL_OWNER_REQUIRED on a workflow agent.

# Archive (idempotent — an already-archived tool answers 200 again). The answer names the
# agents that still use it (warnings[].code tool_in_use): they cannot publish until you
# restore it or remove their step
curl -s -X DELETE "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"

# Find an archived tool again, and put it back as it was
curl -s "https://api.goyappr.com/tools?workflow=true&status=archived" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '[.data[] | {id, name, archived_at}]'
curl -s -X POST "https://api.goyappr.com/tools/TOOL_ID/restore" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '{id, restored}'
```

### Leads

```bash
# List / search
curl -s "https://api.goyappr.com/leads?limit=20&search=john" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Create
curl -s -X POST "https://api.goyappr.com/leads" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+972501234567", "name": "John Smith", "tags": ["Hot Lead"]}'

# Update (tags replaces all)
curl -s -X PATCH "https://api.goyappr.com/leads/LEAD_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"long_term_context": "Interested in premium plan. Prefers morning calls."}'

# Soft delete
curl -s -X DELETE "https://api.goyappr.com/leads/LEAD_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

### Dispositions

```bash
# List
curl -s "https://api.goyappr.com/dispositions" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Create
curl -s -X POST "https://api.goyappr.com/dispositions" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "Qualified Lead", "color": "#22c55e"}'

# Update
curl -s -X PATCH "https://api.goyappr.com/dispositions/DISPOSITION_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "Very Interested", "color": "#16a34a"}'

# Delete (403 if protected)
curl -s -X DELETE "https://api.goyappr.com/dispositions/DISPOSITION_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

### Do-Not-Call list

Per-company suppression list. Outbound call placement (`POST /calls` and the queue dispatcher) consults this list before dialing — matched destinations get a call-log entry with `status: "dnc_blocked"` and no carrier leg / no charge. Phone numbers are normalized to E.164 before storage, so any common input format works.

Use this when an external system (CRM, compliance tool, opt-out form) needs to keep Yappr's suppression list in sync. Entries are **global** by default (every agent blocked); pass `agent_ids` to scope to specific agents only.

```bash
# List all (most recent first)
curl -s "https://api.goyappr.com/do-not-call" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Look up a single number (404 if not on list)
curl -s "https://api.goyappr.com/do-not-call?phone=+972501234567" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Add — global block (every agent)
curl -s -X POST "https://api.goyappr.com/do-not-call" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+972501234567", "reason": "Customer requested removal"}'

# Add — scoped block (only listed agents)
curl -s -X POST "https://api.goyappr.com/do-not-call" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+972501234567",
    "reason": "Don't pitch this lead from the sales agent — renewals only",
    "agent_ids": ["AGENT_ID"]
  }'

# Get by id
curl -s "https://api.goyappr.com/do-not-call/DNC_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Update — convert scoped to global
curl -s -X PATCH "https://api.goyappr.com/do-not-call/DNC_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_ids": []}'

# Update — set an auto-expiry
curl -s -X PATCH "https://api.goyappr.com/do-not-call/DNC_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"expires_at": "2026-06-10T00:00:00Z"}'

# Remove (re-addable later)
curl -s -X DELETE "https://api.goyappr.com/do-not-call/DNC_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

Gotchas worth flagging to the user:
- `phone_number` is immutable on PATCH — delete and re-add to change the number itself.
- Re-adding an existing number is idempotent (returns the existing row with HTTP 200), so a sync script can be written naively.
- `expires_at` in the past returns 400. Omit (or `null`) for a permanent block.
- A DNC-blocked call still writes a call-log entry and starts any follow-up on `request.failed` (what the old `call.dnc_blocked` webhook became) — useful for analytics, but do not double-count it as a real attempt.

---

## API Keys

**Bootstrapping needs a human first.** `api_keys:manage` — the scope that issues and
revokes keys, and reads them too — can only be granted in the dashboard, by a person, under
Settings → API keys. A key issued through `POST /api-keys` can never carry it, however much
authority the key minting it has, so there is no way to bootstrap key management purely
from code: ask the user to create one key with that scope checked, hand you its secret,
and every key after that you can mint yourself.

Once you hold a key with `api_keys:manage`, mint narrower ones from code instead of
sending the user back to the dashboard for every integration:

```bash
curl -s -X POST "https://api.goyappr.com/api-keys" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Nightly lead sync", "scopes": ["leads:read", "leads:manage"]}'
```

The secret comes back **once**, in `key` — save it before doing anything else; no later
read returns it, only `prefix` (its first 16 characters, enough to tell keys apart in a
list). `scopes` is required and has no default: a key gets exactly what you ask for, and
only a **subset** of what the calling key already holds — asking for more is
`403 API_KEY_SCOPE_ESCALATION`, naming each scope that went beyond. Add
`"expires_at": "2026-12-31T23:59:59Z"` (a date-time **with** a time zone) for a key that
should stop on its own — a contractor's, a trial client's; after it every request is
`401 EXPIRED_KEY`, and the key stays listed with its `expires_at` until revoked. A person
can change that end date later in the dashboard (**Edit scopes** → *When this key stops
working*: as it is, never, or 7/30/90/365 days out), so read `expires_at` from
`GET /api-keys` instead of remembering the one you sent.

**Rotating from code.** A name belongs to one active key (case ignored, so `Client-A` and
`client-a` clash: `409 API_KEY_NAME_TAKEN`), and there is no rename, so the replacement
needs a **new name** — e.g. a date suffix. Issue it, move the integration onto it (both keys
work meanwhile), then revoke the old one with `DELETE /api-keys/{id}` from a different key —
a key cannot revoke itself (`409 API_KEY_SELF_REVOKE`). The dashboard's **Rotate** does all
of this in one step and keeps the name; the old secret keeps working for a grace of up to
7 days, or stops at once for a leaked secret.

**`api_keys:read` is the audit scope.** It lists keys (`GET /api-keys` — names, prefixes,
scopes, `agent_ids` with each agent's name in `agents`, `last_used_at`, `expires_at`; page
it with `limit` / `offset`, and `?revoked=true` lists the revoked keys with `revoked_at`) and can neither issue nor revoke. It is **not** in the
dashboard's **Read-only** preset (that one leaves out billing, API keys and affiliates), but
it can be granted through `POST /api-keys`. A key holding neither it
nor `api_keys:manage` gets `403 INSUFFICIENT_SCOPE` on `GET /api-keys`, and so do `POST` and
`DELETE` without `api_keys:manage` — a missing scope is `403` on every route.

**A call's contact is `leads:read`'s.** A key without it reads a call's `lead` as `{id}`
alone (`GET /calls`, `GET /calls/{id}`, and a campaign contact's `lead` on
`GET /campaigns/{id}/leads`), gets an empty `Lead name` column from `GET /calls/export`, and
a name in `GET /calls?search=` matches agents only. `calls:read` still returns personal
data on its own (transcripts, summaries, recordings, both phone numbers, extracted values). The dashboard's **Standard** preset has no `leads:read` — give a key that syncs calls
into a CRM **Read** under **Leads**, or read `GET /leads/{id}` with one that has it.

**A per-client key is `agent_ids`.** Scopes say what a key may do; `agent_ids` (1–100
agent ids on `POST /api-keys`) says which agents it may do it to. Leave it out for a key
that reaches the whole workspace. Ask such a key only for scopes it can use: with
`agent_ids`, a workspace-wide scope (`agents:create`, `tools:create`, `phone_numbers:*`,
`billing:manage`, `leads:manage`, `dispositions:*` and the like) is `400
API_KEY_REQUEST_INVALID` naming each, and no key is issued. A limited key reaches only its
agents, their calls and charges, the leads they called (read only), their deliveries and
the campaigns they answer; everything the workspace shares (tools, numbers, dispositions, the do-not-call
list, calling hours, other keys) is `403 API_KEY_AGENT_SCOPED`, and naming another agent is
`403 AGENT_OUTSIDE_KEY_SCOPE`. It cannot create or duplicate agents, and `POST /calls` must
name one of its agents and call from a number one of them uses. There is no key update
(`PATCH` is `405`): change a key's scopes, agents or end date in the dashboard's
**Edit scopes**, or issue a replacement and revoke the old one.

Field-by-field reference: `yappr-api.md` → **API Keys**.

---

## Billing

```bash
# Check balance
curl -s "https://api.goyappr.com/billing" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Where the balance went: a statement with opening and closing balance, top-ups,
# refunds and one usage row per day. Days are on the workspace's clock (the dashboard's);
# a date-only `to` is that whole day there. Send timezone=UTC for UTC days; `range`
# says which window and clock were read.
curl -s "https://api.goyappr.com/billing/transactions?from=2026-09-01&to=2026-09-30" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '{summary, has_more, range}'

# A top-up row's `payment` says what the card was charged (total_charged_cents, VAT
# included), the VAT, and the invoice number when the statement holds one (a checkout
# top-up's invoice is listed by GET /billing/invoices). The same statement as the
# dashboard's Export CSV file: add format=csv.
curl -s "https://api.goyappr.com/billing/transactions?from=2026-09-01&to=2026-09-30&format=csv" \
  -H "Authorization: Bearer $YAPPR_API_KEY" -o statement.csv

# Generate Stripe Checkout link (for adding payment method)
curl -s -X POST "https://api.goyappr.com/billing/setup" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .checkoutUrl
```

For top-ups, **always get explicit confirmation** before charging:

> "Your balance is low ($X). Would you like to add $20 to your account? This will charge your saved card."

Only after explicit yes:

```bash
curl -s -X POST "https://api.goyappr.com/billing/topup" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount_cents": 2000}'
```

### Journey — invoices and billing details

Every payment — a credit top-up, an automatic top-up, a phone number's first and every
monthly charge — comes with **one invoice, emailed to the workspace's billing email when it
is paid**. Nothing to switch on per call. What the user may want is (1) the invoice to
print their business details, and (2) the invoices themselves for their accountant.

1. **Read what invoices print now** (`billing:manage`):
   ```bash
   curl -s "https://api.goyappr.com/billing/details" -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
   ```
   Before anything is set it answers the defaults: the workspace name, the owner's email,
   no address, no tax ID.
2. **Set them once, from the user's own words** (`billing:manage`). Send only the fields
   they gave; never invent a name, address or number. An Israeli VAT or company number
   (עוסק מורשה, ח.פ.) is `tax_id.type: "il_vat"`:
   ```bash
   curl -s -X PATCH "https://api.goyappr.com/billing/details" \
     -H "Authorization: Bearer $YAPPR_API_KEY" -H "Content-Type: application/json" \
     -d '{"name":"Acme Ltd","email":"books@acme.example","address":{"line1":"1 Example St","city":"Tel Aviv","postal_code":"6100000","country":"IL"},"tax_id":{"type":"il_vat","value":"000012345"}}' | jq .
   ```
   Read the saved values back in one sentence. `400 TAX_ID_INVALID` means the number is not
   valid for its type — ask the user to check it; the old one stays on. Changes print on the
   **next** invoice; issued invoices are never rewritten.
3. **List and hand over invoices** (`billing:read` is enough — a bookkeeping key never needs
   `billing:manage`):
   ```bash
   curl -s "https://api.goyappr.com/billing/invoices?limit=20" -H "Authorization: Bearer $YAPPR_API_KEY" \
     | jq '.invoices[] | {number, issued_at, kind, total_cents, status, pdf_url}'
   ```
   Follow `next_cursor` until it is `null`. Offer `view_url` / `pdf_url` as links.

Say plainly: **invoices are issued in English**, even for a Hebrew workspace (dates print day
first). The dashboard has the same two cards under Settings → Billing (owners and admins).

---

## Affiliate Program (referral reporting)

If the workspace is in Yappr's referral program, two read-only endpoints (`affiliates:read`) report what it has earned. Nothing here enrols a partner, changes a rate or sends a payout — Yappr does those; say so plainly and route the user to Yappr rather than implying they can self-serve them. Field-by-field reference: **Affiliates** in `yappr-api.md`.

```bash
# Lifetime summary + the last 12 months (months=1..60; summary stays lifetime)
curl -s "https://api.goyappr.com/affiliates/stats?months=3" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Sub-affiliates — empty on most accounts
curl -s "https://api.goyappr.com/affiliates/downline" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.data'
```

- **"How much am I owed" is `summary.outstanding_cents`**, never `earned_cents`: `earned` includes commission on revenue still inside the `hold_days` hold. A negative `outstanding_cents` means paid ahead of the hold — say it in words.
- **Read rates off the response, and never multiply revenue by them.** `commission_rate_pct` / `override_rate_pct` are today's; history keeps the rate it was earned at. Quote the earned figures.
- **A negative month is a refund or chargeback**, priced at the original rate. Keep it, and print `earned_before_window_cents` beside the months so the column adds up to `summary.earned_cents`.
- `my_direct_cents` (a partner's own spend) and `my_override_cents` (its customers' spend) are different money — name which is which.
- Show dollars, not cents, and give the whole link, never a bare `ref_code`: `https://app.goyappr.com/signup?ref=<ref_code>`.

---

## Skill Scope

This skill covers: agents, tools, phone numbers (including SIP endpoints: calls from the customer's own phone system, Step 5.1b; and calling from and answering the customer's own Telnyx numbers, Step 5.1c), calls, dispositions, leads, lead tags, shared links, billing, and affiliate/referral reporting (read-only).

Out of scope: outbound calls through the customer's own SIP trunk (distinct from SIP endpoints, Step 5.1b, which bring calls in, and carrier accounts, Step 5.1c), team/user management, WhatsApp directly (only via webhook to an external service), model training, buying non-Israeli phone numbers (a number in the customer's own Telnyx account may be any country's, Step 5.1c), and affiliate enrolment, commission rates or payouts (the API reports them; only Yappr sets them).

If a request is out of scope, say so clearly and offer the developer consultation link: **https://cal.com/yappr/skill-dev-consultation**

Offer the consultation whenever the user has tried something 2+ times without success, expresses confusion or frustration, or asks for help.

---

## Error Handling

For exact error codes and HTTP status meanings, see `yappr-api.md`. Quick reference:

| Status | Meaning |
|--------|---------|
| 400 | Bad request — check field names and values. A `400`/`422` names every problem at once in `issues[]` (`{code, path, message}`); `error` is the first with a count of the rest |
| 401 | The key itself was not accepted (`MISSING_KEY`, `INVALID_KEY`, `EXPIRED_KEY`) — fix the key |
| 402 | Billing — add balance (`BILLING_ERROR`), add a card before buying a number (`PAYMENT_METHOD_REQUIRED` on `POST /phone-numbers/purchase`), or the workspace's own monthly spending limit is reached (`SPEND_BUDGET_REACHED` — raise it with `PATCH /billing`, or it lifts on the 1st) |
| 403 | `INSUFFICIENT_SCOPE` on every route — the key is fine but lacks the scope the message names; widen it, never rotate it. Also a resource that is protected or in another workspace |
| 404 | `AGENT_NOT_FOUND` — that agent is not in this workspace |
| 410 | Gone for good — never retry it. `AGENT_LEGACY_CREATION_GONE`: the `POST /agents` body asked for a prompt or flow agent (`system_prompt`, `type`, `flow_config`, `tools`, `webhook_*` …); send `name` and `workflow.global_instructions` or a `template` instead. `ENDPOINT_RETIRED`: `GET`/`DELETE /integrations` (the native Google connection); connect Google Calendar or Gmail as a connected app (`POST /tool-connections`) |
| 429 | Rate limit (60 requests per minute per API key — wait the `Retry-After` seconds, then resend the same request) or concurrent call limit — wait and retry |
| 500 | Server error — retry once |

Always translate errors for the user. Don't show raw JSON to non-technical users.

---

## Communication Style

Adapt language for non-technical users:
- "phone number" not "E.164 format"
- "creativity level" not "temperature"
- "the agent's personality and instructions" not "system prompt"
- "your balance" not "balance_cents"
- Show prices in dollars, not cents (1000 cents = $10.00)
- Explain what went wrong and what they can do about it — don't just show error codes

---

## Appendix A: Voice Selection Guide

**Never ask the user to choose a voice.** Pick one based on use case and persona, mention it briefly, move on.

| Use case | Female | Male |
|----------|--------|------|
| Professional / corporate | Maya, Anat | Adam, Ariel |
| Warm / friendly service | Michal, Liat | Omer, Tom |
| Young / energetic brand | Rachel, Shir | Yonatan, Roi |
| Authoritative / serious | Dvora, Ruth | David, Natan |
| Calm / reassuring | Noa, Tamar | Alon, Yuval |
| Sales / outbound | Yael, Anat | Gil, Nir |
| Medical / professional | Avigail, Tamar | Yosef, Shlomo |

**Standard catalog (30 voices; the eight expressive `gpt-live` voices — `Keren`, `Eitan`, `Hila`, `Ido`, `Boaz`, `Tali`, `Erez`, `Efrat` — are described in `yappr-api.md` → `GET /agents/:id`):**
- Female (14): Michal, Rachel, Noa, Maya, Shira, Avigail, Liat, Tamar, Yael, Dvora, Shir, Anat, Dana, Ruth
- Male (16): Yonatan, David, Gil, Adam, Amir, Omer, Tom, Benny, Nir, Natan, Yosef, Ariel, Roi, Shlomo, Alon, Yuval

**Default:** `Michal` when use case is unclear. Match gender to the agent's persona in its instructions (`workflow.global_instructions`).

---

## Appendix B: VAD Presets

VAD (Voice Activity Detection) controls when the agent considers the caller done speaking.

| Setting | What it does |
|---------|-------------|
| `vad_stop_secs` | Seconds of silence after speech stops before agent replies. Lower = faster; higher = more patient. |
| `vad_start_secs` | Seconds of sustained speech before it counts as a real utterance (filters noise). |
| `vad_confidence` | Speech detector confidence threshold. Higher = stricter. |
| `silence_timeout_secs` | Auto-hangup after N seconds of caller silence. |

**Presets:**

| Preset | `vad_stop_secs` | `vad_start_secs` | `vad_confidence` | `silence_timeout_secs` |
|--------|----------------|-----------------|-----------------|----------------------|
| Consultative (medical, legal, slow-paced) | 0.8 | 0.3 | 0.6 | 90 |
| Sales / energetic | 0.5 | 0.2 | 0.7 | 60 |
| Outbound (often noisy) | 0.6 | 0.25 | 0.75 | 45 |
| High-volume / fast | 0.4 | 0.15 | 0.8 | 30 |

**Symptom translation:**
- "Agent cuts callers off" → increase `vad_stop_secs`
- "Agent is slow to respond" → decrease `vad_stop_secs`
- "Agent triggers on background noise" → increase `vad_confidence` and/or `vad_start_secs`
- "Agent doesn't hear short responses" → decrease `vad_confidence` or `vad_start_secs`

The three `vad_*` settings apply to the standard voices only: on an expressive `gpt-live` voice they are refused with a `400` (that model runs its own turn-taking).

**Architecture note:** The Yappr voice engine runs two VAD layers simultaneously. Platform VAD must always remain enabled — it's what lets the AI hear the audio stream. The three parameters above only affect the local Silero VAD layer used for pipeline-level turn-taking. Do not attempt to disable Platform VAD.

---

## Appendix C: Call Guard Presets

Protect against wasted credits from runaway or dead calls.

| Setting | Default | What it controls |
|---------|---------|-----------------|
| `max_call_duration_secs` | 600 | Hard cap on total call length (maximum 3600). `0` = no cap of the agent's own: the platform still ends the call after 65 minutes, with the disconnect reason `Platform call limit reached`. Campaigns refuse `0`. |
| `max_continuous_speech_secs` | 120 | Max seconds one party can speak non-stop before hangup. Catches answering machines. `0` = disabled. |
| `silence_timeout_secs` | 60 | Seconds of caller silence before auto-hangup. Prevents idle/dead calls. |
| `idle_reminder_count` | 0 | Times the agent asks "are you still there?" before that hang-up (0–3). Each reminder restarts the silence timer; caller speech resets the count. |
| `idle_reminder_text` | null | The reminder line, word for word. null = a short default in the call's language. |

**Presets:**

| Preset | `max_call_duration_secs` | `max_continuous_speech_secs` | `silence_timeout_secs` |
|--------|------------------------|---------------------------|----------------------|
| Outbound sales | 600 | 120 | 45 |
| Inbound support | 900 | 0 (disabled) | 120 |
| Lead qualification | 480 | 90 | 60 |

**Symptom translation:**
- "Calls are expensive / wasting credits" → lower `max_call_duration_secs` and/or `silence_timeout_secs`
- "Agent keeps talking to answering machines" → lower `max_continuous_speech_secs` to 30–60
- "Calls get cut off too early" → check if `silence_timeout_secs` or `max_call_duration_secs` is too low
- "Callers get hung up on while they look something up / step away" → set `idle_reminder_count` to 1–2 (the agent asks before it hangs up)
- "A call ran for 20 minutes and drained credits" → set `max_call_duration_secs` to a reasonable cap

---

## Appendix D: Variable Injection Reference

### Built-in Variables (always available)

| Variable | Value injected |
|----------|---------------|
| `{{CallerPhone}}` | Caller's phone number (E.164) |
| `{{CurrentDate}}` | Today's date in the call's time zone, `YYYY-MM-DD` (e.g., `2026-03-21`) |
| `{{CurrentTime}}` | Current time in the call's time zone, `HH:MM` |
| `{{CurrentDateTime}}` | Current date and time in the call's time zone, ISO with its UTC offset (e.g., `2026-03-21T14:05:00+02:00`) |
| `{{CurrentDateTime.Asia/Jerusalem}}` | The same clock in an explicit zone (dot notation); no offset (e.g., `2026-03-21T14:05:00`) |
| `{{CallDirection}}` | `"inbound"`, `"outbound"`, or `"web_call"` |
| `{{Timezone}}` | The call's time zone (IANA name) |

See the variables section above: one time zone per call.

### Pre-Fetch Pattern

Pre-fetch data before calling the Yappr API, inject as variables. This reduces in-call tool usage and latency.

```
How it works:
1. dispatch-calls.ts fetches data BEFORE calling POST /calls
2. Data is formatted as a string and passed in the variables dict
3. Variables are substituted into the agent's instructions before the call starts
4. Agent uses pre-loaded data from its instructions; tool is only called as fallback
```

**Example — calendar availability:**

```typescript
// dispatch-calls.ts
async function dispatchCall(lead: Lead) {
  // 1. Pre-fetch data
  const slots = await getAvailableSlots(googleCalendarApi, { days: 3 });
  const formatted = formatSlots(slots);
  // e.g. "Mon Apr 14: 10:00, 14:00, 16:00 | Tue Apr 15: 09:00, 11:00"

  // 2. Dispatch call with variables
  await yapprApi.createCall({
    agent_id: AGENT_ID,
    to: lead.phone_number,
    from: YAPPR_NUMBER,
    metadata: {
      lead_id: lead.id,
      source: lead.source
    },
    variables: {
      LeadName: lead.name,
      AvailableSlots: formatted
    }
  });
}
```

**In the agent's instructions (`workflow.global_instructions`):**
```
<context>
Pre-loaded available slots: {{AvailableSlots}}.
Offer these to the caller first.
If they ask for a time not listed, use checkAvailability.
</context>
```

The variable reduces how often the agent needs to call `checkAvailability`. The tool still exists as a fallback for stale data or out-of-list requests.

### Passing Variables in metadata vs. variables

```
variables  → injected into the agent's instructions (agent sees this as context)
metadata   → stored on the call record for post-call automation (agent does NOT see this)
```

Use `metadata` for tracking data (lead IDs, source, CRM record IDs). Use `variables` for per-call context the agent needs to know (lead name, available slots, company context).

---

## Appendix E: Disposition Reference

### Default Dispositions (seeded per company)

| Label | Protected | Set by |
|-------|-----------|--------|
| No Answer | Yes | Platform — the call ended unanswered |
| Failed | Yes | Platform — the call never connected |
| Voicemail | Yes | Platform when there was no real back-and-forth (empty transcript or under three seconds); otherwise the AI classifier |
| Unclassified | Yes | Platform — the post-call analysis itself failed |
| Transferred to a Person | Yes | AI classifier, when the call was handed to a person |
| Do Not Call | Yes | AI classifier |
| Interested | No | AI classifier |
| Not Interested | No | AI classifier |
| Callback Requested | No | AI classifier |
| Appointment Set | No | AI classifier |
| Issue Resolved | No | AI classifier |
| Wrong Number | No | AI classifier |

This is what a workspace created today is seeded with; older workspaces may have fewer protected labels — branch on `is_protected` from `GET /dispositions`, never on a hard-coded list.

**Protected dispositions:** cannot be deleted. Attempting to delete returns 403. Do not try to recreate them. They can be renamed, but the platform finds No Answer, Failed, Voicemail, Unclassified and Transferred to a Person **by name** — renaming one breaks it.

**No disposition yet:** a call has none until its analysis settles, so handle the missing case in post-call automation. In a follow-up, read the outcome on `analysis.ready`, where `call.disposition` is guaranteed and is an object — `call.disposition.label` (and `.id`), never a bare string.

### Custom Dispositions

Create custom dispositions to match your specific use case. Examples:
- "Qualified Lead" — outbound sales (interested but needs follow-up)
- "Proposal Sent" — sales pipeline
- "Escalated" — support triage
- "Survey Complete" — research campaigns

Colors are optional but help with dashboard readability. Use hex colors.

```bash
curl -s -X POST "https://api.goyappr.com/dispositions" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "Qualified Lead", "color": "#f59e0b"}'
```

---

## Agent Eval — programmatic regression testing

When the user wants to test their agent without burning phone minutes — typically before a deploy, in CI, or while iterating on a prompt — reach for agent eval. The full guide is in [`agent-eval-guide.md`](agent-eval-guide.md); this section is the **journey trigger** so you know when to open it.

### When to suggest agent eval

The user says any of:

- *"I want to verify my latest instructions change didn't break the greeting — let's design a regression suite that runs before each deploy."*
- *"How do I make sure the agent never says X?"*
- *"How can I A/B test two versions of the agent's instructions?"*
- *"Is there a way to call the agent automatically and check if it does the right thing?"*
- *"Can we add agent tests to our CI pipeline?"*

### Mini journey — "block deploys when greeting routing breaks"

1. **Pick the right unit of test.** One case per known-tricky caller scenario. Common starter set: happy path, refusal path, mid-call topic switch, language switch, wrong-number caller, angry caller.
2. **Create the personas first.** One per archetype. Reuse them across multiple cases. See `agent-eval-guide.md` recipe 1.
3. **Create the suite.** `POST /agent-eval/suites` — give it a `parallelism` of 4 to keep wall-clock time reasonable.
4. **Create the cases inside the suite.** For each case, write 3-6 weighted assertions that capture the behaviour you actually care about (`must_say`, `must_not_say`, `must_call_tool`, `custom_llm_judge`). `max_turns` is the case's safety cap, not an assertion.
5. **Sanity-run a single case** with `POST /agent-eval/cases/:id/run` and inspect `GET /agent-eval/runs/:id/turns`. Fix obvious assertion mistakes (e.g. an over-strict regex).
6. **Run the suite** with `POST /agent-eval/suites/:id/run` and capture the returned `suite_run_id`.
7. **Poll until done** by listing runs filtered by that `suite_run_id`. When every run's `queue_status` is `done` (scores and cost are written after `status` turns terminal), compute the pass rate.
8. **Wire into CI** — see recipe 3 in `agent-eval-guide.md` for a full curl-based GitHub Action sketch.
9. **Debug failures.** For each `pass_fail: false` run, fetch turns + evaluation. Walk the transcript to find the diverging turn.

### Gotchas to mention up front

- **`tool_policy: "mock"` is the right default for CI** — tools never fire, every call returns synthetic success. Switch to `real` only for occasional pre-prod sanity checks.
- **Runs are billed per token** against the credit balance; `total_cost_cents` on each run is the exact amount. A typical 10-turn case lands $0.005-$0.05; a 50-case suite for under a dollar is normal.
- **Eval runs send no webhooks** — poll. A single `POST /agent-eval/cases/:id/run` already waits up to 60 s and answers with the scored run when it finishes in time.
- **An eval is a text conversation against the agent's stored record, not its published workflow.** Before steps, the conversation graph, After follow-ups and the tools bound in the workflow document are not run, and instructions changed through `PUT /agents/:id/workflow` may not be what the eval sees. Use it for wording and behaviour checks; rehearse the published workflow itself with a web call (`POST /calls {"type":"web"}`) or a test call.
- **Do not use `must_reach_node`.** It matches node ids of the retired flow engine, so it cannot check a workflow agent's steps.

---

## Reporting Issues to the Yappr Team

If you encounter a bug, unexpected API behaviour, or the user requests a feature that doesn't exist, report it directly to the Yappr team. This creates a tracked ticket on the engineering team's board, attributed to the user's company so the team knows who to follow up with.

**Endpoint:** `POST https://api.goyappr.com/report-issue`

**Authentication:** standard Yappr API key (`Authorization: Bearer ypr_live_...`). Any valid key works — no specific scope required, so even a read-only key can file. The endpoint never modifies the caller's company; it only writes a ticket on Yappr's side.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Short, scannable title (min 5 chars) |
| `description` | string | yes | What happened or what the user wants (min 10 chars) |
| `type` | `"feature"` or `"bug"` | yes | Issue classification |
| `source` | string | no | Set to `"yappr-skill"` so the team knows the report came from an AI coding agent |
| `steps_to_reproduce` | string | no | For bugs: exact steps that caused the issue |
| `error_message` | string | no | For bugs: error text or unexpected response body |
| `call_ids` | string[] | no | Related call IDs if applicable |
| `reporter_email` | string | no | User's email for follow-up |
| `reporter_context` | string | no | Company name, project name, or other context |

**Response:** `{ "status": "created" }` — also when the title closely matches an open report, which the new one is added to

**Example — report a bug:**
```bash
curl -s -X POST "https://api.goyappr.com/report-issue" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "PATCH /agents returns 500 when setting extraction_parameters",
    "description": "Setting extraction_parameters with valid payload returns HTTP 500. Request body: {\"extraction_parameters\": [{\"name\": \"budget\", \"description\": \"Monthly budget\"}]}. Response: Internal Server Error.",
    "type": "bug",
    "source": "yappr-skill",
    "error_message": "HTTP 500 Internal Server Error",
    "reporter_email": "dev@example.com"
  }'
```

**When to report:**
- API returns unexpected errors (5xx) that you cannot resolve
- A documented endpoint behaves differently than described in `yappr-api.md`
- The user requests a feature or integration that Yappr doesn't support yet
- You find a gap in the API or documentation

**When NOT to report:**
- Validation errors (4xx) — those are caller mistakes, fix the request
- Authentication failures — check the API key
- Rate limit errors — wait and retry
