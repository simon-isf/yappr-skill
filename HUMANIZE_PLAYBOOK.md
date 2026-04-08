# Humanize AI Agents Playbook

A synthesis of research across human phone conversation patterns, sales psychology, NLP/dialogue theory, and voice AI prompt engineering. Use this as the reference document when writing or reviewing any agent system prompt.

---

## Part 1: The Core Philosophy — Goals, Not Scripts

### Why Scripts Fail

A script gives the agent a sequence of lines. The moment the user deviates — which they always do — the agent has no instructions for what to do. It either ignores what was said and plows forward, or produces a garbled recovery. Both break trust immediately.

The LLM already has conversational capability. The prompt's job is to define the **outcome**, the **constraints**, and the **persona** — not the exact words. Over-specifying what to say forces the LLM to choose between following instructions and responding to the user, and it will often choose the former.

### The Reframe

| Scripted thinking | Goal-oriented thinking |
|---|---|
| "Say X, then ask Y, then say Z" | "Collect: name, location, specialty. Do it naturally, order doesn't matter." |
| "If they say X, say Y" | "If they object about timing, acknowledge specifically, then ask what would make this a better time." |
| "Stage 3: ask 3 questions in order" | "Build rapport by genuinely learning about them — use what they say to shape what you ask next." |

Research from EMNLP 2025 (proactive and transition-aware agents) confirms: systems designed around goal + constraints significantly outperform sequential script systems on user satisfaction. The conversation is a means to an outcome — not the outcome itself.

---

## Part 2: Responding to What Was Actually Said

This is the single most important rule. Every failure mode traces back to it.

### The Failure Pattern

The agent asks a question. The user doesn't answer it — they ask a question back, express confusion, go off-topic, or give an ambiguous response. The agent responds to the *expected* input rather than the *actual* input: it praises an answer that wasn't given, or bulldozes into the next script item.

This is instantly detectable by the human on the other end. It is the clearest signal that they are not being listened to.

### The Rule

**Before moving forward from any user turn, the agent must ask: did I actually respond to what they said?**

Four specific cases:

1. **User asked a question** → Answer it fully and directly. Never defer it. Never segue around it. Then return to the prior thread.

2. **User's response didn't answer the question asked** → Do not acknowledge it as if it did. Do not say "fascinating!" or "great!" when you received no answer. Absorb, interpret, bridge: "So it sounds like you're saying X — is that right? And going back to [question]..."

3. **User expressed confusion or didn't recognize a name/concept** → Explain before continuing. Do not treat "I don't know who that is" as a yes/no answer and move on.

4. **User said something emotionally weighted (frustration, hesitation, surprise)** → Acknowledge the register specifically before addressing the content. "I understand that must be frustrating" as a boilerplate prefix is worse than nothing — reference what they actually said.

### The ARC Framework (Acknowledge → Respond → Redirect)

For any unexpected input:
1. **Acknowledge**: Name what was said without judgment. "That makes sense." / "Of course." / "Fair question."
2. **Respond**: Address it briefly and genuinely.
3. **Redirect**: Bridge back with a question, not a statement. "Given that — [question that picks up the thread]."

The failure version is skipping straight to Redirect, or skipping all three entirely.

---

## Part 3: Threading — Digressions and Return

### The Mechanism

Skilled human phone communicators maintain a "topic stack." When a digression occurs, they answer it, then explicitly return to where they were. They don't lose the thread, and they don't pretend the digression didn't happen.

The resumption cue is load-bearing. Research shows "anyway," "so," and explicit topic-naming ("getting back to why I called...") are the natural resumption markers. Their length should match the digression length:

- Short digression (1–2 exchanges): "Anyway, so where were we — [question]"
- Longer digression (3+ exchanges): "So getting back to [explicit topic name] — [question]"

### How to Encode This in a Prompt

Include explicit threading instructions. Something like:

> "If the user asks a question or raises a topic outside the current step, answer it fully and directly. Do not defer it. Once addressed, bridge back: acknowledge where you were and continue from there."

The key failure to prevent: prompts that say "stay on topic" or "don't deviate." These cause the worst failure mode — the agent ignores the user's question entirely. The correct instruction is to handle the digression AND return, not to suppress it.

### Internal State Tracking

The agent needs to maintain a mental "current goal" throughout the call. When a digression is handled, it returns to that goal explicitly. The prompt should encode this:

- What the call is trying to accomplish (overall)
- What has been collected so far
- What is still needed
- What stage was active before the digression

For complex multi-step flows, encode this as an explicit state block in the prompt, updated each stage:

```
[CURRENT STATE]
Collected: name, location
Still needed: specialty, years of experience
Current stage: rapport building
```

This is not message history — it's an interrupt register the agent can always return to.

---

## Part 4: Active Listening Signals

### Backchanneling

