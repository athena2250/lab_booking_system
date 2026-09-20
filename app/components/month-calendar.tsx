"use client";

import { useState } from "react";
import { useSchoolClock } from "@/app/components/use-school-clock";

/** Date-only strings are handled as UTC midnight throughout the app, so all
 *  arithmetic here stays in UTC — using local getters would shift a day either
 *  side of the date line. */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** First of the month containing `value`, as "YYYY-MM". */
function monthOf(value: string): string {
  return value.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + by, 1));
  return toKey(date).slice(0, 7);
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The cells of a month grid, padded out to whole Monday-start weeks. Leading
 *  and trailing cells belong to the neighbouring months and render as spacers,
 *  which keeps the grid rectangular without offering dates the header doesn't
 *  name. */
function monthGrid(month: string): (string | null)[] {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  // getUTCDay() is Sunday-based; shift it so Monday is column 0.
  const lead = (first.getUTCDay() + 6) % 7;

  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toKey(new Date(Date.UTC(year, m - 1, day))));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(toDate(`${month}-01`));
}

const NAV =
  "border-edge-strong text-muted hover:text-fg hover:border-faint grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border bg-transparent text-[15px] leading-none disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted disabled:hover:border-edge-strong";

export function MonthCalendar({
  value,
  onChange,
  labelledBy,
}: {
  value: string;
  onChange: (date: string) => void;
  labelledBy?: string;
}) {
  const now = useSchoolClock();
  const [month, setMonth] = useState(() => monthOf(value));

  // A date chosen elsewhere (or rolled forward off a past day) should bring its
  // month into view rather than leaving the grid pointing somewhere else. This
  // is the adjust-during-render pattern: browsing to another month is local
  // state, so it can't simply be derived from `value`.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setMonth(monthOf(value));
  }

  const currentMonth = monthOf(now.date);
  // Nothing before today is bookable, so there is nowhere to go back to.
  const canGoBack = month > currentMonth;

  return (
    <div
      className="border-edge bg-surface rounded-[14px] border p-3.5"
      role="group"
      aria-labelledby={labelledBy}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={!canGoBack}
          aria-label="Previous month"
          className={NAV}
        >
          ‹
        </button>
        <span
          aria-live="polite"
          className="font-display text-[14.5px] font-semibold"
        >
          {formatMonth(month)}
        </span>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Next month"
          className={NAV}
        >
          ›
        </button>
      </div>

      <div className="text-muted-3 mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px] tracking-[0.06em] uppercase">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthGrid(month).map((date, i) => {
          if (!date) return <span key={`pad-${i}`} aria-hidden="true" />;

          const isPast = date < now.date;
          const isToday = date === now.date;
          const isSelected = date === value;

          return (
            <button
              key={date}
              type="button"
              disabled={isPast}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              onClick={() => onChange(date)}
              className={`grid aspect-square w-full place-items-center rounded-[9px] border text-[13.5px] tabular-nums transition-colors ${
                isSelected
                  ? "border-accent bg-accent text-ink font-semibold"
                  : isPast
                    ? "text-faint cursor-not-allowed border-transparent line-through"
                    : isToday
                      ? "border-edge-strong text-fg hover:border-accent cursor-pointer font-semibold"
                      : "text-fg-2 hover:border-edge-strong hover:bg-field cursor-pointer border-transparent"
              }`}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
