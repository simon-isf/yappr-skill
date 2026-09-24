---
name: yappr-agent-builder
description: Build, configure, and launch complete Yappr AI voice agent systems end-to-end — one agent with one editor for what happens before, during and after the call, plus the two older kinds that are still live and still edited. Use when users want to create a voice agent, design a conversation flow with branching, connect Google Calendar / scheduling, set up outbound call dispatch, configure post-call automation, manage leads, or go live with a phone number. Discovery-driven — queries the live account before asking the user anything.
---

# Yappr Super Voice AI Agent Builder

This skill takes a coding agent through building a complete, production-ready voice AI system on Yappr — from discovery through agent creation, tooling, call dispatch, post-call automation, and going live. Every decision flows from what the user tells you and from live data fetched from their account.

---

## How to Use This Skill

This skill is organized into phases. Work through them sequentially. Each phase's output feeds the next.

**Before writing any code or making any API call**, run Phase 0 discovery — query the live account and ask the user the questions. The answers determine everything that follows.

### One kind of agent

There is one kind of agent. Never ask the user to choose a prompt or a flow type:
follow discovery, then POST /agents with a name and an explicit workflow starter as
documented in yappr-api.md. Keep an Idempotency-Key across identical retries. Read the
server-owned draft, edit Before/During/After, and explicitly Save/validate/publish.
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
and no lifecycle step takes a condition — a sequence is where conditions belong.

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

### Unified Tools journey

For workflow-owned agents, use the **Unified versioned Tools** contract in
`yappr-api.md`: HTTP endpoints, connected-app actions and separately named transfers
share the same tool registry and builder picker. Intrinsic End is not a tool. Do not
attach them through legacy `agent_tools`, graph overrides or the legacy direct tester.

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
effect. Unknown outcomes require reconciliation, not automatic repetition. Transfer
tests are mock-only and confer no live-call authority. Unavailable services do not
authorize a legacy fallback or a real call; observe the deployment's readiness gates.

