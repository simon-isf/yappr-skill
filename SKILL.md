---
name: yappr-agent-builder
description: Create, configure, and launch Yappr AI voice agents from scratch. Use when users want to build a voice agent, set up a phone number, configure webhooks, manage their Yappr account, or test their agent with a call. Guides non-technical users through the entire process conversationally.
---

# Yappr Agent Builder

Build and launch AI voice agents on the Yappr platform entirely from the command line. This skill walks users through every step — from account setup to a live phone number answering calls with their custom AI agent.

---

## Version Check (run every session)

**Before doing anything else**, check if a newer version of this skill is available:

1. Run `git -C <skill-directory> fetch origin main --quiet` to fetch the latest remote state.
2. Run `git -C <skill-directory> rev-parse HEAD` to get the current local commit.
3. Run `git -C <skill-directory> rev-parse origin/main` to get the latest remote commit.
4. If they differ, tell the user:
   > A new version of the Yappr Agent Builder skill is available. Would you like to upgrade?
5. If the user agrees, run `git -C <skill-directory> pull origin main --ff-only`.
6. If the user declines, continue with the current version — do not ask again during this session.
7. If they match, proceed silently — do not mention versioning.

Replace `<skill-directory>` with the actual path to this skill's directory (the folder containing this SKILL.md file).

---

## Skill Scope Guardrail

**This skill can only do what is explicitly documented below.** Before acting on any user request, check whether the action maps to a documented capability in this file.

### How to handle out-of-scope requests

1. **Scan this skill file** for any section, endpoint, or configuration option that could address the request.
2. **If found** — proceed with the documented approach.
3. **If not found** — do not improvise, guess at undocumented API parameters, or attempt workarounds. Instead, tell the user clearly:

   > "That's not something I'm able to do through this skill. The Yappr Agent Builder skill covers: creating and updating agents, configuring webhook tools, purchasing and assigning phone numbers, managing billing, and testing calls. [Requested thing] isn't part of what I can configure from here."

   Then offer the **Free Developer Help** option (see end of this document) if the request sounds like something a Yappr developer could assist with.

### What this skill covers (full scope)

| Category | Capabilities |
|----------|-------------|
| **Agents** | Create, update (PATCH), deactivate, list, view full config |
| **Agent config** | Name, system prompt, voice, language, temperature, greeting, event webhook, VAD/turn-taking settings |
| **Tools** | Create webhook tools, attach/detach to agents, update, test, deactivate |
| **Tool config** | Webhook URL, method, headers, extraction parameters, static parameters, standard metadata |
| **Phone numbers** | Search available Israeli numbers, purchase, assign inbound/outbound agent |
| **Billing** | View balance/status, add payment method (Stripe setup link), top-up credits (with approval) |
| **Calls** | List calls with filters, view call details, trigger outbound test call, link to web call in dashboard |
| **Dispositions** | List, create, update, delete call disposition labels |
| **Leads** | List, create, update, delete leads; search by name/phone/email; manage long-term AI memory per lead |
| **Lead tags** | List, create, update, delete lead tag taxonomy |
| **Shared links** | Create, list, revoke shareable web-call testing links |

### Examples of out-of-scope requests

- "Can you set up a custom SIP trunk?" — Not configurable via this skill.
- "Can you add a new user to my account?" — User/team management is not in this skill.
- "Can you connect my agent to WhatsApp?" — Only phone calls are supported.
- "Can you train the model on my data?" — Model training is not available.

If a request sounds adjacent to something in scope, try to address the closest supported thing and explain the limitation: *"I can't reduce network latency, but I can tune the agent's turn-taking sensitivity (VAD settings) and prompt structure which can affect perceived responsiveness."*

---

## API Configuration

- **Base URL**: `https://api.goyappr.com`
- **Docs**: `https://docs.goyappr.com`
- **Auth**: `Authorization: Bearer $YAPPR_API_KEY`
- **Content-Type**: `application/json`

All API calls use `curl` via the Bash tool with the pattern:

```bash
curl -s -X {METHOD} \
  "https://api.goyappr.com/{resource}" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

Parse JSON responses with `jq` if available, raw JSON otherwise.

> **API Discovery**: A `GET https://api.goyappr.com` (no path, no auth) returns a full list of all available endpoints. Use this if you're ever unsure what routes exist.
> ```bash
> curl -s https://api.goyappr.com | jq .
> ```

---

## Core Principle: Execute, Don't Teach

**When a user asks you to do something, DO IT — don't explain how they could do it themselves.** You have full API access. If the user says "create an agent for appointment booking", create the agent. If they say "change the voice to Michal", update the agent. If they say "attach a tool", create and attach it.

Never respond with curl commands, dashboard instructions, or step-by-step guides for the user to follow manually. The only exceptions are genuinely destructive actions (deleting/deactivating) where you should confirm first, or actions explicitly outside your scope.

Wrong: "To create an agent, go to the Agents page and click Create..."
Wrong: "You can update the voice by running: curl -X PATCH..."
Right: *[calls the API, creates the agent, reports the result]*

---

## Agent Intelligence: Translating Plain Language into Great Agents

Your job is not just to run API calls — it's to act as a knowledgeable voice AI consultant. When a user describes what they want in plain language, **you translate that into best-practice configurations**. Never make the user specify technical details like snake_case parameter names or exact temperature values — propose them yourself based on the use case, then confirm.

### Verify Changes After Making Them

After any change that modifies state — creating, updating, attaching, or deleting something — **silently verify it worked** using the appropriate GET endpoint, then tell the user the confirmed result. Don't announce you're verifying; just do it and report the outcome.

**The principle:** use the API to confirm reality, not just trust the success response.

A few examples of what this looks like in practice:
- After attaching a tool to an agent → `GET /agents/:id` and confirm the tool appears in the agent's tool list
- After creating or patching an agent → `GET /agents/:id` and confirm the fields match what was set

Apply the same logic to any change — if there's a natural GET call that lets you confirm the change took effect, make it. Skip the verification only if the user explicitly asks you not to, or if the change is obviously read-only.

### Voice AI System Prompt Best Practices

Voice is fundamentally different from text. When writing a `system_prompt`, follow these rules:

- **No markdown, no lists, no bullet points** — The AI speaks its responses aloud. Formatting becomes meaningless noise.
- **Be concise by default** — Instruct the agent to keep responses to 1–3 sentences unless more detail is genuinely needed.
- **Be explicit about identity** — Always specify who the agent is, what company they represent, and what they can and cannot help with.
- **Specify tone with concrete words** — Not "be professional" but "use a warm, friendly tone, like talking to a helpful neighbor."
- **Handle edge cases explicitly** — What to do when the caller asks something out of scope, is rude, or wants to speak to a human.
- **Use present-tense role instructions** — "You are Maya, a receptionist at..." not "You should act as..."

---

### Conversational Quality — Humanize AI Agents Playbook

For any complex agent (outbound sales, qualification calls, multi-step flows), read **`HUMANIZE_PLAYBOOK.md`** in this skill directory before building the prompt. It contains research-backed principles from NLP dialogue theory, sales psychology, and voice AI platform docs.

**Key principles to apply to every complex prompt:**

**1. Goals, not scripts.** Write stages as goals to accomplish, not lines to say. Over-scripting forces the LLM to choose between following instructions and responding to the user — it picks instructions, which sounds robotic.

**2. Respond to what was actually said.** The single most important rule. Before any forward move, the agent must address the user's last message — not the expected one. Three failure modes to prevent explicitly in every prompt:
- Ignoring a direct question and continuing the script
- Fake-acknowledging an answer that wasn't given ("fascinating!" when no answer came)
- Advancing stages as if the user answered when they didn't

**3. Threading.** When a user digresses, the agent answers fully, then bridges back: "Anyway, going back to [topic]..." Never write "stay on topic" or "don't deviate" — this causes the agent to ignore user questions entirely.

**4. Forbid robotic transitions.** Explicitly prohibit phrases like "Moving on," "Great!", "Certainly," and "Of course" — they are the clearest AI tells. Add to every complex prompt: *"Do not use filler transition phrases. Move between topics naturally."*

**5. Emotional acknowledgment before content.** When the user expresses frustration or hesitation, reference what they specifically said before addressing the content. Generic phrases ("I understand your concern") are worse than nothing.

**6. One question at a time. Then stop.** Never queue the next thing before getting an answer. Silence after a question is normal — the agent should not fill it.

