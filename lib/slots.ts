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
