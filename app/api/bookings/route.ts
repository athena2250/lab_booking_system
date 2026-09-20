import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { parseDateOnly, isValidPeriod, isPastPeriod } from "@/lib/slots";
import { notifyAndRecord } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { currentAccount } from "@/lib/teachers";

// Authentication is enforced by the matcher in `proxy.ts`, which returns 401
// for /api/* before this handler runs. The account is still re-read below: the
// booking is attributed to it, and a signed cookie outlives a retired account.

// Postgres `text` has no length limit, and these strings go straight into an
// SMS-length-sensitive WhatsApp message.
const MAX_SUBJECT = 200;
const MAX_PURPOSE = 1000;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Who the booking belongs to is never taken from the request body — a teacher
  // cannot book in someone else's name by editing the payload.
  const account = await currentAccount(session.teacherId);
  if (!account) {
    return NextResponse.json(
      { error: "This account is no longer active. Ask the lab in-charge." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const date = parseDateOnly(body.date);
  const teacherName = account.name;
  const classSubject = String(body.classSubject ?? "").trim();
  const purpose = String(body.purpose ?? "").trim() || null;

  if (!date) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!isValidPeriod(body.period)) {
    return NextResponse.json({ error: "Period must be 1-8" }, { status: 400 });
  }
  // The calendar and the period list already hide these, but a tab left open
  // across the end bell — or a direct call — must not be able to claim a slot
  // that has already gone. `body.date` is the validated date-only string.
  if (isPastPeriod(String(body.date), body.period)) {
    return NextResponse.json(
      { error: "That period is in the past and can no longer be booked." },
      { status: 400 },
    );
  }
  if (!classSubject) {
    return NextResponse.json(
      { error: "Class/subject is required" },
      { status: 400 },
    );
  }
  if (classSubject.length > MAX_SUBJECT) {
    return NextResponse.json(
      { error: `Class/subject must be ${MAX_SUBJECT} characters or fewer` },
      { status: 400 },
    );
  }
  if (purpose && purpose.length > MAX_PURPOSE) {
    return NextResponse.json(
      { error: `Purpose must be ${MAX_PURPOSE} characters or fewer` },
      { status: 400 },
    );
  }

  let booking;
  try {
    // Insert first and let the @@unique([date, period]) constraint arbitrate.
    // A pre-check `findFirst` would only narrow the race window, never close
    // it, while adding a query — do not "improve" this by adding one.
    booking = await prisma.booking.create({
      data: {
        date,
        period: body.period,
        teacherId: account.id,
        teacherName,
        classSubject,
        purpose,
      },
    });
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

  // The booking is committed the moment `create` returns, so a notification
  // failure must never turn into an error response — the teacher would rebook
  // and hit a 409 on their own booking. `notifyAndRecord` never throws; we await
  // it because a serverless function can be frozen the instant it responds,
  // and report the outcome so the UI can tell the teacher the truth. The same
  // call records the outcome on the row, which is what `/admin` reads back.
  const notification = await notifyAndRecord(booking);
  const notified = notification.email.ok && notification.whatsapp.ok;

  return NextResponse.json({ booking, notified }, { status: 201 });
}
