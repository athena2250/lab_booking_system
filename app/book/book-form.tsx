"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

const FIELD =
  "bg-field border-edge-strong text-fg focus:border-accent w-full rounded-[10px] border px-3.5 py-3.5 text-[15px] outline-none";
const LABEL = "text-muted mb-2 block text-[13px]";
const PRIMARY =
  "bg-accent text-ink cursor-pointer rounded-[10px] text-[15px] font-semibold disabled:opacity-60";
const SECONDARY =
  "border-edge-strong text-fg cursor-pointer rounded-[10px] border px-5 py-3.5 text-[14.5px] font-medium no-underline";

/** What the last submit produced. The form, the receipt and the clash notice
 *  are the same route rather than three — the teacher never navigates away
 *  from a booking they are still in the middle of making. */
type Outcome =
  | { kind: "confirmed"; date: string; period: number; teacherName: string; classSubject: string; notified: boolean }
  | { kind: "clash"; date: string; period: number }
  | null;

/** The booking form. `teacherName` is the signed-in teacher's name, read from
 *  the session by the page that renders this — it is not an input any more, and
 *  the server ignores it in the request body either way. */
export function BookForm({ teacherName }: { teacherName: string }) {
  const router = useRouter();
  const [date, setDate, now] = useBookableDate();
  const [classSubject, setClassSubject] = useState("");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const { slots, error: loadError, loading, reload } = useAvailability(date);

  // The chosen period is stamped with the date it belongs to, so a pick made
  // for one date can never be submitted against another.
  const [pick, setPick] = useState<{ date: string; period: number } | null>(
    null,
  );
  // A pick also lapses when its period ends while the form is still open, so
  // the teacher can never submit a slot the clock has already taken away.
  const period =
    pick?.date === date && !isPastPeriod(date, pick.period as Period, now)
      ? pick.period
      : null;
  const selected = slots?.find((s) => s.period === period) ?? null;

  function changeDate(next: string) {
    setError(null);
    setOutcome(null);
    setDate(next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    // Client-side checks are a courtesy to the teacher; the server revalidates.
    if (period === null) return setError("Pick a period first.");
    if (selected?.booked) return setError("That period is already booked.");
    if (isPastPeriod(date, period as Period, now))
      return setError("That period has already ended. Pick a later one.");
    if (!classSubject.trim()) return setError("Class/subject is required.");

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No teacher name: the server attributes the booking to the session,
        // so sending one would be ignored anyway.
        body: JSON.stringify({
          date,
          period,
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
        setOutcome({
          kind: "confirmed",
          date,
          period,
          teacherName,
          classSubject: classSubject.trim(),
          notified: body?.notified !== false,
        });
        setPick(null);
        setClassSubject("");
        setPurpose("");
        reload();
        return;
      }

      if (res.status === 409) {
        setOutcome({ kind: "clash", date, period });
        setPick(null);
        reload();
        return;
      }

      setError(body?.error ?? "Could not book that slot. Try again.");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (outcome?.kind === "confirmed") {
    return (
      <Confirmed outcome={outcome} onBookAnother={() => setOutcome(null)} />
    );
  }

  if (outcome?.kind === "clash") {
    // Whoever won the race is in the availability we refetched on the 409.
    const holder = slots?.find((s) => s.period === outcome.period);
    return (
      <Clash
        outcome={outcome}
        heldBy={
          holder?.booked
            ? [holder.bookedBy, holder.classSubject].filter(Boolean).join(" — ")
            : null
        }
        onPickAnother={() => setOutcome(null)}
      />
    );
  }

  const shown = slots ?? placeholderSlots();

  return (
    <main className="mx-auto grid w-full max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-6 px-6 pt-9 pb-25">
      <form
        onSubmit={handleSubmit}
        className="border-edge bg-surface rounded-[18px] border p-7.5"
      >
        <h1 className="font-display m-0 mb-1.5 text-2xl font-semibold tracking-[-0.02em]">
          Book the lab
        </h1>
        <p className="text-muted-3 m-0 mb-6.5 text-[14.5px]">
          Pick a date, then a free period. Past days, finished periods and
          taken periods can&rsquo;t be selected.
        </p>

        <span id="date-label" className={LABEL}>
          Date — {formatDateOnlyLong(date)}
        </span>
        <div className="mb-5.5">
          <MonthCalendar
            value={date}
            onChange={changeDate}
            labelledBy="date-label"
          />
        </div>

        <fieldset disabled={loading} className="m-0 border-0 p-0">
          <legend className={LABEL}>Period</legend>

          {loadError && (
            <p
              role="alert"
              className="text-accent-3 mb-2.5 rounded-[10px] border border-[rgba(255,90,54,0.35)] bg-[rgba(255,90,54,0.08)] px-3.5 py-3 text-sm"
            >
              {loadError}{" "}
              <button
                type="button"
                onClick={reload}
                className="cursor-pointer font-semibold underline"
              >
                Retry
              </button>
            </p>
          )}

          <div className="mb-5.5 flex flex-col gap-2">
            {shown.map((slot) => {
              const isSelected = period === slot.period;
              const isPast = isPastPeriod(date, slot.period as Period, now);
              const disabled = loading || slot.booked || isPast;
              return (
                <label
                  key={slot.period}
                  className={`bg-field flex w-full items-center justify-between gap-3 rounded-[10px] border px-3.5 py-3 text-left ${
                    isSelected
                      ? "border-accent bg-[rgba(255,90,54,0.08)]"
                      : "border-edge"
                  } ${
                    disabled
                      ? "text-muted-3 cursor-not-allowed"
                      : "text-fg cursor-pointer"
                  } ${isPast ? "opacity-55" : ""}`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="period"
                      value={slot.period}
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => {
                        setPick({ date, period: slot.period });
                        setError(null);
                      }}
                      className="accent-accent size-[15px] shrink-0"
                    />
                    <span className="flex flex-col">
                      <span
                        className={`text-[14.5px] font-medium ${
                          isPast ? "line-through" : ""
                        }`}
                      >
                        Period {slot.period}
                      </span>
                      <span className="text-muted-3 font-mono text-[11px]">
                        {formatPeriodTime(slot.period as Period)}
                      </span>
                    </span>
                  </span>
                  <span
                    className={`text-[12.5px] ${
                      slot.booked || isPast ? "text-muted-3" : "text-ok"
                    }`}
                  >
                    {loading
                      ? "…"
                      : slot.booked
                        ? (slot.bookedBy ?? "Taken")
                        : isPast
                          ? "Over"
                          : "Free"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <span className={LABEL}>Teacher</span>
        <p className="border-edge bg-field text-muted mb-4 flex items-center justify-between gap-3 rounded-[10px] border px-3.5 py-3.5 text-[15px]">
          {teacherName}
          <span className="text-muted-3 text-[12.5px]">
            from your sign-in
          </span>
        </p>

        <label htmlFor="classSubject" className={LABEL}>
          Class &amp; subject
        </label>
        <input
          id="classSubject"
          type="text"
          name="classSubject"
          required
          placeholder="e.g. 9B — acids and bases"
          value={classSubject}
          onChange={(e) => setClassSubject(e.target.value)}
          className={`${FIELD} mb-4`}
        />

        <label htmlFor="purpose" className={LABEL}>
          Purpose <span className="text-muted-3">(optional)</span>
        </label>
        <input
          id="purpose"
          type="text"
          name="purpose"
          placeholder="e.g. practical, needs the fume hood"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          className={`${FIELD} mb-6`}
        />

        {error && (
          <p
            role="alert"
            className="text-accent-3 mb-4 rounded-[10px] border border-[rgba(255,90,54,0.35)] bg-[rgba(255,90,54,0.08)] px-3.5 py-3 text-sm"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || loading}
          className={`${PRIMARY} w-full py-3.5`}
        >
          {submitting ? "Booking…" : "Confirm booking"}
        </button>
      </form>

      <aside className="border-edge bg-ink-2 rounded-[18px] border p-7.5">
        <h2 className="text-muted-2 m-0 mb-4.5 text-xs tracking-[0.14em] uppercase">
          On confirm
        </h2>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {[
            ["Principal — email", "English"],
            ["Science HOD — email", "English"],
            [
              "Lab in-charge — WhatsApp",
              "English and Kannada, from a fixed template",
            ],
          ].map(([who, how]) => (
            <li key={who} className="grid grid-cols-[auto_1fr] items-start gap-3.5">
              <span className="bg-accent mt-[7px] size-2 rounded-full" />
              <span>
                <span className="block text-[14.5px] font-semibold">{who}</span>
                <span className="text-muted-3 block text-[13.5px] leading-[1.5]">
                  {how}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="border-line text-muted-2 mt-6 border-t pt-5 text-[13px] leading-[1.55]">
          A failed notification never fails the booking. The slot is already
          committed by then.
        </p>
      </aside>
    </main>
  );
}

function Confirmed({
  outcome,
  onBookAnother,
}: {
  outcome: Extract<Outcome, { kind: "confirmed" }>;
  onBookAnother: () => void;
}) {
  return (
    <main className="grid flex-1 place-items-center px-6 py-10">
      <div className="border-edge bg-surface w-full max-w-[520px] rounded-[18px] border p-9">
        <span className="text-ok mb-5.5 grid size-11 place-items-center rounded-xl border border-[rgba(62,207,142,0.35)] bg-[rgba(62,207,142,0.14)] text-xl">
          ✓
        </span>
        <h1 className="font-display m-0 mb-2 text-[25px] font-semibold tracking-[-0.02em]">
          Lab booked
        </h1>
        <p className="text-muted-3 m-0 mb-6.5 text-[14.5px]">
          The slot is held. Nobody else can take it.
        </p>

        <dl className="border-edge m-0 overflow-hidden rounded-xl border">
          {[
            ["Date", formatDateOnlyLong(outcome.date)],
            ["Period", `Period ${outcome.period}`],
            ["Teacher", outcome.teacherName],
            ["Class", outcome.classSubject],
          ].map(([label, value], i, all) => (
            <div
              key={label}
              className={`flex justify-between gap-4 px-4 py-3.5 ${
                i === all.length - 1 ? "" : "border-line border-b"
              }`}
            >
              <dt className="text-muted-3 text-sm">{label}</dt>
              <dd className="m-0 text-right text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        {outcome.notified ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="border-edge text-muted rounded-[7px] border px-2.5 py-1.5 text-[12.5px]">
              2 emails sent
            </span>
            <span className="border-edge text-muted rounded-[7px] border px-2.5 py-1.5 text-[12.5px]">
              WhatsApp sent · EN + KN
            </span>
          </div>
        ) : (
          // The slot is reserved either way; only the notification failed. Say
          // so rather than letting the lab in-charge be silently missed.
          <p
            role="alert"
            className="text-accent-3 mt-5 rounded-[10px] border border-[rgba(255,90,54,0.35)] bg-[rgba(255,90,54,0.08)] px-3.5 py-3 text-sm"
          >
            The booking is held, but a notification could not be sent — please
            tell the lab in-charge yourself.
          </p>
        )}

        <div className="mt-6.5 flex flex-wrap gap-2.5">
          <Link href="/availability" className={`${PRIMARY} px-5 py-3.5 no-underline`}>
            Back to availability
          </Link>
          <button type="button" onClick={onBookAnother} className={SECONDARY}>
            Book another period
          </button>
          <Link href="/my" className={SECONDARY}>
            See my bookings
          </Link>
        </div>
      </div>
    </main>
  );
}

function Clash({
  outcome,
  heldBy,
  onPickAnother,
}: {
  outcome: Extract<Outcome, { kind: "clash" }>;
  heldBy: string | null;
  onPickAnother: () => void;
}) {
  return (
    <main className="grid flex-1 place-items-center px-6 py-10">
      <div className="w-full max-w-[520px] rounded-[18px] border border-[rgba(255,90,54,0.35)] bg-[#141012] p-9">
        <span className="text-accent mb-5.5 grid size-11 place-items-center rounded-xl border border-[rgba(255,90,54,0.4)] bg-[rgba(255,90,54,0.14)] text-xl">
          !
        </span>
        <h1 className="font-display m-0 mb-2 text-[25px] font-semibold tracking-[-0.02em]">
          That period was just taken
        </h1>
        <p className="text-muted m-0 mb-6 text-[15px] leading-[1.6] text-pretty">
          Someone confirmed Period {outcome.period} on{" "}
          {formatDateOnlyLong(outcome.date)} a few seconds before you. Nothing
          was booked for you and nobody was notified.
        </p>

        {heldBy && (
          <div className="mb-6 rounded-xl border border-[#2a2126] p-4">
            <p className="text-muted-3 m-0 mb-1.5 text-[13px]">Now held by</p>
            <p className="m-0 text-[15px] font-semibold">{heldBy}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onPickAnother}
            className={`${PRIMARY} px-5 py-3.5`}
          >
            Pick another period
          </button>
          <Link href="/availability" className={SECONDARY}>
            See what&rsquo;s free
          </Link>
        </div>
      </div>
    </main>
  );
}
