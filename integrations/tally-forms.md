# Tally Forms

> **Use in Yappr context**: Receive leads submitted via Tally forms and immediately trigger outbound Yappr calls to those leads.

## Authentication

Tally webhooks are unauthenticated POST requests. Secure your endpoint with a secret query parameter validated in your edge function.

For Tally API access (form management):
- Tally → Settings → API → Generate token
- Header: `Authorization: Bearer {token}`

## Webhook Setup

In Tally:
1. Open your form → Integrations → Webhooks
2. Add webhook URL: `https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/tally-webhook?secret=your_secret`
3. Select trigger: `New submission`
4. Save and test

## Webhook Payload Structure

**POST to your webhook URL:**

```json
{
  "eventId": "abc123",
  "eventType": "FORM_RESPONSE",
  "createdAt": "2026-04-11T10:00:00.000Z",
  "data": {
    "responseId": "xyz789",
    "submissionId": "xyz789",
    "respondentId": "resp_abc",
    "formId": "mBzNlP",
    "formName": "Lead Generation Form",
    "createdAt": "2026-04-11T10:00:00.000Z",
    "fields": [
      {
        "key": "question_abc123",
        "label": "Full Name",
        "type": "INPUT_TEXT",
        "value": "David Cohen"
      },
      {
        "key": "question_def456",
        "label": "Phone Number",
        "type": "INPUT_PHONE_NUMBER",
        "value": "0501234567"
      },
      {
        "key": "question_ghi789",
        "label": "Email",
        "type": "INPUT_EMAIL",
        "value": "david@example.com"
      },
      {
        "key": "question_jkl012",
        "label": "Which plan interests you?",
        "type": "MULTIPLE_CHOICE",
        "value": "Business",
        "options": [
          { "id": "opt1", "text": "Starter" },
          { "id": "opt2", "text": "Business" },
          { "id": "opt3", "text": "Enterprise" }
        ]
      }
    ]
  }
}
```

**Key field types:**
- `INPUT_TEXT` — plain text
- `INPUT_PHONE_NUMBER` — phone (no guaranteed format normalization)
- `INPUT_EMAIL` — email address
- `MULTIPLE_CHOICE` — selected option
- `CHECKBOXES` — value is an array of selected option texts
- `DROPDOWN` — selected option text
- `TEXTAREA` — multi-line text
- `NUMBER` — numeric value
- `RATING` — numeric 1–5 (or configured max)
- `DATE` — date string `YYYY-MM-DD`

## Key Pattern: Extract Fields by Label

Always find fields by `label`, not by `key` (keys are auto-generated random strings):

```typescript
function getField(fields: any[], label: string): string | null {
  const field = fields.find(f => 
    f.label.toLowerCase() === label.toLowerCase()
  );
  return field?.value ?? null;
}

const phone = getField(data.fields, "Phone Number");
const name = getField(data.fields, "Full Name");
const email = getField(data.fields, "Email");
const plan = getField(data.fields, "Which plan interests you?");
```

For fuzzy matching (in case labels vary slightly):
```typescript
function getFieldFuzzy(fields: any[], keywords: string[]): string | null {
  const field = fields.find(f =>
    keywords.some(kw => f.label.toLowerCase().includes(kw.toLowerCase()))
  );
  return field?.value ?? null;
}

const phone = getFieldFuzzy(data.fields, ["phone", "mobile", "טלפון"]);
```

## Common Patterns

### Full webhook handler → Yappr call
```typescript
export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Validate secret
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== Deno.env.get("TALLY_WEBHOOK_SECRET")) {
    return new Response("Forbidden", { status: 403 });
  }

  const payload = await req.json();
  if (payload.eventType !== "FORM_RESPONSE") {
    return new Response("ok", { status: 200 });
  }

  const fields = payload.data.fields;

  const rawPhone = getField(fields, "Phone Number") ?? getField(fields, "טלפון");
  const name = getField(fields, "Full Name") ?? getField(fields, "שם מלא");
  const email = getField(fields, "Email") ?? "";
  const plan = getField(fields, "Which plan interests you?") ?? "";

  if (!rawPhone) {
    console.error("No phone field found in Tally submission", fields.map(f => f.label));
    return new Response("ok", { status: 200 });
  }

  const phone = normalizeIsraeliPhone(rawPhone);

  // Trigger Yappr call
  const callRes = await fetch(
    "https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/api-v1-calls",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("YAPPR_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: phone,
        agentId: Deno.env.get("AGENT_ID"),
        metadata: { source: "tally-form", name, email, plan },
      }),
    }
  ).then(r => r.json());

  return new Response(JSON.stringify({ callId: callRes.id }), { status: 200 });
}
```

## Gotchas & Rate Limits

- **Field keys are stable but random**: `question_abc123` stays the same for a given form version but is meaningless. Always use `label` for field identification.
- **No signature verification**: Tally doesn't sign webhooks (as of 2026). Secure with a secret query param.
- **Phone number format**: Tally passes phone numbers as-entered by the user. Israeli users may enter `050-123-4567`, `0501234567`, or `+972501234567`. Always normalize.
- **Multi-select values**: For `CHECKBOXES`, `value` is an array of strings (the selected option texts). For `MULTIPLE_CHOICE`, `value` is a single string.
- **Form language**: If you have a Hebrew form, field labels will be in Hebrew. Build label extraction that handles both languages.
- **No rate limits on webhooks**: Tally sends one POST per submission.
- **Duplicate prevention**: If the same person submits twice, you'll get two webhook calls. Add deduplication on phone number with a short TTL (e.g. 5 minutes).
- **Tally API (separate from webhooks)**: For reading submissions via API, use `GET /forms/{formId}/submissions` with a Bearer token.
