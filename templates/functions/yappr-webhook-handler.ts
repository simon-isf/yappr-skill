// yappr-webhook-handler.ts
// Receives Yappr follow-ups (the agent workflow's After triggers: analysis.ready,
// call.no_answer, call.failed), each posted by one HTTP tool to this URL.
// Routes by disposition, schedules retries, triggers downstream actions.
//
// Body: {"call": {...}} plus the step's own inputs. Everything about the call is
// under `call` (call.call_id, call.status, call.callee_number, call.disposition
// {id, label}, call.analysis.summary, ...). A converted agent's follow-up also
// sends a top-level `event` with its old name ("call.analyzed", ...); a follow-up
// authored on a new agent sends none, so the event is derived from call.status.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   YAPPR_API_KEY        — to fetch full call details
//   YAPPR_API_BASE       — Yappr API base URL
//
// Optional:
//   WEBHOOK_SECRET       — a shared secret; put it in a header on the HTTP tool
//                          (e.g. Authorization) and compare it here
//   GREENAPI_INSTANCE    — Green API instance ID (for WhatsApp)
//   GREENAPI_TOKEN       — Green API token
//
// Retry schedule (customize to your needs):
//   Attempt 1: immediate (dispatched by dispatch-calls)
//   Attempt 2: +1 hour
//   Attempt 3: +3 hours (±30 min jitter)
//   Attempt 4: +24 hours (±2 hour jitter)
//   Attempt 5: +48 hours (±2 hour jitter)

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const yapprApiKey = Deno.env.get("YAPPR_API_KEY")!;
const yapprApiBase = Deno.env.get("YAPPR_API_BASE") ?? "https://api.goyappr.com";

// Retry delays in minutes per attempt (0-indexed: attempt 1 = index 0)
const RETRY_DELAYS_MINUTES = [0, 60, 180, 1440, 2880];
const RETRY_JITTER_MINUTES = [0, 10, 30, 120, 120];

function getNextAttemptTime(attempt: number): Date {
  const idx = Math.min(attempt, RETRY_DELAYS_MINUTES.length - 1);
  const base = RETRY_DELAYS_MINUTES[idx];
  const jitter = (Math.random() - 0.5) * 2 * RETRY_JITTER_MINUTES[idx];
  return new Date(Date.now() + (base + jitter) * 60 * 1000);
}

