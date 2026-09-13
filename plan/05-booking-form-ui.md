# Step 5 — Booking Form UI

**Status:** ✅ Done (submit path awaits `POST /api/bookings` from [Step 6](06-booking-api.md))

## Goal

The teacher-facing page. Same shape as the Google Form they already know — a date, a radio list of Period 1–8, a few text fields — but the periods that are already taken are visibly unavailable.

## Files

| File | Purpose |
|---|---|
| `app/book/page.tsx` | The form (client component) |
| `app/page.tsx` | Redirect `/` → `/book` |

## Layout

```
Lab Booking

Date          [ 2026-09-14        ▾ ]

Period        ( ) Period 1
              ( ) Period 2
              (•) Period 3
              ( ) Period 4  — booked by Mrs. Rao
              ( ) Period 5
              ...

Teacher name  [____________________]
Class/Subject [____________________]
Purpose       [____________________]  (optional)

              [ Book slot ]
```

Booked periods render as **disabled radios**, greyed, with the holder's name beside them. Showing them (rather than hiding them) keeps the list at a stable 8 rows and tells the teacher *who* has it.

## Behaviour

1. Default the date to **today** and fetch availability immediately, so the page is useful on arrival.
2. On every date change, refetch. Clear any selected period — a selection made for one date must never carry over to another.
3. While fetching, disable the radio group and show a loading state. Never show a stale date's availability next to a newly picked date.
4. On submit, `POST /api/bookings`, then:
   - **201** → success message, refetch availability, reset the period selection (keep the teacher name — the same teacher often books several slots).
   - **409** → "Period 3 just got booked by someone else." Refetch so the list updates in place.
   - **401** → session expired, redirect to `/login`.
   - **400** → show the field error.
5. Disable the submit button while in flight, so a double-click can't fire two bookings.

## Sketch

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

type Slot = { period: number; booked: boolean; bookedBy: string | null };

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function BookPage() {
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [period, setPeriod] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAvailability = useCallback(async () => {
    setSlots(null);
    const res = await fetch(`/api/availability?date=${date}`);
    if (res.status === 401) { window.location.href = "/login"; return; }
    const data = await res.json();
    setSlots(data.slots);
  }, [date]);

  useEffect(() => {
    setPeriod(null);
    void loadAvailability();
  }, [loadAvailability]);

  // ...form submit handler
}
```

Note `setPeriod(null)` living in the same effect as the date-driven refetch — that coupling is the bug-preventer, not incidental.

### A note on `today()`

`new Date().toISOString()` is **UTC**, so between 00:00 and 05:30 IST it returns yesterday's date. For a school lab that's an edge case nobody will hit, but if it matters, derive the local date explicitly:

```ts
function today() {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now); // YYYY-MM-DD
}
```

## Validation before submit

- A period must be selected, and it must not be a booked one.
- Teacher name and class/subject are required, trimmed, non-empty.
- Server revalidates all of this ([Step 6](06-booking-api.md)) — client validation is for the teacher's benefit, not for safety.

## Should past dates be blocked?

Set `min={today()}` on the date input to steer teachers forward, but **don't hard-block past dates server-side** — someone recording a booking they already made on paper is a legitimate case. A soft nudge in the UI, no server rule.

## Styling

Tailwind v4 is already set up. Keep it plain: one centred column, `max-w-xl`, generous tap targets on the radios (teachers will use phones), high-contrast disabled state. No component library.

## Acceptance criteria

- [x] `/` redirects to `/book`
- [x] Page loads with today's date and its availability already populated
- [x] Changing the date refetches and clears the previously selected period
- [x] Booked periods are disabled, greyed, and show the holder's name
- [x] Successful booking shows confirmation and the period immediately flips to booked — coded; verify once [Step 6](06-booking-api.md) exists
- [x] Submitting a slot taken in another tab shows the 409 message and refreshes the list — coded; verify once [Step 6](06-booking-api.md) exists
- [x] Submit button cannot be double-fired
- [x] Usable at 400px width
