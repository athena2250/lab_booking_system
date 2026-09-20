import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import {
  PERIOD_TIMES,
  formatPeriodTime,
  isPastPeriod,
  nowInSchoolTz,
  parseDateOnly,
  type Period,
} from "@/lib/slots";

// A teacher opens this to check what they have coming up, so it must never be
// served from a cache built before their last booking.
export const dynamic = "force-dynamic";

// How far back the history goes. A school year of one teacher's lab periods is
// well under this; the cap is only here so the page can't be made unbounded by
// a few years of use.
const PAST_LIMIT = 100;

type Row = {
  id: string;
  date: Date;
  period: number;
  classSubject: string;
  purpose: string | null;
};

type Tab = "upcoming" | "past";

export default async function MyBookingsPage({
  searchParams,
}: PageProps<"/my">) {
  const session = await requireSession();
  const tab: Tab = (await searchParams).show === "past" ? "past" : "upcoming";

  const now = nowInSchoolTz();
  // The stored dates are UTC midnight, so today's boundary has to be built the
  // same way or a comparison lands on the wrong side of it.
  const today = parseDateOnly(now.date) as Date;

  const select = {
    id: true,
    date: true,
    period: true,
    classSubject: true,
    purpose: true,
  } as const;

  // Today is split by period, not by date: a lesson whose end bell has rung is
  // history, while a later period on the same day is still upcoming. So today's
  // rows are fetched with the future ones and then divided.
  const [fromToday, earlier] = await Promise.all([
    prisma.booking.findMany({
      where: { teacherId: session.teacherId, date: { gte: today } },
      orderBy: [{ date: "asc" }, { period: "asc" }],
      select,
    }),
    prisma.booking.findMany({
      where: { teacherId: session.teacherId, date: { lt: today } },
      orderBy: [{ date: "desc" }, { period: "desc" }],
      take: PAST_LIMIT,
      select,
    }),
  ]);

  const dateOf = (row: Row) => row.date.toISOString().slice(0, 10);
  const isOver = (row: Row) =>
    isPastPeriod(dateOf(row), row.period as Period, now);

  const upcoming = fromToday.filter((row) => !isOver(row));
  const past = [
    // Today's finished periods are the most recent history, so they come first.
    ...fromToday.filter(isOver).reverse(),
    ...earlier,
  ];

  const rows = tab === "past" ? past : upcoming;

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 pt-9 pb-25">
      <div className="mb-[26px] flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display m-0 mb-1.5 text-[28px] font-semibold tracking-[-0.025em]">
            My bookings
          </h1>
          <p className="text-muted-3 m-0 text-[14.5px]">
            Signed in as {session.name}
          </p>
        </div>
        <Link
          href="/book"
          className="bg-accent text-ink rounded-[10px] px-4.5 py-3 text-sm font-semibold no-underline"
        >
          Book a period
        </Link>
      </div>

      <nav
        aria-label="Which bookings"
        className="border-edge mb-5 inline-flex gap-1 rounded-[10px] border bg-[#131316] p-1"
      >
        {(
          [
            ["upcoming", "Upcoming", upcoming.length],
            ["past", "Past", past.length],
          ] as const
        ).map(([key, label, count]) => (
          <Link
            key={key}
            href={key === "upcoming" ? "/my" : "/my?show=past"}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-[7px] px-3.5 py-[7px] text-[13.5px] font-medium no-underline ${
              tab === key ? "bg-[#26262b] text-fg" : "text-muted-3 hover:text-fg"
            }`}
          >
            {label}{" "}
            <span className="text-muted-3 font-mono text-[12px]">
              {/* The past count stops at the fetch cap, so say so rather than
                  quietly under-reporting a long history. */}
              {key === "past" && count === PAST_LIMIT ? `${count}+` : count}
            </span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="border-edge bg-surface rounded-2xl border p-10 text-center">
          <p className="text-muted m-0 mb-5 text-[15px]">
            {tab === "upcoming"
              ? "You have no lab periods coming up."
              : "You haven't used the lab yet — nothing in your history."}
          </p>
          <Link
            href={tab === "upcoming" ? "/book" : "/my"}
            className="bg-accent text-ink inline-block rounded-[10px] px-5 py-3 text-sm font-semibold no-underline"
          >
            {tab === "upcoming" ? "Book a period" : "See what's coming up"}
          </Link>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {rows.map((row) => {
            const date = dateOf(row);
            const running =
              date === now.date &&
              now.minutes >= PERIOD_TIMES[row.period as Period].start &&
              now.minutes < PERIOD_TIMES[row.period as Period].end;

            return (
              <li
                key={row.id}
                className={`border-edge bg-surface grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[14px] border px-5 py-4 ${
                  tab === "past" ? "opacity-75" : ""
                } ${running ? "border-accent" : ""}`}
              >
                <span className="flex min-w-[76px] flex-col">
                  <span className="font-display text-[15px] font-semibold">
                    P{row.period}
                  </span>
                  <span className="text-muted-3 font-mono text-[11px]">
                    {formatPeriodTime(row.period as Period)}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14.5px] font-medium">
                    {relativeDay(date, now.date)}
                  </span>
                  <span className="text-muted-3 text-[13.5px] leading-[1.45]">
                    {[row.classSubject, row.purpose].filter(Boolean).join(" — ")}
                  </span>
                </span>
                {running ? (
                  <span className="text-accent text-[12px] font-semibold tracking-[0.06em] uppercase">
                    Now
                  </span>
                ) : (
                  <span className="text-muted-3 font-mono text-[12px]">
                    {date}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "past" && past.length >= PAST_LIMIT && (
        <p className="text-muted-3 mt-5 text-[13px]">
          Showing your most recent {PAST_LIMIT} lab periods.
        </p>
      )}
    </main>
  );
}

/** "Today", "Tomorrow", "Yesterday", or "Monday, 21 September 2026". The
 *  relative words are what a teacher actually scans for; the full date is still
 *  shown alongside every row, so nothing is lost by using them. */
function relativeDay(date: string, todayDate: string): string {
  const day = 24 * 60 * 60 * 1000;
  const diff =
    (Date.parse(`${date}T00:00:00.000Z`) -
      Date.parse(`${todayDate}T00:00:00.000Z`)) /
    day;

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";

  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}