**Prompt shipping checklist:**
- [ ] Stages written as goals, not scripts
- [ ] Explicit threading instruction included
- [ ] Rule against fake acknowledgment present
- [ ] Robotic transition phrases explicitly forbidden
- [ ] Emotional acknowledgment instruction present
- [ ] Most critical rules stated at the top of `<critical_rules>`

---

### Structured Prompt Architecture (recommended for complex agents)

For agents with multi-step conversation flows, sales scripts, objection handling, or specific behavioral rules, use **XML-style section tags** inside the system prompt. This helps the STS model parse different parts of a long prompt cleanly and follow each section's instructions accurately.

**Recommended sections (use only the ones that apply):**

| Tag | Purpose |
|-----|---------|
| `<identity>` | Who the agent is, what company they represent, tone and speech style |
| `<context>` | Background info the agent needs (e.g., what kind of call this is, why they're calling) |
| `<goals>` | Numbered list of the agent's objectives for this call |
| `<critical_rules>` | Hard constraints — things the agent must always or never do |
| `<tools>` | Instructions for WHEN and HOW to invoke each attached tool (see **Function Invocation Rules** below) |
| `<conversation_flow>` | Step-by-step conversation script with branching (for sales/setter agents) |
| `<objection_handling>` | Pre-written responses to common objections |
| `<disqualification>` | How to gracefully end calls with unqualified leads |
| `<important_rules>` | Catch-all rules that don't fit elsewhere |

**Example structure for a sales/outbound agent:**

```
<identity>
שמך הוא דניאלה, נציגת הכנסות של Yappr.
את מדברת עם {{LeadName}}.
את מקצועית, חדה, ישירה ובעלת ביטחון עצמי שקט.
סגנון דיבור: עברית מדוברת טבעית. משפטים קצרים.
</identity>

<context>
תאריך ושעה: {{CurrentDateTime}}.
משבצות פנויות לפגישות: {{AvailableSlots}}.
</context>

<goals>
1. לגלות את הצורך של הליד
2. להציג את הפתרון בצורה ממוקדת
3. לתאם שיחת אפיון עם יועץ בכיר
</goals>

<critical_rules>
- שאל שאלה אחת בכל פעם. אסור לשאול רצף שאלות.
- תגובה קצרה, ואז שאלה. מקסימום 2 משפטים לפני שאלה פתוחה.
- אל תציין מחירים ספציפיים.
</critical_rules>

<tools>
יש לך גישה לכלי bookAppointment. הפעל אותו רק כאשר:
- הליד אישר תאריך ושעה ספציפיים
- הליד אישר את השם המלא שלו
- הליד אמר במפורש שהוא רוצה לקבוע

העבר את כל הפרטים בשפה טבעית כפי שהליד אמר אותם.
אל תמיר תאריכים או שעות לפורמט טכני.
</tools>

<conversation_flow>
**שלב 1 - פתיחה:** ...
**שלב 2 - גילוי:** ...
**שלב 3 - סגירה לפגישה:** ...
</conversation_flow>

<objection_handling>
"אני עסוק/ה עכשיו" → "אין שום בעיה. מתי יהיה לכם נוח שאחזור?"
"כמה זה עולה?" → "המחיר תלוי בהיקף. בשיחת האפיון היועץ יתאים הצעה בדיוק למה שאתם צריכים."
</objection_handling>
```

**When to use structured sections:**
- Outbound sales or setter agents with a defined call flow
- Agents with objection-handling scripts
- Agents with strict behavioral rules ("never mention prices", "always speak in Hebrew")
- Any agent where the system prompt exceeds ~200 words

**When to use a simple paragraph prompt:**
- Inbound customer service or support (reactive, not scripted)
- Simple Q&A or FAQ agents
- Short-lived demo agents

---

### Template Variables vs. Functions (Tools)

The system prompt has two different mechanisms for dynamic behavior. Understanding the distinction is critical for building effective agents:

| | **Template Variables** | **Functions (Tools)** |
|---|---|---|
| **What** | Static values injected into the prompt text | Actions the AI can invoke mid-conversation |
| **When** | Rendered once, **before** the call begins | Called **during** the call, when conditions are met |
| **Syntax** | `{{VariableName}}` in the system prompt | Tool attached via API; AI decides when to call it |
| **Examples** | Caller name, current date, available slots | Book appointment, log to CRM, end call |

**Rule**: Use variables for **context the agent needs to know from the start**. Use tools for **actions the agent should take based on conversation**.

---

### Template Variables

Use `{{VariableName}}` syntax directly in the system prompt — the server replaces them before the call begins. Inject them inline wherever they're needed — no aliasing or separate declarations required.

#### Reserved (automatic) variables

These are always available — no setup needed:

| Variable | Value injected |
|----------|---------------|
| `{{CallerPhone}}` | The caller's phone number (inbound calls) |
| `{{CurrentDate}}` | Today's date (e.g., "March 21, 2026") |
| `{{CurrentTime}}` | Current time in the company's timezone |
| `{{CurrentDateTime}}` | Full date and time combined |
| `{{CallDirection}}` | `"inbound"` or `"outbound"` |
| `{{Timezone}}` | The company's configured timezone |

#### Custom variables

You can define **any** variable with `{{VariableName}}` syntax. Custom variables must be supplied when triggering the call (via API or test panel). Common patterns:

| Variable | Typical use case |
|----------|-----------------|
| `{{LeadName}}` | The lead's name for outbound calls |
| `{{FirstName}}` | Personalize the greeting |
| `{{AvailableSlots}}` | Appointment slots to offer |
| `{{CompanyName}}` | Dynamically set per-call (if serving multiple clients) |

#### Using variables in a prompt

Inject variables directly where they're needed — no separate `<variables>` block:

```
<identity>
שמך הוא אסי, עוזר אישי של {{CompanyName}}.
אתה מדבר עם {{CallerPhone}}.
תאריך ושעה נוכחיים: {{CurrentDateTime}}.
</identity>

<context>
שם הליד: {{LeadName}}.
משבצות פנויות: {{AvailableSlots}}.
</context>
```

> **Rule**: If the agent needs to reference the caller's phone number, today's date/time, or call direction — always use the reserved variables. Never hardcode or guess these values.

---

### Function Invocation Rules (How to Write Tool Instructions in the Prompt)

When an agent has tools attached (webhook tools or system tools like `endCall`), the platform automatically registers them with the AI model as callable functions. The AI model already knows the tool **name**, **description**, and **parameters** from the tool configuration — you do NOT need to repeat those in the system prompt.

What you DO need to write in the system prompt is **behavioral guidance**: the conditions under which the AI should (or should not) call each tool. This is critical because the AI model may otherwise call tools prematurely or miss the right moment.

#### What the platform handles automatically (do NOT repeat in the prompt):
- Tool names, descriptions, and parameter schemas — these come from the tool config
- Parameter extraction — the AI extracts values from the conversation based on each parameter's `description`
- Standard metadata (call_id, agent_id, etc.) — included automatically if enabled
- Static parameters — injected automatically from tool config

#### What you MUST write in the prompt:
- **When to call the tool** — specific conditions that must ALL be met
- **When NOT to call the tool** — guard rails (e.g., "don't call before the customer confirms")
- **How to pass information** — always in natural language, exactly as the caller said it
- **What to say before/after calling** — e.g., "tell the customer you're checking availability"

#### Writing a `<tools>` section

For agents with attached tools, add a `<tools>` section to the system prompt with invocation rules for each tool. Reference tools by their **camelCase name** (the name you gave the tool when creating it).

**Pattern:**

```
<tools>
יש לך גישה לכלים הבאים. הפעל כלי רק כאשר כל התנאים מתקיימים.

## bookAppointment
הפעל רק כאשר:
- הלקוח אישר תאריך ושעה ספציפיים
- הלקוח נתן את שמו המלא
- הלקוח אמר במפורש שהוא רוצה לקבוע
לפני ההפעלה, אמור: "רגע, אני בודק זמינות."
העבר תאריכים ושעות בשפה טבעית כפי שהלקוח אמר ("יום שלישי בשעה 3", לא "2026-04-08T15:00").

## crmLogger
הפעל בסוף כל שיחה, לפני endCall.
אין צורך לבקש אישור מהלקוח — זה כלי פנימי.

## endCall
הפעל מיד כאשר:
- הלקוח אומר "ביי", "להתראות", "שלום"
- השיחה הושלמה והמטרה הושגה
אחרי מילות הפרידה שלך, הפעל מיד. אל תחכה.
</tools>
```

#### Key rules for function invocation in prompts:

1. **Always require explicit confirmation before customer-facing tools** — e.g., booking, purchasing, transferring. The AI should confirm details with the caller before firing.
2. **Internal/logging tools don't need confirmation** — CRM loggers, ticket creators, etc. can fire silently.
3. **Pass data in natural language** — Instruct the AI to pass dates, times, and names exactly as the caller said them ("מחר בשתיים", not "2026-04-03T14:00"). The receiving webhook handles parsing.
4. **endCall must always be last** — After all other tools have fired. Write explicit trigger conditions (goodbye phrases, task completion).
5. **Don't redefine parameters** — The AI already knows what to extract from the tool config. The prompt should describe *when* and *how*, not *what*.

#### Example: full prompt with variables AND function rules

```
<identity>
שמך הוא נועה, מזכירה של מרפאת {{CompanyName}}.
את חמה, מקצועית, ודוברת עברית טבעית.
</identity>

<context>
תאריך: {{CurrentDate}}.
שעות פעילות: ימים א׳–ה׳, 08:00–18:00.
שירותים: טיפול שיניים כללי, אורתודנטיה, הלבנה.
</context>

<goals>
1. לברר מה הלקוח צריך
2. לקבוע תור אם רלוונטי
3. לסיים את השיחה בנימוס
</goals>

<tools>
## bookAppointment
הפעל רק אחרי שהלקוח אישר:
- סוג הטיפול
- תאריך ושעה מועדפים
- שם מלא
אמור "רגע, אני בודקת זמינות" לפני ההפעלה.

## endCall
הפעל מיד אחרי שאמרת להתראות.
</tools>

<critical_rules>
- שאלה אחת בכל פעם.
- אל תציעי תורים מחוץ לשעות הפעילות.
- אם הלקוח שואל על מחירים, אמרי שהמחירון תלוי בטיפול והפני לשיחה עם רופא.
</critical_rules>
```

---

### Hebrew Pronunciation Protocol (mandatory for Hebrew agents)

When creating or updating a system prompt for a Hebrew-speaking agent (`language: "he"`), **always perform a pronunciation audit before finalizing the prompt**. The underlying STS (Speech-to-Speech) model reads what it sees — if the prompt contains ambiguous transliteration or relies on the model to "figure out" a business name, it will often get it wrong.

#### Why it matters

The STS engine commonly mispronounces:
- Business names, brand names, and product names
- Agent names and staff names (especially those with gutturals)
- Hebrew words with ח or כ — rendered as English "H"/"K" instead of the correct guttural
- Place names (cities, neighborhoods, streets)
- Domain-specific terms (medical, legal, real estate, food, etc.)

The solution is to move pronunciation logic **into the system prompt itself**, so the model always outputs phonetic English instead of ambiguous Hebrew or romanization.

#### Transliteration rules

| Sound | Rule | Example |
|-------|------|---------|
| Gutturals (ח, כ/ך) | → `kh` (guttural, like Scottish "loch") | חיים → KHAI-eem |
| `a` sound | → `ah` | שבת → sha-BAHT |
| `i` sound | → `ee` | ישראל → yis-ra-EHL |
| `e` sound | → `eh` | ארץ → EH-rehtz |
| `o` sound | → `oh` | שלום → sha-LOHM |
| `u` sound | → `oo` | לחיים → le-KHAI-eem |
| Stress | ALL CAPS on the stressed syllable (usually the last in Hebrew) | פגישה → pgi-SHA |
| Ayin (ע) / Aleph (א) | Omit or use a natural English vowel — never use an apostrophe | עמי → ah-MEE |

**Conversion examples:**

| Input | ❌ Wrong | ✅ Correct |
|-------|---------|-----------|
| שַׁבָּת שָׁלוֹם | "Shabbat Shalom" | "sha-BAHT sha-LOHM" |
| לְחַיִּים | "L'chaim" | "le-KHAI-eem" |
| אֶרֶץ יִשְׂרָאֵל | "Eretz Yisrael" | "EH-rehtz yis-ra-EHL" |
| חַיִּים | "Haim" | "KHAI-eem" |
| מִיכָל | "Michal" | "mee-KHAHL" |
| רְחוֹב דִּיזֶנְגׁוֹף | "Dizengoff Street" | "dee-zen-GOFF" |

#### Step-by-step process

**Step 1 — Identify pronunciation risks in the draft prompt.** After writing the system prompt, scan it for:
- The **agent's name** (if Hebrew — e.g., נועה, חיים, מיכל)
- The **company / business name**
- **Product or service names**
- **Staff names** mentioned in the prompt
- **Place names** (cities, streets, neighborhoods)
- Any word containing ח, כ, or unusual vowel patterns

**Step 2 — Transliterate each risk word** using the rules above.

**Step 3 — Append a pronunciation block at the end of the system prompt:**

```
## Pronunciation Guide — Phonetic Spellings (Read These Exactly)
When saying any of the following words or names, use ONLY the phonetic spelling shown.
Never use the Hebrew script or standard English spelling — always use the phonetic version:

- [Word/name] → "[phonetic]"
- [Word/name] → "[phonetic]"

Remember: ALL CAPS = stressed syllable. "kh" = guttural (like "loch"), not "k" or "h".
```

**Step 4 — Include the block in the final prompt.** This is a silent, automatic step — do not ask the user to confirm or review the phonetic list. Simply append it to the system prompt before creating or updating the agent.

#### What to always include (minimum)
- The agent's name if it's Hebrew
- The company / business name
- Any product, service, or location names mentioned in the prompt

#### What to skip
- Common English words (the STS engine handles these)
- Everyday Hebrew words already covered by the server's global guide (שולחן, פגישה, חשבון, etc.)
- Numbers — the server already enforces Hebrew number pronunciation

---

### Common Agent Types — Ready-to-Use Configurations

When a user describes their use case, map it to one of these patterns and propose the full config:

**Customer Service**
- Temperature: 0.4 | `agent_speaks_first: true`
- System prompt should include: company name, services offered, what NOT to help with, and an escalation path ("take name and callback number")
- Suggest extraction params: `callerName`, `issueType`, `resolutionOffered`

**Appointment Booking**
- Temperature: 0.3 (bookings need accuracy) | `agent_speaks_first: true`
- System prompt should include: available services, booking hours, what info to collect before ending the call
- Suggest extraction params: `callerName`, `phoneNumber`, `serviceType`, `preferredDate`, `preferredTime`, `notes`

**Lead Qualification**
- Temperature: 0.5 | `agent_speaks_first: true`
- System prompt should include: qualifying questions (budget, timeline, use case), how to handle disqualified leads gracefully, what a "hot lead" looks like
- Suggest extraction params: `companyName`, `contactName`, `useCase`, `teamSize`, `budgetRange`, `timeline`, `nextStep`

**Order / Delivery Support**
- Temperature: 0.3 | `agent_speaks_first: false` (let caller explain their issue first)
- System prompt should include: what the agent can look up, how to handle missing order info, refund/complaint escalation path
- Suggest extraction params: `orderNumber`, `callerName`, `issueType`, `resolution`

**Restaurant Reservations**
- Temperature: 0.4 | `agent_speaks_first: true`
- System prompt should include: restaurant name, cuisine, hours, party size limits, cancellation policy
- Suggest extraction params: `callerName`, `partySize`, `preferredDate`, `preferredTime`, `specialRequests`, `phoneNumber`

### Translating User Language to Extraction Parameters

Don't ask users to specify parameter names — they don't know what that means. Instead:

1. Ask: **"After each call, what information would you want saved?"**
2. Translate their answer into camelCase English parameter names and propose the full list:
   - "who called" → `callerName`, `phoneNumber`
   - "why they called" → `callReason` or `issueType`
   - "whether it was resolved" → `resolutionStatus`
   - "their order number" → `orderNumber`
   - "when they want to come in" → `preferredDate`, `preferredTime`
3. Show them the proposed list: *"Based on what you described, I'll configure the tool to capture: caller name, reason for the call, and whether it was resolved. Does that sound right?"*
4. Adjust based on their feedback, then create the tool.

> **Parameter naming rule**: Tool names and parameter names must always be in **camelCase English** (e.g. `callerName`, `issueType`, `orderNumber`). Descriptions can be in any language including Hebrew.

### Voice Selection Guide

**Never ask the user to choose a voice.** Based on the use case and agent personality, pick one automatically and move on. Only change it if the user explicitly asks.

Use the friendly English names below in all API calls (e.g. `"voice": "Maya"`). The platform resolves them internally — you never need to know the underlying voice IDs.

Pick the best fit from this mapping:

| Use case | Female | Male |
|----------|--------|------|
| Professional / corporate | Maya, Anat | Adam, Ariel |
| Warm / friendly service | Michal, Liat | Omer, Tom |
| Young / energetic brand | Rachel, Shir | Yonatan, Roi |
| Authoritative / serious | Dvora, Ruth | David, Natan |
| Calm / reassuring | Noa, Tamar | Alon, Yuval |
| Sales / outbound | Yael, Anat | Gil, Nir |
| Medical / professional | Avigail, Tamar | Yosef, Shlomo |

**Full voice catalogue** (30 voices):
Female: Michal, Rachel, Noa, Maya, Shira, Avigail, Liat, Tamar, Yael, Dvora, Shir, Anat, Dana, Ruth
Male: Yonatan, David, Gil, Adam, Amir, Omer, Tom, Benny, Nir, Natan, Yosef, Ariel, Roi, Shlomo, Alon, Yuval

**Default**: use `Michal` when the use case is unclear or general. Choose the gender that matches the agent's persona in the system prompt.

---

### VAD / Turn-Taking Configuration

The platform uses **Voice Activity Detection (VAD)** to determine when a caller has finished speaking and the agent should respond. Three parameters control this behaviour — they are optional on all agents and have sensible defaults, but can be tuned when users report the agent cutting them off too early or waiting too long before responding.

| Parameter | Default | Range | What it controls |
|-----------|---------|-------|-----------------|
| `vad_stop_secs` | `0.5` | `0.05 – 5.0` | Seconds of silence **after speech stops** before the agent considers the turn finished and starts generating a reply. Lower = faster response; higher = more patient. |
| `vad_start_secs` | `0.2` | `0.05 – 2.0` | Seconds of sustained speech **before** it counts as a real utterance (filters background noise and very short sounds). |
| `vad_confidence` | `0.7` | `0.0 – 1.0` | Confidence threshold for the speech detector. Higher = stricter (ignores faint or ambiguous audio); lower = more sensitive. |

#### When to suggest tuning

- **Agent cuts the caller off mid-sentence** → increase `vad_stop_secs` (e.g. `0.5` or `0.8`)
- **Agent waits too long before replying** → decrease `vad_stop_secs` (e.g. `0.15`)
- **Agent triggers on background noise** → increase `vad_confidence` (e.g. `0.85`) and/or increase `vad_start_secs`
- **Agent misses short, clipped speech** → decrease `vad_start_secs` (e.g. `0.2`) or decrease `vad_confidence`

#### How to translate plain user language

- "The agent keeps interrupting me" → increase `vad_stop_secs`
- "The agent is slow to respond" → decrease `vad_stop_secs`
- "The agent speaks over background noise" → increase `vad_confidence`
- "The agent doesn't hear me sometimes" → decrease `vad_confidence` or `vad_start_secs`

**Do not ask the user for parameter names or values.** They describe the symptom; you choose the adjustment and propose it:

> *"It sounds like the agent is cutting you off. I'll increase the pause threshold so it waits a bit longer after you stop speaking before replying — does that sound right?"*

Then apply the change:

```bash
curl -s -X PATCH \
  "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"vad_stop_secs": 0.6}'
```

**Important architecture note**: The Yappr voice engine runs **two VAD layers** simultaneously:
1. **Platform VAD** — must always remain enabled (this is what lets the AI model "hear" the audio stream). Never disable it.
2. **Local Silero VAD** — controlled by the three parameters above, used for fine-grained pipeline-level turn-taking. This is what `vad_stop_secs`, `vad_start_secs`, and `vad_confidence` configure.

The three API parameters only affect the local Silero layer. The platform VAD layer is always on and is not user-configurable — this is intentional and should not be changed.

### Call Guard Settings

Three additional parameters protect against wasted credits from runaway or dead calls. All are optional and have sensible defaults.

| Parameter | Default | Range | What it controls |
|-----------|---------|-------|-----------------|
| `silence_timeout_secs` | `60` | `10 – 900` | Seconds of caller silence before auto-hangup. Prevents idle/dead calls from burning credits. |
| `max_continuous_speech_secs` | `120` | `0 – 300` | Max seconds one party can speak non-stop before auto-hangup. Catches answering machines and IVR recordings that bypass Telnyx AMD. `0` = disabled. |
| `max_call_duration_secs` | `600` | `0 – 3600` | Hard cap on total call length regardless of activity. Prevents runaway calls (e.g. stuck pipelines, long hold music). `0` = disabled. |

#### When to suggest tuning

- **Calls to voicemail boxes that play long greetings** → decrease `max_continuous_speech_secs` (e.g. `60`)
- **Calls hang up too quickly on slow responders** → increase `silence_timeout_secs` (e.g. `120`)
- **Agent runs up huge bills on stuck calls** → set `max_call_duration_secs` to a reasonable cap (e.g. `300` for 5 min)
- **Agent should allow very long conversations** → increase `max_call_duration_secs` (e.g. `1800` for 30 min) or set to `0` to disable

#### How to translate plain user language

- "Calls are too expensive / wasting credits" → lower `max_call_duration_secs` and/or `silence_timeout_secs`
- "The bot keeps talking to answering machines" → lower `max_continuous_speech_secs` (e.g. `30` or `60`)
- "My calls get cut off too early" → check if `silence_timeout_secs` or `max_call_duration_secs` is too low
- "A call ran for 20 minutes and drained my credits" → set `max_call_duration_secs` to a cap

Example:

```bash
curl -s -X PATCH \
  "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"silence_timeout_secs": 30, "max_continuous_speech_secs": 60, "max_call_duration_secs": 300}'
```

---

## Step 0: Prerequisites Check

Before anything else, verify the user has completed these browser-based steps. Ask them directly — do not assume.

### What the user needs to do in their browser (one-time setup):

1. **Create an account** at the Yappr dashboard (ask the user for the URL or check if they already have one)
2. **Confirm their email** (check inbox for verification link)
3. **Complete onboarding**: create a company, fill in company details
4. **Add a payment method**: connect a credit/debit card via Stripe during onboarding or in Settings > Billing
5. **Create an API key**: go to Settings > API Keys, create a new key with all scopes enabled
6. **Save the API key**: the full key is shown only once — they need to copy it

If the user hasn't done these steps yet, walk them through it clearly. Do NOT try to automate account creation — it must be done in the browser.

### Store the API key

Once the user has their key, save it:

```bash
export YAPPR_API_KEY="ypr_live_..."
```

Or store it in a `.env` file in the working directory for persistence.

### Validate the key

```bash
curl -s "https://api.goyappr.com/billing" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

This should return their billing status. If it returns an auth error, the key is invalid — ask them to double-check.

Check the response:
- `has_payment_method: true` — good, they can proceed
- `has_payment_method: false` — they need to add a payment method first (see Step 1)
- `balance_cents` — show them their current credit balance

---

## Step 1: Billing Setup (if needed)

If the user has no payment method, generate a Stripe Checkout link:

```bash
curl -s -X POST \
  "https://api.goyappr.com/billing/setup" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Tell the user to open the `checkoutUrl` from the response in their browser to add their card. Then poll billing status until `has_payment_method` becomes `true`.

If their balance is low (under $1), suggest a top-up — but **always ask for explicit confirmation before charging their card**:

> "Your balance is low ($X). Would you like to add $20 to your account? This will charge your saved card."

Only proceed with the top-up API call **after** the user explicitly says yes:

```bash
curl -s -X POST \
  "https://api.goyappr.com/billing/topup" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount_cents": 2000}'
```

> ⚠️ **Never trigger a top-up without explicit user approval** — this charges their saved payment method.

---

## Step 2: Create or Update an Agent

### 2a. Check for existing agents first

**Always silently fetch existing agents before asking anything:**

```bash
curl -s "https://api.goyappr.com/agents" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '[.data[] | {id, name, voice, language, is_active}]'
```

**If agents exist**, present them to the user:

> "You already have the following agents:
> 1. **Noa** — Hebrew, Noa voice (active)
> 2. **Support Bot** — Hebrew, Michal voice (active)
>
> Would you like to update one of these, or create a brand new agent?"

- If they want to **update an existing agent** → fetch its full config, show the user what it currently looks like, ask what they want to change, then use `PATCH /agents/:id`. Skip to the patch block below.
- If they want to **create a new agent** → continue to **step 2b**.

**If no agents exist** → say nothing about it, proceed directly to **step 2b**.

#### Fetching and showing a single agent's full details:

```bash
curl -s "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.'
```

This returns the **complete agent config** — do not filter fields. The response includes:
- `name`, `voice`, `language`, `temperature`, `agent_speaks_first`, `greeting_message`
- `system_prompt` — the full personality/instructions
- `tools[]` — every attached tool with its full config, including:
  - `id`, `name`, `type` (`webhook` or `system`)
  - `config.url`, `config.method`
  - `config.extraction_parameters[]` — each parameter's `name` and `description`
  - `execution_order`
- `webhook_url`, `webhook_events` — call event notifications
- `is_active`, `created_at`, `updated_at`

Present the relevant fields in plain language:
- `system_prompt` → "personality/instructions"
- `temperature` → "creativity level (0 = focused, 1 = creative)"
- `tools` → "connected webhooks / actions"
- `extraction_parameters` → "data fields it captures after calls"

If the agent has tools, list each one by name and URL so the user can see exactly what's connected. Then ask what they'd like to change.

#### Update an existing agent:

```bash
curl -s -X PATCH \
  "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"system_prompt": "Updated prompt...", "voice": "Maya"}'
```

Only include fields the user actually wants to change. After patching, confirm: *"Done! I've updated [agent name] with your changes."*

Patchable fields include all creation fields plus the VAD turn-taking settings (`vad_stop_secs`, `vad_start_secs`, `vad_confidence`), call guard settings (`silence_timeout_secs`, `max_continuous_speech_secs`, `max_call_duration_secs`), and `lead_memory_enabled` — see the **VAD / Turn-Taking Configuration** and **Call Guard Settings** sections above for when and how to tune these.

---

### 2b. Configure and create a new agent

This is the core step. Have a conversation with the user to understand what they want their agent to do, then build the configuration.

### Detecting and confirming the agent's language

**The platform is used exclusively by Hebrew speakers.** Most users will want their agent to speak Hebrew — but some may want English or another language for specific use cases.

**How to handle this:**

1. **Detect the language the user is speaking to you in** — if they're writing in Hebrew, assume `language: "he"`. If they're writing in English, assume `language: "en"`.
2. **Always confirm your assumption explicitly before creating the agent.** Say something like:
   - (if user wrote in Hebrew) — *"אני מניח שהסוכן ידבר עברית עם המתקשרים — זה נכון, או שתרצה שידבר שפה אחרת?"*
   - (if user wrote in English) — *"I'll set the agent to speak English — is that right, or should it speak Hebrew or another language?"*
3. **Only set the language after the user confirms.** Do not silently default.

Supported languages: `he` (Hebrew), `en` (English). Hebrew is the most common choice for this platform.

> **Important for Hebrew agents**: The `system_prompt` and `greeting_message` should be written in Hebrew. The agent's instructions are part of its identity — writing them in English for a Hebrew-speaking agent creates a mismatch. Craft all prompts in the confirmed language.

### Questions to ask (adapt based on context):

1. **"What should your voice agent do?"** — Use their answer to craft a `system_prompt`. Write it in the confirmed language. Write it as instructions to the AI ("אתה נציג שירות לקוחות של..."). Be detailed and specific.

   **For Hebrew agents**: after drafting the prompt, silently apply the **Hebrew Pronunciation Protocol** (see section above) — scan for business names, agent names, and any words with gutturals (ח/כ), generate phonetic transliterations, and append the pronunciation block to the prompt before submitting. This is an automatic prompt-engineering step; no user confirmation needed.

2. **Voice** — Do not ask the user to choose. Use the **Voice Selection Guide** above to pick the best voice for the use case automatically. Mention your choice as a brief statement, not a question: *"I'll give it a warm, friendly voice."* Only offer to change it if the user pushes back.

3. **"Should the agent greet callers first, or wait for them to speak?"**
   - If yes: ask what the greeting should be — and write it in the agent's confirmed language
   - `agent_speaks_first: true` + `greeting_message: "..."`

4. **"How creative should responses be?"** — Explain in simple terms:
   - Low (0.2-0.4): Consistent, predictable responses — good for factual tasks
   - Medium (0.5): Balanced (default)
   - High (0.7-1.0): More varied, creative responses — good for casual conversation

5. **"Do you want to be notified when calls happen?"** — This is the **agent-level event webhook**. It's separate from tool webhooks (which fire to log call data). The event webhook notifies *your server or automation platform* in real-time as calls progress.

   Explain it in plain terms:
   > "If you have a backend system, CRM, or automation (like Make.com or Zapier), I can have the agent send it a notification every time something happens on a call — like when a call starts, ends, or if a transcript is ready."

   **Available events:**
   - `call.started` — fires when a call begins (inbound ring or outbound dial)
   - `call.answered` — fires when the caller connects and the AI starts talking
   - `call.ended` — fires when the call finishes (includes duration)
   - `call.failed` — fires if the call fails to connect
   - `call.no_answer` — fires if the call rings but nobody picks up
   - `transcript.ready` — fires after the call ends with the full conversation transcript

   **Default set** (if they say yes and don't have a preference): `call.started`, `call.answered`, `call.ended`, `call.failed`

   **How to ask intelligently:**
   - If the user is clearly non-technical ("just set it up for me") → skip this question entirely; leave `webhook_url` as null
   - If the user mentioned a CRM, backend, or automation tool → proactively ask: *"Would you like the agent to send call events to your [CRM/system]? If so, what URL should it post to?"*
   - If the user seems technical or is building an integration → ask which events they care about; `transcript.ready` is especially useful for post-call processing

   If they want it, add to the payload:
   ```python
   'webhook_url': 'https://their-server.com/webhook',
   'webhook_events': ['call.started', 'call.answered', 'call.ended', 'call.failed']
   ```
   If they don't need it, omit both fields entirely (null is the default).

### Create the agent:

> ⚠️ **Always use the file-based approach** for agent creation. Inline `-d '{...}'` in curl is prone to JSON encoding errors, especially when the system prompt contains Hebrew, special characters, or apostrophes. Write the payload to a temp file with Python, then pass it to curl.

```bash
# Step 1: Write the payload to a temp file (safe for any characters including Hebrew)
python3 -c "
import json
payload = {
    'name': 'My Agent',
    'system_prompt': 'You are...',
    'voice': 'Michal',
    'language': 'he',
    'temperature': 0.5,
    'agent_speaks_first': True,
    'greeting_message': 'Hello! How can I help you today?',
    # VAD / turn-taking — omit these to use the platform defaults (recommended for most agents).
    # Only include if the user reports the agent cutting them off or responding too slowly.
    # 'vad_stop_secs': 0.5,      # Silence duration before agent replies (default 0.5s)
    # 'vad_start_secs': 0.2,     # Speech duration before it counts as an utterance (default 0.2s)
    # 'silence_timeout_secs': 60,         # Auto-hangup after N seconds of caller silence (default 60)
    # 'max_continuous_speech_secs': 120,  # Auto-hangup after N seconds non-stop speech (default 120, 0=off)
    # 'max_call_duration_secs': 600,      # Hard cap on total call length (default 600, 0=off)
    # 'vad_confidence': 0.7,     # Speech detector confidence threshold (default 0.7)
    # 'lead_memory_enabled': True,        # Inject matched lead's long-term memory into system prompt (default true)
    # Include webhook_url and webhook_events ONLY if the user asked for call event notifications.
    # If they did not ask, omit both fields entirely (null is the default — no overhead).
    # 'webhook_url': 'https://their-server.com/webhook',
    # 'webhook_events': ['call.started', 'call.answered', 'call.ended', 'call.failed'],
    'idempotency_key': 'unique-key-here'
}
with open('/tmp/agent-payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)
print('Payload written to /tmp/agent-payload.json')
"

# Step 2: Send the request
curl -s -X POST \
  "https://api.goyappr.com/agents" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/agent-payload.json | jq .
```

Save the returned `id` — you'll need it for everything that follows.

Always generate a unique `idempotency_key` (e.g., a UUID) so retries are safe.

### Attach the end_call system tool (required for every agent)

Every agent **must** have the `end_call` system tool attached — this is what allows the agent to hang up the call cleanly. Without it, calls will never terminate properly.

The `end_call` tool UUID is **different per company** — do not hardcode it. Fetch it every time:

```bash
# Find the end_call system tool for this company
curl -s "https://api.goyappr.com/tools" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '.data[] | select(.type == "system") | {id, name}'
```

Copy the `id` of the tool with `type: "system"` (it will be named something like "End Call"). Then attach it:

```bash
curl -s -X POST \
  "https://api.goyappr.com/tools/attach" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID", "tool_id": "END_CALL_TOOL_ID", "execution_order": 999}'
```

> Set `execution_order: 999` so the end_call tool is always last in the chain. Do this silently — you don't need to explain it to the user unless they ask. Just confirm: *"Your agent is set up and ready to handle calls."*

---

## Step 3: Configure Tools (Optional)

Ask: **"Should your agent send data to a webhook during calls? For example, to log information, create a ticket, or trigger an action in another system?"**

If yes, **silently fetch the user's existing tools first** before creating anything new:

```bash
curl -s "https://api.goyappr.com/tools" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | select(.type == "webhook") | {id, name, description}]'
```

**If webhook tools already exist**, present them:

> "You already have these webhook tools set up:
> 1. **CRM Logger** — Logs call details to your CRM
> 2. **Ticket Creator** — Creates a support ticket after each call
>
> Want to reuse one of these for this agent, or create a new tool?"

- If they want to **reuse an existing tool** → just attach it directly (skip to the attach step). You can also fetch its full config to show the user if they want to review it: `GET /tools/:id`
- If they want to **update an existing tool** → fetch it, show current config, ask what to change, then `PATCH /tools/:id`
- If they want to **create a new tool** → continue to **step 3a** below

**If no webhook tools exist** → proceed directly to **step 3a**.

### 3a. Gather configuration from the user

Ask these questions one by one:

1. **"What is the webhook URL?"** — This must be a real, publicly accessible HTTPS URL that accepts POST requests. It cannot be localhost or an internal network address.
   - If they don't have one yet, suggest a free testing tool: **https://webhook.site** — they open it in a browser and get a unique URL instantly. Great for verifying the payload before wiring up their real system.
   - If they insist on using a placeholder for now, that's okay — just make sure they understand the tool won't fire during calls until the URL is updated to a real one.

2. **"What information should the agent extract from the conversation?"** — These are **extraction parameters**: pieces of information the AI listens for and pulls out of the conversation. Each one needs:
   - `name`: a short camelCase English key (e.g. `callerName`, `issueType`) — always camelCase, always English
   - `description`: a clear instruction to the AI (e.g. "The caller's full name as stated during the call") — can be in Hebrew
   - Ask the user in plain language: *"What information do you want captured after each call?"* — then translate their answers into extraction parameters.
   - Common examples: `callerName`, `reason`, `urgency`, `email`, `orderNumber`, `appointmentDate`, `productInterest`

3. **"Do you have any fixed values that should always be sent in the webhook payload?"** — These are **static parameters**: key-value pairs that are always included in the payload regardless of what was said during the call.

   **Each static parameter must be a JSON object with both a `name` and a `value` field:**
   ```json
   {"name": "source", "value": "yappr-agent"}
   {"name": "formId", "value": "contact-form"}
   {"name": "apiKey", "value": "abc123"}
   ```
   ❌ **Wrong** — never write just a value without a name (e.g. `"yappr-agent"` alone, or `{"value": "foo"}`)
   ✅ **Correct** — always `{"name": "...", "value": "..."}` — both fields are required.

   Useful for things like identifying the agent/channel, or passing API keys required by the receiving service. Most users won't need this — only ask if they mention a CRM integration, form submission, or multi-channel setup. If they don't need it, skip this question silently and omit `static_parameters` from the payload (or pass an empty list).

4. **"Should the payload also include standard call metadata?"** — This is `include_standard_metadata`. When enabled, every webhook payload automatically includes:
   - `call_id`, `agent_id`, `agent_name`, `company_id`
   - `call_direction` (inbound / outbound)
   - `caller_number`, `callee_number`
   - Default: **yes** — only disable if the user specifically doesn't want it.

5. **"Does your webhook require any custom headers?"** (e.g. `Authorization: Bearer secret123`) — Default: none.

Once you have all the answers, create the tool:

> ⚠️ **Always use the file-based approach** for tool creation — same reason as agents: inline JSON in curl breaks easily with nested structures, special characters, or long descriptions. Use Python to write the payload safely.

> ⚠️ **Payload structure**: `extraction_parameters`, `static_parameters`, and `include_standard_metadata` must be nested inside a `payload_config` object within `config`. Do NOT put them directly in `config` — the API will ignore them and the tool will not work correctly.

```bash
# Step 1: Write the payload to a temp file
python3 -c "
import json
payload = {
    # Tool name MUST be camelCase English — e.g. 'crmLogger', 'leadCapture', 'supportTicket'
    # Do NOT use snake_case ('crm_logger'), spaces ('CRM Logger'), or other formats.
    'name': 'crmLogger',
    'description': 'Logs call details to our CRM',
    'type': 'webhook',
    'config': {
        'url': 'https://YOUR_REAL_WEBHOOK_URL',
        'method': 'POST',
        'headers': {},
        'payload_config': {
            'include_standard_metadata': True,
            # static_parameters: fixed key-value pairs always sent in the payload.
            # Each entry MUST have both 'name' and 'value'. Omit the list if none needed.
            'static_parameters': [
                {'name': 'source', 'value': 'yappr-agent'},
                # {'name': 'formId', 'value': 'contact-form'},
            ],
            'extraction_parameters': [
                {'name': 'callerName', 'description': 'The callers full name as stated during the call'},
                {'name': 'reason', 'description': 'The main reason for the call'}
            ]
        }
    },
    'idempotency_key': 'unique-key-here'
}
with open('/tmp/tool-payload.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)
print('Payload written to /tmp/tool-payload.json')
"

# Step 2: Send the request
curl -s -X POST \
  "https://api.goyappr.com/tools" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/tool-payload.json | jq .
```

Then attach it to the agent:

```bash
curl -s -X POST \
  "https://api.goyappr.com/tools/attach" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID", "tool_id": "TOOL_ID", "execution_order": 0}'
```

> **Multiple tools?** The API accepts **one tool per attach call** — no arrays. If the user wants more than one tool, repeat the full create → attach flow for each one, incrementing `execution_order` by 1 each time (0 for the first tool, 1 for the second, etc.). The `execution_order` controls which tool fires first during a call. Ask the user: *"Should one webhook fire before the other, or does the order not matter?"* — and set `execution_order` accordingly.

### 3b. Verify the tool webhook works

Send a test delivery — it hits the tool's configured webhook URL with a sample payload built from the tool's `extraction_parameters`:

```bash
curl -s -X POST \
  "https://api.goyappr.com/tools/TOOL_ID/test" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

**Interpreting the result:**
- `"success": true` + `status_code: 200` → ✅ The webhook URL received the payload successfully. Show the user the `payload_sent` field so they can confirm the shape.
- `"error": "Webhook delivery failed"` → ❌ The URL did not respond with a 2xx status. Common causes:
  - The URL doesn't exist or is a placeholder — the tool will silently fail during real calls. Suggest updating it with `PATCH /tools/:id` once they have a real URL.
  - The server rejected the request (auth header missing, wrong method) — check if custom headers are needed.
  - The server is down or unreachable — ask the user to verify the URL works independently.

**If the test fails**, explain what it means and let the user decide:

> "Your webhook URL isn't reachable right now, so the tool won't send data during calls. You can update it any time — the agent will still work fine, the tool just won't fire until the URL is valid. Want to fix the URL now, or continue and come back to it later?"

If they want to fix it now, update the tool and re-test:

```bash
curl -s -X PATCH \
  "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"config": {"url": "https://NEW_REAL_URL", "method": "POST"}}'

# Then test again:
curl -s -X POST \
  "https://api.goyappr.com/tools/TOOL_ID/test" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

If they want to continue with a placeholder — that's fine. Move on to Step 4. Remind them they can update the tool URL at any time using `PATCH /tools/:id`.

---

## Step 4: Get a Phone Number

**Only Israeli phone numbers (+972) are supported.** All numbers are mobile numbers billed at **$10/month** via a recurring Stripe subscription charge on the user's saved card — make sure they understand this before purchasing.

### 4a. Silently check for existing numbers first

**Do not ask the user** if they have a number — just fetch it silently:

```bash
curl -s "https://api.goyappr.com/phone-numbers" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

**If the response contains existing numbers** (`data` array is non-empty), present them to the user:

> "You already have the following Yappr phone numbers:
> - +972-50-XXX-XXXX (active)
> - +972-54-XXX-XXXX (active)
>
> Would you like to use one of these for your agent, or get a new number?"

- If they choose an existing number → skip to **step 4d** (assign the agent).
- If they want a new number → continue to **step 4b**.

**If the response has no numbers** (`data` is empty) → say nothing about this, move straight to **step 4b**.

### 4b. Search for available numbers

omit `areaCode` entirely to get all available Israeli mobile numbers

```bash
# Without prefix preference — show all available Israeli mobile numbers
curl -s -X POST \
  "https://api.goyappr.com/phone-numbers/search" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}' | jq .
```

Show the user the `numbers` array in a readable list. For each number show the `phoneNumber` and `pricing.priceDisplay` (from the API response). Ask them to pick one:

> "Here are the available numbers:
> 1. +972-54-XXX-XXXX — $10/month
> 2. +972-54-XXX-XXXX — $10/month
> 3. +972-54-XXX-XXXX — $10/month
>
> Which one would you like?"


### 4c. Purchase the chosen number

**Before purchasing, confirm:** *"Purchasing [phone number] will start a $10/month recurring charge on your saved card. Shall I go ahead?"*

```bash
curl -s -X POST \
  "https://api.goyappr.com/phone-numbers/purchase" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+972XXXXXXXXX"}' | jq .
```

**What happens when you purchase:**
1. The number is ordered from Telnyx (our telecom provider)
2. A $10/month Stripe subscription is created and charged to the user's card
3. The number is registered to the user's account
4. Voice is automatically configured so it can immediately receive and make calls

> **Note:** If the exact number gets taken between search and purchase (race condition), the system automatically finds an alternative with the same prefix. The purchased number in the response may differ slightly from what was selected — always show the user the actual `phoneNumber` from the response.

**Interpreting the response:**
- `"status": "active"` → ✅ The number is ready immediately. Move to the configure step.
- `"status": "pending_requirements"` → ⏳ Regulatory approval is required (standard for Israeli numbers, usually 1–3 business days). The number is reserved and the subscription is active — it will start working once approved. The user can check back later.

### 4d. Assign the agent to the number

The purchase response does not include the number's internal UUID — fetch it from the list:

```bash
curl -s "https://api.goyappr.com/phone-numbers" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.data[0]'
```

Find the record matching the purchased phone number and copy its `id`. Then assign the agent:

```bash
curl -s -X POST \
  "https://api.goyappr.com/phone-numbers/configure" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number_id": "PHONE_NUMBER_UUID",
    "inbound_agent_id": "AGENT_ID",
    "outbound_agent_id": "AGENT_ID"
  }' | jq .
