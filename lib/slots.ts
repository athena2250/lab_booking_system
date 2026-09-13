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
