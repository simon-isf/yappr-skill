---
name: yappr-agent-builder
description: Build, configure, and launch complete Yappr AI voice agent systems end-to-end — both single-prompt agents and flow agents (graph state machines for procedural conversations like booking, intake, qualification). Use when users want to create a voice agent, design a conversation flow with branching, connect Google Calendar / scheduling, set up outbound call dispatch, run a bulk outbound calling campaign over a lead list, configure post-call automation, manage leads, or go live with a phone number. Discovery-driven — queries the live account before asking the user anything.
---

# Yappr Super Voice AI Agent Builder

This skill takes a coding agent through building a complete, production-ready voice AI system on Yappr — from discovery through agent creation, tooling, call dispatch, post-call automation, and going live. Every decision flows from what the user tells you and from live data fetched from their account.

---

## How to Use This Skill

This skill is organized into phases. Work through them sequentially. Each phase's output feeds the next.

**Before writing any code or making any API call**, run Phase 0 discovery — query the live account and ask the user the questions. The answers determine everything that follows.

**Then, before the prompt-vs-flow decision, run the [create-vs-edit gate](#decision-new-build-or-change-to-an-existing-system).** If the request is to change something that already exists, you edit it (GET + PATCH) — you do NOT create a new one. This is the single most important rule in the skill: POST is for new resources, PATCH is for changes. See also [Managing Existing Resources](#managing-existing-resources).

### Decision: new build OR change to an existing system

**Run this FIRST, before anything else** (before the prompt-vs-flow decision below).

- If the user names an existing resource, or says **change / update / edit / fix / rename / adjust / disable / add a tool to** something that already exists → this is an **EDIT**. Resolve the resource id from Phase 0 discovery data (the `EXISTING RESOURCES` block in Step 0.3 — never ask the user for it), `GET` the full record, then `PATCH` only the changed fields. Jump straight to [**Managing Existing Resources**](#managing-existing-resources). Do **NOT** POST.
- Only when Phase 0 confirms the resource does **not** exist do you create it (POST) via the phases below.
- Editing is addressed strictly by id. The id comes from Phase 0 (never ask the user for it). If you don't have it yet, run Phase 0 discovery first, then re-check this gate.

> **POST creates a NEW resource every time** (except an exact idempotency-key replay, which returns the OLD row **unchanged** with HTTP 200 — see the [idempotency note](#idempotency_key-is-not-an-upsert)). POST is **NOT** an upsert. "Update the agent" + POST = a duplicate agent. To change an existing resource, use **PATCH**.

### Decision: prompt agent OR flow agent

Yappr supports **two agent types**. Pick one before Phase 1 — agent type is set at create time and cannot be changed (the API will reject any attempt to flip it).

| Pick **prompt agent** when… | Pick **flow agent** when… |
|---|---|
| Conversation is open-ended / consultative | Conversation has required steps that must run in order |
| The agent's job is fluent dialogue, not procedure | The agent's job is to collect specific slots / fire specific tools at specific points |
| You want one big system prompt to shape behavior | You want **measurable funnel drop-off** at each step |
| Examples: customer support, FAQ, sales discovery, free-form interview | Examples: appointment booking, lead qualification, RSVP, intake forms, pre-screening |

**Heuristic queries that map to flow agents:**
- *"Build me a wedding RSVP voice agent that books in my Google Calendar"*
- *"I need an agent that always asks for date and party size in order"*
- *"Build me a procedural agent that branches based on the answer"*

**Heuristic queries that map to prompt agents:**
- *"Build me a sales agent for cold-calling leads"*
- *"I want a customer support agent that answers FAQs"*
- *"Build me a Hebrew assistant that talks naturally with callers"*

If unsure, ask the user one clarifying question: *"Does this agent need to follow a fixed sequence of steps with specific information collected at each step, or is it a free-form conversation?"*

**Once you've decided**, set `agent_type` in the discovery config (Phase 0) and follow the corresponding fork in Phase 1.

For the deeper how-to on flow agents, open [`flow-composition-guide.md`](flow-composition-guide.md). For OAuth-backed integrations (Google Calendar — only available to flow agents in v1), open [`integrations-guide.md`](integrations-guide.md).

### Core files in this skill directory

| File / Directory | When to open it |
|------|----------------|
| `yappr-api.md` | Anytime you need an exact endpoint shape, request/response fields, validation rules, or error codes |
| `HUMANIZE_PLAYBOOK.md` | When writing or reviewing any agent system prompt — research-backed principles for voice AI dialogue |
| `flow-composition-guide.md` | Designing flow agents — node catalog, transition heuristics, common topologies |
| `agent-eval-guide.md` | **Programmatic regression testing** — how to design personas, build cases + suites, wire suites into CI, debug failing assertions. Open whenever the user wants to test agents without making real calls. |
| `SKILL.md` (this file) | The journey guide — what to build, in what order, and why |
| `integrations/_overview.md` | Decide which integration to use for a given task — maps use cases to file names |
| `integrations/{name}.md` | Auth, base URL, all key endpoints, gotchas, and rate limits for a specific platform |
| `templates/integrations/{name}.ts` | **Ready-to-use Deno TypeScript client** for that platform — import directly into edge functions |

### Shared Integration Clients

Every integration has a typed TypeScript client in `templates/integrations/`. Use them instead of writing raw `fetch` calls.

**Import pattern** (from a Supabase edge function or template function):

```typescript
import { HubSpotClient } from "../_shared/integrations/hubspot.ts";
// clients are flat files: templates/integrations/{name}.ts — copy the one you need
// into your edge function's _shared/integrations/ directory (or import it relatively)

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
| Payments / Israeli market | `green-invoice`, `icount`, `priority-erp`, `cardcom`, `meshulam`, `pelecard`, `bit-pay`, `stripe` |
| Lead sources / Forms | `facebook-lead-ads`, `tally-forms`, `typeform`, `jotform`, `google-lead-forms`, `linkedin-lead-gen`, `tiktok-lead-gen`, `google-forms-sheets` |
| Email & Marketing | `resend-email`, `sendgrid`, `mailchimp`, `klaviyo`, `mailerlite`, `brevo`, `convertkit` |
| Automation | `make-com`, `n8n`, `zapier`, `pluga` |
| Data / Spreadsheets | `google-sheets`, `notion`, `airtable`, `supabase` |
| E-commerce | `shopify`, `woocommerce` |
| Helpdesk | `freshdesk`, `zendesk` |
| Project management | `asana`, `clickup`, `jira` |
| HR | `hibob` |
| Enrichment | `clearbit` |

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
new GoogleCalendarClient(accessToken, calendarId)   // calendarId required (e.g. "primary")

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
Add that key to your own project's `deno.json` if you copy `mailchimp.ts` into a non-Supabase Deno context. Inside a Supabase edge function project this is handled for you — Supabase's Deno runtime resolves `npm:` imports natively.

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

Add a fourth call when the request involves calling a list of people (bulk dialing, "call these leads", retries over days) — an existing campaign may already own those numbers:

```bash
curl -s "https://api.goyappr.com/campaigns" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '[.data[] | {id, name, status, total_leads, last_tick_result}]'
```

These jq filters all keep each resource's `id`. **Do not discard the ids** — capture them into the `EXISTING RESOURCES (id → name)` block of the Step 0.3 config. Every later edit (PATCH/DELETE/attach) is addressed by id, and Step 1.1 ("never ask for an id manually") depends on those ids being captured here.

Summarize what you found and present it to the user before asking any questions. Example:

> "I've checked your account. You have 2 agents (Maya — Hebrew, Michal — Hebrew), 3 phone numbers (one unassigned), and a $45.20 balance. Your dispositions are: Interested, Not Interested, Callback Requested, Appointment Set, Issue Resolved, No Answer, Failed, Voicemail, Wrong Number, Do Not Call.
>
> Now — tell me about the voice agent system you want to build."

If this is a fresh account (no agents, no tools), say nothing about it — just go straight to the questions.

### Step 0.2 — Discovery Questions

Ask these in a natural conversation, not as a form. Group related questions. Adapt based on what you already know from the account data.

**Business & call type:**
1. What is the primary goal of this agent? (appointment booking / lead qualification / outbound sales / inbound support / survey / other)
2. Call direction: inbound, outbound, or both?
3. Language: Hebrew, English, or both?
4. What timezone and business hours should calls run in? (drives call-windows — outbound is gated to business hours by default; note the timezone itself is set in the dashboard Company settings, not via the API — see Step 5.2 and the Call windows section)
5. Do you need multiple agents for different use cases — e.g., a sales agent and a support agent with different prompts, voices, or tools?

**Persona & voice:**
6. Agent name, role, and company context (one sentence: "Maya, sales rep at Acme Ltd")
7. Gender and tone: professional / warm / energetic / authoritative / calm?
8. Any required phrases or forbidden phrases?

**Tools & systems:**
9. What should the agent do during a call? (book appointment / log lead / check availability / transfer to human / update CRM / send WhatsApp)
10. What scheduling system, if any? (Google Calendar / Calendly / Cal.com / Monday / custom API / none)
11. What other systems need updating after calls? (HubSpot / Monday / Pipedrive / Google Sheets / none)
12. Post-call messaging? (WhatsApp via Green API / email / none)
13. Do you have a Supabase project? (if yes: URL, anon key, service key — needed for call queue and edge function templates)

**Lead intake:**
14. Where do leads come from? (Facebook Lead Ads / website form / CRM export / automation platform / manual)
15. Expected daily call volume? (1–50 / 50–500 / 500+)
16. Should the agent remember returning callers across multiple calls? (lead memory)

**Post-call routing — for each disposition you'll route on (these are the AI-classifier dispositions found in 0.1, e.g. Interested, Appointment Set, Callback Requested):**
17. What should happen on each disposition? Ask per-disposition:
    - Appointment Set: send confirmation message to the caller?
    - Not Interested: mark as do-not-call?
    - Callback Requested: auto-schedule a follow-up call?
    - Interested (but no booking): notify sales team? How?
18. No Answer: retry? How many attempts? What intervals?

### Step 0.3 — Discovery Config Object

After gathering answers, output a discovery config you'll use throughout the remaining phases. This is your working document — update it as you learn more.

```
DISCOVERY CONFIG
================
EXISTING RESOURCES (id → name — carry these for any later edit)
  Agents:        [{id, name}]
  Tools:         [{id, name}]
  Phone numbers: [{id, number, inbound_agent_id, outbound_agent_id}]
  Dispositions:  [{id, label}]   # ids are also how campaign stop rules are addressed (Phase 6)
  Campaigns:     [{id, name, status}]  # only when bulk dialing is in scope
  # These ids are how every later PATCH/DELETE/attach is addressed.
  # When the user asks to "change X", resolve X against this map and PATCH by id —
  # do not POST a new resource. Step 1.1 ("never ask for an id manually") relies on this.

Agents needed: [list each agent with its purpose, language, tone]
Agent type: prompt / flow (per the Decision section above; one per agent)
Call direction: inbound / outbound / both
Languages: he / en
Timezone / calling hours: [IANA tz, e.g. Asia/Jerusalem + desired business hours]
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

**Phase 1 forks based on agent type** (set in DISCOVERY CONFIG):
- `agent_type: prompt` → continue with **Phase 1A** below (single-prompt agent — the original journey).
- `agent_type: flow` → jump to **Phase 1B** (graph-of-nodes agent). Phase 1B is documented in [`flow-composition-guide.md`](flow-composition-guide.md); a brief inline summary is at the end of this phase. After Phase 1B, **skip Phase 2 (Tools)** — flow agents reference tools from inside flow tool-call nodes, not via the `agent_tools` join.

---

## PHASE 1A: Prompt Agent Creation

For each agent identified in discovery, run this phase. If multiple agents are needed, complete one at a time.

### Step 1.1 — Check for Existing Agents

Already done in Phase 0. **First branch on create-vs-edit** (see the [create-vs-edit gate](#decision-new-build-or-change-to-an-existing-system)):

- **If this references an agent that already exists** (the user named it, or asked to change / update / fix / rename / adjust / disable it) → this is an EDIT. **Jump to [Managing Existing Resources → Agents](#agents).** Resolve its id from the Phase 0 `EXISTING RESOURCES` block — never ask the user to provide an id manually — then GET the full record, PATCH only the changed fields, and verify via GET. Do **NOT** continue into the create steps below.
- **Only if Phase 0 confirms no matching agent exists** → continue with Step 1.2 to create a new one.

The edit recipe in short (full curl examples in [Managing Existing Resources](#managing-existing-resources)):

1. Resolve the id from the Phase 0 `EXISTING RESOURCES` block (never ask the user)
2. Fetch its full config: `GET /agents/:id` (see `yappr-api.md`)
3. Present the current config in plain language: prompt, voice, tools, webhook settings
4. Ask what they want to change
5. PATCH only the changed fields (snake_case — see [PATCH gotchas](#patch-gotchas))
6. Verify via GET after patching

### Step 1.2 — Build the System Prompt

**Before writing the prompt, read `HUMANIZE_PLAYBOOK.md`.** Then apply these rules:

- Write stages as goals, not scripts
- Include an explicit threading instruction
- Forbid fake acknowledgment
- Forbid robotic transition phrases ("Great!", "Moving on", "Certainly", "Of course")
- Emotional acknowledgment instruction: reference what was specifically said
- One question at a time, then stop
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

Recommended pick: `Michal` when use case is unclear. **Always pass `voice` explicitly** — if you omit it, the server falls back to `Rachel`, not Michal.

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

**Create the agent** — use the file-based payload approach (required for Hebrew/special characters):

```bash
python3 -c "
import json
payload = {
    'name': 'Agent Name',
    'system_prompt': '...',
    'voice': 'Michal',
    'language': 'he',
    'temperature': 0.5,
    'agent_speaks_first': True,
    'greeting_message': '...',
    # VAD: include only if deviating from defaults
    # 'vad_stop_secs': 0.5,
    # 'vad_start_secs': 0.2,
    # 'vad_confidence': 0.7,
    # Call guards: include only if deviating from defaults
    # 'silence_timeout_secs': 60,
    # 'max_continuous_speech_secs': 120,
    # 'max_call_duration_secs': 600,
    # Webhook: only include if the user asked for call event notifications
    # 'webhook_url': 'https://...',
    # 'webhook_events': ['call.no_answer', 'call.failed', 'call.analyzed'],
    # lead_memory_enabled: optional, default true. Set false to disable cross-call memory.
    # 'lead_memory_enabled': True,
    # idempotency_key: OMIT for a normal create. Only set it (to a STABLE key you control,
    # not a fresh uuid) when you need a specific create to be replay-safe — see the note below.
}
with open('/tmp/agent-payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False)
"
curl -s -X POST "https://api.goyappr.com/agents" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/agent-payload.json | jq .
```

Save the returned `id` — **store it in the Phase 0 `EXISTING RESOURCES` block** so any later edit can target it by id.

> #### idempotency_key is NOT an upsert
> Re-POSTing with the same `idempotency_key` returns the already-stored record **unchanged with HTTP 200** — none of your new fields are applied. It exists to make **retries** safe, not to edit. **To change an existing agent, use `PATCH /agents/:id`** (see [Managing Existing Resources](#managing-existing-resources)) — never re-POST. Only set `idempotency_key` when you need a specific create to be replay-safe, and use a **stable key you control** (not a fresh `uuid` each call — a fresh uuid defeats the dedup and creates a duplicate every run).

**Attach the end_call system tool (required for every agent):**

```bash
# Find the end_call system tool for this company
curl -s "https://api.goyappr.com/tools" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '.data[] | select(.type == "system") | {id, name}'
```

Then attach it with `execution_order: 999` so it's always last:

```bash
curl -s -X POST "https://api.goyappr.com/tools/attach" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID", "tool_id": "END_CALL_TOOL_ID", "execution_order": 999}'
```

Do this silently — no explanation needed unless the user asks.

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

## PHASE 1B: Flow Agent Creation

**If `agent_type: prompt`, skip this section entirely — you've already built your agent in Phase 1A. Continue to Phase 2.**

Flow agents replace one large system prompt with a graph of nodes — each node is a small step (conversation, tool call, transfer, end). Routing between nodes happens automatically: on every user-turn boundary the model evaluates what the user just said against the current step's outgoing transitions and either advances or stays. Tool-call nodes execute deterministically and route on the result. This pattern matches what Retell.ai and nlpearl.ai ship.

The full how-to lives in [`flow-composition-guide.md`](flow-composition-guide.md). At a glance:

### Step 1B.1 — Design the global system prompt

Flow agents still have a global `system_prompt` (persona, brand rules, hard constraints). It's layered with each node's `instructions` at runtime. Apply HUMANIZE_PLAYBOOK rules — same as Phase 1A.2.

### Step 1B.2 — Sketch the graph

Identify the steps. For each step decide:
- **Conversation node** (LLM talks): what the bot is trying to accomplish, plus N labeled transitions out (e.g. "User confirmed attendance" → next-step). The model picks based on what the user just said.
- **Tool-call node** (deterministic): which existing tool (by `tool_id`) and what to do on success / error / custom branches (custom branches use simple JSONPath-equality matching like `$.status == "no_availability"`). Tool args are owned by the **tool itself** via `payload_config` (literals + `ai_extract`-by-the-runtime); `tool_call` nodes have **no per-node `args_template`** field. At call start the effective linked-tool config (including `config_override`) becomes a flat submission schema with one field per extraction parameter; the model never submits a nested `args` object. `required` defaults to true, while optional fields do not block dispatch. First `GET /tools` and reuse an existing tool if its capability matches (the same tool row can be referenced from N flow nodes); `PATCH` it when every consumer should inherit the change. Use a node's `config_override` for deliberate per-flow differences, remembering that `payload_config` is replaced as one complete section. Create a new tool when the action is a distinct reusable capability rather than a variation of the same one.
- **Transfer node** / **End node**: terminal.
- **Post-call extraction and automation**: there are no `webhook` or `structured_output` flow nodes. For per-call extraction, use the agent-level `extraction_parameters` field. For post-call automation, use `webhook_url` + `webhook_events` on the agent. Both apply to prompt and flow agents — flow agents do not have separate post-end node types.

A flow can expose at most **127 unique typed extraction contracts**. Reusing the same effective tool and extraction schema across nodes shares one contract. If the API returns `too_many_extraction_contracts`, reuse a schema or split the graph into smaller agents.

### Step 1B.2a — Greeting before flow (`auto_advance: false`)

Pattern name: **Greeting before flow**.

When to use: the agent should greet neutrally and listen for the caller's open-ended intent before routing into structured steps. Useful when the first conversation node's instructions are intent-specific (e.g. "ask which service they want") and you don't want the greeting itself to bend toward that intent.

How: set `auto_advance: false` on the StartNode. The bot delivers the greeting in start-node context only — no first-conversation-node instructions are pre-loaded. After the user's first reply, the flow automatically enters the first conversation node and the bot replies in that node's voice.

When `auto_advance: true` (default, legacy behavior): greeting + the first conversation node's instructions are pre-loaded together, so the greeting is delivered "in" the first node's voice. Saves one round-trip but blends greeting with that node's behavior.

### Step 1B.2b — Globals (escape hatches reachable from any step)

For escape hatches that should be reachable from any step (transfer-to-human, end-on-DNC, wrong-number, "user reveals they're actually X" misclassification recovery), use **global nodes** instead of wiring an explicit transition into every source node. See [`flow-composition-guide.md`](flow-composition-guide.md) section on globals for the full how-to.

### Step 1B.3 — Connect Google Calendar (if scheduling is involved)

OAuth-backed integrations are the v1 way to give agents access to scheduling. The OAuth handshake (popup → Google consent → callback) is **dashboard-only** — the human onboarding the company connects each Google account once via the Yappr dashboard's Integrations page. The public API exposes list (`GET /integrations`) and revoke (`DELETE /integrations/:id`) but not connect. Once connected, capture the credential's `id` from `GET /integrations` and plug it into an `integration_call` node's `integration_id`. See [`integrations-guide.md`](integrations-guide.md) for the full lifecycle.

### Step 1B.4 — Create the agent via API

```bash
curl -X POST "https://api.goyappr.com/agents" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wedding RSVP",
    "type": "flow",
    "language": "he",
    "voice": "Zephyr",
    "system_prompt": "You are Michal, the personal assistant for the wedding...",
    "flow_config": { /* the graph — see flow-composition-guide.md */ }
  }'
```

The API validates `flow_config` (Zod-equivalent JSON schema): exactly one start node, all `next_step_id`s resolve, unique node ids. Validation errors come back as 400s with a clear message.

### Step 1B.5 — Smoke-test the flow graph (free, hermetic)

**Before placing any real or eval call, validate the graph's routing with the hermetic flow simulator** — `POST /agents/:id/flow/test`. It deterministically replays a synthetic transcript through the graph without spending eval tokens or placing a call, returning a step trace, `named_results`, `slot_values`, and `ended_at_step_id`.

```bash
curl -s -X POST "https://api.goyappr.com/agents/AGENT_ID/flow/test" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": [
      { "role": "user", "content": "Hi, I want to RSVP for the wedding" },
      { "role": "user", "content": "Two people, and yes we will attend" }
    ],
    "mock_tool_results": { "checkAvailability": { "status": "ok" } }
  }' | jq '{ended_at_step_id, slot_values, named_results}'
```

Confirm the trace ends at the expected node and that the slots you care about were filled. Fix routing/transition bugs here — it's free — before moving to a real test call. Full reference: [`flow-composition-guide.md`](flow-composition-guide.md).

### Step 1B.7 — Skip Phase 2 (Tooling)

Phase 2 below describes how prompt agents attach tools via the `agent_tools` join. **Flow agents do NOT use `agent_tools`** — tools live inside `flow_config.nodes[].tool_id`. The tools themselves still live in the `tools` table and are reusable across multiple flows or attached to prompt agents.

To add a tool to a flow: create the tool via `POST /tools` (same as Phase 2.1), then reference its `tool_id` from a tool-call node in your `flow_config`.

**Continue to Phase 3 (Call Dispatch)** — that phase works for both agent types.

---

## PHASE 2: Tooling

> **Flow agents (`agent_type: flow`)**: skip this phase. Your tools live inside `flow_config.nodes[].tool_id` references — see [`flow-composition-guide.md`](flow-composition-guide.md). The `tools` table itself is still the source of truth (one row per tool, reusable), but you never call `POST /tools/attach` for flow agents.

Tools are webhook endpoints the agent can call during a conversation. This phase has two layers:

- **Layer 1 — Blueprint**: what tools to build and why (platform-agnostic)
- **Layer 2 — Implementation**: actual code, using Supabase edge functions if available

> **Who hosts the tool receiver.** The webhook receiver endpoints — including the example handlers in `templates/functions/*` (`book-appointment`, `check-availability`, etc.) — are **example implementations you host on your OWN infrastructure** (e.g. your own Supabase project) and adapt to your business. Yappr is a platform: it does **not** supply, host, or run tools. You build the receiver endpoint, deploy it, then point a Yappr webhook tool at its URL (`config.url`). Treat the `templates/functions/*` files and the `templates/integrations/*` clients as starting points, not drop-in Yappr features.

### Layer 1 — Tool Philosophy

Apply these rules before deciding what tools to build:

**Rule 1: Bundle secondaries.** Booking an appointment + sending a WhatsApp confirmation + updating the CRM = one edge function, one Yappr tool. The agent sees ONE tool (`bookAppointment`). Secondary actions happen inside the function invisibly. This reduces tool calls, which reduces latency and complexity.

**Rule 2: Pre-fetch + CRUD safeguard.** Pre-fetch calendar availability at dispatch time → inject as `{{AvailableSlots}}` variable. This reduces how often `checkAvailability` is called during the call. But `checkAvailability` MUST still exist as a tool — pre-fetched slots can be stale, and the caller may ask about a time not in the list. The variable is the fast path. The tool is the fallback.

**Rule 3: Full CRUD when the domain is relevant.** If the use case involves appointments → build `checkAvailability`, `bookAppointment`, and (if inbound/support) `cancelAppointment` and `rescheduleAppointment`. Don't create tools that won't be used, but don't skip the safeguards.

**Rule 4: `endCall` is always last.** The system tool is already attached in Phase 1. Write explicit trigger conditions in the system prompt.

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

const calendar = new GoogleCalendarClient(Deno.env.get("GOOGLE_ACCESS_TOKEN")!, Deno.env.get("GOOGLE_CALENDAR_ID") ?? "primary");
const whatsapp = new GreenApiClient(Deno.env.get("GREEN_API_INSTANCE")!, Deno.env.get("GREEN_API_TOKEN")!);
const crm = new HubSpotClient(Deno.env.get("HUBSPOT_TOKEN")!);
```

The client constructor's optional `fetchFn` parameter means the same code works in tests (injected mock) and production (real `globalThis.fetch`).

**When Supabase is not available:** give the user the webhook URL pattern and the expected payload shape. They wire up their own backend.

### Step 2.1 — Creating Tools via Yappr API

> **Reuse before you create.** First `GET /tools` and reuse an existing tool when its capability matches — a single tool row is reusable across many agents and many flow nodes. If only the URL, description, or parameters changed, **`PATCH` the existing tool** instead of minting a new one. Create a NEW tool ONLY when the argument *shape* genuinely differs. Don't duplicate a tool that already exists for the same job (e.g. a second `bookAppointment`).

For each tool, use the file-based approach:

```bash
python3 -c "
import json
payload = {
    'name': 'bookAppointment',
    'description': 'Book an appointment. Call only after the caller has confirmed a specific date, time, and their full name.',
    'type': 'webhook',
    'config': {
        'url': 'https://YOUR_EDGE_FUNCTION_URL',
        'method': 'POST',
        'headers': {},
        'payload_config': {
            'include_standard_metadata': True,
            'static_parameters': [],
            'extraction_parameters': [
                {'name': 'callerName', 'description': 'Full name of the caller as stated', 'required': True},
                {'name': 'preferredDate', 'description': 'Requested appointment date in natural language', 'required': True},
                {'name': 'preferredTime', 'description': 'Requested appointment time in natural language', 'required': True},
                {'name': 'serviceType', 'description': 'Type of service or appointment requested', 'required': False}
            ]
        }
    }
    # idempotency_key: OMIT for a normal create. Same rule as agents — it dedups on identical-key
    # replay (returns the OLD row unchanged, HTTP 200); it is NOT an upsert and does not edit.
    # To change an existing tool, use PATCH /tools/:id. See the idempotency note in Step 1.8.
}
with open('/tmp/tool-payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False)
"
curl -s -X POST "https://api.goyappr.com/tools" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/tool-payload.json | jq .
```

**Tool naming rules:**
- Name MUST be camelCase English: `bookAppointment`, `logLead`, `checkAvailability`
- No snake_case, no spaces, no Hebrew in the name
- Descriptions can be in Hebrew
- All parameter names are normalized to camelCase automatically
- Webhook targets must be final public HTTP(S) URLs; localhost, cloud-metadata hosts, non-global literal or DNS-resolved addresses, mixed public/private DNS answers, and redirects are rejected, so configure the final destination directly
- Custom `Authorization` / `Content-Type` headers are supported, but routing and framing headers (`Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Expect`, `Keep-Alive`, `Proxy-*`, `TE`, `Trailer`, `Upgrade`) are rejected
- Webhook actions run once; do not add `retry_count` because automatic action retries are unsupported

**Attach to agent:**
```bash
curl -s -X POST "https://api.goyappr.com/tools/attach" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID", "tool_id": "TOOL_ID", "execution_order": 0}'
```

One tool per attach call. Increment `execution_order` by 1 for each additional tool.

> **Editing an existing tool?** Don't POST again — use `PATCH /tools/:id`. See [Managing Existing Resources → Tools](#tools).

### Step 2.2 — Writing Tool Instructions in the Prompt

The platform auto-registers tool names, descriptions, and flat parameter schemas with the AI. This applies to prompt agents and to every referenced `tool_call` in a flow. Flow schemas are resolved when the call starts, so a tool/config-override edit applies on the next call. Do NOT repeat the schema in the prompt, and never instruct the model to wrap fields in `args` or send a `node_id`.

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

## endCall
Invoke immediately when:
- The caller says goodbye, bye, talk later, or similar
- The call goal has been achieved and farewell has been said
After your farewell words, invoke immediately — do not wait.
</tools>
```

### Step 2.3 — Test the Tool Webhook

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
- **`call_variables`** — the same `{{VariableName}}` values that were injected into the system prompt. Useful when the tool receiver wants to echo the lead's name into a Slack alert, an outbound WhatsApp, etc. — without re-fetching the call.

**Tool webhooks are synchronous and real-time.** No `GET /calls/:id` round-trip required — everything the receiver needs arrives in one payload. This is what separates tool webhooks from event webhooks (`call.analyzed` etc.) which are minimal and require a follow-up fetch.

See [yappr-api.md — Tool Webhook Payload](yappr-api.md) for the full field reference.

---

## PHASE 3: Call Dispatch

How calls get initiated. Choose the right pattern based on the user's lead source and volume.

> **Before dispatching, check call windows.** Outbound is gated to business hours by default (Sun–Thu/Fri Israel schedule, evaluated in the company timezone). A call placed outside the window returns `202` with `status: "scheduled"` (auto-dispatched at the next opening), and if there's no future window at all it returns `422 OUTSIDE_CALL_WINDOW`. Confirm the timezone is set (dashboard-only) and the windows match the desired hours — see the [Call windows](#call-windows-business-hours) section. Outbound destinations are also screened against the [do-not-call list](#do-not-call-list).

### Layer 1 — Three Dispatch Patterns

**Pattern 1: Direct API**
Best for: low volume, ad-hoc calls, testing, simple automation.
The caller calls `POST /api-v1/calls` directly from their server, script, or automation.

```bash
CALL_REQUEST_ID="$(uuidgen)"

curl -s -X POST "https://api.goyappr.com/calls" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $CALL_REQUEST_ID" \
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

**Safe retry rule.** Generate one `Idempotency-Key` for each intended call. If the response is lost or the API returns a temporary idempotency error, retry the identical body with the same key—never generate a replacement key for an uncertain request. A completed result replays the original status/body without creating another call. A concurrent request returns `409` with `Retry-After`; the same key with a different body returns `409`. Keys remain valid for eight days and are scoped to the workspace, so API-key rotation does not break retries.

**One number, many agents.** The `from` field is a per-call override. Any active number in the company can be paired with any agent — the phone number's `outbound_agent_id` only seeds the dashboard default, it does not constrain the API. Users do NOT need to buy a separate number for each agent. Reuse a single outbound number across every agent; just change `agent_id` per call.

**Pattern 2: Supabase Call Queue**
Best for: high volume, scheduled/batched outbound, retry logic, deduplication.
A `call_queue` table in Supabase holds pending calls. A cron job or edge function drains the queue, fetching pre-call data and calling the Yappr API per lead.

```typescript
// dispatch-calls.ts (Supabase edge function or Node.js script)
// 1. Fetch pending leads from queue
// 2. For each lead, fetch pre-call data (calendar slots, CRM context)
// 3. Format variables
// 4. POST /api-v1/calls with variables injected and the stable queue-row ID as Idempotency-Key
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

**Pattern 4: Campaigns (managed bulk dialing)**
Best for: dialing a whole list — with retries, per-contact stop rules, daily caps, a spend cap, and business-hours pacing — without building any of that yourself.
Instead of draining your own queue, you enroll contacts into a campaign and the platform paces the calls into the same outbound queue `POST /calls` uses. Reach for this whenever the user says "call these N leads" or wants retry logic across days. Full journey: [PHASE 6 — Campaigns](#phase-6-optional-campaigns--bulk-outbound-dialing).

Choosing between Pattern 2/3 and Pattern 4: if the user needs per-lead pre-fetched `variables` (e.g. `{{AvailableSlots}}` computed per contact at dispatch time), keep your own dispatcher — campaign calls are placed by the platform and do not carry per-contact `variables`. If the user needs list management, retries, and pacing, use a campaign.

### Step 3.1 — Variable Pre-Fetch

When using Pattern 2 or 3, pre-fetch data BEFORE calling the Yappr API and inject it as variables. See Appendix D for the full pre-fetch pattern.

The most common pre-fetched variables:
- `{{AvailableSlots}}` — formatted string of open calendar slots for the next 2–3 days
- `{{LeadName}}` — lead's name from the CRM or lead source
- `{{CompanyName}}` — company context if serving multiple clients

---

## PHASE 4: Post-Call Automation

What happens after a call ends. Configure this based on per-disposition routing answers from Phase 0.

### Layer 1 — Webhook Event Guide

Configure the agent's `webhook_url` and `webhook_events` (via PATCH /api-v1/agents/:id or at creation time).

**Event reference:**

| Event | When it fires | Best use |
|-------|---------------|----------|
| `call.no_answer` | Fires immediately when no one picks up | Trigger retry logic |
| `call.failed` | Fires on connection error | Log failure, alert ops |
| `call.dnc_blocked` | Fires when an outbound call (fresh or queued) is blocked by the do-not-call list (`extra_data.queued` distinguishes the two) | Stop retrying — the destination is on DNC and will always be blocked |
| `call.analyzed` | Fires when full AI pipeline completes: transcript + disposition + summary | Main post-call automation trigger |
| `transcript.ready` | Legacy — fires when transcript is saved | Use `call.analyzed` instead |

The full valid event set is: `call.started`, `call.answered`, `call.ended`, `call.failed`, `call.no_answer`, `call.dnc_blocked`, `transcript.ready`, `call.analyzed` (see `yappr-api.md`). The table above is the curated subset most post-call handlers subscribe to.

**Recommended default event set:** `call.no_answer`, `call.failed`, `call.analyzed`

The event body is `{ event, timestamp, agent_id, company_id, call_id, data: {...} }`. The `call.analyzed` `data` object includes: `direction`, `status`, `from_number`, `to_number`, `duration_seconds`, `disposition` (label string or null), `summary`, `transcript`, and `extracted_data` (object with the agent's extraction-parameter values, or absent if none configured). Read these under `payload.data` — e.g. `payload.data.from_number`, not `payload.data.from`. (Note: `from`/`to` ARE the field names on `GET /calls/:id`, but the **webhook event** payload uses `from_number`/`to_number`.)

**Who ended the call (`ended_by`)** — `GET /calls/:id` returns an `ended_by` field that distinguishes hang-up causality: `"caller"` (the human picked up and ended it), `"agent"` (the bot ended it — e.g. timed out or chose to hang up), `"system"` (the platform ended it — e.g. voicemail detection, max duration), or `"unknown"`. Useful for retry and analytics logic so you don't auto-retry calls the user intentionally ended. First-write-wins — once set, it isn't overwritten.

### CRITICAL — Webhook Payload Blind Spot

> **WARNING:** The `call.analyzed` payload is minimal. It does NOT include:
> - The lead object (name, tags, history, metadata)
> - Metadata passed at call creation time (`metadata` field from POST /api-v1/calls)
> - Cost data
> - The full disposition object — only the label string is included, and it may be `null` if AI classification failed
>
> **To get the full call record** including resolved lead, full disposition object, and all metadata: `GET /api-v1/calls/:id` after receiving the webhook.
>
> **Pattern for needing the lead's name in a post-call WhatsApp:**
> - Option A: pass `"name": "ישראל כהן"` in `metadata` when creating the call → read from webhook's call record after fetching `GET /api-v1/calls/:id`
> - Option B: fetch `GET /api-v1/calls/:id` immediately after receiving the webhook — the response includes the full lead object

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

Returns Israeli mobile numbers in this shape:
```json
{
  "numbers": [
    {
      "phoneNumber": "+972XXXXXXXXX",
      "friendlyName": "...",
      "locality": "...",
      "region": "...",
      "capabilities": { "voice": true, "sms": false },
      "pricing": { "basePriceCents": 0, "finalPriceCents": 1000, "priceDisplay": "$10.00", "currency": "USD", "markupPercentage": 0 }
    }
  ],
  "numberType": "mobile",
  "pagination": { "currentPage": 1, "totalPages": 1, "totalNumbers": 10, "limit": 10 }
}
```

Present the list with numbers and pricing (`pricing.priceDisplay`). Ask which they want.

**Confirm before purchasing:** *"Purchasing [number] will start a $10/month recurring charge on your saved card. Shall I go ahead?"*

**Purchase:**
```bash
curl -s -X POST "https://api.goyappr.com/phone-numbers/purchase" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+972XXXXXXXXX"}' | jq .
```

Request field is `phone_number` (snake_case). **Only Israeli phone numbers are supported** — a non-IL number returns `400 {"error":"Only Israeli phone numbers are supported"}`.

Response shape:
```json
{ "success": true, "phoneNumber": "+972XXXXXXXXX", "monthlyPrice": 10, "currency": "USD", "status": "pending_requirements", "message": "..." }
```

`status` is `pending_requirements` at purchase time — the number is NOT immediately `active`. It activates later once carrier requirements clear (promoted by a background job). The purchased number may differ from what was selected (race-condition fallback), so always show the `phoneNumber` from the response, not the one you requested.

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

**The model: slug = bearer credential, no SIP digest auth.** The URI we hand the customer contains a 24-char random suffix (~120 bits of entropy). Anyone with the URI can dial the agent — treat it like an API key. To rotate access, delete the endpoint and create a new one (the new URI has a fresh slug).

**Create the endpoint via API:**

```bash
curl -s -X POST "https://api.goyappr.com/sip-endpoints" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "After-hours", "inbound_agent_id": "AGENT_UUID"}'
```

The response includes `sip_uri` — that's everything the customer needs. There is no `sip_username` or `sip_password` to copy.

**Hand the URI to the customer's telephony.** They paste it as the SIP destination in their PBX/CPaaS outbound route. No authentication setup. UDP, TCP, and TLS are all supported by the upstream SIP gateway; G711/G722 codecs are advertised.

Concrete example pastes for common platforms:
- **Twilio Studio** — set the "Connect Call To" SIP value in the appropriate widget to `sip_uri`
- **Twilio TwiML** — `<Dial><Sip>{{sip_uri}}</Sip></Dial>` (no `username`/`password` attributes)
- **Asterisk** — `Dial(SIP/<slug>@yappr-byoc.sip.telnyx.com)` from your dialplan
- **FreeSWITCH** — `<action application="bridge" data="sofia/external/<sip_uri>"/>` in the relevant XML route
- **3CX / Yeastar / hosted PBX** — paste the URI as the "SIP trunk destination" with auth set to "none"

**Optional: source-IP allowlist.** If the customer's PBX has a fixed egress IP, pass `allowed_source_ips: ["1.2.3.4/32"]` on create (or PATCH later). Calls from any other IP are rejected pre-answer. Useful defense-in-depth on top of slug obscurity.

**Manage existing endpoints (the lifecycle the rotation recipe relies on):**

```bash
# List endpoints (find the id) — returns { data: [...], total, limit, offset }
curl -s "https://api.goyappr.com/sip-endpoints" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.data[] | {id, name, is_active, sip_uri}'

# PATCH — add a source-IP allowlist, or flip is_active
curl -s -X PATCH "https://api.goyappr.com/sip-endpoints/SIP_ENDPOINT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"allowed_source_ips": ["1.2.3.4/32"], "is_active": true}'

# DELETE — the rotation recipe: delete, then re-create to get a fresh slug/URI
curl -s -X DELETE "https://api.goyappr.com/sip-endpoints/SIP_ENDPOINT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

**Caller-ID note.** Because the upstream is customer-controlled, the caller-ID arriving in the SIP `From` header cannot be trusted by default. Yappr **skips lead-context lookups** on calls arriving via SIP endpoints unless the agent has `trust_external_sip_caller_id = true`. Set that only when the upstream is operated directly by the customer and they vouch for the caller-ID.

**Pre-launch checklist for SIP endpoints:** all the standard items in Step 5.2 still apply, plus:

- [ ] Customer's PBX/CPaaS outbound SIP route is set to the exact `sip_uri` value (no auth)
- [ ] A test call from the customer's system reaches the agent (the call appears in the dashboard call log, and via `GET /calls`)
- [ ] The customer understands the caller-ID trust model (default: untrusted)
- [ ] The endpoint is marked `is_active: true`
- [ ] If the URI ever needs to be revoked, the recipe is delete-and-recreate (not rotate)

### Step 5.2 — Pre-Launch Checklist

Before telling the user they're live, verify each item:

- [ ] Agent exists and `is_active: true` (GET /agents/:id)
- [ ] `end_call` system tool is attached to every agent
- [ ] All webhook tools created, attached, and tested (POST /tools/:id/test)
- [ ] Phone number is active (or pending regulatory approval with explanation)
- [ ] Phone number is assigned to the correct agent(s)
- [ ] Billing balance is above $5 (GET /billing)
- [ ] Webhook URL is set on the agent if post-call automation is needed
- [ ] `call.no_answer` and `call.analyzed` events are in the `webhook_events` list
- [ ] Any custom variables used in the system prompt are documented — caller must supply them at call creation time
- [ ] Dispositions needed for routing are created
- [ ] Company timezone is correct (dashboard-only — Company settings) and call windows (`GET /call-windows`) match the desired calling hours — outbound gating defaults **ON** with a Sun–Thu/Fri Israel schedule, so a wrong timezone or no future window silently 202-schedules or 422-rejects calls at the wrong local time. See the [Call windows](#call-windows-business-hours) section.
- [ ] At least one agent-eval suite passes before going live (`POST /agent-eval/suites/:id/run`) — see the [Agent Eval](#agent-eval--programmatic-regression-testing) section

### Step 5.3 — Test the Agent

**Before any manual test, run a regression suite if you have one** — the single manual call below proves the happy path, not that you didn't break greeting routing, refusals, or a flow transition. See the [Agent Eval](#agent-eval--programmatic-regression-testing) section / [`agent-eval-guide.md`](agent-eval-guide.md) to run `POST /agent-eval/suites/:id/run` and gate go-live on the pass rate. For flow agents, also smoke-test the graph with the hermetic [flow simulator](#step-1b6--smoke-test-the-flow-graph-free-hermetic) first.

Then offer these manual options:

**Option A: Web Call (recommended — no phone needed)**

```
https://app.goyappr.com/he/agents/AGENT_ID
```

Direct link to the agent's page in the Yappr dashboard. Click "Test Call" to speak with the agent in the browser.

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

**Option C: Send a shareable test link (no dashboard login needed)**

Mint a public web-call link to hand the client so they can try the agent without a Yappr account. Returns a `https://app.goyappr.com/share/{token}` URL.

```bash
curl -s -X POST "https://api.goyappr.com/shared-links" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID", "expires_at": "2026-06-30T00:00:00Z"}' | jq .
```

`expires_at` is optional. To revoke a link, `PATCH /shared-links/:id` with `{"is_revoked": true}` (there is no DELETE). List/manage existing links in [Managing Existing Resources → Shared links](#shared-links).

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
| An agent, with a **positive** `max_call_duration_secs` | `GET /agents/:id` — `0` means unlimited and campaigns refuse it, because worst-case cost would be unbounded |
| An active from-number | `GET /phone-numbers` — needs `is_active: true` and `status: "active"` |
| A reachable workspace calling window | `GET /call-windows` — this is the schedule the campaign obeys; confirm the timezone too (dashboard-only) |
| Credit above the call floor | `GET /billing` |
| A compliance basis the user can attest to | Ask (see Step 6.4) |
| An agent that does **not** depend on custom `{{Variables}}` | Campaign calls are placed by the platform and carry **no per-call `variables`**, so a custom `{{AvailableSlots}}` would render empty. Built-ins (`{{CurrentDate}}`, `{{CallerPhone}}`, `{{Timezone}}`, …) still work, and per-contact context belongs in the lead's memory (`notes` at enroll → `long_term_context`). If the prompt genuinely needs per-lead pre-fetched values, dispatch with Phase 3 Pattern 2/3 instead of a campaign |

### Step 6.1 — Create the draft

Name is the only required field, but **no configuration field has a default** — anything you never send stays `null` and `launch` refuses with `422 CAMPAIGN_NOT_READY` naming it. So either send the full configuration here, or plan on Steps 6.3 and 6.4 filling every gap. Everything is PATCH-able until the campaign is terminal.

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

- Names need not be unique, so a create never fails on the name. That makes the create-vs-edit gate your judgement, not the API's: `GET /campaigns` first and PATCH an existing campaign rather than minting a near-duplicate of it.
- `400` naming a field → the writable allowlist is strict, and **unknown or read-only keys are rejected, never ignored**. If you sent `status`, `spent_cents`, or a misspelling like `stop_dispositions`, fix the key and retry.

### Step 6.2 — Enroll contacts

Two inputs, usable in the same request, capped at **1,000 contacts per request** (send several requests for a bigger list). Enrolling works on a `draft` **and** on a `running` campaign — you can top up a live list.

**From existing leads** (use this when the leads are already in Yappr, e.g. imported earlier or created by a lead-source integration):

```bash
# Resolve ids first. GET /leads supports limit/offset/search (name, phone, email) —
# there is no tag filter, so page through and select client-side if you need one.
curl -s "https://api.goyappr.com/leads?limit=100" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq -r '[.data[] | select(.tags[]?.name == "Renewal") | .id]'

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
- `409 ALREADY_IN_ACTIVE_CAMPAIGN` — see the failure table below. The report in the body still tells you what *did* land.

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
    "randomize_retry_time": true,
    "max_attempts": 3
  }' | jq '{stop_disposition_ids, stop_on_voicemail, max_attempts}'
```

**Why ids and not labels.** Labels are per-workspace text and are renameable; ids are stable. A stop set stored by label would silently disarm the moment somebody renamed "Not Interested". The API only accepts ids, and every id must belong to this workspace (otherwise `400`).

**Why `No Answer`, `Failed`, and `Voicemail` must NOT go in `stop_disposition_ids`.** Those three labels are *also* auto-assigned by the platform, and the outcome classifier legitimately assigns them to calls where a human really did talk — a receptionist answering a 90-second call can land "No Answer". Put them in the stop set and you permanently retire real conversations as never-reached. Use the booleans instead, which are evaluated on the call's **outcome class** rather than its label:

| Instead of putting this in the stop set | Use |
|---|---|
| `No Answer` | `stop_on_no_answer: true`. Normally you want `false` here — an unanswered call is usually worth retrying |
| `Voicemail` | `stop_on_voicemail: true` |
| `Failed` | nothing — platform failures use the separate `max_infra_retries` budget and never consume a dial attempt |
| "we reached a human, we're done" | Create a disposition for that outcome (`POST /dispositions`) and put its id in `stop_disposition_ids`. There is no built-in rule — what counts as a real conversation differs per workspace |

A launch needs at least one stop rule, and **nothing is armed for you** — no configuration field has a default, so a campaign you never gave a stop rule is refused rather than quietly given one. Arm the real outcome set: without it, people who already said no are redialled until the attempt cap.

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
    "retry_no_answer_seconds": 3600,
    "retry_completed_seconds": 86400,
    "randomize_retry_time": true,
    "disposition_timeout_seconds": 900,
    "double_dial_enabled": false,
    "double_dial_gap_seconds": 90,
    "stop_on_unclassified": false,
    "budget_cents": 5000
  }' | jq '{regulatory_basis, max_calls_per_day, max_in_flight, budget_cents}'
```

| Control | Sensible starting point | Why |
|---|---|---|
| `max_calls_per_day` | 150–200 | Resets on the workspace's own calendar day |
| `min_seconds_between_calls` | 30–60 | Spacing between admissions |
| `max_in_flight` | 2 (max 8) | How many attempts this campaign may have outstanding. It is **self-restraint, not a capacity grant** — the platform's shared outbound lanes are the real ceiling, so raising it does not make the campaign faster once the queue is busy |
| `max_attempts` | 3 | Per-contact dial cap |
| `retry_no_answer_seconds` | 3600 | Redial gap after nobody picks up. Also covers voicemail and busy |
| `retry_completed_seconds` | 86400 | Redial gap after a call that connected but didn't hit a stop rule |
| `randomize_retry_time` | ask the user | `false` keeps the wait exact — a one-week wait retries at the same hour a week later. `true` picks a different hour inside the calling window, so repeat attempts don't always land at the same moment. Either way the retry is never *earlier* than the wait |
| `double_dial_enabled` | `false` | A second ring moments after an unanswered first one. The pair counts as one attempt |
| `budget_cents` | the amount the user is comfortable spending | Enforced against spend **plus** in-flight reservations, so a campaign can't blow the cap with calls already dialing |

**`regulatory_basis` is required before launch** — one of `consent`, `existing_customer`, `non_marketing`, `registry_screened`. Ask the user which is true; do not pick for them. It is recorded on the launch audit event with the enrolled count, and it is the artefact that exists if anyone later asks why a person was called.

**Every field above is required before launch**, along with `stop_on_no_answer`, `stop_on_voicemail`, `stop_on_unclassified` and `double_dial_gap_seconds`. There are no defaults, so `launch` returns `422` listing whatever is still `null` — send them all and the first launch attempt succeeds.

**When the campaign may dial** comes from the workspace call windows (`GET`/`PUT /call-windows`), not from the campaign. If the user wants campaign-specific hours, set the workspace schedule accordingly and say so.

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
| `from_number_unavailable` | The calling number went inactive → `paused_infra` | assign an active number, then `resume` |
| `agent_has_no_duration_cap` | The agent's max call duration was set to unlimited → `paused_config` | set a positive `max_call_duration_secs`, then `resume` |
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
| `regulatory_basis` is required before launching | `PATCH` with `consent` / `existing_customer` / `non_marketing` / `registry_screened` — ask the user which is true |
| Configure at least one stop rule before launching | Set `stop_disposition_ids`, or one of `stop_on_no_answer` / `stop_on_voicemail` |
| Finish configuring the campaign before launching. Not set: … | Every config field is `null` until you send it; the message names each one. `PATCH` them and launch again |
| The assigned agent no longer exists | Point `agent_id` at a live agent (`GET /agents`) |
| The assigned agent has no maximum call duration set | `PATCH /agents/:id` with a positive `max_call_duration_secs` — `0` = unlimited, which campaigns refuse because worst-case cost would be unbounded |
| The phone number assigned to this campaign is no longer active | Pick a number with `is_active: true` and `status: "active"` |
| This workspace has no upcoming calling window | `PUT /call-windows` (and confirm the workspace timezone, which is dashboard-only) |
| Enroll at least one contact before launching | `POST /campaigns/:id/leads` — and check the enroll report: everything may have been filtered as DNC or invalid |

**`409 ALREADY_IN_ACTIVE_CAMPAIGN` on enroll.** One or more numbers are already live in another active campaign. A number can only be dialed by one campaign at a time, workspace-wide — this is the guard that stops the same person being called twice as fast. Do not retry blindly. Instead: `GET /campaigns?status=running,paused` and find the other campaign; then either finish/stop it, exclude the overlapping contacts there, or drop them from this enroll batch. The 409 body still contains the full report, so contacts that did land are enrolled.

**`paused_insufficient_credit` auto-resumes; `paused` does not.** When the balance falls under the floor the campaign parks itself as `paused_insufficient_credit` and the tick re-checks every minute — after a top-up (checkout, auto-topup, or credit added by an admin) it returns to `running` on its own, with `last_tick_result: "resumed_credit_ok"`. Do not call `launch` in a loop, and do not tell the user to relaunch. Every **other** paused state (`paused`, `paused_budget`, `paused_infra`, `paused_config`) needs an explicit `resume` after the cause is fixed — deliberately, so a human pause is never undone by a payment.

**`awaiting_disposition` means "wait", not "stuck".** Outcomes are classified asynchronously after the call ends — usually within seconds, occasionally much later. A contact sits in `awaiting_disposition` until it's classified or until `disposition_timeout_seconds` (default 1800) elapses, and `stop_on_unclassified` then decides whether to retire or retry it. **Never redial a contact in this state** and never "help" by placing a `POST /calls` to that number: the platform is deliberately holding it, and a manual dial can call somebody who already asked you to stop. If a user reports "it's stuck", check `attempts_in_flight` and `last_tick_result` before concluding anything.

**Other errors:** `400` naming a field means the writable allowlist rejected a key or a value range — fix the request, never work around it by re-creating the campaign. `400 Campaign is completed/stopped/archived` means you're editing a terminal campaign; create a new one.

**Parsing campaign errors.** The three coded campaign errors put the machine code in `error` and the human text in `message` (`{"error": "CAMPAIGN_NOT_READY", "message": "Assign an agent before launching"}`), which is the reverse of the platform's usual `{"error": "<human>", "code": "<CODE>"}`. Read `code` first, then fall back to `error` when it looks like a code, and always surface `message` to the user — it names the one thing to fix.

### Report it like this

When a campaign is live, tell the user: how many contacts enrolled (and how many were excluded as DNC/invalid), the stop rules in plain language ("we stop calling someone once they book, say no, or we reach a human"), the pace ("up to 150 calls a day, one every 45 seconds, within your 09:00–19:00 hours"), the spend cap, and how they'll know it's done. Then verify with `GET /campaigns/:id/stats` and quote the real numbers back — never just the launch response.

---

## Managing Existing Resources

**This is the EDIT path.** Whenever the user wants to change / update / fix / rename / adjust / disable an existing resource (the [create-vs-edit gate](#decision-new-build-or-change-to-an-existing-system) routed you here), work entirely from this section — `GET` the record, `PATCH` only the changed fields, verify with another `GET`. **Do not POST a new resource to "update" one.** Always fetch and present the options first, then act on their selection. Resolve the id from the Phase 0 `EXISTING RESOURCES` block — never ask the user to provide an id manually.

### PATCH gotchas

These are **recoverable** errors — fix the request and retry the PATCH. They are NOT a reason to fall back to POST / recreate the resource:

- **Field names must be snake_case.** A camelCase field (e.g. `flowConfig`, `systemPrompt`) returns `400` with a corrective message. Re-send with snake_case (`flow_config`, `system_prompt`).
- **`type` (prompt vs flow) is immutable after create.** A PATCH that includes `type` is rejected. Changing *type* genuinely does require a new agent — but ONLY type. Every other field is freely PATCH-able; don't recreate the whole agent for a voice/prompt/webhook change.
- **`flow_config` cannot be set to `null`.** To take a flow agent out of service, **deactivate it** (`DELETE /agents/:id`, which is a soft-deactivate), don't null its flow.
- **`flow_config` only applies to `type=flow` agents.** Sending it to a prompt agent is rejected.

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

# Deactivate
curl -s -X DELETE "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

### Tools

```bash
# List webhook tools
curl -s "https://api.goyappr.com/tools" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | select(.type == "webhook") | {id, name, description}]'

# Get full config
curl -s "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Patch
curl -s -X PATCH "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"config": {"url": "https://new-url.com/webhook", "method": "POST"}}'

# Test webhook
curl -s -X POST "https://api.goyappr.com/tools/TOOL_ID/test" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Get tools attached to a specific agent
curl -s "https://api.goyappr.com/tools?agent_id=AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | {id, name, type, execution_order}]'

# Detach from agent
curl -s -X POST "https://api.goyappr.com/tools/detach" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID", "tool_id": "TOOL_ID"}'

# Deactivate
curl -s -X DELETE "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

### Leads

```bash
# List / search
curl -s "https://api.goyappr.com/leads?limit=20&search=john" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Create — long_term_context is settable on create (AI memory injected into the agent's
# system prompt for this lead). Provenance goes in metadata, NOT source: API-created leads
# are always source:"api" (not caller-settable, to prevent spoofing reporting).
curl -s -X POST "https://api.goyappr.com/leads" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+972501234567",
    "name": "John Smith",
    "tags": ["Hot Lead"],
    "long_term_context": "Interested in premium plan. Prefers morning calls.",
    "metadata": { "origin": "facebook-lead-ads" }
  }'

# Update (tags replaces all; long_term_context also settable via PATCH)
curl -s -X PATCH "https://api.goyappr.com/leads/LEAD_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"long_term_context": "Interested in premium plan. Prefers morning calls."}'

# Soft delete
curl -s -X DELETE "https://api.goyappr.com/leads/LEAD_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

### Dispositions

Only **custom** dispositions can be PATCHed or DELETEd. All 10 seeded defaults are protected — PATCH/DELETE on a default returns `403 PROTECTED` (see [Appendix E](#appendix-e-disposition-reference)).

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

### Shared links

Public, no-login web-call links for an agent — `https://app.goyappr.com/share/{token}`. Hand one to a client so they can try the agent without a Yappr account (see Step 5.3 Option C). There is **no DELETE** — revoke via PATCH.

```bash
# List (most recent first) — returns { data: [...] }
curl -s "https://api.goyappr.com/shared-links" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | {id, agent_id, url, status, expires_at}]'

# Create — expires_at optional
curl -s -X POST "https://api.goyappr.com/shared-links" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID", "expires_at": "2026-06-30T00:00:00Z"}' | jq .

# Revoke (no DELETE — PATCH is_revoked)
curl -s -X PATCH "https://api.goyappr.com/shared-links/SHARED_LINK_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"is_revoked": true}'
```

### Campaigns

Full journey (create → enroll → stop rules → pacing → launch → monitor) is [PHASE 6](#phase-6-optional-campaigns--bulk-outbound-dialing). The edit path for an existing campaign:

```bash
# List (filter by status; comma-separated)
curl -s "https://api.goyappr.com/campaigns?status=running,paused" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | {id, name, status, total_leads, last_tick_result}]'

# Get full config (agent, from-number and stop dispositions are expanded)
curl -s "https://api.goyappr.com/campaigns/CAMPAIGN_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Patch config — safe while running; the next tick picks it up
curl -s -X PATCH "https://api.goyappr.com/campaigns/CAMPAIGN_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"max_calls_per_day": 300, "min_seconds_between_calls": 20}'

# Progress + why nothing is dialing
curl -s "https://api.goyappr.com/campaigns/CAMPAIGN_ID/stats" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '{status, last_tick_result, leads_by_status}'
```

Gotchas worth flagging to the user:
- Only the config allowlist is writable. `status`, `spent_cents`, `daily_admitted_count`, `last_tick_result` and the other engine-owned fields are rejected with `400` — change status through `launch` / `pause` / `resume` / `stop`, never a PATCH.
- A `completed`, `stopped` or `archived` campaign cannot be edited (`400`). Create a new one.
- `DELETE /campaigns/:id` **archives** (hides it and retires live contacts) — confirm first; prefer `pause`/`stop` to just halt dialing.
- `paused_insufficient_credit` resumes by itself after a top-up. A manual `paused` does not.

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

### Call windows (business hours)

Per-company time-of-day gate on inbound and outbound calls, evaluated in the workspace's timezone. Defaults to **outbound on / inbound off**, with a Sun–Thu 09:00–19:00 + Fri 09:00–11:30 schedule seeded on company creation (Saturday closed).

Outside any allowed window, `POST /calls` returns `202` with `status: "scheduled"` and a `scheduled_for` timestamp — the platform dispatches the call automatically at the next opening. Inbound calls (when enforcement is on for inbound) are hung up before being answered — no `call_logs` row is written.

```bash
# Read the current configuration
curl -s "https://api.goyappr.com/call-windows" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .

# Replace the schedule — Sun–Thu split into morning + afternoon blocks
curl -s -X PUT "https://api.goyappr.com/call-windows" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "outbound_enabled": true,
    "inbound_enabled": false,
    "windows": [
      { "day_of_week": 0, "start_time": "09:00", "end_time": "13:00" },
      { "day_of_week": 0, "start_time": "14:00", "end_time": "18:00" }
    ]
  }'

# Turn outbound gating off without losing the schedule
curl -s -X PUT "https://api.goyappr.com/call-windows" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "outbound_enabled": false }'
```

Gotchas worth flagging to the user:
- `day_of_week` is 0=Sunday … 6=Saturday. A day with no rows is fully closed for whichever direction is enforced.
- `start_time` must be strictly before `end_time` — no overnight wrap-around. To express e.g. 22:00–02:00, use two rows on consecutive days.
- Two ranges on the same day must not overlap (`400 INVALID_CALL_WINDOWS`).
- The timezone comes from `companies.timezone` — set it in the Company settings tab before relying on the schedule.
- If outbound is enforced and the company has no future window at all (every day empty), `POST /calls` returns `422 OUTSIDE_CALL_WINDOW` instead of queueing indefinitely.

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

### Consumption / spend reporting

`GET /billing/consumption` reports how much the workspace spent over a date range, bucketed however you ask — ideal for the agency/reseller use case ("how much did this client spend on voice calls vs phone numbers this month, per agent").

Query params:
- `group_by` — `day` | `month` | `total` | `agent` | `product` (default `total`)
- `from`, `to` — ISO date range
- `product` — filter to a single product (e.g. voice, phone number)
- `include_topups` — include credit top-ups in the totals (default excludes them, so you see usage cost only)

Each bucket returns an `amount` and a `count`.

```bash
# Per-agent spend this month
curl -s "https://api.goyappr.com/billing/consumption?group_by=agent&from=2026-06-01&to=2026-06-30" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

---

## Skill Scope

This skill covers: agents, tools, phone numbers, calls, campaigns (bulk outbound dialing), dispositions, leads, lead tags, shared links, billing, SIP endpoints (BYOC inbound), do-not-call list, call windows (business hours), OAuth integrations, and agent eval (programmatic regression testing).

Out of scope: raw carrier SIP **trunk** provisioning (distinct from the supported BYOC **SIP endpoints** feature in Step 5.1b), team/user management, WhatsApp directly (only via webhook to an external service), model training, non-Israeli phone numbers.

**No company API resource.** Workspace-level settings — company **timezone** and team/members — are **dashboard-only**; there is no `POST /company`. The only company-level setting the API can change is **call windows** (`PUT /call-windows`), which assumes the timezone is already correct (set it in the dashboard Company settings first).

If a request is out of scope, say so clearly and offer the developer consultation link: **https://cal.com/yappr/skill-dev-consultation**

Offer the consultation whenever the user has tried something 2+ times without success, expresses confusion or frustration, or asks for help.

---

## Error Handling

For exact error codes and HTTP status meanings, see `yappr-api.md`. Quick reference:

| Status | Meaning |
|--------|---------|
| 400 | Bad request — check field names and values |
| 401 | Auth failed — verify API key and scopes |
| 402 | Billing — add balance or payment method |
| 403 | Forbidden — resource not found or protected |
| 404 | Not found in this workspace (or archived) |
| 409 | Conflict — duplicate name, idempotency-key reuse, or a contact already live in another campaign |
| 422 | Preconditions not met — e.g. `CAMPAIGN_NOT_READY` (launch preflight), `OUTSIDE_CALL_WINDOW`. `message` names the single blocking cause; fix it and retry |
| 429 | Rate limit or concurrent call limit — wait and retry |
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

**Recommended pick:** `Michal` when use case is unclear. Match gender to the agent's persona in the system prompt. Always set `voice` explicitly in the create payload — the server-side fallback for an omitted voice is `Rachel`, not Michal.

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
| `max_call_duration_secs` | 600 | Hard cap on total call length. `0` = disabled. |
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
| Interested | Yes | AI classifier |
| Not Interested | Yes | AI classifier |
| Callback Requested | Yes | AI classifier |
| Appointment Set | Yes | AI classifier |
| Issue Resolved | Yes | AI classifier |

**Protected dispositions:** all 10 default dispositions are protected — they cannot be edited or deleted. Attempting to PATCH or DELETE one returns `403 PROTECTED`. Do not try to recreate them. Only custom dispositions you create can be edited or deleted.

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

**Response:** `{ "status": "created" }`. Deduplication against open tickets happens server-side and is intentionally **not** surfaced to the caller — every successful report returns `"created"`, even if it was deduped. Do not branch on a `"duplicate"` status; the API never returns one.

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
