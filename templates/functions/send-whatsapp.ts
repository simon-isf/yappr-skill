// send-whatsapp.ts
// Send WhatsApp messages via Green API.
// Primary post-call channel for the Israeli market.
//
// Required env vars:
//   GREENAPI_INSTANCE    — instance ID from console.green-api.com
//   GREENAPI_TOKEN       — API token from console.green-api.com
//
// Payload:
//   { phone_number, message, template? }
//   template options: "appointment_confirmation" | "follow_up" | "no_answer" | "custom"

const GREENAPI_INSTANCE = Deno.env.get("GREENAPI_INSTANCE")!;
const GREENAPI_TOKEN = Deno.env.get("GREENAPI_TOKEN")!;
const GREENAPI_BASE = `https://api.green-api.com/waInstance${GREENAPI_INSTANCE}`;

// Templates (customize with your business name and tone)
const TEMPLATES = {
  appointment_confirmation: (name: string, date: string, time: string) =>
    `שלום ${name}! תורך אושר ל-${date} בשעה ${time}. נשמח לראותך! לשאלות, השב להודעה זו.`,

  follow_up: (name: string) =>
    `שלום ${name}, דיברנו לפני מעט. האם יש לך שאלות נוספות? נשמח לעזור!`,

  no_answer: (name: string) =>
    `שלום ${name}, ניסינו להתקשר אליך. נחזור בהזדמנות הקרובה.`,

  custom: (_name: string, message: string) => message,
};

function normalizeToGreenApiFormat(phone: string): string {
  // Input: +9725XXXXXXXX or 05XXXXXXXX
  // Output: 9725XXXXXXXX@c.us
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("972") ? digits : digits.startsWith("05") ? `972${digits.slice(1)}` : digits;
  return `${normalized}@c.us`;
}

Deno.serve(async (req: Request) => {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false }), { status: 400 });
  }

  const phone = payload.phone_number as string;
  const template = (payload.template as string) ?? "custom";
  const name = (payload.name as string) ?? "";
  const date = (payload.date as string) ?? "";
  const time = (payload.time as string) ?? "";
  const customMessage = (payload.message as string) ?? "";

  if (!phone) {
    return new Response(JSON.stringify({ success: false, error: "phone_number required" }), { status: 400 });
  }

  const chatId = normalizeToGreenApiFormat(phone);
  const message = template === "appointment_confirmation" ? TEMPLATES.appointment_confirmation(name, date, time)
    : template === "follow_up" ? TEMPLATES.follow_up(name)
    : template === "no_answer" ? TEMPLATES.no_answer(name)
    : TEMPLATES.custom(name, customMessage);

  const res = await fetch(`${GREENAPI_BASE}/sendMessage/${GREENAPI_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  });

  const data = await res.json();

  return new Response(JSON.stringify({
    success: res.ok,
    idMessage: data.idMessage ?? null,
  }), { status: 200 });
});
