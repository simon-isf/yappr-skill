// book-appointment.ts
// Yappr tool handler: books appointment and fires secondary actions.
// Called by the voice agent during a call when it decides to book.
//
// This is a BUNDLED handler — booking + customer notification + team notification
// + CRM update all happen here. The agent makes ONE tool call.
//
// Payload received from Yappr agent:
//   Standard metadata (if include_standard_metadata: true):
//     call_id, agent_id, duration_seconds
//   Extraction parameters (defined in tool config):
//     callerName, preferredDate, preferredTime, notes (optional)
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Optional env vars (enable features):
//   CALENDAR_TYPE        — "google" | "supabase" | "calendly" (default: "supabase")
//   GOOGLE_CALENDAR_ID   — calendar ID (if CALENDAR_TYPE=google)
//   GOOGLE_SA_KEY_JSON   — service account JSON (if CALENDAR_TYPE=google)
//   GREENAPI_INSTANCE    — send WhatsApp to caller (if set)
//   GREENAPI_TOKEN       — Green API token
//   NOTIFY_PHONE         — team phone to notify on booking
//   RESEND_API_KEY       — send email notification (if set)
//   NOTIFY_EMAIL         — team email for notification

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const calendarType = Deno.env.get("CALENDAR_TYPE") ?? "supabase";

// ── CALENDAR ADAPTER ─────────────────────────────────────────────────────────
// Swap implementations by changing CALENDAR_TYPE env var.

async function bookInCalendar(details: {
  name: string;
  phone: string;
  date: string;   // "2026-04-15"
  time: string;   // "15:00" or "3pm"
  notes?: string;
}): Promise<{ success: boolean; eventId?: string; confirmationMessage: string }> {

  if (calendarType === "supabase") {
    // Store directly in Supabase appointments table
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const scheduledAt = new Date(`${details.date}T${normalizeTime(details.time)}:00+03:00`); // Israel timezone
    const { data } = await supabase.from("appointments").insert({
      phone_number: details.phone,
      name: details.name,
      scheduled_at: scheduledAt.toISOString(),
      notes: details.notes ?? null,
      status: "scheduled",
    }).select("id").single();
    return { success: true, eventId: data?.id, confirmationMessage: `Booked for ${formatDate(details.date)} at ${details.time}` };
  }

  if (calendarType === "google") {
    // Google Calendar — see integrations/google-calendar.md
    // Requires GOOGLE_CALENDAR_ID and GOOGLE_SA_KEY_JSON env vars
    // TODO: implement Google Calendar booking
    // const token = await getGoogleAccessToken();
    // const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, { ... });
    return { success: false, confirmationMessage: "Google Calendar not configured" };
  }

  if (calendarType === "calendly") {
    // Calendly doesn't have a direct create booking API
    // Use scheduling link pattern — see integrations/calendly.md
    return { success: false, confirmationMessage: "Calendly does not support direct booking — use scheduling links" };
  }

  return { success: false, confirmationMessage: "No calendar configured" };
}

// ── NOTIFICATION HELPERS ──────────────────────────────────────────────────────

async function sendWhatsAppNotification(phone: string, message: string) {
  const instance = Deno.env.get("GREENAPI_INSTANCE");
  const token = Deno.env.get("GREENAPI_TOKEN");
  if (!instance || !token) return;

  // Normalize to Green API format: +9725XXXXXXXX → 9725XXXXXXXX@c.us
  const chatId = phone.replace("+", "") + "@c.us";
  await fetch(`https://api.green-api.com/waInstance${instance}/sendMessage/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  }).catch(() => {}); // fire-and-forget
}

async function sendEmailNotification(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "noreply@yourdomain.com", to, subject, html }),
  }).catch(() => {}); // fire-and-forget
}

// ── UTILS ──────────────────────────────────────────────────────────────────────

function normalizeTime(time: string): string {
  // "3pm" → "15:00", "3:30pm" → "15:30", "15:00" → "15:00"
  const pm = time.toLowerCase().includes("pm");
  const am = time.toLowerCase().includes("am");
  const digits = time.replace(/[^\d:]/g, "");
  const [h, m = "00"] = digits.split(":");
  let hour = parseInt(h);
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${m.padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
}

// ── MAIN HANDLER ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, message: "Invalid request" }), { status: 400 });
  }

  // Standard metadata from Yappr
  const callId = payload.call_id as string | undefined;
  const agentId = payload.agent_id as string | undefined;

  // Extraction parameters (defined in tool config)
  const callerName = (payload.callerName ?? payload.caller_name ?? "the caller") as string;
  const preferredDate = (payload.preferredDate ?? payload.preferred_date) as string | undefined;
  const preferredTime = (payload.preferredTime ?? payload.preferred_time) as string | undefined;
  const notes = (payload.notes ?? "") as string;

  // Get caller phone from Supabase (via call_id if available)
  let callerPhone = payload.callerPhone as string | undefined;
  if (!callerPhone && callId) {
    // Could fetch from Yappr API here but adds latency — better to pass via static param or metadata
    callerPhone = payload.to_number as string | undefined;
  }

  if (!preferredDate || !preferredTime) {
    return new Response(JSON.stringify({
      success: false,
      message: "I need a date and time to book the appointment. When would you like to come in?",
    }), { status: 200 });
  }

  // Book the appointment
  const result = await bookInCalendar({
    name: callerName,
    phone: callerPhone ?? "unknown",
    date: preferredDate,
    time: preferredTime,
    notes,
  });

  if (result.success) {
    // Secondary actions (fire-and-forget — don't block agent response)
    const confirmMsg = `Hi ${callerName}, your appointment is confirmed for ${formatDate(preferredDate)} at ${preferredTime}. We look forward to seeing you!`;

    if (callerPhone) {
      sendWhatsAppNotification(callerPhone, confirmMsg);
    }

    const notifyEmail = Deno.env.get("NOTIFY_EMAIL");
    if (notifyEmail) {
      sendEmailNotification(
        notifyEmail,
        `New Appointment: ${callerName}`,
        `<p><b>Name:</b> ${callerName}<br><b>Phone:</b> ${callerPhone}<br><b>Date:</b> ${preferredDate}<br><b>Time:</b> ${preferredTime}<br><b>Notes:</b> ${notes}</p>`
      );
    }

    const notifyPhone = Deno.env.get("NOTIFY_PHONE");
    if (notifyPhone) {
      sendWhatsAppNotification(notifyPhone, `New booking: ${callerName} on ${formatDate(preferredDate)} at ${preferredTime}`);
    }
  }

  // Return to agent — agent reads this message aloud
  return new Response(JSON.stringify({
    success: result.success,
    message: result.success
      ? result.confirmationMessage
      : "I'm sorry, I wasn't able to book that time. Let me try another slot — do you have any other availability?",
    event_id: result.eventId ?? null,
  }), { status: 200 });
});
