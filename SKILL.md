---
name: yappr-agent-builder
description: Build, configure, and launch complete Yappr AI voice agent systems end-to-end. Use when users want to create a voice agent, set up outbound call dispatch, configure post-call automation, manage leads, or go live with a phone number. Discovery-driven — queries the live account before asking the user anything.
---

# Yappr Super Voice AI Agent Builder

This skill takes a coding agent through building a complete, production-ready voice AI system on Yappr — from discovery through agent creation, tooling, call dispatch, post-call automation, and going live. Every decision flows from what the user tells you and from live data fetched from their account.

---

## How to Use This Skill

This skill is organized into phases. Work through them sequentially. Each phase's output feeds the next.

**Before writing any code or making any API call**, run Phase 0 discovery — query the live account and ask the user the questions. The answers determine everything that follows.

### Core files in this skill directory

| File / Directory | When to open it |
|------|----------------|
| `yappr-api.md` | Anytime you need an exact endpoint shape, request/response fields, validation rules, or error codes |
| `HUMANIZE_PLAYBOOK.md` | When writing or reviewing any agent system prompt — research-backed principles for voice AI dialogue |
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

**Create the agent** — use the file-based payload approach (required for Hebrew/special characters):

```bash
python3 -c "
import json, uuid
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
    'idempotency_key': str(uuid.uuid4())
}
with open('/tmp/agent-payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False)
"
curl -s -X POST 'https://api.goyappr.com/agents' \
  -H 'Authorization: Bearer $YAPPR_API_KEY' \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/agent-payload.json | jq .
```

Save the returned `id`.

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

## PHASE 2: Tooling

Tools are webhook endpoints the agent can call during a conversation. This phase has two layers:

- **Layer 1 — Blueprint**: what tools to build and why (platform-agnostic)
- **Layer 2 — Implementation**: actual code, using Supabase edge functions if available

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

const calendar = new GoogleCalendarClient(Deno.env.get("GOOGLE_ACCESS_TOKEN")!);
const whatsapp = new GreenApiClient(Deno.env.get("GREEN_API_INSTANCE")!, Deno.env.get("GREEN_API_TOKEN")!);
const crm = new HubSpotClient(Deno.env.get("HUBSPOT_TOKEN")!);
```

The client constructor's optional `fetchFn` parameter means the same code works in tests (injected mock) and production (real `globalThis.fetch`).

**When Supabase is not available:** give the user the webhook URL pattern and the expected payload shape. They wire up their own backend.

### Step 2.1 — Creating Tools via Yappr API

For each tool, use the file-based approach:

```bash
python3 -c "
import json, uuid
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
                {'name': 'callerName', 'description': 'Full name of the caller as stated'},
                {'name': 'preferredDate', 'description': 'Requested appointment date in natural language'},
                {'name': 'preferredTime', 'description': 'Requested appointment time in natural language'},
                {'name': 'serviceType', 'description': 'Type of service or appointment requested'}
            ]
        }
    },
    'idempotency_key': str(uuid.uuid4())
}
with open('/tmp/tool-payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False)
"
curl -s -X POST 'https://api.goyappr.com/tools' \
  -H 'Authorization: Bearer $YAPPR_API_KEY' \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/tool-payload.json | jq .
```

**Tool naming rules:**
- Name MUST be camelCase English: `bookAppointment`, `logLead`, `checkAvailability`
- No snake_case, no spaces, no Hebrew in the name
- Descriptions can be in Hebrew
- All parameter names are normalized to camelCase automatically

**Attach to agent:**
```bash
curl -s -X POST "https://api.goyappr.com/tools/attach" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID", "tool_id": "TOOL_ID", "execution_order": 0}'
```

One tool per attach call. Increment `execution_order` by 1 for each additional tool.

### Step 2.2 — Writing Tool Instructions in the Prompt

The platform auto-registers tool names, descriptions, and parameter schemas with the AI. Do NOT repeat these in the prompt.

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

- `"success": true` + `status_code: 200` → show the user the `payload_sent` field
- `"error": ...` → explain clearly and give options (fix URL now, or continue and fix later)

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

## PHASE 4: Post-Call Automation

What happens after a call ends. Configure this based on per-disposition routing answers from Phase 0.

### Layer 1 — Webhook Event Guide

Configure the agent's `webhook_url` and `webhook_events` (via PATCH /api-v1/agents/:id or at creation time).

**Event reference:**

| Event | When it fires | Best use |
|-------|---------------|----------|
| `call.no_answer` | Fires immediately when no one picks up | Trigger retry logic |
| `call.failed` | Fires on connection error | Log failure, alert ops |
| `call.analyzed` | Fires when full AI pipeline completes: transcript + disposition + summary | Main post-call automation trigger |
| `transcript.ready` | Legacy — fires when transcript is saved | Use `call.analyzed` instead |

**Recommended default event set:** `call.no_answer`, `call.failed`, `call.analyzed`

The `call.analyzed` payload includes: `direction`, `status`, `from`, `to`, `duration_seconds`, `disposition` (label string or null), `summary`, `transcript`.

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

### Step 5.3 — Test the Agent

Two options — offer both:

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

This skill covers: agents, tools, phone numbers, calls, dispositions, leads, lead tags, shared links, billing.

Out of scope: custom SIP trunks, team/user management, WhatsApp directly (only via webhook to an external service), model training, non-Israeli phone numbers.

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

## Reporting Issues to the Yappr Team

If you encounter a bug, unexpected API behaviour, or the user requests a feature that doesn't exist, report it directly to the Yappr team. This creates a tracked ticket — no API key required.

**Endpoint:** `POST https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/report-issue`

**No authentication required.** The endpoint is public and rate-limited (10 reports/hour per IP).

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
curl -s -X POST "https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/report-issue" \
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
