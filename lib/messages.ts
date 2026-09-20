import type { Booking } from "@/app/generated/prisma/client";
import { formatDateLong } from "@/lib/slots";

/**
 * Fixed bilingual templates — deliberately NOT a translation API
 * (plan/07-notifications.md). The message has exactly five fields and never
 * varies in structure, so a template gives a correct, free, dependency-free
 * translation with no per-message cost and no extra failure mode.
 *
 * Only the LABELS are Kannada. The VALUES — teacher name, class/subject and
 * the free-text purpose — are passed through exactly as the teacher typed
 * them, in whatever script they used. That is the whole point of the no-API
 * decision, not an oversight: translating a free-text field nobody proofreads
 * is what we chose to avoid. If `purpose` turns out to matter to the Kannada
 * recipient, make it a dropdown of pre-translated choices rather than quietly
 * adding an API.
 *
 * ⚠️ The Kannada wording below has NOT been reviewed by a native speaker. It
 * must be checked by someone who reads Kannada before go-live — ideally the
 * recipient. "ಅವಧಿ" for a school period in particular may be less natural than
 * the everyday transliteration "ಪೀರಿಯಡ್"; ask which they would rather read.
 * Ask about the date order too — see `formatDateKannada` below.
 */

const ENGLISH_LABELS = {
  title: "New Lab Booking",
  date: "Date",
  period: "Period",
  teacher: "Teacher",
  classSubject: "Class/Subject",
  purpose: "Purpose",
} as const;

export const KANNADA_LABELS = {
  title: "ಹೊಸ ಪ್ರಯೋಗಾಲಯ ಬುಕಿಂಗ್",
  date: "ದಿನಾಂಕ",
  period: "ಅವಧಿ",
  teacher: "ಶಿಕ್ಷಕರು",
  classSubject: "ತರಗತಿ/ವಿಷಯ",
  purpose: "ಉದ್ದೇಶ",
} as const;

/** "ಸೋಮವಾರ, ಸೆಪ್ಟೆಂಬರ್ 14, 2026" — Kannada weekday and month names.
 *  `timeZone: "UTC"` because dates are stored as UTC midnight (Step 2).
 *  Note the order: ICU puts the month before the day for kn-IN, unlike the
 *  English line above it in the message. That is ICU's locale data, not a bug
 *  here — but it is one more thing to put to the native speaker in E4. */