Backchannels account for ~19% of all utterances in spoken human dialogue. They divide into three types:

- **Continuers**: "mm-hmm", "yeah", "right" — "I'm following, keep going"
- **Assessments**: "oh wow", "I see", "really" — "I processed that emotionally"
- **Acknowledgments**: "okay", "got it" — "received, can act on it"

**Timing is everything.** A backchannel at the wrong moment reads as interruption. The correct trigger points are prosodic completion cues: pitch falls, speech rate slows, or a syntactically complete unit finishes.

Rules:
- Never backchannel twice in a row without meaningful content in between — it reads as hollow
- Don't use the same acknowledgment word every turn — vary between "right", "okay", "I see", "got it", "sure"
- Use "mm-hmm" during long user explanations; switch to a word-level acknowledgment when they complete a thought

### Talk/Listen Ratio

Top-performing sales reps talk 43% / listen 57%. Average reps invert this. The agent should be doing more asking and listening than telling.

Concrete implication: **the agent should not make a point and then immediately make another point.** One thought → pause → let the human respond.

### Silence

After asking a question, wait. Top reps let 4+ seconds pass. The urge to fill silence is the agent's problem, not the prospect's. An agent that immediately restates or rephrases a question the moment the human pauses signals that it isn't genuinely waiting for an answer.

---

## Part 5: Turn-Taking and Timing

### The Numbers

| Duration | Perception |
|---|---|
| 0–300ms | Normal transition gap |
| 300ms–3s | Perceptible pause, acceptable |
| 3s+ | Awkward — requires a filler or acknowledgment |

On a cold business call with an unfamiliar person, even 2-second gaps feel broken. The threshold loosens on warmer, established calls.

### Rules

- Target turn transitions under 500ms for cold/business call contexts
- If processing requires more than ~1 second, insert a filler immediately: "Let me check on that —", "One second —"
- If both parties start talking simultaneously (competitive simultaneous start), the agent should always yield immediately and invite the human to continue: "Sorry — go ahead."

---

## Part 6: What Makes It Sound Scripted

Research on spontaneous vs. non-spontaneous speech identifies these as the primary tells:

1. **Absence of disfluencies**: Natural speech has filled pauses ("uh", "um"), false starts, self-corrections. Scripted speech is too smooth.
2. **Fixed prosody**: Scripted delivery has predictable rhythm with pauses only at sentence boundaries.
3. **No listener adaptation**: Spontaneous speech adjusts to backchannels, interruptions, tone changes. Scripted delivery continues regardless.
4. **Formal register**: Scripts use complete sentences. Natural conversation uses contractions, fragments, colloquialisms.
5. **Over-smooth transitions**: "Great! Moving on to our next topic..." is an immediate AI tell. Human conversations have imperfect, organic transitions.
6. **Response doesn't match what was said**: The agent heard the words but responded to the expected-branch version.
7. **Generic follow-up questions**: Questions that could apply to anyone signal the agent isn't processing what was shared.
8. **Emotional mismatch**: Responding to expressed frustration with a perky, formulaic reply.

**The most important signal that someone is listening: what the user just said visibly changes what the agent does next.** If the agent's behavior would be identical regardless of the prior turn, it sounds like a script.

---

## Part 7: Rapport and Sales Psychology

### On Cold/Warm Calls

- **Lead with calm directness, not energy.** High-energy openers trigger sales-resistance reflex. A confident, measured opener disarms.
- **Genuine curiosity outperforms qualification.** Prospects who feel the caller is sincerely interested in their situation stay on the call longer and disclose more. This means asking follow-up questions that derive from the specific answer just given — not the next item on the checklist.
- **Pacing and mirroring**: Match the prospect's vocal pace and energy. If they're clipped and busy, be crisper. If they're open and chatty, allow more space.

### Off-Topic Responses — Follow the Thread

When a prospect drifts — mentions a frustration, a concern, something tangential — this is usually the real conversation, not a distraction from it.

**Gong data shows**: the more turns a conversation takes (including "off-topic" detours the rep engages with), the better the outcome. "Tell me more about that" is often the highest-value sentence on a call.

**When to redirect** (not follow): when the prospect is clearly using tangents to run out the clock, or when the topic can't be resolved in the current call format. Use a connective bridge: "That's worth a proper conversation — can we come back to it? I want to make sure we don't lose it."

**The test**: Does following this thread get you closer to understanding their situation, or further away?

### Objection Handling

Most objections are not the real objection. "Now's not a good time" usually means "I don't see enough value yet."

- **Don't defend, explore**: "That's fair — can I ask what's driving that?" gets more information than any counter-argument.
- **Never argue**: Any argument — even one you win logically — creates resistance. The goal is for the prospect to feel their objection is legitimate, then walk through it together.
- Use **LAARC**: Listen → Acknowledge → Assess → Respond → Confirm. The "Assess" step is what AI agents skip — genuinely determining what the objection means before responding to it.

