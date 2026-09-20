import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { AdminDay } from "./admin-day";
import {
  PERIODS,
  formatDateShort,
  formatWeekdayShort,
  isPastPeriod,
  nowInSchoolTz,
  parseDateOnly,
  schoolWeek,
  type Period,
} from "@/lib/slots";

// The whole point of this page is "what does the lab look like right now", so it
// must never be served from a cache built before the last booking.
export const dynamic = "force-dynamic";

type Cell = { id: string; teacherName: string; classSubject: string };

export default async function AdminPage() {
  // The proxy already bounced non-admins, but a page that lists staff accounts
  // re-reads the row rather than trusting a twelve-hour-old cookie.
  const admin = await requireAdmin();

  const now = nowInSchoolTz();
  const week = schoolWeek();
  const [from, to] = [parseDateOnly(week[0]), parseDateOnly(week[4])] as [
    Date,
    Date,
  ];

  const [bookings, accounts] = await Promise.all([
    prisma.booking.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { period: "asc" }],
      select: {
        id: true,
        date: true,
        period: true,
        teacherName: true,
        classSubject: true,
      },
    }),
    prisma.teacher.groupBy({
      by: ["role", "active"],
      _count: { _all: true },
    }),
  ]);

  // Keyed by "<date>-<period>" so the grid below is a lookup rather than a scan
  // per cell.
  const bySlot = new Map<string, Cell>();
  for (const b of bookings) {
    const date = b.date.toISOString().slice(0, 10);
    bySlot.set(`${date}-${b.period}`, b);
  }

  const capacity = week.length * PERIODS.length;
  const booked = bookings.length;
  const teachersBooking = new Set(bookings.map((b) => b.teacherName)).size;

  const perDay = week.map((date) => ({
    date,
    count: bookings.filter((b) => b.date.toISOString().slice(0, 10) === date)
      .length,
  }));
  const busiest = perDay.reduce((a, b) => (b.count > a.count ? b : a));

  const activeStaff = accounts
    .filter((a) => a.active)
    .reduce((n, a) => n + a._count._all, 0);
  const retiredStaff = accounts
    .filter((a) => !a.active)
    .reduce((n, a) => n + a._count._all, 0);
  const activeAdmins = accounts
    .filter((a) => a.active && a.role === "ADMIN")
    .reduce((n, a) => n + a._count._all, 0);

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 pt-9 pb-25">
      <h1 className="font-display m-0 mb-1.5 text-[28px] font-semibold tracking-[-0.025em]">
        Admin
      </h1>
      <p className="text-muted-3 m-0 mb-[26px] text-[14.5px]">
        Signed in as {admin.name}. This week is{" "}
        {formatDateShort(from)} &ndash; {formatDateShort(to)}.
      </p>

      <div className="mb-9">
        <AdminDay today={now.date} />
      </div>

      <h2 className="font-display m-0 mb-4 text-[19px] font-semibold tracking-[-0.02em]">
        This week
      </h2>

      <section className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Periods booked"
          value={`${booked}`}
          note={`of ${capacity} this week`}
        />
        <Stat
          label="Still free"
          value={`${capacity - booked}`}
          note={`${Math.round((booked / capacity) * 100)}% used`}
        />
        <Stat
          label="Teachers booking"
          value={`${teachersBooking}`}
          note="distinct, this week"
        />
        <Stat
          label="Busiest day"
          value={busiest.count === 0 ? "—" : formatWeekdayShort(busiest.date)}
          note={busiest.count === 0 ? "nothing booked yet" : `${busiest.count} periods`}
        />
      </section>

      <section className="border-edge bg-surface mb-7 overflow-x-auto rounded-2xl border">
        <div className="border-line flex flex-wrap items-baseline justify-end gap-2 border-b px-5 py-4">
          <Link
            href="/bookings"
            className="text-muted-3 hover:text-fg text-[13px] no-underline"
          >
            All bookings &rarr;
          </Link>
        </div>

        <div className="min-w-[720px] p-5">
          <div className="grid grid-cols-[46px_repeat(5,1fr)] gap-1.5">
            <span />
            {week.map((date) => (
              <span
                key={date}
                className="text-muted-2 pb-1 text-center text-xs tracking-[0.08em] uppercase"
              >
                {formatWeekdayShort(date)}{" "}
                <span className="text-faint">{date.slice(8)}</span>
              </span>
            ))}

            {PERIODS.map((period) => (
              <Row
                key={period}
                period={period}
                week={week}
                bySlot={bySlot}
                now={now}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Panel
          href="/admin/teachers"
          title="Teacher accounts"
          body={`${activeStaff} active (${activeAdmins} admin${activeAdmins === 1 ? "" : "s"})${
            retiredStaff ? `, ${retiredStaff} retired` : ""
          }. Add someone, reset a passcode, retire an account.`}
        />
        <Panel
          href="/bookings"
          title="All bookings"
          body="Every teacher's bookings, newest first — and where a period gets cancelled to free the lab."
        />
      </section>
    </main>
  );
}

function Row({
  period,
  week,
  bySlot,
  now,
}: {
  period: Period;
  week: string[];
  bySlot: Map<string, Cell>;
  now: ReturnType<typeof nowInSchoolTz>;
}) {
  return (
    <>
      <span className="text-muted-3 font-mono self-center text-center text-xs">
        P{period}
      </span>
      {week.map((date) => {
        const cell = bySlot.get(`${date}-${period}`);
        const past = isPastPeriod(date, period, now);
        if (!cell) {
          return (
            <span
              key={date}
              className={`border-line rounded-lg border border-dashed px-2 py-2.5 text-center text-[11.5px] ${
                past ? "text-faint" : "text-muted-3"
              }`}
            >
              {past ? "—" : "free"}
            </span>
          );
        }
        return (
          <span
            key={date}
            title={`${cell.teacherName} — ${cell.classSubject}`}
            className={`border-edge bg-ink-2 overflow-hidden rounded-lg border px-2 py-2 text-[11.5px] leading-tight ${
              past ? "opacity-55" : ""
            }`}
          >
            <span className="text-fg-2 block truncate">{cell.teacherName}</span>
            <span className="text-muted-3 block truncate">
              {cell.classSubject}
            </span>
          </span>
        );
      })}
    </>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="border-edge bg-surface rounded-2xl border px-5 py-4">
      <div className="text-muted-2 mb-1.5 text-[11px] tracking-[0.1em] uppercase">
        {label}
      </div>
      <div className="font-display text-[26px] leading-none font-semibold tracking-[-0.02em]">
        {value}
      </div>
      <div className="text-muted-3 mt-1.5 text-[12.5px]">{note}</div>
    </div>
  );
}

function Panel({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="border-edge bg-surface hover:border-edge-strong block rounded-2xl border p-5 no-underline"
    >
      <div className="font-display text-fg mb-1.5 text-[16px] font-semibold tracking-[-0.015em]">
        {title} &rarr;
      </div>
      <p className="text-muted-3 m-0 text-[13.5px] leading-relaxed">{body}</p>
    </Link>
  );
}
