"use client";

import { useEffect, useState } from "react";
import { nowInSchoolTz } from "@/lib/slots";

/** The school-local wall clock, re-read every 30s so a period greys itself out
 *  the moment its end bell passes — without this, a tab left open through a
 *  lesson would keep offering a slot that has already gone. */
export function useSchoolClock() {
  // Read once up front rather than after mount, so the first paint already has
  // the right date — the server and the client can only disagree if a period
  // boundary falls between render and hydration, and the mount tick below
  // settles that immediately.
  const [now, setNow] = useState(() => nowInSchoolTz());

  useEffect(() => {
    const tick = () =>
      setNow((prev) => {
        const next = nowInSchoolTz();
        // Keep the same object while the minute hasn't moved, so consumers
        // don't re-render 120 times an hour for nothing.
        return next.date === prev.date && next.minutes === prev.minutes
          ? prev
          : next;
      });

    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return now;
}

/** The selected booking date, clamped so it can never point into the past. A
 *  tab left open overnight would otherwise still be sitting on yesterday,
 *  showing a day the calendar has since disabled; once midnight passes the
 *  clock ticks and the selection reads as today instead. The clamp is derived
 *  rather than stored, so it cannot drift out of step with the clock. */
export function useBookableDate() {
  const now = useSchoolClock();
  const [date, setDate] = useState(now.date);

  return [date < now.date ? now.date : date, setDate, now] as const;
}
