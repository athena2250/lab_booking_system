# Step 6 — Booking API & Double-Booking Protection

**Status:** ✅ Done

## Goal

Accept a booking, guarantee no two teachers hold the same slot, and hand off to notifications — without letting a notification failure lose a booking.

## `app/api/bookings/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { parseDateOnly, isValidPeriod } from "@/lib/slots";
import { notifyBooking } from "@/lib/notify";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const date = parseDateOnly(body.date);
  const teacherName = String(body.teacherName ?? "").trim();
  const classSubject = String(body.classSubject ?? "").trim();
  const purpose = String(body.purpose ?? "").trim() || null;

  if (!date) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  if (!isValidPeriod(body.period))
    return NextResponse.json({ error: "Period must be 1-8" }, { status: 400 });
  if (!teacherName)
    return NextResponse.json({ error: "Teacher name is required" }, { status: 400 });
  if (!classSubject)
    return NextResponse.json({ error: "Class/subject is required" }, { status: 400 });

  try {
    const booking = await prisma.booking.create({
      data: { date, period: body.period, teacherName, classSubject, purpose },
    });

    await notifyBooking(booking);

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: `Period ${body.period} was just booked by someone else.` },
        { status: 409 },
      );
    }
    throw error;
  }
}
```

## The double-booking guarantee

Checking "is this slot free?" and then inserting is a race — two requests can both read *free* before either writes. The only reliable fix is the database constraint doing the checking, which is why `@@unique([date, period])` ([Step 2](02-database-and-prisma.md)) exists and why this route inserts first and handles the rejection.

Prisma surfaces a unique-constraint violation as `PrismaClientKnownRequestError` with code **`P2002`**. That maps to **409 Conflict**, which the UI turns into a readable message ([Step 5](05-booking-form-ui.md)).

Do not "improve" this by adding a pre-check `findFirst` — it would narrow the race window without closing it, while adding a query.

## Field length caps

Add a cap on the free-text fields (say 200 chars for name/subject, 1000 for purpose) before insert. Postgres `text` has no limit, and these strings go straight into an SMS-length-sensitive WhatsApp message in [Step 7](07-notifications.md).

## Notification failures must not fail the booking

The booking is committed the moment `create` returns. If Gmail or Twilio is down, the slot is still legitimately reserved and the teacher must not be told it failed — they'd rebook and hit a 409 on their own booking.

So `notifyBooking` **never throws**: it catches and logs internally ([Step 7](07-notifications.md)), and this route always returns 201 on a successful insert.

The tradeoff is real and worth stating: a booking can exist that nobody was notified about, and the teacher won't know. The mitigations, in order of effort:

1. Log failures loudly (Vercel logs) — minimum.
2. Return a `notified: false` flag in the 201 body and have the UI say *"Booked, but the notification could not be sent — please inform the lab in-charge."* — **recommended**, cheap and honest.
3. A retry queue — out of scope for a school lab form.

Option 2 is worth the small extra wiring: `notifyBooking` returns a result object rather than `void`.

### Should it await?

Yes — `await notifyBooking(...)` before responding. Serverless functions can be frozen the instant the response is sent, so a floating promise may simply never run. Two API calls add latency the teacher will notice as a beat before the confirmation; that's acceptable and far better than silently dropped messages.

## `await` on a `Prisma` type import

`Prisma.PrismaClientKnownRequestError` comes from the generated client, so import it from `@/app/generated/prisma/client` — the same path `lib/db.ts` uses. There's no `index.ts` in this generator's output ([Step 2](02-database-and-prisma.md)).

## Acceptance criteria

- [x] Valid POST returns 201 and the row is in Postgres
- [x] Same date+period twice returns 409 with a readable message, and only one row exists — also verified with 8 concurrent POSTs: exactly one 201, seven 409s, one row
- [x] Missing/blank teacher name or class/subject returns 400
- [x] Period 0 or 9, or a malformed date, returns 400
- [x] Unauthenticated POST returns 401 (via the `proxy.ts` matcher)
- [x] With notifications unavailable the booking still returns 201 and the row persists — re-verify with deliberately wrong Twilio/Gmail credentials once [Step 7](07-notifications.md) lands
