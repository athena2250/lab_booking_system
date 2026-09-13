# Step 10 — End-to-End Verification

**Status:** ⬜ Not started

Run this before handing the URL to teachers. Type checks and unit tests don't tell you whether a teacher can book a lab and whether three people found out.

## A. Auth

| # | Action | Expected |
|---|---|---|
| A1 | Visit `/book` logged out | Redirects to `/login` |
| A2 | `curl /api/availability?date=2026-09-14` logged out | `401`, not a redirect |
| A3 | Log in with wrong password | Error shown, no cookie set |
| A4 | Log in with correct credentials | Lands on `/book` |
| A5 | Reload the page | Still logged in |
| A6 | Edit the cookie value in devtools | Next request bounces to `/login` |

## B. Availability

| # | Action | Expected |
|---|---|---|
| B1 | Open `/book` | Today's date preselected, availability already loaded |
| B2 | Fresh date, no bookings | All 8 periods selectable |
| B3 | Change the date | List refetches; previously selected period is cleared |
| B4 | `?date=2026-02-31` | `400` |

## C. Booking

| # | Action | Expected |
|---|---|---|
| C1 | Book Period 3 | Confirmation shown; Period 3 flips to booked |
| C2 | Reload the page | Period 3 still booked — proves it's in the DB, not client state |
| C3 | Check Postgres | Exactly one row, `date` at `00:00:00` UTC |
| C4 | Submit with a blank teacher name | `400`, clear message |
| C5 | Double-click submit | Only one booking created |

## D. The race (the whole point)

| # | Action | Expected |
|---|---|---|
| D1 | Two tabs, same date, both load availability showing Period 5 free | — |
| D2 | Book Period 5 in tab 1 | `201`, success |
| D3 | Book Period 5 in tab 2 | `409` and a readable "just got booked" message — **not** a crash or a stack trace |
| D4 | Check Postgres | Exactly one row for that slot |

If D3 shows a 500, the `P2002` handling in [Step 6](06-booking-api.md) is wrong. This is the test that matters most — it's the failure the Google Form had.

## E. Notifications

| # | Action | Expected |
|---|---|---|
| E1 | Make a booking | Both email recipients receive it; date + period visible in the subject line |
| E2 | Same booking | Recipient receives **exactly one** WhatsApp message |
| E3 | Inspect the WhatsApp message | Contains an English block *and* a Kannada block |
| E4 | **Ask the recipient to read it on their phone** | Kannada renders as text, not tofu boxes; wording is natural to them |
| E5 | Break `GMAIL_APP_PASSWORD`, book | Booking still succeeds (`201`); WhatsApp still arrives; failure logged |
| E6 | Break the Twilio token, book | Booking still succeeds; email still arrives |

E4 is not a formality. It is the requirement that motivated the bilingual message, and it can only be confirmed by the person it was built for.

## F. Real-device pass

| # | Action | Expected |
|---|---|---|
| F1 | Open on a phone (~400px) | No horizontal scroll; radios are comfortably tappable |
| F2 | Book a slot from the phone | Works end to end |
| F3 | Open on the school network | Reachable |

## G. Dry run with a real teacher

Have **one teacher who hasn't seen it** book a slot with no instructions, while you watch without helping.

Every question they ask out loud is a UI fix. This catches what no checklist does — whether "Period 4 — booked by Mrs. Rao" reads as *unavailable* or as *selectable*, and whether they understand the booking was sent to anyone.

## Reset between test runs

```bash
psql -h localhost -p 5432 -U "$(whoami)" -d lab_booking_system -c 'TRUNCATE "Booking";'
```

Local development database only. Never point this at production.
