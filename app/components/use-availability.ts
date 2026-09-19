"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type Slot = {
  period: number;
  booked: boolean;
  bookedBy: string | null;
  classSubject: string | null;
};

type Result = { key: string; slots: Slot[] | null; error: string | null };

/** Availability for one date, refetched whenever the date changes or `reload`
 *  is called. Every result is stamped with the key it was fetched for, so a
 *  response for a superseded date can never paint itself over the current one
 *  — that stale-data window is the whole reason this project exists. */
export function useAvailability(date: string) {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const key = `${date}#${reloadToken}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const res = await fetch(`/api/availability?date=${date}`, {
          cache: "no-store",
        });
        if (!active) return;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));

        const data = (await res.json()) as { slots: Slot[] };
        if (active) setResult({ key, slots: data.slots, error: null });
      } catch {
        if (active) {
          setResult({
            key,
            slots: null,
            error: "Could not load availability. Check your connection.",
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [date, key, router]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const current = result?.key === key ? result : null;
  return {
    slots: current?.slots ?? null,
    error: current?.error ?? null,
    loading: current === null,
    reload,
  };
}

/** Keeps a period list at a stable 8 rows while availability is in flight. */
export function placeholderSlots(): Slot[] {
  return Array.from({ length: 8 }, (_, i) => ({
    period: i + 1,
    booked: false,
    bookedBy: null,
    classSubject: null,
  }));
}
