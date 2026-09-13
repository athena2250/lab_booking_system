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

/** "ಸೋಮವಾರ, 14 ಸೆಪ್ಟೆಂಬರ್ 2026" — Kannada weekday and month names.
 *  `timeZone: "UTC"` because dates are stored as UTC midnight (Step 2). */
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