// Fetch full call details from Yappr (includes lead + disposition objects)
async function fetchYapprCall(callId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${yapprApiBase}/calls/${callId}`, {
      headers: { "Authorization": `Bearer ${yapprApiKey}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── DISPOSITION HANDLERS ─────────────────────────────────────────────────────
// Customize these based on your use case.
// callData = full call object from GET /api-v1/calls/:id (has lead, disposition, transcript, summary)
// webhookData = raw follow-up body: { event?, call: { call_id, status, call_direction,
//   caller_number, callee_number, disposition?: {id, label}, analysis?: {summary, extracted_data} } }

async function handleAppointmentSet(callData: Record<string, unknown>, supabase: ReturnType<typeof createClient>) {
  // Example: send WhatsApp confirmation + update contacts table
  const toNumber = callData.to as string;
  const lead = callData.lead as Record<string, unknown> | null;
  const callerName = (lead?.name as string) ?? "there";

  console.log(`Appointment set for ${toNumber} (${callerName})`);

  // Upsert contact
  if (lead) {
    await supabase.from("contacts").upsert({
      phone_number: toNumber,
      name: lead.name as string ?? null,
      email: lead.email as string ?? null,
    }, { onConflict: "phone_number" });

    await supabase.from("contact_interactions").insert({
      phone_number: toNumber,
      yappr_call_id: callData.id as string,
      agent_id: callData.agent_id as string,
      disposition: "Appointment Set",
      summary: callData.summary as string ?? null,
      duration_seconds: callData.duration_seconds as number ?? 0,
    });
  }

  // TODO: Send WhatsApp confirmation via Green API
  // See integrations/greenapi-whatsapp.md
  // await sendWhatsApp(toNumber, `Hi ${callerName}, your appointment is confirmed!`);
}

async function handleNoAnswer(webhookData: Record<string, unknown>, supabase: ReturnType<typeof createClient>) {
  const call = (webhookData.call ?? {}) as Record<string, unknown>;
  const toNumber = call.callee_number as string;
  const callId = call.call_id as string;
  // dispatch-calls puts call_queue_id in the call's metadata; POST /calls answers a
  // workflow agent with 202 and no call id yet, so match on it first.
  const queueId = (call.call_metadata as Record<string, unknown> | undefined)?.call_queue_id as string | undefined;

  const { data: queueRow } = await supabase
    .from("call_queue")
    .select("id, attempts, max_attempts, phone_number")
    .eq(queueId ? "id" : "yappr_call_id", queueId ?? callId)
    .maybeSingle();

  if (!queueRow) {
    // Not in our queue (e.g., manually triggered call) — log and move on
    console.log(`No answer for ${toNumber} (not in queue)`);
    return;
  }

  const attempts = (queueRow.attempts as number) + 1;
  const maxAttempts = queueRow.max_attempts as number;

  if (attempts >= maxAttempts) {
    await supabase
      .from("call_queue")
      .update({ status: "exhausted", attempts, disposition: "No Answer" })
      .eq("id", queueRow.id);
    console.log(`Exhausted retries for ${toNumber} after ${attempts} attempts`);
    // TODO: notify team or move to manual follow-up list
  } else {
    const nextAttemptAt = getNextAttemptTime(attempts);
    await supabase
      .from("call_queue")
      .update({
        status: "pending",
        attempts,
        next_attempt_at: nextAttemptAt.toISOString(),
        disposition: "No Answer",
      })
      .eq("id", queueRow.id);
    console.log(`Retry ${attempts}/${maxAttempts} for ${toNumber} scheduled at ${nextAttemptAt.toISOString()}`);
  }
}

async function handleNotInterested(callData: Record<string, unknown>, supabase: ReturnType<typeof createClient>) {
  const toNumber = callData.to as string;

  // Add to do-not-call list
  await supabase.from("do_not_call").upsert({ phone_number: toNumber, reason: "Not Interested" }, { onConflict: "phone_number" });

  // Update call_queue
  await supabase
    .from("call_queue")
    .update({ status: "completed", disposition: "Not Interested" })
    .eq("yappr_call_id", callData.id as string);
}

async function handleCallCompleted(callData: Record<string, unknown>, supabase: ReturnType<typeof createClient>) {
  const disposition = (callData.disposition as Record<string, unknown> | null)?.label as string | null;
  const callQueueId = (callData.metadata as Record<string, unknown> | null)?.call_queue_id as string | null;

  // Update call_queue with outcome
  if (callQueueId) {
    await supabase
      .from("call_queue")
      .update({
        status: "completed",
        disposition: disposition ?? null,
        call_summary: callData.summary as string ?? null,
      })
      .eq("id", callQueueId);
  } else {
    await supabase
      .from("call_queue")
      .update({
        status: "completed",
        disposition: disposition ?? null,
        call_summary: callData.summary as string ?? null,
      })
      .eq("yappr_call_id", callData.id as string);
  }

  // Route by disposition
  switch (disposition) {
    case "Appointment Set":
      await handleAppointmentSet(callData, supabase);
      break;
    case "Not Interested":
      await handleNotInterested(callData, supabase);
      break;
    case "Callback Requested":
      // TODO: schedule a follow-up call
      // await scheduleCallback(callData.to as string, callData.agent_id as string, "+24h");
      console.log(`Callback requested for ${callData.to}`);
      break;
    case "Interested":
      // TODO: add to follow-up sequence
      console.log(`Interested: ${callData.to}`);
      break;
    default:
      console.log(`Call completed with disposition: ${disposition ?? "none"}`);
  }
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let payload: Record<string, unknown>;

  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const call = (payload.call ?? {}) as Record<string, unknown>;
  const callId = call.call_id as string;
  // A converted agent sends `event`; a natively authored follow-up does not, so
  // derive it: an analysis means analysis.ready, otherwise read call.status.
  const event = (payload.event as string | undefined) ??
    (call.analysis ? "call.analyzed"
      : call.status === "no_answer" ? "call.no_answer"
      : call.status === "failed" ? "call.failed"
      : `status:${call.status}`);

  console.log(`Received event: ${event}, call_id: ${callId}`);

  switch (event) {
    case "call.analyzed": {
      // The body's `call` carries call_direction, status, caller/callee numbers,
      // duration_seconds, disposition {id, label}, transcript once ready, and analysis
      // {summary, extracted_data} (extracted_data if the agent collects fields).
      // For the full call record (lead object, metadata, cost): GET /calls/:id.
      const callData = await fetchYapprCall(callId);
      if (!callData) {
        console.error(`Could not fetch call ${callId} from Yappr`);
        return new Response(JSON.stringify({ ok: false, error: "call fetch failed" }), { status: 200 });
      }
      // Access extracted values: call.analysis?.extracted_data?.customerName, etc.
      await handleCallCompleted(callData, supabase);
      break;
    }

    case "call.no_answer":
      await handleNoAnswer(payload, supabase);
      break;

    case "call.failed": {
      console.error(`Call failed: ${callId}`);
      // Update queue (by the call_queue_id dispatch-calls put in the call's metadata)
      const queueId = (call.call_metadata as Record<string, unknown> | undefined)?.call_queue_id as string | undefined;
      await supabase
        .from("call_queue")
        .update({ status: "failed", disposition: "Failed", yappr_call_id: callId ?? null })
        .eq(queueId ? "id" : "yappr_call_id", queueId ?? callId);
      break;
    }

    default:
      console.log(`Unhandled event: ${event}`);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