**New journey — where a tool's arguments come from.** `bindings[].inputs` maps each
field of a tool's `input_schema` to one source: `{"kind":"model","path":"/field"}` (the
agent collects it; conversation only, one top-level name), `literal`, `request` (a value
sent in `variables` on `POST /calls`, declared in the document's `request_schema`),
`sequence` (inside a sequence), `step` (another step's output, `scope` `local` / `before` /
`during`) and `artifact` (After only). `artifact` is also how what the agent extracted
reaches a tool — `{"kind":"artifact","artifact":"analysis","path":"/extracted_data/<parameter>"}`,
with `"requires": ["analysis"]` on the step; there is no separate "extracted" kind (see
PHASE 4). Do not use `stored`: nothing writes saved context, so it is empty on every call
and `validate` answers `stored_context_has_no_writer`. Every source except `model` and
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

**There is no agent left running the old prompt/flow engine.** Every agent that existed
before this release was converted onto the workflow engine as part of it — an agent you
find on an existing account is a workflow agent, whatever it looked like when it was
created. `agents.system_prompt`, `type` and `flow_config` remain on the row only as
frozen history: `GET`/`PATCH /agents/:id` null them out (see *Canonical workflow
authoring* in `yappr-api.md`), and writing to them does nothing a call will ever see. If
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
| `HUMANIZE_PLAYBOOK.md` | When writing or reviewing any agent system prompt — research-backed principles for voice AI dialogue |
| `flow-composition-guide.md` | **Retired surface** — its endpoints no longer work; open only for the node catalog, transition heuristics and topology patterns as conceptual design reference |
| `agent-eval-guide.md` | **Programmatic regression testing** — how to design personas, build cases + suites, wire suites into CI, debug failing assertions. Open whenever the user wants to test agents without making real calls. |
| `yappr-api.md` → *Connected accounts* | Connecting a calendar, mailbox or any third-party account an agent acts on, and the human authorization handoff |
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
2. Call direction: inbound, outbound, or both?
3. Language: Hebrew, English, or both?
4. Do you need multiple agents for different use cases — e.g., a sales agent and a support agent with different prompts, voices, or tools?

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
Agent type: prompt / flow (per the Decision section above; one per agent)
Call direction: inbound / outbound / both
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
> `workflow.global_instructions`. Any other create body is refused with `410`. Create the
> draft that way, then build what the two sections below describe inside its workflow
> document.

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

1. Fetch its full config: `GET /api-v1/agents/:id` (see `yappr-api.md`)
2. Present the current config in plain language: prompt, voice, tools, webhook settings
3. Ask what they want to change
4. PATCH only the changed fields
5. Verify via GET after patching

### Step 1.2 — Build the System Prompt

**Before writing the prompt, read `HUMANIZE_PLAYBOOK.md`.** Then apply these rules:

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

**Step 3:** Append this block at the end of the system prompt:

```
## Pronunciation Guide — Phonetic Spellings (Read These Exactly)
When saying any of the following words or names, use ONLY the phonetic spelling shown.
Never use the Hebrew script or standard English spelling — always use the phonetic version:

- [Word] → "[phonetic]"

Remember: ALL CAPS = stressed syllable. "kh" = guttural (like "loch"), not "k" or "h".
```

Skip common English words and everyday Hebrew words (שולחן, פגישה, חשבון). Skip numbers — the server handles those.

### Step 1.4 — Variable Injection Strategy

Use `{{VariableName}}` syntax directly in the system prompt. Variables are substituted before the call begins.

**Built-in variables (always available — no setup needed):**

| Variable | Value |
|----------|-------|
| `{{CallerPhone}}` | Caller's phone number (E.164) |
| `{{CurrentDate}}` | Today's date (e.g., "March 21, 2026") |
| `{{CurrentTime}}` | Current time in company timezone |
| `{{CurrentDateTime}}` | Full ISO timestamp |
| `{{CurrentDateTime.Asia/Jerusalem}}` | With timezone override (dot notation) |
| `{{CallDirection}}` | `"inbound"`, `"outbound"`, or `"web_call"` |
| `{{Timezone}}` | Company's configured timezone |

**Custom variables:** any `{{VariableName}}` you add to the prompt. Must be supplied in the `variables` dict when creating the call (`POST /api-v1/calls`). See Appendix D for the pre-fetch pattern.

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

**Create the draft** — use the file-based payload approach (required for Hebrew/special characters). `name` plus `workflow.global_instructions` is the whole body; anything else (`system_prompt`, `type`, `flow_config`) answers `410 AGENT_LEGACY_CREATION_GONE`:

```bash
python3 -c "
import json, uuid
payload = {
    'name': 'Agent Name',
    'language': 'he',
    'workflow': {'global_instructions': '...'},
    'idempotency_key': str(uuid.uuid4())
}
with open('/tmp/agent-payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False)
"
curl -s -X POST 'https://api.goyappr.com/agents' \
  -H 'Authorization: Bearer $YAPPR_API_KEY' \
  -H 'Idempotency-Key: <the same uuid>' \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/agent-payload.json | jq .
```

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
attach. If you are looking at an agent that still has an `agent_tools` row named
`end_call`, that agent predates this and the row is inert — do not recreate the
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

Protected dispositions (cannot be edited or deleted via RLS): all 10 default dispositions are protected. Users can add custom dispositions but cannot modify the defaults.

No Answer and Failed are auto-set by the system. The AI classifier sets all others. If classification fails, disposition is null.

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
Deterministic nodes route on their tool's result, never on the model. This pattern
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
  binding behind an `action` node being a transfer tool. Route its outcome with `result`
  edges (`outcome: "succeeded" | "failed"`), never with a labeled transition.
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
need to replace the account instead.

**Connecting an app opens one authorization at a time.** Starting another one calls off
the one that was left open; if the one in the way was opened in a different browser or
by another member, the handoff page says so and offers to call those off and carry on. A
link that cannot be used says which it is — expired, called off, already finished,
already opened, or one this workspace cannot open.

**Cleaning up abandoned connections.** `GET /tool-connections?state=disconnected&toolkit=<slug>`
lists them (`?state=` takes one state at a time; a filtered page can be short and still
carry `next_cursor`). `POST /tool-connections/{id}/remove` takes an already-disconnected
record off the list — `?state=removed` still reads it back — and each row's `created_by.id`
tells your own key's records from a person's. See **Connected accounts** in `yappr-api.md`.

**The native OAuth integrations are retired.** `GET /integrations` and `DELETE /integrations/{id}` answer `410` with `code: endpoint_retired` — they listed and revoked credentials that no longer exist. There is nothing to fall back to when a connection fails — retry the connection, never reach for the old path. Connect the calendar or mailbox as a connected account, then call it from a `sequence` step or an `action` node bound to that connection.

### Step 1B.4 — Build the graph

Read the draft with `GET /agents/:id/workflow`, add your nodes/edges to `document.conversation` and your tool bindings to `document.bindings[]`, then save with `PUT /agents/:id/workflow` carrying the `expected_version` you just read. `POST /agents/:id/workflow/validate`, sent the `draft.version` the save answered with, checks that **saved** draft — it cannot check a document you have not saved, so save first — and neither saves nor publishes; `POST /agents/:id/workflow/publish` makes it live. See *Canonical workflow authoring* in `yappr-api.md` for the exact request/response shapes and every `issues[]` code.

### Step 1B.5 — Tools come from the same registry as Phase 2

There is no separate attachment step and no `agent_tools` join for a graph node. A node's
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

**When Supabase is available:** write each tool as a Deno edge function. The Yappr tool's `config.url` points to the edge function. The edge function handles all secondary actions and responds back to Yappr.

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
import json, uuid
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
        'timeout_ms': 10000
    },
    'idempotency_key': str(uuid.uuid4())
}
with open('/tmp/tool-payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False)
"
curl -s -X POST 'https://api.goyappr.com/tools' \
  -H 'Authorization: Bearer $YAPPR_API_KEY' \
  -H 'Idempotency-Key: <the same uuid>' \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/tool-payload.json | jq .
```

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

### Step 2.2 — Writing Tool Instructions in the Prompt

The platform auto-registers a bound tool's name, description and input schema with the model — for every `available_binding_ids` entry on a conversation node and every `action` node's `binding_id`. Bindings resolve at session start, so a tool/binding edit applies on the next call, not the one in flight. Do NOT repeat the schema in the prompt, and never instruct the model to wrap fields in `args` or send a node id.

What you MUST write in the `<tools>` section of the prompt:
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
once it settles it shows up in `GET /deliveries?source=test&tool_id=…`. The shape below is
the legacy `type`/`config` tool's, which delivers at once.

After creating each tool, test delivery:

```bash
curl -s -X POST "https://api.goyappr.com/tools/TOOL_ID/test" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

- `"success": true` + downstream `status_code` in `200`–`299` → show the user `payload_sent`, `response_body`, and `delivery_id`
- HTTP `502` with `DOWNSTREAM_HTTP_ERROR` / `WEBHOOK_NETWORK_ERROR`, or `504` with `WEBHOOK_TIMEOUT` → explain `details` and the sanitized `downstream_response`; never ask the user to expose configured request headers

### Step 2.4 — What the Tool Webhook Receives

When the agent invokes the tool during a real call, Yappr sends this flat shape to `config.url`. `POST` / `PUT` / `PATCH` / `DELETE` use a JSON body; `GET` uses the same fields as query parameters, with objects/arrays serialized as compact JSON strings, and has no body:

```json
{
  "company_id": "uuid",
  "agent_id": "uuid",
  "agent_name": "string",
  "call_id": "uuid",
  "call_direction": "outbound",
  "caller_number": "+972...",
  "callee_number": "+972...",
  "call_metadata":  { "...": "exactly what you passed to POST /calls body.metadata" },
  "call_variables": { "LeadName": "...", "AppointmentDate": "..." },

  "<extraction_param_name>": "<what the AI extracted>"
}
```

Two critical fields for multi-tenant / CRM-integrated setups:

- **`call_metadata`** — forwards in real-time whatever you passed as `metadata` when creating the call. This is the right place for CRM IDs (appointment_id, contact_id, calendar_id) that the tool receiver needs to route updates back to the correct record. The agent NEVER sees these (they don't go into the prompt).
- **`call_variables`** — the same `{{VariableName}}` values that were injected into the agent's instructions. Useful when the tool receiver wants to echo the lead's name into a Slack alert, an outbound WhatsApp, etc. — without re-fetching the call.

**Tool webhooks are synchronous and real-time.** No `GET /calls/:id` round-trip required — everything the receiver needs arrives in one payload. This is what separates tool webhooks, fired mid-call, from event webhooks fired after it: a legacy `call.analyzed` payload carries the call's content (transcript, summary, disposition label, extracted values) but not its context — no lead, metadata or cost — and needs `GET /calls/:id` for those. A workflow's own After triggers do not have that gap; see [The trigger's payload is not minimal](#the-triggers-payload-is-not-minimal) below.

See [yappr-api.md — Tool Webhook Payload](yappr-api.md) for the full field reference.

---

## PHASE 3: Call Dispatch

How calls get initiated. Choose the right pattern based on the user's lead source and volume.

### Layer 1 — Three Dispatch Patterns

**Pattern 1: Direct API**
Best for: low volume, ad-hoc calls, testing, simple automation.
The caller calls `POST /api-v1/calls` directly from their server, script, or automation.

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

**One number, many agents.** The `from` field is a per-call override. Any active number in the company can be paired with any agent — the phone number's `outbound_agent_id` only seeds the dashboard default, it does not constrain the API. Users do NOT need to buy a separate number for each agent. Reuse a single outbound number across every agent; just change `agent_id` per call.

**Pattern 2: Supabase Call Queue**
Best for: high volume, scheduled/batched outbound, retry logic, deduplication.
A `call_queue` table in Supabase holds pending calls. A cron job or edge function drains the queue, fetching pre-call data and calling the Yappr API per lead.

```typescript
// dispatch-calls.ts (Supabase edge function or Node.js script)
// 1. Fetch pending leads from queue
// 2. For each lead, fetch pre-call data (calendar slots, CRM context)
// 3. Format variables
// 4. POST /api-v1/calls with variables injected
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

1. **Server mints a session** — `POST /calls {type:"web", agent_id}` with the secret API key (optionally `lead_id` and `metadata`). Returns `{ call_id, token, connection, protocol }` (see **POST /calls — web call session** in `yappr-api.md`). Nothing is dialled and the secret key stays on the server, but the call already exists: `GET /calls/{call_id}` reads `pending_connection` until the browser connects, and an unused session settles `no_answer` (`session_expired`, cost 0) about a minute after the token expires — so mint on click, not on page load.
2. **Browser connects** — `npm install @goyappr/client`, then `YapprConversation.startSession({ token, connection })`. The developer owns the UI; the SDK handles mic + WebRTC. Controls: `setMicMuted`, `setVolume`, `getInputVolume`/`getOutputVolume`, `endSession`; callbacks `onStatusChange`, `onModeChange`, `onConnect`, `onDisconnect`, `onError`.

Billing, voice, and language come from the agent config — same as any call. Audio-only in preview (no live transcript yet).

A workflow agent whose published workflow runs before-call steps **or has follow-ups (After steps)** serves browser calls through a different exchange: the mint succeeds with `protocol: "call_request"` instead of `"offer"`, and the browser must create a call request, poll it, then start it (see **Web calls on an agent that prepares** in `yappr-api.md`). A browser that tries the one-shot `offer` connection on such an agent is refused with `409 workflow_preparation_required` before the token is spent — nothing is lost; switch to the exchange `protocol` names rather than republishing. Always follow `protocol`; never infer it from the workflow. On a `call_request` session `call_id` is `null` (the request reports it once it starts), and `lead_id` is refused with `422 WEB_LEAD_UNSUPPORTED`.

## PHASE 4: Post-Call Automation

What happens after a call ends. Configure this based on per-disposition routing answers from Phase 0.

### Layer 1 — Post the call to your system (After triggers)

There is no agent-level `webhook_url` / `webhook_events` to configure — every agent this
skill creates is a workflow agent (Phase 1), so "notify my system when X happens" is two
ordinary API calls: create the HTTP tool, then bind it into the workflow document's
`after` array, one trigger per event.

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
   refused, and the refusal does not name the field.
3. Publish. A trigger step is validated the same as any other step —
   `POST /agents/:id/workflow/validate` returns the exact JSON pointer to fix.

**Sending what the call collected.** The agent's extraction values are the `analysis`
artifact's `extracted_data`, and they reach a tool through the binding's `inputs` with an
ordinary artifact source — the step needs `"requires": ["analysis"]`:

```json
"inputs": {
  "preferred_day": { "kind": "artifact", "artifact": "analysis", "path": "/extracted_data/preferred_day" },
  "collected":     { "kind": "artifact", "artifact": "analysis", "path": "/extracted_data" }
}
```

Every parameter is a key on every call, and one the conversation never covered is `null`,
so a `fallback` never fires: declare a single-field input nullable
(`"type": ["string", "null"]`), or send the whole `/extracted_data` into one input declared
`"type": "object"`. Before publishing, `validate` warns `input_constant_placeholder` when a
**required** input is frozen to a stand-in such as `n/a` or `TBD`, and
`stored_context_has_no_writer` when an input reads `stored`, which nothing fills. Each
parameter may carry a `type` — `text` (the default), `number`, `yes_no` or `date` — and
`POST /agents/{id}/extraction/dry-run` reads a transcript you supply for them without a
call, so a parameter set can be checked in CI. The same values also land on the lead,
read-only, as `lead.extracted` (merged across that person's calls).

**Where a call's results go, in the dashboard.** Extraction parameters on an agent only
decide *what* is pulled out of the call; they do not decide where it lands — that is the
After trigger above. In the dashboard this is one shortcut — After call → **Notify URL /
send webhook** — which creates the tool and one trigger per event you tick. Each delivery
is `{"event": "<event>", "call": {…}}`; see `yappr-api.md` → **Webhook Events**.

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

**Who ended the call (`ended_by`)** — `GET /calls/:id` returns an `ended_by` field that distinguishes hang-up causality: `"caller"` (the human hung up, or the browser closed), `"agent"` (the bot chose to hang up), `"system"` (the platform ended it — e.g. voicemail detection, max duration, a fault, a browser session that expired unused), `"operator"` (a dashboard phone test call's End, or Yappr stopping a stuck call), `"unknown"`, or `null` while the call is live. Useful for retry and analytics logic so you don't auto-retry calls the user intentionally ended. First-write-wins — once set, it isn't overwritten.

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
   `event` that opened each one and the steps inside it.

A failure is already a sentence in `error` / `error_message`. Read it to the customer as
it stands; do not translate it into internal vocabulary, and do not branch on its wording
— branch on `status`, which is `succeeded`, `failed` or `pending` on every row that has
one, and `delivered` / `failed` / `pending` on a delivery. Payloads, URLs, headers and
credentials are deliberately not in the timeline, so if the answer needs the body that was
sent, it is on their side to log. (The same response's older `tool_calls` and `events`
members do still carry them, and are superseded — do not build new work on them.)

Field-by-field reference: `yappr-api.md` → **GET /calls/:id** → `timeline`.

**Finding it in the dashboard.** The Call Logs page answers at `/call-logs` (and at
`/calls`, which redirects there). Its filters live in the address — `from`, `to` (both
`YYYY-MM-DD`, read as whole days in the workspace timezone), `outcome` (comma-separated
disposition ids, or `none` for calls with no outcome) and `q` (a phone number) — so a
filtered view can be linked, bookmarked or built by hand. Either end of the window may be
given on its own: `from` alone runs to today, `to` alone runs back 30 days. "Export CSV"
writes every call the filters match — including the agent and A/B dropdowns on the page,
which are not part of the address — not only the page on screen. `GET /calls/export`
below is the same button, addressable.

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
   eval run) come back with `source: null`. `product` narrows it to one of `voice_call`,
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
   `GET /billing/transactions?from=2026-09-01&to=2026-09-30` (its days are UTC).
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
confirm one call's webhook fired, by `status` (`delivered` / `failed` / `pending` — rows
still `pending` are listed too; `failed` is the delivery-health query), or by `source`:
`live` is real traffic (a call, or a lead event, which can have `call_id: null`), `test` is
a tool test you ran that actually reached the endpoint — a legacy webhook tool's test at
once, a workflow tool's real `allowlist` test once it settles; a mock test writes nothing
— or anything sent on a call the dashboard opened to rehearse an agent.
Use `?source=live` for a delivery-health report, and `?source=test&tool_id=…` to answer
"did my test reach the endpoint?". Page with `pagination.next_cursor` until
`has_more` is `false` — cursor, not offset, because the log keeps growing while a long
read is in flight, and an offset would silently skip or repeat rows. Send `cursor` only
once you actually have one — like every filter here, an empty value is refused, and a
cursor that does not read as one of this endpoint's is `400 DELIVERY_CURSOR_INVALID` rather
than a silent restart from the top. A key with `calls:read` or `tools:read` can read them.

To see why one failed, open it: `GET /deliveries/{id}` returns the body that was sent and
what the endpoint answered (header values `[REDACTED]`; bodies need `calls:read`). Once
the endpoint is fixed, `POST /deliveries/{id}/retry` (`tools:update`) sends that same body
once more to where the tool points now — only a `failed` delivery, once.

Field-by-field reference: `yappr-api.md` → **Deliveries**.

### The trigger's payload is not minimal

A trigger step's request is the same [call package](yappr-api.md) every workflow tool
gets: `{"event": "analysis.ready", "call": {…}}`. Unlike the legacy `call.analyzed`
webhook this replaces, `call` already carries the lead object, the `metadata` and
`call_variables` from call creation, billing, the recording URL and the full disposition
object (`{id, label}`, not just the label string) — see the phase table in `yappr-api.md`
for exactly which members are populated by the time an `after` trigger runs. There is no
required `GET /calls/:id` follow-up fetch for anything in that package; only reach for it
when you need something the package genuinely does not carry, such as the lead's full
history rather than the lead attached to this call.

### Step 4.1 — Disposition Routing Architecture

Based on the per-disposition routing answers from Phase 0, wire up a routing handler in the webhook receiver:

```typescript
// webhook-handler.ts
async function handleCallAnalyzed(payload: WebhookPayload) {
  const { call_id, data } = payload;
  const disposition = data.disposition; // label string or null

  // Always fetch full call for lead context
  const call = await yapprApi.getCall(call_id);

  switch (disposition) {
    case 'Appointment Set':
      await sendWhatsAppConfirmation(call.lead, call.metadata);
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
// On call.no_answer webhook:
async function handleNoAnswer(payload: WebhookPayload) {
  const call = await yapprApi.getCall(payload.call_id);
  const lead = call.lead;

  // Check attempt count (store in call_queue or lead metadata)
  const attempts = await getAttemptCount(lead.id);

  if (attempts < MAX_RETRIES) {
    await scheduleRetryCall(lead, RETRY_INTERVALS[attempts]);
  } else {
    await markLeadExhausted(lead.id);
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

**Purchase:**
```bash
curl -s -X POST "https://api.goyappr.com/phone-numbers/purchase" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+972XXXXXXXXX"}' | jq .
```

The purchased number may differ from what was selected (race condition fallback). Always show the `phoneNumber` from the response.

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

**Note on `outbound_agent_id`:** this field only controls two things — (1) the default agent the dashboard uses when the user presses "Call" on the number's page, and (2) nothing else. It does NOT restrict which agent can initiate outbound calls from this number via the API. `POST /calls` accepts any `agent_id` + any active company-owned `from` number combination per request. Do not recommend purchasing extra numbers just to run multiple agents — one outbound number is enough to serve all agents.

**Note on `inbound_agent_id`:** this one DOES matter — it's the agent that answers when someone calls this number. It is a real 1:1 binding. If two agents need to handle inbound, they need two numbers.

### Step 5.1b — Option B: BYOC inbound via SIP (no Yappr number needed)

When the customer already has a business line and an external telephony system they want to keep, route inbound calls from that system to a Yappr agent via a SIP endpoint instead of buying a Yappr number. Use this when:

- The customer wants Yappr to answer overflow / after-hours / escalated calls without changing the number their customers dial
- The customer is piloting Yappr on a subset of routes before committing to porting
- The customer maintains their own queue / IVR / switchboard and wants AI as the last step

This path is independent of Yappr-bought numbers — a single agent can answer calls from both, and they share the same billing, concurrency cap, and call-log storage. The PSTN inbound flow (Step 5.1 above) is unaffected.

**The model: slug = bearer credential, no SIP digest auth.** The URI we hand the customer contains a 24-char random suffix (~120 bits of entropy). Anyone with the URI can dial the agent, billed to the workspace — treat it like an API key. The URI cannot be changed; to rotate access, create a new endpoint, point the phone system at its `sip_uri`, then delete the old one — in that order, so no call is dropped.

**Create the endpoint via API:**

```bash
curl -s -X POST "https://api.goyappr.com/sip-endpoints" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "After-hours", "inbound_agent_id": "AGENT_UUID"}'
```

The response is the endpoint wrapped in `data`, and `data.sip_uri` is everything the customer needs. There is no `sip_username` or `sip_password` to copy. `slug` is optional: the readable start of the address, 2–12 lowercase letters, digits and single hyphens, starting and ending with a letter or digit, and not a reserved word (`yappr`, `admin`, `internal`, `system`, `api`, `sip`, `telnyx`, `trunk`, `root`, `test`, `sudo`, `support`) or one followed by a hyphen. A slug that does not fit is refused with `400 SIP_ENDPOINT_REQUEST_INVALID`, never rewritten. Leave it out and the prefix is derived from `name`, cut to 12 characters. Any field the endpoint does not read (`sip_password`, `transport`, `require_tls`, a typo) is refused the same way, by name.

**Hand the URI to the customer's telephony.** They paste it as the SIP destination in their PBX/CPaaS outbound route. Authentication: none ("none" or "anonymous"). Transport: UDP or TCP, port 5060 — **TLS is not available on these addresses**, so the URI travels in clear text between their phone system and Yappr and sits in their configuration, logs and SIP traces. Codecs: G.711 (µ-law or A-law) or G.722.

Concrete example pastes for common platforms:
- **Twilio Studio** — set the "Connect Call To" SIP value in the appropriate widget to `sip_uri`
- **Twilio TwiML** — `<Dial><Sip>{{sip_uri}}</Sip></Dial>` (no `username`/`password` attributes)
- **Asterisk** — `Dial(SIP/<slug>@yappr-byoc.sip.telnyx.com)` from your dialplan
- **FreeSWITCH** — `<action application="bridge" data="sofia/external/<sip_uri>"/>` in the relevant XML route
- **3CX / Yeastar / hosted PBX** — paste the URI as the "SIP trunk destination" with auth set to "none"

**`allowed_source_ips` is a record, not a filter.** The field is stored with the endpoint (up to 50 IPv4/IPv6 addresses, each optionally with a `/prefix`), but no call is checked against it: a call to the URI is answered wherever it comes from. Never tell the customer it blocks other sources. What actually limits exposure: who can read the phone system's configuration, `is_active: false` while the endpoint is not in use (calls are then rejected before they are answered), and rotating the URI whenever it may have been seen.

**Caller-ID note.** Because the upstream is customer-controlled, the caller-ID arriving in the SIP `From` header cannot be trusted. Yappr **skips lead-memory lookups and returning-caller recognition** on every call arriving via a SIP endpoint. There is no setting to turn that on, in the API or the dashboard — an agent field such as `trust_external_sip_caller_id` is refused with a 400.

**Reading these calls back.** A SIP-endpoint call is `source: phone_inbound` with `to: null` (it dialled no number) and carries `sip_endpoint_id`; its `from` is whatever the phone system sent as the caller, which may not be a phone number. The calls API and the export never return the URI, but the dashboard's call logs show it as the number called, and the call details the agent's tools and webhooks receive carry the address as `callee_number` — so anyone who can read those can read the credential.

**Pre-launch checklist for SIP endpoints:** all the standard items in Step 5.2 still apply, plus:

- [ ] Customer's PBX/CPaaS outbound SIP route is set to the exact `sip_uri` value (no auth)
- [ ] A test call from the customer's system reaches the agent (the call appears in the dashboard call log, and via `GET /calls`)
- [ ] The customer understands the caller-ID trust model (default: untrusted)
- [ ] The endpoint is marked `is_active: true`
- [ ] The customer knows the rotation recipe: create a new endpoint, repoint the phone system, then delete the old one (deleting first drops calls until the new URI is in place)
- [ ] The customer knows TLS is not available and `allowed_source_ips` is not enforced

### Step 5.1c — Option C: call from the customer's own Telnyx numbers (no Yappr number needed)

Use this when the customer already owns numbers at Telnyx and wants agents to call **from** them: their caller ID, their Telnyx account, nothing ported or bought. It is outbound only — calls *to* those numbers keep going where they go in Telnyx; to have an agent answer them, add a SIP endpoint (Step 5.1b). Full reference: **Carrier Accounts** in `yappr-api.md`.

**Who bills what.** Telnyx bills the customer's own account for the phone minutes at their rates, Telnyx's own fees (call control, media streaming, recording, noise suppression) and the numbers themselves; none of it appears on the Yappr bill. Yappr bills the agent minutes, at the same per-minute rate as any other call. Say this before they connect — it is the first question they will have.

**0. Give the key the carrier scopes.** Carrier accounts are available to every workspace — nothing to switch on. The scopes are opt-in, though: no key has them by default. In Settings → API keys, create a key with the **Your carrier (Telnyx)** group ticked (`carrier_accounts:read` and `carrier_accounts:manage`); without them every carrier route answers `403 INSUFFICIENT_SCOPE` naming the scope — `GET /carrier-accounts/status` included, since it needs `carrier_accounts:read` like every other `GET`. That is the key, not the feature: widen the key's scopes, don't rotate it. (A `403` with the code `CARRIER_ACCOUNTS_NOT_ENABLED` means Yappr switched the feature off for this workspace in an emergency — contact Yappr support. Branch on `code`, never on the status alone.)

**1. Prerequisites in Telnyx.** The customer does these in their Telnyx portal; confirm each one before calling the API:

- [ ] The account is verified to **Level 2**. Level 1 allows calls inside the US only; Level 2 turns on international calling, Israel included.
- [ ] An **outbound voice profile** allows every country the agents will call. A new profile allows only the US and Canada, and a call anywhere else is refused. Set a **channel limit** and a **daily spend limit** on it: they cap what a leaked key could spend.
- [ ] A **dedicated API key for Yappr** (Account Settings → API Keys → Create API Key — Telnyx shows it once). Telnyx keys cannot be limited to certain actions, so this one is for Yappr alone; switching it off in Telnyx stops Yappr's calls from the account at once.
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
  -d '{"create": {"outbound_voice_profile_id": "PROFILE_ID"}}' | jq .
```

Yappr creates an app named "Yappr outbound" and never changes their profile. Alternative: `{"connection_id": "…"}` for an app they made just for Yappr, with its webhook URL set to exactly the account's `webhook_url`, a profile attached, and switched on.

**4. Add the numbers**, one call each. Each must be an active number in that Telnyx account; `outbound_agent_id` binds the calling agent at once.

```bash
curl -s -X POST "https://api.goyappr.com/carrier-accounts/ACCOUNT_ID/numbers" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number": "+972XXXXXXXXX", "outbound_agent_id": "AGENT_ID"}' | jq .
```

`409 CONNECTION_REQUIRED` means step 3 is not done; `422 NUMBER_NOT_IN_YOUR_TELNYX_ACCOUNT` means Telnyx does not list it as active there; `409 NUMBER_ALREADY_REGISTERED` means the number is held elsewhere in Yappr (Yappr support moves it). Tell the customer to leave each number's settings in Telnyx as they are.

**5. Test.** `POST /carrier-accounts/ACCOUNT_ID/test` places no call and returns `ok` plus one check each for the key, the app, the profile (its `detail` lists the allowed countries) and the numbers. Fix any failed check in Telnyx and test again.

**6. Use the numbers** — as `from` on `POST /calls`, as a campaign's `from_phone_number_id`, or as an agent's outbound number. Nothing else changes in the call request. The account reads `untested` until the first answered call, then `active`.

**7. Watch for a pause.** `GET /carrier-accounts/ACCOUNT_ID` → `status: "paused"` switches every number on the account off, so campaigns stop and `POST /calls` from those numbers answers `400 INVALID_FROM_NUMBER`. Only a refused key or a missing app pauses at once; any other refusal (a country the profile does not allow, one bad destination, a caller ID Telnyx will not present) counts once, and five in a row pause it. Read `pause_reason` and `last_error`, fix the cause in Telnyx, then `POST /carrier-accounts/ACCOUNT_ID/reactivate` — it tests first and answers `422 CARRIER_TEST_FAILED` with the checks still failing.

**A refused call before it rings has no webhook when placed directly.** `POST /calls` answers `422` with the reason in `error`, and that answer is the only notice; queued and campaign calls send `call.failed` with `data.error_reason`. Make sure the caller's code reads that `422`.

**Pre-launch checklist for carrier accounts:** all the standard items in Step 5.2 still apply, plus:

- [ ] `POST /carrier-accounts/{id}/test` returns `ok: true`, and the profile's allowed countries cover every destination
- [ ] Every number shows `ownership_verified_at` set and `is_active: true`
- [ ] One real call from a carrier number was answered, and the account reads `active`
- [ ] The customer knows Telnyx bills the phone minutes, and where to turn the account back on (Phone numbers → Your carrier) if it pauses

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
- [ ] Any custom variables used in the system prompt are documented — caller must supply them at call creation time
- [ ] Dispositions needed for routing are created

### Step 5.3 — Test the Agent

Two options — offer both:

**Option A: Web Call (recommended — no phone needed)**

```
https://app.goyappr.com/he/agents/AGENT_ID
```

Direct link to the agent's page in the Yappr dashboard. Click "Test Call" to speak with
the agent in the browser — this needs a **published** workflow; an unpublished agent's
Testing tab offers "Go to the workflow" instead of a call, so publish first
(`POST /agents/:id/workflow/publish`, Step 1B.4) if it is not live yet. To rehearse the
same way without a browser click, mint a session with `POST /calls {"type":"web"}` (see
**PHASE 3B** below) or hand out a `POST /shared-links` page. **Do not** reach for
`POST /agents/:id/flow/test` to rehearse a workflow agent — it is the retired flow
simulator and answers `409 WORKFLOW_FLOW_TEST_UNSUPPORTED` for every agent this skill
creates (see **Flow agents — retired** in `yappr-api.md`).

**Option B: Phone Call (requires purchased number)**

Check for custom variables in the system prompt. Any `{{VariableName}}` not in the reserved list (`CallerPhone`, `CurrentDate`, `CurrentTime`, `CurrentDateTime`, `CallDirection`, `Timezone`) must be supplied as test values.

```bash
curl -s -X POST "https://api.goyappr.com/calls" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "AGENT_ID",
    "to": "+972XXXXXXXXX",
    "from": "+972YYYYYYYYY",
    "variables": {
      "LeadName": "ישראל",
      "AvailableSlots": "יום שני 10:00, יום שלישי 14:00"
    }
  }'
```

### Step 5.4 — Monitoring

After launch, check recent calls:

```bash
curl -s "https://api.goyappr.com/calls?limit=20&agent_id=AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '[.data[] | {id, status, direction, duration_seconds, disposition}]'
```

If the user reports the agent cutting callers off → increase `vad_stop_secs` (PATCH /agents/:id)
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
| A reachable workspace calling window | `GET /call-windows` — this is the schedule the campaign obeys; confirm the timezone too (dashboard-only) |
| Credit above the call floor | `GET /billing` |
| A compliance basis the user can attest to | Ask (see Step 6.4) |
| An agent that does **not** depend on custom `{{Variables}}` | Campaign calls are placed by the platform and carry **no per-call `variables`**, so a custom `{{AvailableSlots}}` would render empty. Built-ins (`{{CurrentDate}}`, `{{CallerPhone}}`, `{{Timezone}}`, …) still work, and per-contact context belongs in the lead's memory (`notes` at enroll → `long_term_context`). If the prompt genuinely needs per-lead pre-fetched values, dispatch with Phase 3 Pattern 2/3 instead of a campaign |

### Step 6.1 — Create the draft

Name is the only field required to create, but **no configuration field has a default**: whatever you leave out stays `null`, and launch refuses with `422 CAMPAIGN_NOT_READY` naming it. Pass what you already know now; every field is PATCH-able later, and Steps 6.3–6.4 fill the rest.

```bash
curl -s -X POST "https://api.goyappr.com/campaigns" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "March renewals",
    "description": "Existing customers, renewal due in April",
    "agent_id": "AGENT_ID",
    "from_phone_number_id": "PHONE_NUMBER_ID"
  }' | jq '{id, status, name}'
```

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
    "stop_disposition_ids": ["DO_NOT_CALL_ID", "NOT_INTERESTED_ID", "WRONG_NUMBER_ID", "APPOINTMENT_SET_ID"],
    "stop_on_no_answer": false,
    "stop_on_voicemail": true,
    "stop_on_unclassified": false,
    "max_attempts": 3
  }' | jq '{stop_disposition_ids, stop_on_voicemail, max_attempts}'
```

**Why ids and not labels.** Labels are per-workspace text and are renameable; ids are stable. A stop set stored by label would silently disarm the moment somebody renamed "Not Interested". The API only accepts ids, and every id must belong to this workspace (otherwise `400`).

**Why `No Answer`, `Failed`, and `Voicemail` must NOT go in `stop_disposition_ids`.** Those three labels are *also* auto-assigned by the platform, and the outcome classifier legitimately assigns them to calls where a human really did talk — a receptionist answering a 90-second call can land "No Answer". Put them in the stop set and you permanently retire real conversations as never-reached. Use the booleans instead, which are evaluated on the call's **outcome class** rather than its label:

| Instead of putting this in the stop set | Use |
|---|---|
| `No Answer` | `stop_on_no_answer: true` (usually `false` — normally you *want* to retry an unanswered call) |
| `Voicemail` | `stop_on_voicemail: true` |
| `Unclassified` | `stop_on_unclassified` — `false` retries the contact, `true` retires it |
| `Failed` | nothing — platform failures use the separate `max_infra_retries` budget and never consume a dial attempt |
| "we reached a human, we're done" | a disposition of your own for that outcome (`POST /dispositions`), its id in `stop_disposition_ids` — there is no built-in human-connect rule |

A launch needs at least one stop rule — a non-empty `stop_disposition_ids`, or `stop_on_no_answer` or `stop_on_voicemail` set to `true`. Nothing is armed by default, and all three booleans must be sent (none has a default). A campaign whose whole point is "keep calling until they book" should arm the real outcome set, or people who already said no will be redialled until the attempt cap.

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
| `from_number_unavailable` | The calling number went inactive → `paused_config` | assign an active number, then `resume` |
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

# Remove one person from this campaign (addressed by lead_id, terminal)
curl -s -X DELETE "https://api.goyappr.com/campaigns/CAMPAIGN_ID/leads/LEAD_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

- `pause` is a **manual** pause and stays paused through a top-up — only `paused_insufficient_credit` auto-resumes. Resuming is explicit.
- `stop` is terminal and excludes every not-yet-dialed contact. Calls already in flight finish and still bill.
- `DELETE /campaigns/:id` archives: the campaign disappears from `GET /campaigns` and all live contacts are retired. **Confirm with the user first** — it is not reversible. Prefer `pause` or `stop` when they just want the dialing to end.
- Excluding a contact removes them **from this campaign only**. To suppress a person everywhere, add them to the do-not-call list (`POST /do-not-call`).

### Failure modes you will actually hit

**`422 CAMPAIGN_NOT_READY` on launch/resume.** One blocking cause per response, in `message`. Nothing changed; fix and re-launch.

| Message | Fix |
|---|---|
| Assign an agent before launching | `PATCH` with `agent_id` |
| Assign a phone number to call from before launching | `PATCH` with `from_phone_number_id` |
| `regulatory_basis` is required before launching | `PATCH` with `lawful_basis_confirmed` / `consent` / `existing_customer` / `non_marketing` / `registry_screened` — ask the user which is true |
| Finish configuring the campaign before launching. Not set: … | `PATCH` every field it names — no configuration field has a default |
| Configure at least one stop rule before launching | A non-empty `stop_disposition_ids`, or `stop_on_no_answer` / `stop_on_voicemail` set to `true` |
| The assigned agent no longer exists | Point `agent_id` at a live agent (`GET /agents`) |
| An agent on this campaign has no maximum call duration set | `PATCH /agents/:id` with a positive `max_call_duration_secs` on every agent the campaign calls with, the A/B test's second agent included — `0` = no cap of the agent's own (only the platform's 65-minute limit), which campaigns refuse because that worst case is far above any budget |
| The second agent on this campaign's A/B test is not available | Point `split.agent_id` at an active agent in this workspace, or send `"split": null` |
| The phone number assigned to this campaign is no longer active | Pick a number with `is_active: true` and `status: "active"` |
| This workspace has no upcoming calling window | `PUT /call-windows` (and confirm the workspace timezone, which is dashboard-only) |
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

# Patch (only changed fields)
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

# Archive (idempotent — an already-archived tool answers 200 again)
curl -s -X DELETE "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
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

Per-company suppression list. Outbound call placement (`POST /calls` and the queue dispatcher) consults this list before dialing — matched destinations get a `call_logs` row with `status: "dnc_blocked"` and no carrier leg / no charge. Phone numbers are normalized to E.164 before storage, so any common input format works.

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
- A DNC-blocked call still writes a `call_logs` row and fires a `call.dnc_blocked` webhook — useful for analytics, but do not double-count it as a real attempt.

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
`403 API_KEY_SCOPE_ESCALATION`, naming each scope that went beyond. A key cannot revoke
itself (`409 API_KEY_SELF_REVOKE`); rotate by issuing the replacement, moving the
integration onto it, then revoking the old one with `DELETE /api-keys/{id}`.

**`api_keys:read` is the audit scope.** It lists keys (`GET /api-keys` — names, prefixes,
scopes, `agent_ids`, `last_used_at`) and can neither issue nor revoke. It is **not** in the
dashboard's **Read-only** preset (that one leaves out billing, API keys and affiliates), but
it can be granted through `POST /api-keys`. A key holding neither it
nor `api_keys:manage` gets `403 INSUFFICIENT_SCOPE` on `GET /api-keys`, and so do `POST` and
`DELETE` without `api_keys:manage` — a missing scope is `403` on every route.

**A per-client key is `agent_ids`.** Scopes say what a key may do; `agent_ids` (1–100
agent ids on `POST /api-keys`) says which agents it may do it to. Leave it out for a key
that reaches the whole workspace. A limited key reaches only its agents, their calls and
charges, the leads they called (read only), their deliveries and the campaigns they
answer; everything the workspace shares (tools, numbers, dispositions, the do-not-call
list, calling hours, other keys) is `403 API_KEY_AGENT_SCOPED`, and naming another agent is
`403 AGENT_OUTSIDE_KEY_SCOPE`. It cannot create or duplicate agents, and `POST /calls` must
name one of its agents and call from a number one of them uses. There is no key update
(`PATCH` is `405`): change a key's agents in the dashboard, or issue a replacement and
revoke the old one.

Field-by-field reference: `yappr-api.md` → **API Keys**.

---

## Billing

```bash
# Check balance
curl -s "https://api.goyappr.com/billing" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

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

---

## Skill Scope

This skill covers: agents, tools, phone numbers (including SIP endpoints, Step 5.1b, and calling from the customer's own Telnyx numbers, Step 5.1c), calls, dispositions, leads, lead tags, shared links, billing.

Out of scope: custom SIP trunks (distinct from SIP endpoints, Step 5.1b, and carrier accounts, Step 5.1c), team/user management, WhatsApp directly (only via webhook to an external service), model training, buying non-Israeli phone numbers (a number in the customer's own Telnyx account may be any country's, Step 5.1c).

If a request is out of scope, say so clearly and offer the developer consultation link: **https://cal.com/yappr/skill-dev-consultation**

Offer the consultation whenever the user has tried something 2+ times without success, expresses confusion or frustration, or asks for help.

---

## Error Handling

For exact error codes and HTTP status meanings, see `yappr-api.md`. Quick reference:

| Status | Meaning |
|--------|---------|
| 400 | Bad request — check field names and values |
| 401 | The key itself was not accepted (`MISSING_KEY`, `INVALID_KEY`, `EXPIRED_KEY`) — fix the key |
| 402 | Billing — add balance or payment method (`BILLING_ERROR`), or the workspace's own monthly spending limit is reached (`SPEND_BUDGET_REACHED` — raise it with `PATCH /billing`, or it lifts on the 1st) |
| 403 | `INSUFFICIENT_SCOPE` on every route — the key is fine but lacks the scope the message names; widen it, never rotate it. Also a resource that is protected or in another workspace |
| 404 | `AGENT_NOT_FOUND` — that agent is not in this workspace |
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

**Full catalog (30 voices):**
- Female (14): Michal, Rachel, Noa, Maya, Shira, Avigail, Liat, Tamar, Yael, Dvora, Shir, Anat, Dana, Ruth
- Male (16): Yonatan, David, Gil, Adam, Amir, Omer, Tom, Benny, Nir, Natan, Yosef, Ariel, Roi, Shlomo, Alon, Yuval

**Default:** `Michal` when use case is unclear. Match gender to the agent's persona in the system prompt.

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

**Architecture note:** The Yappr voice engine runs two VAD layers simultaneously. Platform VAD must always remain enabled — it's what lets the AI hear the audio stream. The three parameters above only affect the local Silero VAD layer used for pipeline-level turn-taking. Do not attempt to disable Platform VAD.

---

## Appendix C: Call Guard Presets

Protect against wasted credits from runaway or dead calls.

| Setting | Default | What it controls |
|---------|---------|-----------------|
| `max_call_duration_secs` | 600 | Hard cap on total call length (maximum 3600). `0` = no cap of the agent's own: the platform still ends the call after 65 minutes, with the disconnect reason `Platform call limit reached`. Campaigns refuse `0`. |
| `max_continuous_speech_secs` | 120 | Max seconds one party can speak non-stop before hangup. Catches answering machines. `0` = disabled. |
| `silence_timeout_secs` | 60 | Seconds of caller silence before auto-hangup. Prevents idle/dead calls. |

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
- "A call ran for 20 minutes and drained credits" → set `max_call_duration_secs` to a reasonable cap

---

## Appendix D: Variable Injection Reference

### Built-in Variables (always available)

| Variable | Value injected |
|----------|---------------|
| `{{CallerPhone}}` | Caller's phone number (E.164) |
| `{{CurrentDate}}` | Today's date (e.g., "March 21, 2026") |
| `{{CurrentTime}}` | Current time in company timezone |
| `{{CurrentDateTime}}` | Full ISO timestamp |
| `{{CurrentDateTime.Asia/Jerusalem}}` | With timezone override (dot notation) |
| `{{CallDirection}}` | `"inbound"`, `"outbound"`, or `"web_call"` |
| `{{Timezone}}` | Company's configured timezone |

### Pre-Fetch Pattern

Pre-fetch data before calling the Yappr API, inject as variables. This reduces in-call tool usage and latency.

```
How it works:
1. dispatch-calls.ts fetches data BEFORE calling POST /api-v1/calls
2. Data is formatted as a string and passed in the variables dict
3. Variables are substituted into the system prompt before the call starts
4. Agent uses pre-loaded data from the prompt; tool is only called as fallback
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

**In the system prompt:**
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
variables  → injected into the system prompt (agent sees this as context)
metadata   → stored on the call record for post-call automation (agent does NOT see this)
```

Use `metadata` for tracking data (lead IDs, source, CRM record IDs). Use `variables` for per-call context the agent needs to know (lead name, available slots, company context).

---

## Appendix E: Disposition Reference

### Default Dispositions (seeded per company)

| Label | Protected | Set by |
|-------|-----------|--------|
| No Answer | Yes | System (automatic — set when call is not answered) |
| Failed | Yes | System (automatic — set on connection error) |
| Voicemail | Yes | System |
| Wrong Number | Yes | System |
| Do Not Call | Yes | System |
| Interested | No | AI classifier |
| Not Interested | No | AI classifier |
| Callback Requested | No | AI classifier |
| Appointment Set | No | AI classifier |
| Issue Resolved | No | AI classifier |

**Protected dispositions:** cannot be deleted. Attempting to delete returns 403. Do not try to recreate them.

**No Answer and Failed:** auto-set by the platform. The AI classifier does not set these.

**null disposition:** if AI classification fails (e.g., very short call, unclear outcome), the disposition field is null. Always handle the null case in post-call automation.

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

- *"I want to verify my new flow change didn't break greeting routing — let's design a regression suite that runs before each deploy."*
- *"How do I make sure the agent never says X?"*
- *"How can I A/B test two system prompts?"*
- *"Is there a way to call the agent automatically and check if it does the right thing?"*
- *"Can we add agent tests to our CI pipeline?"*

### Mini journey — "block deploys when greeting routing breaks"

1. **Pick the right unit of test.** One case per known-tricky caller scenario. Common starter set: happy path, refusal path, mid-call topic switch, language switch, wrong-number caller, angry caller.
2. **Create the personas first.** One per archetype. Reuse them across multiple cases. See `agent-eval-guide.md` recipe 1.
3. **Create the suite.** `POST /agent-eval/suites` — give it a `parallelism` of 4 to keep wall-clock time reasonable.
4. **Create the cases inside the suite.** For each case, write 3-6 weighted assertions that capture the behaviour you actually care about (`must_say`, `must_not_say`, `must_call_tool`, `must_reach_node`, `max_turns`, `custom_llm_judge`).
5. **Sanity-run a single case** with `POST /agent-eval/runs` and inspect `GET /agent-eval/runs/:id/turns`. Fix obvious assertion mistakes (e.g. an over-strict regex).
6. **Run the suite** with `POST /agent-eval/suites/:id/run` and capture the returned `suite_run_id`.
7. **Poll until done** by listing runs filtered by that `suite_run_id`. When all runs are terminal, compute the pass rate.
8. **Wire into CI** — see recipe 3 in `agent-eval-guide.md` for a full curl-based GitHub Action sketch.
9. **Debug failures.** For each `pass_fail: false` run, fetch turns + evaluation. Walk the transcript to find the diverging turn. For flow agents, the `flow_event` rows reveal routing decisions.

### Gotchas to mention up front

- **`tool_policy: "mock"` is the right default for CI** — tools never fire, every call returns synthetic success. Switch to `real` only for occasional pre-prod sanity checks.
- **Agents and personas are billed at different rates** ($2/$10 vs $1/$4 per 1M tokens). A typical 10-turn case lands $0.005-$0.05; a 50-case suite for under a dollar is normal.
- **Webhooks fire per-run** (`agent_eval.run.completed` / `.failed`) — wire a CI worker to react instead of polling if you have many cases.
- **`must_reach_node` only works for flow agents** — using it on a prompt-mode agent fails the assertion every time.

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

**Response:** `{ "status": "created" }` or `{ "status": "duplicate" }` (auto-deduped against open tickets)

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