```

> **Important**: The configure endpoint uses **snake_case** field names — `phone_number_id`, `inbound_agent_id`, `outbound_agent_id`. Using camelCase (`phoneNumberId`) will return a 400 error.

Once configured, tell the user: **"Your agent is now live! Anyone who calls [phone number] will be connected to your AI agent."**

If status was `pending_requirements`, add: **"The number is pending regulatory approval — it should be active within 1–3 business days. Once approved, calls will route to your agent automatically."**

---

## Step 5: Test Your Agent (Optional)

There are **two ways** to test the agent. Offer both options:

---

### Option A: Web Call (Recommended — no phone number needed)

The easiest way to test. The user opens their agent's page in the Yappr dashboard and clicks the **"Test Call"** button to speak with the agent directly in the browser — no phone required.

Give them the direct link:
```
https://app.goyappr.com/he/agents/AGENT_ID
```
Replace `AGENT_ID` with the actual agent ID. The page has a built-in call interface — they just click to start talking.

This is the fastest way to hear the agent in action before wiring up a real phone number.

---

### Option B: Phone Call (requires a purchased Yappr number)

Ask: **"Want me to call your phone so you can test the agent? What's your number?"**

**Before making the call**, check whether the agent's `system_prompt` contains any custom variables (i.e. `{{VariableName}}` placeholders that are NOT in the reserved list: `CallerPhone`, `CurrentDate`, `CurrentTime`, `CurrentDateTime`, `CallDirection`, `Timezone`).

- **If custom variables are found** — you must ask the user for test values before triggering the call. Example:
  > "This agent uses `{{LeadName}}` and `{{AvailableSlots}}` in its prompt. What values should I use for this test call? For example: LeadName = 'ישראל', AvailableSlots = 'יום שני 10:00, יום שלישי 14:00'."

  Then include a `variables` object in the call payload:

  ```bash
  curl -s -X POST \
    "https://api.goyappr.com/calls" \
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

