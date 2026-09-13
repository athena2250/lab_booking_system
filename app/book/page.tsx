"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Slot = {
  period: number;
  booked: boolean;
  bookedBy: string | null;
  classSubject: string | null;
};

/** Today in school-local time. `toISOString()` is UTC and would read as
 *  yesterday before 05:30 IST. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

type Result = { key: string; slots: Slot[] | null; error: string | null };

type Status =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

export default function BookPage() {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [teacherName, setTeacherName] = useState("");
  const [classSubject, setClassSubject] = useState("");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  // Bumping this refetches the current date; changing the date does the same.
  // Together they form the key every fetched result is stamped with.
  const [reloadToken, setReloadToken] = useState(0);
  const key = `${date}#${reloadToken}`;

  const [result, setResult] = useState<Result | null>(null);
  const [pick, setPick] = useState<{ date: string; period: number } | null>(
    null,
  );

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

    // A response for a superseded key must never paint itself over the current
    // one — that stale-data window is the whole reason this page exists.
    return () => {
      active = false;
    };
  }, [date, key, router]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // Availability and the chosen period are each stamped with the date they
  // belong to, so nothing from one date can be read while another is showing.
  const current = result?.key === key ? result : null;
  const slots = current?.slots ?? null;
  const loadError = current?.error ?? null;
  const period = pick?.date === date ? pick.period : null;
  const loading = current === null;
  const selected = slots?.find((s) => s.period === period) ?? null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    // Client-side checks are a courtesy to the teacher; the server revalidates.
    if (period === null) {
      setStatus({ kind: "error", message: "Pick a period first." });
      return;
    }
    if (selected?.booked) {
      setStatus({ kind: "error", message: "That period is already booked." });
      return;
    }
    if (!teacherName.trim()) {
      setStatus({ kind: "error", message: "Your name is required." });
      return;
    }
    if (!classSubject.trim()) {
      setStatus({ kind: "error", message: "Class/subject is required." });
      return;
    }

    setStatus(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          period,
          teacherName: teacherName.trim(),
          classSubject: classSubject.trim(),
          purpose: purpose.trim() || null,
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const body = await res.json().catch(() => null);

      if (res.status === 201) {
        // The slot is reserved either way; only the notification can have
        // failed. Say so rather than letting the lab in-charge be missed.
        setStatus({
          kind: "success",
          message:
            body?.notified === false
              ? `Booked Period ${period} on ${date}, but the notification could not be sent \u2014 please inform the lab in-charge.`
              : `Booked Period ${period} on ${date}.`,
        });
        // Keep the name — one teacher often books several slots in a row.
        setPick(null);
        setClassSubject("");
        setPurpose("");
        reload();
        return;
      }

      if (res.status === 409) {
        setStatus({
          kind: "error",
          message: `Period ${period} just got booked by someone else.`,
        });
        setPick(null);
        reload();
        return;
      }

      setStatus({
        kind: "error",
        message: body?.error ?? "Could not book that slot. Try again.",
      });
    } catch {
      setStatus({
        kind: "error",
        message: "Network error. Check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Lab Booking</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Pick a date and a free period. Booked periods show who has them.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Date
            <input
              type="date"
              name="date"
              required
              value={date}
              min={today()}
              onChange={(e) => {
                setStatus(null);
                setDate(e.target.value);
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base font-normal outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
            />
          </label>

          <fieldset disabled={loading} className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">Period</legend>

            {loadError && (
              <p
                role="alert"
                className="mt-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
              >
                {loadError}{" "}
                <button
                  type="button"
                  onClick={reload}
                  className="font-medium underline"
                >
                  Retry
                </button>
              </p>
            )}

            <div className="mt-1 flex flex-col divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {(slots ?? placeholderSlots()).map((slot) => {
                const disabled = loading || slot.booked;
                return (
                  <label
                    key={slot.period}
                    className={`flex min-h-12 items-center gap-3 px-3 py-3 text-base ${
                      disabled
                        ? "cursor-not-allowed bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500"
                        : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="radio"
                      name="period"
                      value={slot.period}
                      checked={period === slot.period}
                      disabled={disabled}
                      onChange={() => {
                        setPick({ date, period: slot.period });
                        setStatus(null);
                      }}
                      className="h-5 w-5 accent-zinc-900 dark:accent-zinc-100"
                    />
                    <span className="font-medium">Period {slot.period}</span>
                    {slot.booked && slot.bookedBy && (
                      <span className="ml-auto text-right text-sm">
                        booked by {slot.bookedBy}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {loading && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Loading availability…
              </p>
            )}
          </fieldset>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Teacher name
            <input
              type="text"
              name="teacherName"
              autoComplete="name"
              required
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base font-normal outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Class/Subject
            <input
              type="text"
              name="classSubject"
              required
              value={classSubject}
              onChange={(e) => setClassSubject(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base font-normal outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Purpose{" "}
            <span className="font-normal text-zinc-500">(optional)</span>
            <input
              type="text"
              name="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base font-normal outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
            />
          </label>

          {status && (
            <p
              role="alert"
              className={`rounded-md px-3 py-2 text-sm ${
                status.kind === "success"
                  ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              {status.message}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || loading}
            className="h-12 rounded-md bg-zinc-900 px-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {submitting ? "Booking…" : "Book slot"}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Keeps the list at a stable 8 rows while availability is in flight. */
function placeholderSlots(): Slot[] {
  return Array.from({ length: 8 }, (_, i) => ({
    period: i + 1,
    booked: false,
    bookedBy: null,
    classSubject: null,
  }));
}
