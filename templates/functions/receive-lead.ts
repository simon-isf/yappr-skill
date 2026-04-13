// receive-lead.ts
// Receives a lead from any external platform and queues it for calling.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Default routing env vars (used if not in payload):
//   DEFAULT_AGENT_ID     — Yappr agent UUID
//   DEFAULT_FROM_NUMBER  — E.164 Telnyx number
//   DEFAULT_MAX_ATTEMPTS — number of retry attempts (default: 5)
//
// Payload (flexible — any of these work):
//   { phone_number, name?, email?, agent_id?, from_number?, campaign?, lead_data? }
//
// Multi-agent routing:
//   Pass agent_id + from_number in the payload to route to a specific agent.
//   Or use URL query params: ?agent_id=xxx&from_number=+972...
//   Falls back to env var defaults if not provided.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const defaultAgentId = Deno.env.get("DEFAULT_AGENT_ID") ?? "";
const defaultFromNumber = Deno.env.get("DEFAULT_FROM_NUMBER") ?? "";
const defaultMaxAttempts = parseInt(Deno.env.get("DEFAULT_MAX_ATTEMPTS") ?? "5");

// Normalize Israeli phone numbers to E.164
// 05X-XXXXXXX, 05XXXXXXXX, +9725XXXXXXXX → +9725XXXXXXXX
function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return `+${digits}`;
  if (digits.startsWith("05") && digits.length === 10) return `+972${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `+972${digits}`;
  // Return as-is if already E.164 or unrecognized format
  return phone.startsWith("+") ? phone : `+${digits}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  }

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  // Extract phone number (check common field names)
  const rawPhone = (
    body.phone_number ?? body.phone ?? body.Phone ?? body.mobile ?? body.Mobile
  ) as string | undefined;

  if (!rawPhone) {
    return new Response(JSON.stringify({ error: "phone_number is required" }), { status: 400 });
  }

  const phone = normalizeIsraeliPhone(String(rawPhone));

  // Routing — payload > URL param > env var default
  const agentId = (body.agent_id ?? url.searchParams.get("agent_id") ?? defaultAgentId) as string;
  const fromNumber = (body.from_number ?? url.searchParams.get("from_number") ?? defaultFromNumber) as string;
  const campaign = (body.campaign ?? url.searchParams.get("campaign") ?? null) as string | null;
  const maxAttempts = parseInt(String(body.max_attempts ?? defaultMaxAttempts));

  if (!agentId || !fromNumber) {
    return new Response(JSON.stringify({ error: "agent_id and from_number are required (in payload, query params, or env vars)" }), { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Check do-not-call list
  const { data: dncEntry } = await supabase
    .from("do_not_call")
    .select("id")
    .eq("phone_number", phone)
    .maybeSingle();

  if (dncEntry) {
    return new Response(JSON.stringify({ skipped: true, reason: "do_not_call" }), { status: 200 });
  }

  // Deduplication: skip if already pending or dispatched for this phone + agent
  const { data: existing } = await supabase
    .from("call_queue")
    .select("id, status")
    .eq("phone_number", phone)
    .eq("agent_id", agentId)
    .in("status", ["pending", "dispatched"])
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ duplicate: true, id: existing.id, status: existing.status }), { status: 200 });
  }

  // Build lead_data from remaining payload fields
  const { phone_number, phone: _p, agent_id: _a, from_number: _f, campaign: _c, max_attempts: _m, name, email, ...rest } = body;

  const { data: row, error } = await supabase
    .from("call_queue")
    .insert({
      phone_number: phone,
      lead_name: (name as string) ?? null,
      lead_email: (email as string) ?? null,
      lead_data: rest,
      agent_id: agentId,
      from_number: fromNumber,
      campaign: campaign,
      max_attempts: maxAttempts,
      status: "pending",
      next_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ queued: true, id: row.id }), { status: 201 });
});
