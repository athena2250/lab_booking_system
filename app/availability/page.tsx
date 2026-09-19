"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDateOnlyLong, todayInSchoolTz } from "@/lib/slots";
import {
  placeholderSlots,
  useAvailability,
} from "@/app/components/use-availability";

export default function AvailabilityPage() {
  const [date, setDate] = useState(todayInSchoolTz);
  const { slots, error, loading, reload } = useAvailability(date);

  const shown = slots ?? placeholderSlots();
  const takenCount = slots?.filter((s) => s.booked).length ?? 0;
  const freeCount = slots ? slots.length - takenCount : 0;

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 pt-9 pb-25">
      <div className="mb-[26px] flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display m-0 mb-1.5 text-[28px] font-semibold tracking-[-0.025em]">
            Availability
          </h1>
          <p className="text-muted-3 m-0 text-[14.5px]">
            {formatDateOnlyLong(date)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="date" className="sr-only">
            Date
          </label>
          <input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-surface border-edge-strong text-fg focus:border-accent rounded-[10px] border px-3.5 py-2.5 text-sm outline-none"
          />
          <Link
            href="/book"
            className="bg-accent text-ink rounded-[10px] px-4.5 py-3 text-sm font-semibold no-underline"
          >
            Book a period
          </Link>
        </div>
      </div>

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
        </div>
      )}

      <ul
        aria-busy={loading}
        className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))] gap-3 p-0"
      >
        {shown.map((slot) => (
          <li
            key={slot.period}
            className={`flex min-h-[118px] flex-col gap-[9px] rounded-[14px] border p-4 ${
              slot.booked
                ? "border-[#1e1e22] bg-ink-2"
                : "border-edge-strong bg-surface"
            } ${loading ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-[15px] font-semibold">
                Period {slot.period}
              </span>
              <span
                className={`size-[7px] rounded-full ${
                  slot.booked ? "bg-faint" : "bg-ok"
                }`}
              />
            </div>
            <span
              className={`text-[12.5px] font-semibold tracking-[0.06em] uppercase ${
                slot.booked ? "text-muted" : "text-ok"
              }`}
            >
              {loading ? "…" : slot.booked ? "Booked" : "Free"}
            </span>
            <span className="text-muted-3 mt-auto text-[13.5px] leading-[1.45]">
              {loading
                ? ""
                : slot.booked
                  ? [slot.bookedBy, slot.classSubject]
                      .filter(Boolean)
                      .join(" — ")
                  : "Open — anyone can claim it"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
