import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentAccount } from "@/lib/teachers";
import { getSession } from "@/lib/session";
import { PERIODS, parseDateOnly } from "@/lib/slots";
import type { DeliveryStatus } from "@/app/generated/prisma/client";

/** One period of the chosen day, with who has it and whether the three
 *  recipients were actually told. */
export type DaySlot = {
  period: number;
  booking: {
    id: string;
    teacherName: string;
    classSubject: string;
    purpose: string | null;
    bookedAt: string;
    /** null until a send has settled — "not recorded", not "not sent". */
    notifiedAt: string | null;
    email: { status: DeliveryStatus; error: string | null };
    whatsapp: { status: DeliveryStatus; error: string | null };
  } | null;
};

export async function GET(req: NextRequest) {
  // `proxy.ts` guards `/api/admin`, but it reads the signed cookie. A demoted
  // or retired admin must lose this before their session expires, so the row is
  // what decides.
  const session = await getSession();
  const account = session && (await currentAccount(session.teacherId));
  if (!account || account.role !== "ADMIN") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const raw = req.nextUrl.searchParams.get("date");
  const date = parseDateOnly(raw);
  if (!date) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const bookings = await prisma.booking.findMany({
    where: { date },
    select: {
      id: true,
      period: true,
      teacherName: true,
      classSubject: true,
      purpose: true,
      createdAt: true,
      notifiedAt: true,
      emailStatus: true,
      emailError: true,
      whatsappStatus: true,
      whatsappError: true,
    },
  });

  const byPeriod = new Map(bookings.map((b) => [b.period, b]));

  // Always all eight periods, in order, so the grid keeps its shape on a day
  // with nothing booked.
  const slots: DaySlot[] = PERIODS.map((period) => {
    const b = byPeriod.get(period);
    return {
      period,
      booking: b
        ? {
            id: b.id,
            teacherName: b.teacherName,
            classSubject: b.classSubject,
            purpose: b.purpose,
            bookedAt: b.createdAt.toISOString(),
            notifiedAt: b.notifiedAt?.toISOString() ?? null,
            email: { status: b.emailStatus, error: b.emailError },
            whatsapp: { status: b.whatsappStatus, error: b.whatsappError },
          }
        : null,
    };
  });

  return NextResponse.json({ date: raw, slots });
}