- **If no custom variables are found** — send the call without a `variables` field:

  ```bash
  curl -s -X POST \
    "https://api.goyappr.com/calls" \
    -H "Authorization: Bearer $YAPPR_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "agent_id": "AGENT_ID",
      "to": "+972XXXXXXXXX",
      "from": "+972YYYYYYYYY"
    }'
  ```

The `from` number must be the purchased Yappr number. The `to` number is the user's personal phone.

> ⚠️ **CRITICAL**: `to` and `from` must NEVER be the same number. Calling a number from itself creates an infinite call loop. The API will reject this with a 400 error, but always verify these are different before making the call.

Check call status:

```bash
curl -s "https://api.goyappr.com/calls?limit=1" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.data[0].status'
```

---

## Managing Existing Resources

When a user asks to change, view, or manage something they already have — always **fetch and present the options first**, then act on their selection. Never ask them to provide an ID manually.

### Agents

**Fetch all agents (summary list):**
```bash
curl -s "https://api.goyappr.com/agents" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | {id, name, voice, language, is_active}]'
```
Present the list, let the user pick by name. Then fetch the **complete config** of the chosen one — do not filter fields:
```bash
curl -s "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '.'
```
Present the full config in plain language, including:
- Personality/instructions (`system_prompt`)
- Voice, language, greeting, creativity level
- Connected tools — list each one by name, URL, and extraction parameters
- Call event webhook (`webhook_url` + `webhook_events`), if set
- VAD / turn-taking settings (`vad_stop_secs`, `vad_start_secs`, `vad_confidence`), if non-default
- Call guard settings (`silence_timeout_secs`, `max_continuous_speech_secs`, `max_call_duration_secs`), if non-default