---

## Part 8: Prompt Structure

Every agent prompt should be organized into clearly separated sections:

```
<identity>
Name, role, who they work for, what success means for this call.
</identity>

<persona>
Communication style, register, energy level.
Specific behavioral rules that survive unexpected inputs.
Use contractions. Speak in fragments where natural.
</persona>

<critical_rules>
The 3-5 rules that must survive the entire conversation.
State the most important 1-2 rules twice (at top and later).
</critical_rules>

<conversation_flow>
Stages as goals, not scripts.
Each stage: what to accomplish, not what to say.
Include threading instructions for each stage.
</conversation_flow>

<objection_handling>
Principles, not scripts. How to respond to the spirit of an objection.
</objection_handling>
```

Separate knowledge from instructions: facts about the product/service go in a knowledge base or a `<context>` block, not inline with behavioral instructions. The model confuses "what I know" with "what I'm supposed to do" when they're mixed.

---

## Part 9: Prompt Rules That Work

These are the specific instructions that research and platform documentation confirm produce measurably better behavior:

**Threading**
> "If the user asks a question mid-conversation, answer it fully and directly. Do not defer it or redirect around it. Once answered, bridge back: 'Anyway, going back to [topic]...'"

**No fake acknowledgment**
> "Never confirm or praise an answer that wasn't given. If the user's response didn't answer your question, absorb it, interpret it back to them if needed, then return to the question."

**No robotic transitions**
> "Do not use transition phrases like 'Moving on,' 'Great,' 'Certainly,' or 'Of course.' Transition naturally by continuing the conversation."

**Emotional acknowledgment**
> "When the user expresses frustration, hesitation, or strong emotion, reference what they specifically said before addressing the content. Never use generic empathy phrases."

**Clarification repair**
> "If you don't understand a response after one attempt, make a reasonable assumption and state it: 'I'll assume you mean X — is that right?' Then move forward. Don't loop on the same clarification."

**Prevent instruction drift in long calls**
> Repeat the 1-2 most critical rules at both the top and bottom of the prompt. For multi-step flows, each stage should have its own focused instructions rather than relying on one global block.

---

## Part 10: Voice-Specific Formatting

- Responses under 50 words for simple queries — break complex answers into conversational turns
- Never use bullet points, headers, markdown, or numbered lists in voice output
- Spell out numbers and times: "January twenty-fourth", "four thirty PM"
- Provide phonetic guidance for brand names and technical terms in the prompt
- Use ellipses and letter repetition for TTS pacing hints: "Well... I-I'd need to check on that"
- Temperature 0.1–0.2 for precision-critical flows; higher temperatures increase conversational naturalness but reduce instruction adherence

---

## Part 11: The Uncanny Valley

Sesame AI's 2025 research identifies four components that must be present simultaneously to feel human:

1. **Emotional intelligence** — reading and responding to the emotional register, not just the content
2. **Conversational dynamics** — timing, pauses, interruptions, prosody that matches semantics
3. **Contextual awareness** — adjusting tone to match the situation (warm vs. clinical vs. social)
4. **Consistent personality** — coherent, stable presence across the call; no register shifts turn-to-turn

**The non-monotonic trap**: A voice that sounds almost human but has systematic errors is perceived as more disturbing than one that is obviously synthetic. Don't half-cross the valley. If the agent can't be fully natural in a dimension (timing, emotional register, etc.), be plainly clear rather than almost-right.

---

## Quick Reference — Checklist for Any New Prompt

Before shipping a system prompt, verify:

- [ ] Stages are written as **goals to accomplish**, not sequences of lines
- [ ] Explicit threading instruction: handle digressions and return to thread
- [ ] Rule against fake acknowledgment (don't confirm answers that weren't given)
- [ ] Rule against generic empathy phrases — always reference what was specifically said
- [ ] Rule against transition phrases ("Great!", "Moving on...")
- [ ] Clarification repair ladder defined (not a hard "I don't understand" dead end)
- [ ] Most important 1-2 rules stated twice in the prompt
- [ ] Knowledge separated from behavioral instructions
- [ ] Voice formatting rules applied (no markdown, numbers spelled out)
- [ ] Persona anchoring: specific behavioral rules that hold under unexpected inputs

---

*Sources: Gong.io call analytics, Voss/Vapi/Retell/ElevenLabs/OpenAI prompting guides, Sesame CSM research (2025), Jurafsky & Martin SLP3 Ch.25, Clark & Brennan grounding theory (1991), EMNLP 2025 proactive agent research, Stivers et al. turn-taking universals (2009), arxiv 2501.11613 (Conversation Routines framework), PMC vocal uncanny valley research.*
