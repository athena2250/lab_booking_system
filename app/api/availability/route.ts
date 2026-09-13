import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { PERIODS, parseDateOnly } from "@/lib/slots";

// Stale availability is the exact failure this project exists to fix, so be
// explicit rather than relying on route handlers being dynamic by default.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");
  const date = parseDateOnly(dateParam);
  if (!date) {
    return NextResponse.json(
      { error: "Invalid or missing date" },
      { status: 400 },
    );
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