export function formatDateKannada(date: Date): string {
  return new Intl.DateTimeFormat("kn-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

type Row = [label: string, value: string];

/**
 * Latin-script labels are padded into a column, which is how the plan's
 * sample message reads. Kannada labels are not padded: the glyphs are
 * proportional and padding by character count would misalign them anyway.
 */
function render(title: string, rows: Row[], pad: boolean): string {
  const width = pad ? Math.max(...rows.map(([label]) => label.length)) + 1 : 0;
  const lines = rows.map(
    ([label, value]) => `${`${label}:`.padEnd(width)} ${value}`.trimEnd(),
  );
  return [title, "", ...lines].join("\n");
}

function rows(
  labels: typeof ENGLISH_LABELS | typeof KANNADA_LABELS,
  booking: Booking,
  date: string,
): Row[] {
  const list: Row[] = [
    [labels.date, date],
    // Latin digits in both languages: Kannada numerals are correct but the
    // recipient cross-references a timetable written in Latin digits.
    [labels.period, String(booking.period)],
    [labels.teacher, booking.teacherName],
    [labels.classSubject, booking.classSubject],
  ];
  // `purpose` is optional — an empty label with no value is just noise.
  if (booking.purpose) list.push([labels.purpose, booking.purpose]);
  return list;
}

export function englishMessage(booking: Booking): string {
  return render(
    ENGLISH_LABELS.title,
    rows(ENGLISH_LABELS, booking, formatDateLong(booking.date)),
    true,
  );
}

export function kannadaMessage(booking: Booking): string {
  return render(
    KANNADA_LABELS.title,
    rows(KANNADA_LABELS, booking, formatDateKannada(booking.date)),
    false,
  );
}

/**
 * One WhatsApp message, English first then Kannada — not two messages. Two
 * arrive separately, can be read out of order, and cost double. English leads
 * so the message matches what the email recipients see, which matters when
 * all three are discussing the same booking.
 */
export function bilingualMessage(booking: Booking): string {
  return `${englishMessage(booking)}\n\n${kannadaMessage(booking)}`;
}

export function emailSubject(booking: Booking): string {
  // Date and period in the subject so recipients can triage from the
  // notification preview without opening anything.
  return `Lab booked: ${formatDateLong(booking.date)}, Period ${booking.period}`;
}

// ---------------------------------------------------------------------------
// Production template path (plan/08-external-services.md §2)
//
// Everything above builds one ready-made string, which is what the Twilio
// sandbox accepts. A production WhatsApp sender does not: free-form text is
// only permitted inside the 24-hour window after the recipient last messaged
// you, and a booking notification is by definition unprompted. Outside that
// window the message must be a template Meta has approved in advance, sent as
// a content SID plus its variables rather than as a body.
//
// So the same five fields are rendered twice, by two different mechanisms, and
// the two must not drift. The template body below is generated from the very
// same label objects as the free-form message, so a label edited in one place
// cannot silently disagree with the other. (Re-submitting to Meta after such
// an edit is still manual — an approved template is immutable.)
// ---------------------------------------------------------------------------

/** Field order, shared by the template body and its variables. */
const TEMPLATE_ORDER = [
  "date",
  "period",
  "teacher",
  "classSubject",
  "purpose",
] as const;

/** How many placeholders one language block uses. */
const HALF = TEMPLATE_ORDER.length;

function templateHalf(
  labels: typeof ENGLISH_LABELS | typeof KANNADA_LABELS,
  offset: number,
): string {
  // Deliberately unpadded, unlike `englishMessage`: WhatsApp rejects a
  // parameter containing four or more consecutive spaces, and a column laid
  // out around placeholder names would not line up around the values anyway.
  const lines = TEMPLATE_ORDER.map(
    (field, index) => `${labels[field]}: {{${offset + index + 1}}}`,
  );
  return [labels.title, "", ...lines].join("\n");
}

/**
 * The exact body to register with Meta — copy this verbatim into the template
 * submission. English block, blank line, Kannada block, matching
 * `bilingualMessage` line for line.
 *
 * The two halves use ten *distinct* placeholders even though five of the
 * values repeat (the period, the teacher and so on are the same in both
 * languages). WhatsApp requires placeholders to be numbered from 1 with no
 * gaps and no reuse, so `{{2}}` cannot appear twice; `templateVariables`
 * simply sends each repeated value under both of its numbers.
 *
 * One template carries both languages rather than using WhatsApp's own
 * per-language template variants: the recipient gets a single message with
 * both halves, which is the whole point of the bilingual decision in
 * plan/07-notifications.md. Getting the Kannada reviewed matters more here
 * than anywhere else — an approved template cannot be edited, only replaced
 * and re-approved.
 */
export const WHATSAPP_TEMPLATE_BODY = [
  templateHalf(ENGLISH_LABELS, 0),
  templateHalf(KANNADA_LABELS, HALF),
].join("\n\n");

/** Stands in for an omitted `purpose`: WhatsApp rejects an empty parameter,
 *  and a template cannot drop the line the way `rows()` does. */
const ABSENT = "—";

/** WhatsApp's per-parameter ceiling. `purpose` is already capped at 1000 by
 *  the booking API, so this only catches the pathological. */
const MAX_PARAMETER = 1024;

/**
 * Makes one value safe to send as a template parameter. WhatsApp refuses a
 * parameter containing a newline, a tab, or four or more consecutive spaces —
 * and `purpose` is free text a teacher may well have typed across two lines.
 * Rejection would come back as an opaque Twilio error at send time, long after
 * the booking was committed, so the whitespace is flattened here instead.
 */
function parameter(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return ABSENT;
  return flat.length > MAX_PARAMETER
    ? `${flat.slice(0, MAX_PARAMETER - 1)}…`
    : flat;
}

/**
 * The `contentVariables` payload for `WHATSAPP_TEMPLATE_BODY` — keys "1"
 * through "10", as Twilio's Content API expects them (JSON-stringified by the
 * caller).
 *
 * Dates differ between the halves (each locale formats its own); the other
 * four values are sent twice, under their English and their Kannada number.
 */
export function templateVariables(booking: Booking): Record<string, string> {
  const shared = [
    String(booking.period),
    parameter(booking.teacherName),
    parameter(booking.classSubject),
    parameter(booking.purpose ?? ""),
  ];
  const values = [
    parameter(formatDateLong(booking.date)),
    ...shared,
    parameter(formatDateKannada(booking.date)),
    ...shared,
  ];
  return Object.fromEntries(values.map((value, i) => [String(i + 1), value]));
}