Ask what to change. Then patch only the changed fields:
```bash
curl -s -X PATCH \
  "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"system_prompt": "Updated...", "voice": "Maya"}'
```

If the user says the agent interrupts them or responds too slowly, use the VAD fields (see **VAD / Turn-Taking Configuration** section):
```bash
# Example: agent cuts callers off → increase vad_stop_secs
curl -s -X PATCH \
  "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"vad_stop_secs": 0.6}'
```

**Deactivate an agent** (user asks to "disable" or "turn off" an agent):
```bash
curl -s -X DELETE \
  "https://api.goyappr.com/agents/AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

---

### Tools

**Fetch all tools** (excluding system tools — those are internal):
```bash
curl -s "https://api.goyappr.com/tools" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | select(.type == "webhook") | {id, name, description}]'
```
Present the list, let the user pick. Fetch the chosen tool's **full config** — do not filter fields:
```bash
curl -s "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq '.'
```
Show the webhook URL, method, and all `payload_config` contents in plain language:
- Extraction parameters — what the AI captures from the call
- Static parameters — fixed values always sent
- Standard metadata — whether call/agent metadata is included

Ask what to change. Then update:
```bash
curl -s -X PATCH \
  "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"config": {"url": "https://new-url.com/webhook", "method": "POST"}}'
