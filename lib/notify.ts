import nodemailer from "nodemailer";
import twilio from "twilio";
import type {
  Booking,
  DeliveryStatus,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  bilingualMessage,
  emailSubject,
  englishMessage,
  templateVariables,
} from "@/lib/messages";

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
  const client = twilio(sid, token);

  // Which of the two shapes below goes out is decided entirely by whether a
  // content SID is configured — see plan/08-external-services.md §2.
  //
  // A production WhatsApp sender only accepts free-form text inside the
  // 24-hour window after the recipient last messaged the sender. A booking
  // notification is unprompted by definition, so in production it must be a
  // template Meta approved in advance: a content SID plus its variables. The
  // Twilio sandbox is the opposite — it takes free-form text and has no
  // approved templates at all.
  //
  // Hence no attempt to "detect" the right mode and no fallback from one to
  // the other: a fallback would turn a misconfigured template into a message
  // that silently stops arriving the moment the 24-hour window closes, which
  // is exactly the failure this path exists to remove. The environment says
  // which sender this is, and the send fails loudly onto `whatsappError` if
  // that is wrong.
  const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim();

  if (contentSid) {
    await client.messages.create({
      from,
      to,
      contentSid,
      contentVariables: JSON.stringify(templateVariables(booking)),
    });
    return;
  }

  await client.messages.create({
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

// Errors are stored so an admin can see *why* a message didn't arrive, but a
// stack trace from a library is unbounded and the useful part is at the front.
const MAX_ERROR = 500;

function truncate(error: string | undefined): string | null {
  if (!error) return null;
  return error.length > MAX_ERROR ? `${error.slice(0, MAX_ERROR)}…` : error;
}

function statusOf(result: NotifyChannelResult): DeliveryStatus {
  return result.ok ? "SENT" : "FAILED";
}

/**
 * Sends, then records what happened on the booking row.
 *
 * Like `notifyBooking`, this never rejects. The booking is already committed by
 * the time it runs, so a database hiccup while writing the *receipt* must not
 * become an error the teacher sees — it just leaves `notifiedAt` null, which
 * the admin screens read as "not recorded" rather than as a success.
 */
export async function notifyAndRecord(booking: Booking): Promise<NotifyResult> {
  const result = await notifyBooking(booking);

  try {
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        notifiedAt: new Date(),
        emailStatus: statusOf(result.email),
        emailError: truncate(result.email.error),
        whatsappStatus: statusOf(result.whatsapp),
        whatsappError: truncate(result.whatsapp.error),
      },
    });
  } catch (error) {
    console.error(`Booking ${booking.id} delivery receipt failed`, error);
  }

  return result;
}
