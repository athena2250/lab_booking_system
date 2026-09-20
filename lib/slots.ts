export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type Period = (typeof PERIODS)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-09-14" -> Date at UTC midnight. Returns null if malformed or not a real date. */
export function parseDateOnly(input: string | null | undefined): Date | null {
  if (!input || !DATE_RE.test(input)) return null;
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Rejects things like 2026-02-31, which Date would roll over to March.
  if (date.toISOString().slice(0, 10) !== input) return null;
  return date;
}

export function isValidPeriod(value: unknown): value is Period {
  return typeof value === "number" && PERIODS.includes(value as Period);
}

/** For display in notifications: "Monday, 14 September 2026" */
export function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Today in school-local time, as an input[type=date] value. `toISOString()`
 *  is UTC and would read as yesterday before 05:30 IST. */
export function todayInSchoolTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

/** "2026-09-21" -> "Monday, 21 September 2026". Falls back to the raw value
 *  for anything malformed, so a half-typed date never blanks the heading. */
export function formatDateOnlyLong(input: string): string {
  const date = parseDateOnly(input);
  return date ? formatDateLong(date) : input;
}

/** For dense lists: "21 Sep 2026". The stored date is UTC midnight, so it must
 *  be read back in UTC or it shifts a day either side of the date line. */
export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** The school's bell schedule, as minutes from midnight in SCHOOL_TZ. This is
 *  the only place period times live — change a bell here and the calendar, the
 *  booking form and the server-side past-slot check all follow.
 *  A period counts as past once it has *ended*, so a lesson already underway
 *  can still be claimed for the room. */
export const PERIOD_TIMES: Record<Period, { start: number; end: number }> = {
  1: { start: 9 * 60, end: 9 * 60 + 45 },
  2: { start: 9 * 60 + 45, end: 10 * 60 + 30 },
  3: { start: 10 * 60 + 30, end: 11 * 60 + 15 },
  4: { start: 11 * 60 + 30, end: 12 * 60 + 15 },
  5: { start: 12 * 60 + 15, end: 13 * 60 },
  6: { start: 13 * 60 + 45, end: 14 * 60 + 30 },
  7: { start: 14 * 60 + 30, end: 15 * 60 + 15 },
  8: { start: 15 * 60 + 15, end: 16 * 60 },
};

export const SCHOOL_TZ = "Asia/Kolkata";

function minutesToClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${h24 < 12 ? "am" : "pm"}`;
}

/** "9:00 am – 9:45 am" for the given period. */
export function formatPeriodTime(period: Period): string {
  const { start, end } = PERIOD_TIMES[period];
  return `${minutesToClock(start)} – ${minutesToClock(end)}`;
}

/** The current school-local wall clock: the date as an input[type=date] value
 *  and minutes since midnight. Both are read from the same instant so they can
 *  never disagree across a midnight tick. */
export function nowInSchoolTz(at: Date = new Date()): {
  date: string;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** True once the school day for `date` is over — i.e. the date is strictly
 *  before today in school-local time. Date-only strings sort lexicographically
 *  in the same order as chronologically, so a string compare is exact here. */
export function isPastDate(date: string, now = nowInSchoolTz()): boolean {
  return date < now.date;
}

/** True when the period can no longer be used: any period on a past date, or
 *  a period on today whose end bell has already rung. Booked or not is a
 *  separate question — a past period is dead either way. */
export function isPastPeriod(
  date: string,
  period: Period,
  now = nowInSchoolTz(),
): boolean {
  if (date < now.date) return true;
  if (date > now.date) return false;
  return now.minutes >= PERIOD_TIMES[period].end;
}
