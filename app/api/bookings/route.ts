import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { parseDateOnly, isValidPeriod } from "@/lib/slots";
import { notifyBooking } from "@/lib/notify";

// Authentication is enforced by the matcher in `proxy.ts`, which returns 401
// for /api/* before this handler runs.

// Postgres `text` has no length limit, and these strings go straight into an
// SMS-length-sensitive WhatsApp message.
const MAX_NAME = 200;
const MAX_SUBJECT = 200;
const MAX_PURPOSE = 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const date = parseDateOnly(body.date);
  const teacherName = String(body.teacherName ?? "").trim();
  const classSubject = String(body.classSubject ?? "").trim();
  const purpose = String(body.purpose ?? "").trim() || null;

  if (!date) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!isValidPeriod(body.period)) {
    return NextResponse.json({ error: "Period must be 1-8" }, { status: 400 });
  }
  if (!teacherName) {
    return NextResponse.json(
      { error: "Teacher name is required" },
      { status: 400 },
    );
  }
  if (teacherName.length > MAX_NAME) {
    return NextResponse.json(
      { error: `Teacher name must be ${MAX_NAME} characters or fewer` },
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
      data: { date, period: body.period, teacherName, classSubject, purpose },
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
  // and hit a 409 on their own booking. `notifyBooking` never throws; we await
  // it because a serverless function can be frozen the instant it responds,
  // and report the outcome so the UI can tell the teacher the truth.
  const notification = await notifyBooking(booking);
  const notified = notification.email.ok && notification.whatsapp.ok;

  return NextResponse.json({ booking, notified }, { status: 201 });
}
