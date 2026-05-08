# Supabase

> **Use in Yappr context**: Read and write data directly to the Yappr Supabase database from workflow edge functions — query call records, update lead status, store call metadata, and call RPCs.

## Authentication

**From edge functions (inside Supabase):**
```typescript
import { createClient } from "npm:@supabase/supabase-js";

// Use service role for admin operations (no RLS)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Use anon key with user JWT for user-scoped operations
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
);
```

**From external systems (HTTP):**
```
Authorization: Bearer {service_role_key}
apikey: {anon_key}
Content-Type: application/json
```

Yappr's Supabase URL: `https://ffzsojlyxumahuxjqerq.supabase.co`

## Base URL

```
https://ffzsojlyxumahuxjqerq.supabase.co
```

REST API: `/rest/v1/{table}`
Edge Functions: `/functions/v1/{function_name}`
RPC: `/rest/v1/rpc/{function_name}`

## Key Patterns

### Query Table
**GET /rest/v1/calls?select=*&company_id=eq.{id}&order=created_at.desc&limit=20**

**Headers:**
```
Authorization: Bearer {service_role_key}
apikey: {anon_key}
Content-Type: application/json
```

**Response:**
```json
[
  {
    "id": "call_abc123",
    "from_number": "+972501234567",
    "to_number": "+972521234567",
    "duration_seconds": 180,
    "disposition": "Appointment Set",
    "summary": "Customer interested in Business plan...",
    "created_at": "2026-04-11T10:00:00Z"
  }
]
```

Common filter operators:
- `eq.value` — equals
- `neq.value` — not equals
- `gt.value`, `lt.value` — greater/less than
- `gte.value`, `lte.value` — greater/less than or equal
- `like.%value%` — LIKE match
- `is.null` — is null
- `in.(val1,val2)` — in list

---

### Insert Row
**POST /rest/v1/{table}**

```json
{
  "from_number": "+972501234567",
  "company_id": "uuid",
  "metadata": { "source": "facebook-lead" }
}
```

**Headers for upsert:**
```
Prefer: return=representation    // Return inserted row
Prefer: resolution=merge-duplicates  // Upsert behavior
```

---

### Update Row
**PATCH /rest/v1/calls?id=eq.{call_id}**

```json
{
  "disposition": "Appointment Set",
  "summary": "Customer interested in Business plan."
}
```

**Response (with `Prefer: return=representation`):**
Updated row object.

---

### Call RPC (Stored Procedure)
**POST /rest/v1/rpc/validate_api_key**

```json
{
  "p_api_key": "sk_live_xxx"
}
```

**Response:**
```json
true
```

Or complex return type:
```json
{ "company_id": "uuid", "permissions": ["calls.create"] }
```

---

### Using SDK in Edge Function (preferred)
```typescript
import { createClient } from "npm:@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Query
const { data: calls, error } = await supabase
  .from("calls")
  .select("id, from_number, disposition, summary")
  .eq("company_id", companyId)
  .order("created_at", { ascending: false })
  .limit(10);

// Insert
const { data: newCall, error: insertError } = await supabase
  .from("calls")
  .insert({ from_number: phone, company_id: companyId })
  .select()
  .single();

// Update
const { error: updateError } = await supabase
  .from("calls")
  .update({ disposition, summary })
  .eq("id", callId);

// Upsert
const { error: upsertError } = await supabase
  .from("leads")
  .upsert({ phone, company_id: companyId, name: callerName }, { onConflict: "phone" });

// RPC
const { data, error: rpcError } = await supabase
  .rpc("validate_api_key", { p_api_key: apiKey });
```

---

### Call Edge Function from External System
**POST /functions/v1/{function_name}**

```typescript
const res = await fetch(
  "https://ffzsojlyxumahuxjqerq.supabase.co/functions/v1/api-v1-calls",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${YAPPR_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: phone, agentId }),
  }
).then(r => r.json());
```

---

### Realtime Subscription (from browser/Node)
```typescript
const channel = supabase
  .channel("call-updates")
  .on("postgres_changes", {
    event: "UPDATE",
    schema: "public",
    table: "calls",
    filter: `company_id=eq.${companyId}`,
  }, (payload) => {
    console.log("Call updated:", payload.new);
  })
  .subscribe();
```

## Common Patterns

### Store call outcome from workflow
```typescript
// In a workflow edge function triggered by call.analyzed webhook
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

await supabase
  .from("call_outcomes")
  .insert({
    call_id: callId,
    company_id: companyId,
    caller_phone: callerPhone,
    caller_name: callerName,
    disposition,
    summary: callSummary,
    crm_synced: false,
  });
```

## Gotchas & Rate Limits

- **RLS (Row Level Security)**: Service role key bypasses RLS. Anon key respects RLS. Use service role in edge functions, never expose it client-side.
- **Column names are snake_case**: Supabase tables use snake_case. The JS SDK returns them as snake_case too.
- **`Prefer: return=representation`**: Without this header, POST/PATCH returns empty body. Add to get the created/updated row back.
- **Rate limits**: Supabase free plan: 500MB DB, 1M edge function invocations/month. Pro: 8GB, 2M invocations. API requests: no hard limit but subject to connection pooling (max 60 direct connections on Pro).
- **JSONB columns**: Store arbitrary metadata in `jsonb` columns. Filter with: `?metadata->>'key'=eq.value` or via SDK: `.eq("metadata->key", value)`.
- **Migration files**: All schema changes in `/supabase/migrations/*.sql`. Never modify production schema via Dashboard SQL editor.
