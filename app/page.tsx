import Link from "next/link";

const STACK = [
  "Next.js 16",
  "React 19",
  "TypeScript",
  "Tailwind v4",
  "Prisma 6",
  "PostgreSQL",
  "nodemailer",
  "twilio",
];

const PROBLEMS = [
  {
    num: "01",
    title: "Availability before the pick",
    body: "All eight periods for any date, each marked free or taken with the name of whoever holds it. Taken periods are visibly unavailable in the form, not a surprise after submitting.",
  },
  {
    num: "02",
    title: "Three people told, every time",
    body: "Two by email, one by WhatsApp in English and Kannada. Kannada comes from a fixed template rather than a translation API, so nothing unproofread is ever sent.",
  },
  {
    num: "03",
    title: "The database arbitrates",
    body: "A unique constraint on date and period is what makes double booking impossible. The insert runs blind and catches the conflict — a pre-check would narrow the race window and never close it.",
  },
];

const DECISIONS = [
  {
    num: "01",
    title: "The database arbitrates the race",
    body: "Insert blind, catch the unique-constraint conflict, return 409. A pre-check would never close the window.",
  },
  {
    num: "02",
    title: "Dates are date-only, stored as UTC midnight",
    body: "A local-time date carries a time component and would silently defeat the constraint. Today is computed in Asia/Kolkata.",
  },
  {
    num: "03",
    title: "Notifications never fail a booking",
    body: "Each channel catches its own errors. The booking is already committed, so an error would only make the teacher rebook into their own clash.",
  },
  {
    num: "04",
    title: "Kannada labels only, values verbatim",
    body: "Fixed templates rather than a translation API. Unproofread free text is never machine-translated.",
  },
];

export default function Home() {
  return (
    <main>
      <section className="mx-auto max-w-[1180px] px-6 pt-24 pb-20">
        <p className="border-edge-strong text-muted mb-[34px] inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px]">
          <span className="bg-ok animate-pulse-dot size-1.5 rounded-full" />
          Live availability · Periods 1–8 · One lab
        </p>
        <h1 className="font-display m-0 max-w-[16ch] text-[clamp(38px,6.4vw,72px)] leading-[1.02] font-bold tracking-[-0.035em] text-balance">
          See the lab is free <span className="text-accent">before</span> you
          claim it.
        </h1>
        <p className="text-muted mt-[26px] max-w-[56ch] text-[clamp(16px,2vw,19px)] leading-[1.6] text-pretty">
          The lab was booked through a Google Form that showed no availability.
          Two teachers claimed the same period and nobody found out until the
          clash happened in the corridor. This replaces the form with live slots
          and automatic notification of everyone who needs to know.
        </p>
        <div className="mt-[38px] flex flex-wrap gap-3">
          <Link
            href="/book"
            className="bg-accent text-ink rounded-[10px] px-6 py-3.5 text-[15px] font-semibold no-underline"
          >
            Open the booking screens
          </Link>
          <Link
            href="/availability"
            className="border-edge-strong text-fg rounded-[10px] border px-6 py-3.5 text-[15px] font-medium no-underline"
          >
            Today&rsquo;s availability
          </Link>
        </div>
      </section>

      <section className="border-line bg-ink-2 border-y">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-2.5 px-6 py-[22px]">
          <span className="text-muted-2 mr-3.5 text-xs tracking-[0.14em] uppercase">
            Built on
          </span>
          {STACK.map((item) => (
            <span
              key={item}
              className="border-edge text-muted font-mono rounded-[7px] border px-2.5 py-[5px] text-[12.5px]"
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 py-22">
        <h2 className="font-display m-0 mb-3.5 text-[clamp(26px,3.6vw,40px)] font-semibold tracking-[-0.03em]">
          Two problems, one screen
        </h2>
        <p className="text-muted m-0 mb-[46px] max-w-[52ch] text-[17px] leading-[1.6] text-pretty">
          Double booking was the loud problem. The quieter one was that an
          English-only notification meant the lab in-charge was effectively
          never told.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,270px),1fr))] gap-[18px]">
          {PROBLEMS.map((card) => (
            <article
              key={card.num}
              className="border-edge bg-surface rounded-2xl border p-7"
            >
              <p className="text-accent font-mono mb-[18px] text-xs">
                {card.num}
              </p>
              <h3 className="font-display m-0 mb-2.5 text-[19px] font-semibold tracking-[-0.015em]">
                {card.title}
              </h3>
              <p className="text-muted-2 m-0 text-[15px] leading-[1.6] text-pretty">
                {card.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-line bg-ink-2 border-t">
        <div className="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-13 px-6 py-20">
          <div>
            <h2 className="font-display m-0 mb-4 text-[clamp(24px,3.2vw,34px)] font-semibold tracking-[-0.03em] text-balance">
              Deliberately the same shape as the form
            </h2>
            <p className="text-muted-2 m-0 text-base leading-[1.65] text-pretty">
              One lab. Periods 1–8, no clock times. One shared staff-room login
              rather than per-teacher accounts. Teachers should recognise the
              thing they already fill in, minus the guessing.
            </p>
          </div>
          <dl className="m-0 flex flex-col">
            {DECISIONS.map((d) => (
              <div
                key={d.num}
                className="border-line grid grid-cols-[auto_1fr] items-baseline gap-4 border-b py-4"
              >
                <span className="text-muted-2 font-mono text-xs">{d.num}</span>
                <div>
                  <dt className="mb-1 text-[15px] font-semibold">{d.title}</dt>
                  <dd className="text-muted-3 m-0 text-sm leading-[1.55]">
                    {d.body}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 pt-22 pb-28 text-center">
        <h2 className="font-display m-0 mb-[18px] text-[clamp(26px,4vw,44px)] font-semibold tracking-[-0.03em] text-balance">
          Book a period in about fifteen seconds.
        </h2>
        <Link
          href="/book"
          className="bg-accent text-ink mt-2 inline-block rounded-[10px] px-7 py-[15px] text-[15px] font-semibold no-underline"
        >
          Walk through the screens
        </Link>
      </section>
    </main>
  );
}