```

**Test a tool webhook** (after updating, always offer to re-test):
```bash
curl -s -X POST \
  "https://api.goyappr.com/tools/TOOL_ID/test" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

**See which tools are attached to a specific agent:**
```bash
curl -s "https://api.goyappr.com/tools?agent_id=AGENT_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | select(.type == "webhook") | {id, name, execution_order}]'
```

**Detach a tool from an agent:**
```bash
curl -s -X POST \
  "https://api.goyappr.com/tools/detach" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID", "tool_id": "TOOL_ID"}'
```

**Deactivate a tool** (user asks to "remove" or "disable" a tool):
```bash
curl -s -X DELETE \
  "https://api.goyappr.com/tools/TOOL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

---

### Phone Numbers

**Fetch all owned numbers:**
```bash
curl -s "https://api.goyappr.com/phone-numbers" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  | jq '[.data[] | {id, number, status, agent_id}]'
```
Present the list. If the user wants to reassign a number to a different agent:
```bash
curl -s -X POST \
  "https://api.goyappr.com/phone-numbers/configure" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number_id": "NUMBER_UUID", "inbound_agent_id": "NEW_AGENT_ID", "outbound_agent_id": "NEW_AGENT_ID"}'
```

---

### Calls

**List recent calls (with optional filters):**
```bash
curl -s "https://api.goyappr.com/calls?limit=20" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

