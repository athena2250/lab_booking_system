# Step 4 — Availability API

**Status:** ✅ Done

## Goal

Answer the one question the Google Form couldn't: *for this date, which of Periods 1–8 are already taken?*

## Shared module first: `lib/slots.ts`

Both this route and [Step 6](06-booking-api.md) need the same date parsing and the same period list. Write it once here.

```ts
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
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(date);
}
```

The `toISOString()` round-trip check matters: `new Date("2026-02-31T00:00:00.000Z")` silently becomes 2 March, and without the check a teacher could book a nonexistent day.

**Always pass `timeZone: "UTC"` when formatting.** The dates are UTC midnight; formatting them in IST is harmless, but formatting in a negative-offset server timezone would display the previous day.

## `app/api/availability/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PERIODS, parseDateOnly } from "@/lib/slots";

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");
  const date = parseDateOnly(dateParam);
  if (!date) {
    return NextResponse.json({ error: "Invalid or missing date" }, { status: 400 });
  }

  const bookings = await prisma.booking.findMany({
    where: { date },
    select: { period: true, teacherName: true, classSubject: true },
  });

  const byPeriod = new Map(bookings.map((b) => [b.period, b]));

  return NextResponse.json({
    date: dateParam,
    slots: PERIODS.map((period) => {
      const booking = byPeriod.get(period);
      return {
        period,
        booked: Boolean(booking),
        bookedBy: booking?.teacherName ?? null,
        classSubject: booking?.classSubject ?? null,
      };
    }),
  });
}
```

Returning **all 8 slots** with a `booked` flag (rather than just the booked period numbers) lets the UI render the full radio list straight from the response, with no client-side merging against a hardcoded list.

Showing `bookedBy` is deliberate — a teacher seeing *"Period 3 — booked by Mrs. Rao"* can go sort it out directly instead of asking the lab in-charge.

## Caching

Route handlers reading from a database are dynamic by default in the App Router, but be explicit so a future refactor can't accidentally make availability stale:

```ts
export const dynamic = "force-dynamic";
```

Stale availability is the exact failure this project exists to fix, so it's worth the one line.

## Notes / gotchas

- Protected by `proxy.ts` ([Step 3](03-auth-login.md)) — it returns 401 rather than redirecting, so the client fetch can detect a dead session and bounce to `/login`.
- This is an "at time of read" answer. A slot can be taken between the read and the submit; the unique constraint in [Step 6](06-booking-api.md) is what actually prevents the collision.

## Acceptance criteria

- [x] `GET /api/availability?date=2026-09-14` returns 8 slots, all `booked: false` on an empty table
- [x] After a booking exists, that period returns `booked: true` with the teacher name
- [x] `?date=garbage`, `?date=2026-02-31`, and a missing `date` each return 400
- [x] Unauthenticated request returns 401
