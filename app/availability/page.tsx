"use client";

import Link from "next/link";
import {
  formatDateOnlyLong,
  formatPeriodTime,
  isPastPeriod,
  type Period,
} from "@/lib/slots";
import { MonthCalendar } from "@/app/components/month-calendar";
import { useBookableDate } from "@/app/components/use-school-clock";
import {
  placeholderSlots,
  useAvailability,
} from "@/app/components/use-availability";

export default function AvailabilityPage() {
  const [date, setDate, now] = useBookableDate();
  const { slots, error, loading, reload } = useAvailability(date);

  const shown = slots ?? placeholderSlots();
  // A period that has already ended is neither free nor claimable, so it is
  // counted separately rather than being folded into "free".
  const past = (period: number) =>
    isPastPeriod(date, period as Period, now);

  const live = slots?.filter((s) => !past(s.period)) ?? [];
  const takenCount = live.filter((s) => s.booked).length;
  const freeCount = live.length - takenCount;
  const pastCount = slots?.filter((s) => past(s.period)).length ?? 0;

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 pt-9 pb-25">
      <div className="mb-[26px] flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1
            id="availability-heading"
            className="font-display m-0 mb-1.5 text-[28px] font-semibold tracking-[-0.025em]"
          >
            Availability
          </h1>
          <p className="text-muted-3 m-0 text-[14.5px]">
            {formatDateOnlyLong(date)}
          </p>
        </div>
        <Link
          href="/book"
          className="bg-accent text-ink rounded-[10px] px-4.5 py-3 text-sm font-semibold no-underline"
        >
          Book a period
        </Link>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-6 lg:grid-cols-[320px_1fr]">
        <div>
          <h2
            id="calendar-heading"
            className="text-muted-2 m-0 mb-3 text-xs tracking-[0.14em] uppercase"
          >
            Pick a date
          </h2>
          <MonthCalendar
            value={date}
            onChange={setDate}
            labelledBy="calendar-heading"
          />
          <p className="text-muted-3 mt-3 text-[12.5px] leading-[1.5]">
            Days that have already passed can&rsquo;t be selected.
          </p>
        </div>

        <div>
          {error ? (
            <p
              role="alert"
              className="text-accent-3 mb-5 rounded-[10px] border border-[rgba(255,90,54,0.35)] bg-[rgba(255,90,54,0.08)] px-3.5 py-3 text-sm"
            >
              {error}{" "}
              <button
                type="button"
                onClick={reload}
                className="cursor-pointer font-semibold underline"
              >
                Retry
              </button>
            </p>
          ) : (
            <div className="text-muted-3 mb-5 flex flex-wrap gap-4.5 text-[13px]">
              <span className="inline-flex items-center gap-[7px]">
                <span className="bg-ok size-[7px] rounded-full" />
                {loading ? "—" : freeCount} free
              </span>
              <span className="inline-flex items-center gap-[7px]">
                <span className="bg-faint size-[7px] rounded-full" />
                {loading ? "—" : takenCount} taken
              </span>
              {pastCount > 0 && !loading && (
                <span className="inline-flex items-center gap-[7px]">
                  <span className="bg-[#33333a] size-[7px] rounded-full" />
                  {pastCount} past
                </span>
              )}
            </div>
          )}

          <ul
            aria-busy={loading}
            className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))] gap-3 p-0"
          >
            {shown.map((slot) => {
              const isPast = past(slot.period);
              return (
                <li
                  key={slot.period}
                  className={`flex min-h-[132px] flex-col gap-[7px] rounded-[14px] border p-4 ${
                    isPast
                      ? "border-line bg-ink-2 opacity-55"
                      : slot.booked
                        ? "border-[#1e1e22] bg-ink-2"
                        : "border-edge-strong bg-surface"
                  } ${loading ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-display text-[15px] font-semibold ${
                        isPast ? "text-muted-3 line-through" : ""
                      }`}
                    >
                      Period {slot.period}
                    </span>
                    <span
                      className={`size-[7px] rounded-full ${
                        isPast
                          ? "bg-[#33333a]"
                          : slot.booked
                            ? "bg-faint"
                            : "bg-ok"
                      }`}
                    />
                  </div>
                  <span className="text-muted-3 font-mono text-[11.5px] tracking-[0.02em]">
                    {formatPeriodTime(slot.period as Period)}
                  </span>
                  <span
                    className={`text-[12.5px] font-semibold tracking-[0.06em] uppercase ${
                      isPast
                        ? "text-faint"
                        : slot.booked
                          ? "text-muted"
                          : "text-ok"
                    }`}
                  >
                    {loading
                      ? "…"
                      : isPast
                        ? "Past"
                        : slot.booked
                          ? "Booked"
                          : "Free"}
                  </span>
                  <span className="text-muted-3 mt-auto text-[13.5px] leading-[1.45]">
                    {loading
                      ? ""
                      : slot.booked
                        ? [slot.bookedBy, slot.classSubject]
                            .filter(Boolean)
                            .join(" — ")
                        : isPast
                          ? "Over — no longer bookable"
                          : "Open — anyone can claim it"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </main>
  );
}