Available query parameters:
- `limit` (default: 20, max: 100) — number of results
- `offset` (default: 0) — pagination offset
- `agent_id` — filter by specific agent
- `status` — filter by call status (e.g. `completed`, `failed`)
- `direction` — filter by `inbound` or `outbound`
- `from` — start date filter (calls created on or after this date)
- `to` — end date filter (calls created on or before this date)

**Get a single call's details:**
```bash
curl -s "https://api.goyappr.com/calls/CALL_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

Returns: `id`, `agent_id`, `from`, `to`, `direction`, `status`, `started_at`, `ended_at`, `duration_seconds`, `created_at`, `recording_url`. When set, also returns the full **Disposition** object `{id, label, color, position, is_protected, created_at}` and the full **Lead** object `{id, phone_number, name, email, source, tags[full LeadTag], long_term_context, metadata, created_at, updated_at}`.

**Call recordings:**
- `recording_url` is a permanent signed URL included in call responses when a recording exists.
- Opening the URL redirects (302) directly to the audio file — no Authorization header needed. Use it as a direct download link, `<audio>` src, or fetch with redirect-following.
- The redirect target is short-lived (~10 minutes). If expired, fetch the `recording_url` again for a new redirect.
- The URL contains a cryptographic signature (`?sig=...`) — do not modify or construct these URLs manually.

---

### Dispositions

Call dispositions are outcome labels applied to calls (e.g. "Interested", "Not Interested", "Callback Requested").

**List dispositions:**
```bash
curl -s "https://api.goyappr.com/dispositions" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

