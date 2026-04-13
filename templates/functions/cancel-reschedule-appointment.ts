// cancel-reschedule-appointment.ts
// Handles both cancelAppointment and rescheduleAppointment tool calls.
// Register as TWO separate tools in Yappr pointing to this same endpoint,
// but with different tool names and extraction parameters.
//
// cancelAppointment extraction params: appointmentId? (optional), reason?
// rescheduleAppointment extraction params: appointmentId? (optional), newDate, newTime
//
// The function distinguishes by checking which params are present.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   GREENAPI_INSTANCE, GREENAPI_TOKEN (optional: notify caller)

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, message: "Invalid request" }), { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Determine action from payload
  const newDate = (payload.newDate ?? payload.new_date) as string | undefined;
  const newTime = (payload.newTime ?? payload.new_time) as string | undefined;
  const isReschedule = !!(newDate && newTime);

  // Find appointment — by ID or by caller phone
  const appointmentId = (payload.appointmentId ?? payload.appointment_id) as string | undefined;
  const callerPhone = payload.callerPhone as string | undefined;

  let appointment: Record<string, unknown> | null = null;

  if (appointmentId) {
    const { data } = await supabase.from("appointments").select("*").eq("id", appointmentId).maybeSingle();
    appointment = data;
  } else if (callerPhone) {
    // Find most recent upcoming appointment for this phone
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("phone_number", callerPhone)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    appointment = data;
  }

  if (!appointment) {
    return new Response(JSON.stringify({
      success: false,
      message: isReschedule
        ? "I couldn't find an existing appointment to reschedule. Would you like to book a new one?"
        : "I couldn't find an appointment to cancel. Do you have your booking reference?",
    }), { status: 200 });
  }

  if (isReschedule) {
    // Reschedule
    const newScheduledAt = new Date(`${newDate}T${newTime}:00+03:00`).toISOString();
    await supabase
      .from("appointments")
      .update({ scheduled_at: newScheduledAt, status: "scheduled" })
      .eq("id", appointment.id as string);

    return new Response(JSON.stringify({
      success: true,
      message: `Your appointment has been rescheduled to ${newDate} at ${newTime}. You'll receive an updated confirmation.`,
    }), { status: 200 });

  } else {
    // Cancel
    const reason = (payload.reason ?? "caller request") as string;
    await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointment.id as string);

    return new Response(JSON.stringify({
      success: true,
      message: "Your appointment has been cancelled. Is there anything else I can help you with?",
    }), { status: 200 });
  }
});
