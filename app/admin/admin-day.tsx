"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar } from "@/app/components/month-calendar";
import { useSchoolClock } from "@/app/components/use-school-clock";
import {
  PERIODS,
  formatDateOnlyLong,
  formatPeriodTime,
  isPastPeriod,
  type Period,
} from "@/lib/slots";
import type { DaySlot } from "@/app/api/admin/day/route";

/** The day's slots, refetched whenever the date changes or `reload` is called.
 *  Every result is stamped with the key it was fetched for, so a response for a
 *  date the admin has already clicked past can't paint over the current one. */
function useAdminDay(date: string) {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const key = `${date}#${reloadToken}`;
  const [result, setResult] = useState<{
    key: string;
    slots: DaySlot[] | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const res = await fetch(`/api/admin/day?date=${date}`, {
          cache: "no-store",
        });
        if (!active) return;
        if (res.status === 401 || res.status === 403) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));

        const data = (await res.json()) as { slots: DaySlot[] };
        if (active) setResult({ key, slots: data.slots, error: null });
      } catch {
        if (active) {
          setResult({
            key,
            slots: null,
            error: "Could not load that day. Check your connection.",
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

function placeholder(): DaySlot[] {
  return PERIODS.map((period) => ({ period, booking: null }));
}

type Booking = NonNullable<DaySlot["booking"]>;

/** How a booking's notifications came out, as one verdict. "Not recorded" is
 *  deliberately not "failed": nobody knows whether those messages arrived. */
function verdict(b: Booking): "sent" | "failed" | "unrecorded" {
  if (!b.notifiedAt) return "unrecorded";
  return b.email.status === "SENT" && b.whatsapp.status === "SENT"
    ? "sent"
    : "failed";
}

export function AdminDay({ today }: { today: string }) {
  const now = useSchoolClock();
  const [date, setDate] = useState(today);
  const { slots, error, loading, reload } = useAdminDay(date);

  const shown = slots ?? placeholder();
  const past = (period: number) => isPastPeriod(date, period as Period, now);

  // Period kept alongside the booking, so "who is in today" can name the
  // periods without looking each one back up.
  const claimed = shown.flatMap((s) =>
    s.booking ? [{ period: s.period, booking: s.booking }] : [],
  );
  const bookings = claimed.map((c) => c.booking);
  const teachers = [...new Set(bookings.map((b) => b.teacherName))];

  const failed = bookings.filter((b) => verdict(b) === "failed").length;
  const unrecorded = bookings.filter((b) => verdict(b) === "unrecorded").length;
  const allSent = bookings.length > 0 && failed === 0 && unrecorded === 0;

  return (
    <section>
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display m-0 mb-1 text-[19px] font-semibold tracking-[-0.02em]">
            {date === now.date ? "Today" : "That day"}
          </h2>
          <p className="text-muted-3 m-0 text-[14px]">
            {formatDateOnlyLong(date)}
          </p>
        </div>
        {date !== now.date && (
          <button
            type="button"
            onClick={() => setDate(now.date)}
            className="border-edge-strong text-muted-2 hover:text-fg cursor-pointer rounded-[10px] border px-3.5 py-2 text-[13px]"
          >
            Back to today
          </button>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-6 lg:grid-cols-[320px_1fr]">
        <div>
          <h3
            id="admin-calendar-heading"
            className="text-muted-2 m-0 mb-3 text-xs tracking-[0.14em] uppercase"
          >
            Pick a day
          </h3>
          <MonthCalendar
            value={date}
            onChange={setDate}
            labelledBy="admin-calendar-heading"
            allowPast
          />
          <p className="text-muted-3 mt-3 text-[12.5px] leading-[1.5]">
            Past days can be opened here — that is usually where a failed
            notification is found.
          </p>

          {!loading && !error && (
            <div className="border-edge bg-surface mt-4 rounded-[14px] border p-4">
              <h3 className="text-muted-2 m-0 mb-2.5 text-xs tracking-[0.14em] uppercase">
                Teachers booked
              </h3>
              {teachers.length === 0 ? (
                <p className="text-muted-3 m-0 text-[13.5px]">
                  Nobody has the lab this day.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {teachers.map((name) => (
                    <li key={name} className="text-fg-2 text-[13.5px]">
                      {name}
                      <span className="text-muted-3">
                        {" · "}
                        {claimed
                          .filter((c) => c.booking.teacherName === name)
                          .map((c) => `P${c.period}`)
                          .join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
            <NotificationSummary
              loading={loading}
              total={bookings.length}
              failed={failed}
              unrecorded={unrecorded}
              allSent={allSent}
            />
          )}

          <ul
            aria-busy={loading}
            className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-3 p-0"
          >
            {shown.map((slot) => (
              <SlotCard
                key={slot.period}
                slot={slot}
                isPast={past(slot.period)}
                loading={loading}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function NotificationSummary({
  loading,
  total,
  failed,
  unrecorded,
  allSent,
}: {
  loading: boolean;
  total: number;
  failed: number;
  unrecorded: number;
  allSent: boolean;
}) {
  if (loading) {
    return <p className="text-muted-3 mb-5 text-[13.5px]">Loading…</p>;
  }
  if (total === 0) {
    return (
      <p className="text-muted-3 mb-5 text-[13.5px]">
        Nothing booked, so there was nothing to notify.
      </p>
    );
  }

  // Both counts are reported whenever both exist. Leading with the failures
  // alone would say "1 of 3" on a day where two bookings are unconfirmed, and
  // the whole point of this line is that the admin can trust it.
  const tone = failed > 0 ? "bad" : unrecorded > 0 ? "unknown" : "good";
  const parts: string[] = [];
  if (failed > 0) {
    parts.push(`${failed} did not reach everyone — see the red periods below`);
  }
  if (unrecorded > 0) {
    parts.push(
      `${unrecorded} has no delivery record, so nobody can tell whether those messages went out`,
    );
  }
  const text = allSent
    ? `All ${total} booking${total === 1 ? "" : "s"} notified — email and WhatsApp both went out.`
    : `Of ${total} booking${total === 1 ? "" : "s"}, ${parts.join("; and ")}.`;

  return (
    <p
      className={`mb-5 rounded-[10px] border px-3.5 py-3 text-[13.5px] ${
        tone === "bad"
          ? "border-[rgba(255,90,54,0.35)] bg-[rgba(255,90,54,0.08)] text-accent-3"
          : tone === "unknown"
            ? "border-edge bg-ink-2 text-muted"
            : "border-[rgba(62,207,142,0.3)] bg-[rgba(62,207,142,0.07)] text-ok"
      }`}
    >
      <span className="mr-2 font-semibold">
        {allSent
          ? "All notifications sent"
          : failed > 0
            ? "Check these"
            : "Not confirmed"}
      </span>
      {text}
    </p>
  );
}

function SlotCard({
  slot,
  isPast,
  loading,
}: {
  slot: DaySlot;
  isPast: boolean;
  loading: boolean;
}) {
  const b = slot.booking;
  const state = b ? verdict(b) : null;

  return (
    <li
      className={`flex min-h-[150px] flex-col gap-[7px] rounded-[14px] border p-4 ${
        !b
          ? isPast
            ? "border-line bg-ink-2 opacity-55"
            : "border-edge-strong bg-surface"
          : state === "failed"
            ? "border-[rgba(255,90,54,0.45)] bg-[rgba(255,90,54,0.05)]"
            : "border-[#1e1e22] bg-ink-2"
      } ${loading ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-[15px] font-semibold">
          Period {slot.period}
        </span>
        <span
          className={`size-[7px] rounded-full ${
            !b ? (isPast ? "bg-[#33333a]" : "bg-ok") : "bg-faint"
          }`}
        />
      </div>
      <span className="text-muted-3 font-mono text-[11.5px] tracking-[0.02em]">
        {formatPeriodTime(slot.period as Period)}
      </span>

      {loading ? (
        <span className="text-muted-3 text-[13.5px]">…</span>
      ) : !b ? (
        <span className="text-muted-3 mt-auto text-[13.5px]">
          {isPast ? "Over — nobody used it" : "Free"}
        </span>
      ) : (
        <>
          <span className="text-fg text-[14px] font-semibold">
            {b.teacherName}
          </span>
          <span className="text-muted-3 text-[13px] leading-[1.45]">
            {[b.classSubject, b.purpose].filter(Boolean).join(" — ")}
          </span>
          <Delivery booking={b} />
        </>
      )}
    </li>
  );
}

/** The two channels, side by side. Both have to be green for the three
 *  recipients to have actually been told. */
function Delivery({ booking }: { booking: Booking }) {
  if (!booking.notifiedAt) {
    return (
      <div className="border-line mt-auto border-t pt-2.5">
        <span className="text-faint text-[12px]">
          Delivery not recorded — booked before this was tracked, or the send
          never finished.
        </span>
      </div>
    );
  }

  const failures = [
    booking.email.status === "FAILED" ? booking.email.error : null,
    booking.whatsapp.status === "FAILED" ? booking.whatsapp.error : null,
  ].filter(Boolean) as string[];

  return (
    <div className="border-line mt-auto flex flex-col gap-1.5 border-t pt-2.5">
      <div className="flex flex-wrap gap-1.5">
        <Pill label="Email" status={booking.email.status} />
        <Pill label="WhatsApp" status={booking.whatsapp.status} />
      </div>
      {failures.length > 0 && (
        <details className="text-accent-3 text-[11.5px]">
          <summary className="cursor-pointer">Why it failed</summary>
          {failures.map((message) => (
            <p
              key={message}
              className="text-muted-3 m-0 mt-1 font-mono text-[11px] leading-[1.4] break-words"
            >
              {message}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}

function Pill({ label, status }: { label: string; status: Booking["email"]["status"] }) {
  const tone =
    status === "SENT"
      ? "border-[rgba(62,207,142,0.35)] text-ok"
      : status === "FAILED"
        ? "border-[rgba(255,90,54,0.45)] text-accent-3"
        : "border-edge text-faint";
  return (
    <span
      className={`rounded-[6px] border px-1.5 py-0.5 text-[10.5px] tracking-[0.05em] uppercase ${tone}`}
    >
      {label} {status === "SENT" ? "✓" : status === "FAILED" ? "✕" : "—"}
    </span>
  );
}
