/**
 * Step 8 credential smoke test — plan/08-external-services.md.
 *
 * Sends one throwaway message down each channel to prove the Gmail app
 * password and the Twilio credentials actually work. It deliberately does NOT
 * import lib/messages.ts: that is Step 7's template, tested by making a real
 * booking. This script answers one narrower question — are the credentials in
 * .env live? — so it stays a plain Node script with no build step and no
 * database, runnable before any booking exists.
 *
 *   node scripts/check-services.mjs            # both channels
 *   node scripts/check-services.mjs --email
 *   node scripts/check-services.mjs --whatsapp
 *   node scripts/check-services.mjs --dry      # check env only, send nothing
 */
import "dotenv/config";

const args = new Set(process.argv.slice(2));
const dry = args.has("--dry");
const only = args.has("--email") || args.has("--whatsapp");
const doEmail = !only || args.has("--email");
const doWhatsApp = !only || args.has("--whatsapp");

const EMAIL_VARS = ["GMAIL_USER", "GMAIL_APP_PASSWORD", "RECIPIENT_EMAILS"];
const WHATSAPP_VARS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM",
  "TWILIO_WHATSAPP_TO",
];

const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

function missing(names) {
  return names.filter((name) => !process.env[name]?.trim());
}

function fail(message, hints = []) {
  console.error(`  ✗ ${message}`);
  for (const hint of hints) console.error(`    → ${hint}`);
  return false;
}

async function checkEmail() {
  console.log("\nEmail (Gmail SMTP)");
  const gaps = missing(EMAIL_VARS);
  if (gaps.length) {
    return fail(`not configured: ${gaps.join(", ")}`, [
      "GMAIL_APP_PASSWORD is a 16-char App Password (needs 2FA), not the account password.",
      "See plan/08-external-services.md §1.",
    ]);
  }

  const recipients = process.env.RECIPIENT_EMAILS.split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  console.log(`  from ${process.env.GMAIL_USER}`);
  console.log(`  to   ${recipients.join(", ")} (${recipients.length})`);
  if (recipients.length < 2) {
    console.warn("  ! the plan expects 2 recipients (HOD and principal)");
  }
  if (dry) return true;

  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    const info = await transport.sendMail({
      from: process.env.GMAIL_USER,
      to: recipients.join(","),
      subject: "Lab Booking System — test email",
      text: [
        "This is a setup test from the Lab Booking System. No lab has been booked.",
        "",
        `Sent: ${stamp}`,
        "",
        "If you received this, the email notifications are configured correctly.",
      ].join("\n"),
    });
    console.log(`  ✓ accepted: ${info.accepted.join(", ") || "(none)"}`);
    if (info.rejected?.length) {
      console.warn(`  ! rejected: ${info.rejected.join(", ")}`);
    }
    console.log("    Confirm it actually landed in BOTH inboxes — check spam.");
    return info.rejected?.length === 0;
  } catch (error) {
    const hints = [];
    if (error?.code === "EAUTH") {
      hints.push(
        "Gmail rejected the login. Re-generate the App Password and paste it with no spaces.",
        "Plain account passwords never work here; 2-Step Verification must be on.",
      );
    }
    return fail(String(error?.message ?? error), hints);
  }
}

async function checkWhatsApp() {
  console.log("\nWhatsApp (Twilio)");
  const gaps = missing(WHATSAPP_VARS);
  if (gaps.length) {
    return fail(`not configured: ${gaps.join(", ")}`, [
      "See plan/08-external-services.md §2.",
    ]);
  }

  const from = process.env.TWILIO_WHATSAPP_FROM;
  const to = process.env.TWILIO_WHATSAPP_TO;
  console.log(`  from ${from}`);
  console.log(`  to   ${to}`);
  for (const [name, value] of [
    ["TWILIO_WHATSAPP_FROM", from],
    ["TWILIO_WHATSAPP_TO", to],
  ]) {
    // lib/notify.ts passes these straight through, so a missing prefix fails
    // at Twilio with an opaque error rather than anywhere near the mistake.
    if (!/^whatsapp:\+\d{6,}$/.test(value)) {
      return fail(`${name} must look like "whatsapp:+14155238886"`);
    }
  }
  if (dry) return true;

  const { default: twilio } = await import("twilio");
  try {
    const message = await twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    ).messages.create({
      from,
      to,
      // Both scripts, because a phone that renders English fine can still show
      // Kannada as boxes — better to find that out now than on a real booking.
      body: [
        "Lab Booking System — test message. No lab has been booked.",
        "",
        "ಪ್ರಯೋಗಾಲಯ ಬುಕಿಂಗ್ ವ್ಯವಸ್ಥೆ — ಪರೀಕ್ಷಾ ಸಂದೇಶ.",
        "",
        `Sent: ${stamp}`,
      ].join("\n"),
    });
    console.log(`  ✓ queued: ${message.sid} (status: ${message.status})`);
    console.log("    'queued' only means Twilio accepted it. Confirm the phone");
    console.log("    received it, and that the Kannada line is readable.");
    return true;
  } catch (error) {
    const hints = [];
    switch (error?.code) {
      case 20003:
        hints.push("Auth failed — check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN.");
        break;
      case 63007:
        hints.push(`${from} is not a valid WhatsApp sender on this account.`);
        break;
      case 63015:
      case 63016:
        hints.push(
          "Outside the 24-hour window, so free-form text is refused.",
          "Expected on a production sender: notifications must go out as an",
          "approved template (contentSid + contentVariables). See §2 of the plan.",
        );
        break;
      case 21608:
      case 63024:
        hints.push(
          "The recipient has not joined the sandbox, or the join lapsed.",
          "Joins expire after 72 hours of inactivity — re-send the 'join <code>' message.",
        );
        break;
      default:
        break;
    }
    return fail(`[${error?.code ?? "?"}] ${error?.message ?? error}`, hints);
  }
}

const results = [];
if (doEmail) results.push(await checkEmail());
if (doWhatsApp) results.push(await checkWhatsApp());

const ok = results.every(Boolean);
console.log(
  `\n${ok ? "✓" : "✗"} ${dry ? "Configuration check" : "Smoke test"} ${ok ? "passed" : "failed"}.`,
);
process.exit(ok ? 0 : 1);
