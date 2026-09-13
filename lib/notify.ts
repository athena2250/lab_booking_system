import nodemailer from "nodemailer";
import twilio from "twilio";
import type { Booking } from "@/app/generated/prisma/client";
import { bilingualMessage, emailSubject, englishMessage } from "@/lib/messages";

export type NotifyChannelResult = { ok: boolean; error?: string };

export type NotifyResult = {
  email: NotifyChannelResult;
  whatsapp: NotifyChannelResult;
};

function requireEnv(...names: string[]): string[] {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}`);
  }
  return names.map((name) => process.env[name] as string);
}

// Both clients are built per call rather than at module load: a missing
// credential must surface as one failed channel, not as an import-time crash
// that takes down every route that transitively imports this file.

async function sendEmail(booking: Booking): Promise<void> {
  const [user, pass, to] = requireEnv(
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
    "RECIPIENT_EMAILS",
  );

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transport.sendMail({
    from: user,
    to, // "a@x.com,b@y.com" — nodemailer accepts a comma-separated string.
    subject: emailSubject(booking),
    text: englishMessage(booking),
  });
}

async function sendWhatsApp(booking: Booking): Promise<void> {
  const [sid, token, from, to] = requireEnv(
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "TWILIO_WHATSAPP_TO",
  );

  // The literal "whatsapp:" prefix lives in the env var so it cannot be
  // forgotten in code; both numbers must also be E.164 ("whatsapp:+91…").
  await twilio(sid, token).messages.create({
    from,
    to,
    body: bilingualMessage(booking),
  });
}

function settle(
  channel: string,
  booking: Booking,
  send: Promise<void>,
): Promise<NotifyChannelResult> {
  return send.then(
    (): NotifyChannelResult => ({ ok: true }),
    (error: unknown): NotifyChannelResult => {
      console.error(`Booking ${booking.id} ${channel} failed`, error);
      return { ok: false, error: String(error) };
    },
  );
}

/**
 * Notifies all three recipients: two by email, one by WhatsApp in English and
 * Kannada (plan/07-notifications.md).
 *
 * `Promise.all` over two *independently caught* promises, so the channels go
 * out concurrently — halving the latency the teacher waits through — and a
 * failure in one cannot suppress the other. A plain `Promise.all` over
 * throwing promises would let a Gmail outage swallow the WhatsApp message.
 *
 * This function NEVER rejects. Step 6 depends on that: the booking is already
 * committed by the time it is called, so a notification failure must not
 * become an error the teacher sees and rebooks against.
 */
export async function notifyBooking(booking: Booking): Promise<NotifyResult> {
  const [email, whatsapp] = await Promise.all([
    settle("email", booking, sendEmail(booking)),
    settle("WhatsApp", booking, sendWhatsApp(booking)),
  ]);
  return { email, whatsapp };
}
