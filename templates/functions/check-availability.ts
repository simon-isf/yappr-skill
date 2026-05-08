// check-availability.ts
// Yappr tool handler: checks real-time calendar availability.
// Used as a safeguard even when slots are pre-fetched at dispatch time.
// The pre-fetch reduces how often this is called, but it's always available.
//
// Required env vars:
//   CALENDAR_TYPE        — "google" | "supabase" (default: "supabase")
//   GOOGLE_CALENDAR_ID, GOOGLE_SA_KEY_JSON (if google)
//
// Payload from agent:
//   requestedDate  — "2026-04-15" or "next Tuesday"
//   requestedTime  — optional: "3pm" (if asking about specific time)

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const calendarType = Deno.env.get("CALENDAR_TYPE") ?? "supabase";

async function getAvailableSlots(date: string): Promise<string[]> {
  if (calendarType === "supabase") {
    // Check appointments table for the requested date
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const startOfDay = new Date(`${date}T00:00:00+03:00`).toISOString();
    const endOfDay = new Date(`${date}T23:59:59+03:00`).toISOString();

    const { data: booked } = await supabase
      .from("appointments")
      .select("scheduled_at")
      .gte("scheduled_at", startOfDay)
      .lte("scheduled_at", endOfDay)
      .eq("status", "scheduled");

    // Your business hours (customize)
    const businessHours = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];
    const bookedTimes = (booked ?? []).map(r => new Date(r.scheduled_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }));
    return businessHours.filter(t => !bookedTimes.includes(t));
  }

  if (calendarType === "google") {
    // TODO: implement Google Calendar FreeBusy check
    // See integrations/google-calendar.md
    return [];
  }

  return [];
}

Deno.serve(async (req: Request) => {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, message: "Invalid request" }), { status: 400 });
  }

  const requestedDate = (payload.requestedDate ?? payload.requested_date) as string | undefined;

  if (!requestedDate) {
    return new Response(JSON.stringify({
      success: false,
      message: "What date are you looking for? I can check availability for a specific day.",
    }), { status: 200 });
  }

  const slots = await getAvailableSlots(requestedDate);

  if (slots.length === 0) {
    return new Response(JSON.stringify({
      success: true,
      availableSlots: [],
      message: `Unfortunately we're fully booked on ${requestedDate}. Would another day work for you?`,
    }), { status: 200 });
  }

  const slotList = slots.slice(0, 5).join(", "); // Limit to 5 slots for brevity
  return new Response(JSON.stringify({
    success: true,
    availableSlots: slots,
    message: `On ${requestedDate} we have availability at ${slotList}. Which works best for you?`,
  }), { status: 200 });
});
