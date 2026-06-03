// dispatch-calls.ts
// YOUR OWN glue — you host & run this on your infrastructure (e.g. your Supabase project).
// It is your call queue's dispatcher, not a Yappr-supplied feature: it drains a table you own
// and calls Yappr's public POST /calls endpoint. Adapt the table/columns to your setup.
// Called by pg_cron every minute. Dispatches pending calls to Yappr.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   YAPPR_API_KEY        — ypr_live_... key with calls:create scope
//   YAPPR_API_BASE       — https://api.goyappr.com
//
// Optional:
//   MAX_CONCURRENT       — max calls to dispatch per run (default: 5)
//   PRE_FETCH_ENABLED    — "true" to enable pre-fetch hooks (default: false)
//
// Pre-fetch pattern:
//   Before calling Yappr, this function can optionally fetch dynamic data
//   (e.g., calendar availability) and inject it into the "variables" field.
//   Uncomment and customize the PRE_FETCH section below.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const yapprApiKey = Deno.env.get("YAPPR_API_KEY")!;
const yapprApiBase = Deno.env.get("YAPPR_API_BASE") ?? "https://api.goyappr.com";
const maxConcurrent = parseInt(Deno.env.get("MAX_CONCURRENT") ?? "5");

// ── PRE-FETCH HOOK ───────────────────────────────────────────────────────────
// Customize this function to fetch data before dispatching each call.
// Return an object that will be passed as "variables" to Yappr.
// These become {{VariableName}} template variables in the agent's system prompt.
//
// Example: fetch calendar availability so the agent doesn't need to call a tool.
async function preFetchVariables(row: Record<string, unknown>): Promise<Record<string, string>> {
  // Default: return whatever is already stored in pre_fetch_variables
  const stored = (row.pre_fetch_variables as Record<string, string>) ?? {};
  return stored;

  // ── UNCOMMENT TO ENABLE CALENDAR PRE-FETCH ──────────────────────────────
  // const slots = await fetchCalendarAvailability(); // implement this
  // return {
  //   ...stored,
  //   availableSlots: slots,  // becomes {{availableSlots}} in prompt
  // };
}
// ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch pending rows that are due
  const { data: rows, error } = await supabase
    .from("call_queue")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(maxConcurrent);

  if (error || !rows || rows.length === 0) {
    return new Response(JSON.stringify({ dispatched: 0 }), { status: 200 });
  }

  let dispatched = 0;
  const results: unknown[] = [];

  for (const row of rows) {
    try {
      // Mark as dispatching (optimistic lock)
      await supabase
        .from("call_queue")
        .update({ status: "dispatched", last_attempted_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending"); // only update if still pending (prevents double-dispatch)

      // Pre-fetch variables
      const variables = await preFetchVariables(row);

      // Dispatch to Yappr
      const yapprRes = await fetch(`${yapprApiBase}/calls`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${yapprApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: row.agent_id,
          to: row.phone_number,
          from: row.from_number,
          metadata: {
            call_queue_id: row.id,
            campaign: row.campaign,
            attempt: row.attempts + 1,
            lead_name: row.lead_name,
          },
          variables: {
            ...variables,
            // Built-in: CallerPhone, CurrentDate, CurrentDateTime, CallDirection
            // are injected automatically by Yappr — no need to pass them
          },
        }),
      });

      const yapprData = await yapprRes.json();

      // IMPORTANT: POST /calls does NOT always return a call_logs id.
      //   • 201 → immediate dial: `id` IS the real call_log id → store as yappr_call_id.
      //   • 200 → number on DNC: not dialled, but a real call_log id is in `call_id` (status dnc_blocked).
      //   • 202 → queued (server at capacity) or scheduled (outside call window):
      //           `id` is a Yappr-side *call_queue* entry id, NOT a call_log id. Storing it as
      //           yappr_call_id would break later webhook matching (.eq("yappr_call_id", call_id)),
      //           because the webhook delivers the real call_log id. Keep the row 'pending' to
      //           re-poll, and stash the queue id separately so you can reconcile via the webhook's call_id.
      if (yapprRes.status === 201) {
        await supabase
          .from("call_queue")
          .update({
            yappr_call_id: yapprData.id,
            attempts: row.attempts + 1,
            status: "dispatched",
          })
          .eq("id", row.id);

        dispatched++;
        results.push({ id: row.id, yappr_call_id: yapprData.id, status: "ok" });
      } else if (yapprRes.status === 202) {
        // Queued or scheduled — yapprData.id is a queue-entry id, not a call id.
        // Re-poll later; the real call_log id arrives via the webhook (match on its call_id).
        await supabase
          .from("call_queue")
          .update({
            // yappr_queue_id: a separate column you add to reconcile against the webhook payload.
            yappr_queue_id: yapprData.id,
            attempts: row.attempts + 1,
            status: "pending",
            next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          })
          .eq("id", row.id);
        results.push({ id: row.id, yappr_queue_id: yapprData.id, status: yapprData.status ?? "queued" });
      } else if (yapprRes.status === 200 && yapprData.status === "dnc_blocked") {
        // Number is on the company DNC list — not dialled. `call_id` is a real call_log id.
        await supabase
          .from("call_queue")
          .update({
            yappr_call_id: yapprData.call_id ?? null,
            status: "completed",
            disposition: "DNC Blocked",
          })
          .eq("id", row.id);
        results.push({ id: row.id, status: "dnc_blocked" });
      } else if (yapprRes.status === 429 || yapprRes.status === 503) {
        // Rate limited or server at capacity — reschedule in 5 minutes
        await supabase
          .from("call_queue")
          .update({
            status: "pending",
            next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          })
          .eq("id", row.id);
        results.push({ id: row.id, status: "rescheduled", reason: "capacity" });
      } else {
        // Permanent failure
        await supabase
          .from("call_queue")
          .update({ status: "failed" })
          .eq("id", row.id);
        results.push({ id: row.id, status: "failed", error: yapprData });
      }
    } catch (err) {
      // Network error — reschedule
      await supabase
        .from("call_queue")
        .update({
          status: "pending",
          next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        })
        .eq("id", row.id);
      results.push({ id: row.id, status: "error", error: String(err) });
    }
  }

  return new Response(JSON.stringify({ dispatched, results }), { status: 200 });
});
