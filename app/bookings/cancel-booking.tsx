"use client";

import { useState, useTransition } from "react";
import { cancelBooking } from "@/app/admin/actions";

/**
 * Frees a period. Two clicks, because the row is deleted outright and a
 * mis-click would silently un-book a lesson somebody is planning around —
 * the teacher gets no notification either way.
 */
export function CancelBooking({
  id,
  label,
}: {
  id: string;
  /** What is being cancelled, for the confirm prompt: "Asha Rao, P3 on 21 Sep". */
  label: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(id);
      // On success the row is gone with the revalidation, so there is nothing
      // left to render a message into. Only a failure needs saying.
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  if (error) {
    return (
      <span className="text-accent-3 text-[12.5px]" role="alert">
        {error}
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Cancel ${label}`}
        className="border-edge text-muted-3 hover:text-fg hover:border-edge-strong cursor-pointer rounded-[8px] border px-2.5 py-1.5 text-[12.5px]"
      >
        Cancel
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className="border-accent-edge-strong text-accent-2 hover:bg-accent-tint cursor-pointer rounded-[8px] border px-2.5 py-1.5 text-[12.5px] disabled:opacity-60"
      >
        {pending ? "Cancelling…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-muted-3 hover:text-fg cursor-pointer px-1.5 py-1.5 text-[12.5px]"
      >
        Keep
      </button>
    </span>
  );
}
