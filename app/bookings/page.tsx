import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateShort } from "@/lib/slots";

// Admin only — `ADMIN_ONLY` in `proxy.ts` bounces teachers to `/my`, which is
// the same list narrowed to their own bookings.

// The point of this page is to show what has actually been claimed, so it must
// never be served from a cache built before the last booking.
export const dynamic = "force-dynamic";

const COLUMNS = "grid grid-cols-[1.1fr_0.6fr_1fr_1.3fr] gap-4 px-5";

export default async function BookingsPage() {
  const bookings = await prisma.booking.findMany({
    orderBy: [{ date: "desc" }, { period: "asc" }],
    select: {
      id: true,
      date: true,
      period: true,
      teacherName: true,
      classSubject: true,
      purpose: true,
    },
  });

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 pt-9 pb-25">
      <h1 className="font-display m-0 mb-1.5 text-[28px] font-semibold tracking-[-0.025em]">
        All bookings
      </h1>
      <p className="text-muted-3 m-0 mb-[26px] text-[14.5px]">
        Every teacher&rsquo;s bookings, newest first.
      </p>

      {bookings.length === 0 ? (
        <div className="border-edge bg-surface rounded-2xl border p-10 text-center">
          <p className="text-muted m-0 mb-5 text-[15px]">
            Nothing has been booked yet.
          </p>
          <Link
            href="/book"
            className="bg-accent text-ink inline-block rounded-[10px] px-5 py-3 text-sm font-semibold no-underline"
          >
            Book the first period
          </Link>
        </div>
      ) : (
        <div className="border-edge bg-surface overflow-x-auto rounded-2xl border">
          <div className="min-w-[640px]">
            <div
              className={`${COLUMNS} border-line bg-ink-2 text-muted-2 border-b py-3.5 text-xs tracking-[0.1em] uppercase`}
            >
              <span>Date</span>
              <span>Period</span>
              <span>Teacher</span>
              <span>Class &amp; purpose</span>
            </div>
            {bookings.map((b) => (
              <div
                key={b.id}
                className={`${COLUMNS} items-center border-b border-[#18181b] py-4 text-[14.5px] last:border-b-0`}
              >
                <span className="text-fg-2">{formatDateShort(b.date)}</span>
                <span className="text-accent font-mono text-[13px]">
                  P{b.period}
                </span>
                <span className="font-medium">{b.teacherName}</span>
                <span className="text-muted-3">
                  {[b.classSubject, b.purpose].filter(Boolean).join(" — ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
