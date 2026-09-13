# Step 7 — Notifications (Email + Bilingual WhatsApp)

**Status:** ✅ Code done — untested against live services until [Step 8](08-external-services.md) provides credentials; Kannada wording still needs a native-speaker review

## Goal

Every confirmed booking reaches three people immediately: **2 by email**, **1 by WhatsApp in English *and* Kannada** — the mobile recipient isn't comfortable in English, so an English-only message means they effectively don't get told.

## Files

| File | Purpose |
|---|---|
| `lib/messages.ts` | Message templates — English and Kannada |
| `lib/notify.ts` | `notifyBooking()` — sends email + WhatsApp, never throws |

## Message content

```
New Lab Booking

Date:          Monday, 14 September 2026
Period:        3
Teacher:       Mrs. Rao
Class/Subject: 9B Physics
Purpose:       Practical exam preparation
```

## The Kannada half

Decision from planning: a **fixed Kannada template**, not a translation API. The message has exactly five fields and never varies in structure, so a template gives a correct, free, dependency-free translation — where an API would add a per-message cost, a failure mode, and unpredictable phrasing of a message nobody proofreads.

### What this means in practice

Only the **labels** are Kannada. The **values** — teacher name, class/subject, free-text purpose — are passed through exactly as the teacher typed them, in whatever script they used. Translating a teacher's free-text `purpose` is precisely what the no-API decision rules out.

This is the right tradeoff — the recipient needs to know *who booked what, when*, and names/subjects are recognisable to them regardless of script. But it should be said plainly rather than discovered later.

If the `purpose` field turns out to matter to this recipient, the options are (a) make purpose a dropdown of fixed choices that *can* be pre-translated, or (b) accept the API. Don't quietly add a translation API to a field nobody proofreads.

### Template

```ts
export const KANNADA_LABELS = {
  title: "ಹೊಸ ಪ್ರಯೋಗಾಲಯ ಬುಕಿಂಗ್",
  date: "ದಿನಾಂಕ",
  period: "ಅವಧಿ",
  teacher: "ಶಿಕ್ಷಕರು",
  classSubject: "ತರಗತಿ/ವಿಷಯ",
  purpose: "ಉದ್ದೇಶ",
} as const;
```

> ⚠️ **This Kannada wording was drafted without a native-speaker review.** It must be checked by someone who reads Kannada before go-live — ideally by the recipient themselves. The terms are standard, but "ಅವಧಿ" for a school period in particular may be less natural than the everyday transliteration "ಪೀರಿಯಡ್". Ask which they'd rather read.

### Dates in Kannada

Format the date twice, once per locale, rather than repeating the English string:

```ts
new Intl.DateTimeFormat("kn-IN", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
}).format(date);
```

This yields Kannada weekday and month names. Keep `timeZone: "UTC"` — dates are stored as UTC midnight ([Step 2](02-database-and-prisma.md)).

Keep **period numbers as Latin digits** (`3`, not `೩`). Kannada numerals are correct but less instantly scannable on a phone, and the recipient is cross-referencing against a timetable written in Latin digits.

### One message, both languages

Send a **single WhatsApp message** — English block, blank line, Kannada block — not two messages. Two arrive separately, can be read out of order, and double the cost. One message means the recipient always has both, and can read whichever they prefer first.

Put **English first**: it keeps the message identical in structure to what the email recipients see, which matters when three people are discussing the same booking.

## `lib/notify.ts`

```ts
export type NotifyResult = {
  email: { ok: boolean; error?: string };
  whatsapp: { ok: boolean; error?: string };
};

export async function notifyBooking(booking: Booking): Promise<NotifyResult> {
  const [email, whatsapp] = await Promise.all([
    sendEmail(booking).then(
      () => ({ ok: true }),
      (e) => { console.error("Booking email failed", e); return { ok: false, error: String(e) }; },
    ),
    sendWhatsApp(booking).then(
      () => ({ ok: true }),
      (e) => { console.error("Booking WhatsApp failed", e); return { ok: false, error: String(e) }; },
    ),
  ]);
  return { email, whatsapp };
}
```

`Promise.all` over two independently-caught promises: the two channels are sent **concurrently** (halving the latency the teacher waits through) and a failure in one cannot prevent the other. A plain `Promise.all` over throwing promises would let a Gmail outage suppress the WhatsApp message.

This function never rejects — [Step 6](06-booking-api.md) depends on that.

### Email

```ts
import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

await transport.sendMail({
  from: process.env.GMAIL_USER,
  to: process.env.RECIPIENT_EMAILS,   // "a@x.com,b@y.com" — nodemailer accepts a comma-separated string
  subject: `Lab booked: ${formatDateLong(booking.date)}, Period ${booking.period}`,
  text: englishMessage(booking),
});
```

Putting date and period **in the subject line** means the recipients can triage from the notification preview without opening anything.

### WhatsApp

```ts
import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

await client.messages.create({
  from: process.env.TWILIO_WHATSAPP_FROM,  // "whatsapp:+14155238886"
  to: process.env.TWILIO_WHATSAPP_TO,      // "whatsapp:+91XXXXXXXXXX"
  body: `${englishMessage(booking)}\n\n${kannadaMessage(booking)}`,
});
```

Both numbers need the literal **`whatsapp:`** prefix and E.164 format (`+91…`). Store the prefix in the env var so it can't be forgotten in code.

## Env vars introduced

```
GMAIL_USER=
GMAIL_APP_PASSWORD=
RECIPIENT_EMAILS=          # comma-separated, the 2 addresses
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=      # whatsapp:+1...
TWILIO_WHATSAPP_TO=        # whatsapp:+91...
```

## Notes / gotchas

- **Kannada is non-Latin, so the WhatsApp message is billed as UCS-2.** WhatsApp (unlike SMS) has a ~4096-char body limit, so a bilingual message is nowhere near it — but this is exactly why WhatsApp was chosen over SMS, where Kannada would fragment a message into many 70-character segments.
- Twilio's WhatsApp **sandbox** only delivers to numbers that have joined it, and its 24-hour session window expires — see [Step 8](08-external-services.md). Sandbox failures in testing are usually this, not the code.
- Verify the Kannada renders correctly **on the recipient's actual phone**, not just in a terminal. Old Android builds with missing Kannada fonts show tofu boxes.
- Gmail SMTP has a ~500 messages/day limit. A school lab will never approach it.

## Acceptance criteria

- [ ] A booking sends one email to both addresses, with date and period in the subject — *blocked on Step 8 credentials*
- [ ] A booking sends exactly one WhatsApp message containing both English and Kannada blocks — *blocked on Step 8 credentials*
- [ ] Kannada text renders correctly on the recipient's phone (confirmed by the recipient)
- [ ] Kannada wording reviewed by a Kannada reader
- [x] With Gmail credentials broken, the WhatsApp message still arrives (and vice versa) — each channel is caught independently; verified both fail separately, neither suppressing the other
- [x] `notifyBooking` never throws — verified with credentials absent and with both sets invalid (real 535 from Gmail, real 20003 from Twilio); both returned `{ok: false}` per channel