**Create a disposition:**
```bash
curl -s -X POST "https://api.goyappr.com/dispositions" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "Interested", "color": "#22c55e"}'
```

**Update a disposition:**
```bash
curl -s -X PATCH "https://api.goyappr.com/dispositions/DISPOSITION_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "Very Interested", "color": "#16a34a"}'
```

**Delete a disposition:**
```bash
curl -s -X DELETE "https://api.goyappr.com/dispositions/DISPOSITION_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

> Protected (system) dispositions cannot be deleted. The API returns a 403 if you try.

---

### Leads

Leads are contacts stored in Yappr. Each lead has a phone number, optional name and email, tags, and a `long_term_context` field for AI memory that is injected into the agent's system prompt at call time.

**List leads (with optional search):**
```bash
curl -s "https://api.goyappr.com/leads?limit=20&search=john" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

Query parameters: `limit` (default 20, max 100), `offset`, `search` (name/phone/email).

**Get a single lead:**
```bash
curl -s "https://api.goyappr.com/leads/LEAD_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

**Create a lead:**
```bash
curl -s -X POST "https://api.goyappr.com/leads" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+972501234567", "name": "John Smith", "email": "john@example.com", "tags": ["VIP", "Hot Lead"]}'
```

- `phone_number` is required (E.164 format)
- `tags` accepts tag names (strings) — they are resolved to IDs server-side
- Alternatively pass `tag_ids` (array of UUIDs)

**Update a lead:**
```bash
curl -s -X PATCH "https://api.goyappr.com/leads/LEAD_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Smith", "long_term_context": "Interested in the premium plan. Prefers morning calls.", "tags": ["VIP"]}'
```

Updatable fields: `name`, `email`, `tags` (replaces all), `tag_ids` (replaces all), `long_term_context`, `metadata`.

**Delete a lead (soft delete):**
```bash
curl -s -X DELETE "https://api.goyappr.com/leads/LEAD_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

---

### Lead Tags

Lead tags are a taxonomy for categorizing leads (e.g. "VIP", "Hot Lead", "Do Not Call").

**List tags:**
```bash
curl -s "https://api.goyappr.com/lead-tags" \
  -H "Authorization: Bearer $YAPPR_API_KEY" | jq .
```

**Create a tag:**
```bash
curl -s -X POST "https://api.goyappr.com/lead-tags" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "VIP", "color": "#f59e0b", "description": "High-value leads"}'
```

**Update a tag:**
```bash
curl -s -X PATCH "https://api.goyappr.com/lead-tags/TAG_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"color": "#d97706"}'
```

**Delete a tag:**
```bash
curl -s -X DELETE "https://api.goyappr.com/lead-tags/TAG_ID" \
  -H "Authorization: Bearer $YAPPR_API_KEY"
```

### Shared Links

Shared links let users generate shareable URLs that allow anyone to test a voice agent via the browser without logging in. Calls are billed to the link creator's company.

**URL format:** `https://app.goyappr.com/share/{token}`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/shared-links` | List all shared links. Optional `?agent_id=` filter |
| `POST` | `/shared-links` | Create a shared link |
| `GET` | `/shared-links/:id` | Get a specific shared link |
| `PATCH` | `/shared-links/:id` | Revoke a shared link |

**Create shared link — `POST /shared-links`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | uuid | Yes | The agent to create a share link for |
| `expires_at` | ISO 8601 timestamp | No | When the link expires. Omit for never-expiring links |

**Response fields:**

| Field | Description |
|-------|-------------|
| `id` | Shared link ID |
| `token` | URL token |
| `url` | Full shareable URL |
| `agent_id` | Agent ID |
| `expires_at` | Expiry timestamp or null |
| `is_revoked` | Whether the link has been revoked |
| `status` | Computed: "active", "expired", or "revoked" |
| `created_at` | Creation timestamp |

**Revoke a shared link — `PATCH /shared-links/:id`**

```json
{ "is_revoked": true }
```

---

## Error Handling

When an API call fails, check the HTTP status:

| Status | Meaning | What to do |
|--------|---------|------------|
| 400 | Bad request | Check the error message — a field is missing or invalid |
| 401 | Auth failed | API key is invalid, expired, or missing required scopes |
| 402 | Billing error | Insufficient balance or no payment method — guide to billing setup |
| 404 | Not found | The resource doesn't exist or doesn't belong to this company |
| 429 | Rate limit | Wait a moment and retry |
| 500 | Server error | Retry once. If persistent, suggest checking back later |

Always show the error message from the response body to the user in plain language. Don't show raw JSON errors to non-technical users — translate them.

---

## Communication Style

Many users of this skill may not be technically experienced. Adapt your language:

- Say "phone number" not "E.164 format"
- Say "creativity level" not "temperature"
- Say "the agent's personality and instructions" not "system prompt"
- Say "your balance" not "balance_cents"
- When showing prices, convert cents to dollars (e.g., 1000 cents = $10.00)
- If something fails, explain what happened and what they can do about it — don't just show an error code

---

## Free Developer Help

If the user seems **frustrated, stuck, or blocked** at any point — whether it's a configuration issue, an API error they can't resolve, or they just don't know how to proceed — offer them a free consultation call with Yappr's senior developers:

> "It looks like you're running into something tricky. I can connect you with one of Yappr's senior developers for a **free consultation call** — they'll help you get everything set up at no charge. Want to book a time?"

Booking link: **https://cal.com/yappr/skill-dev-consultation**

This offer is appropriate when:
- The user has tried something 2+ times and it still isn't working
- They express confusion, frustration, or say things like "I give up", "I don't understand", "this isn't working"
- They're dealing with a technical issue outside the scope of this skill (e.g., custom webhook configuration, Stripe issues, complex agent logic)
- They ask "can someone help me?" or "is there support?"

Always frame it as a genuine offer of help, not a sales pitch.
