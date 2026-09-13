# Step 10 — End-to-End Verification

**Status:** 🟡 Automated rows done and passing (19/19 on a production build,
2026-09-14). Sections E1–E4, F and G are unstarted — they need a real inbox, a
real phone, a real network and a real teacher, and the app is **not** ready to
hand over until they are done.

Run this before handing the URL to teachers. Type checks and unit tests don't
tell you whether a teacher can book a lab and whether three people found out.

## How to run it

```bash
npm run verify              # sections A–D + the E5/E6 property, against `next dev`
npm run verify -- --prod    # the same, against `next build && next start` — the pre-handover run
npm run verify -- --live-notifications   # E5/E6 for real: sends real messages
npm run verify -- --base-url=https://your-deployment   # a deployed instance
```

[`scripts/verify.mjs`](../scripts/verify.mjs) starts its own server on port
3210, drives it over HTTP the way a browser does, and reads the rows back with
`psql` — a different tool than the one that wrote them, which is the point of
C3 and D4. It prints one line per checklist row and exits non-zero on any
failure. Rows only a person can answer are printed as `☐` at the end rather
than quietly dropped.

Two things worth knowing before you read a green run as more than it is:

- **It writes to the database it is pointed at.** All of its bookings are on
  dates in 2099, and it deletes everything from `2099-01-01` onward before and
  after each run. Point it at local Postgres. Never at production.
- **By default no real email or WhatsApp is sent.** The spawned server gets
  *empty* notification credentials. That is not a way of dodging section E —
  it means every booking in sections C and D is made through a server whose
  notifications are broken, which is exactly the property E5 and E6 exist to
  check. Real delivery is E1–E4, and only a person can confirm it.

## A. Auth

| # | Action | Expected | |
|---|---|---|---|
| A1 | Visit `/book` logged out | Redirects to `/login` | ✅ auto |
| A2 | `curl /api/availability?date=2026-09-14` logged out | `401`, not a redirect | ✅ auto |
| A3 | Log in with wrong password | Error shown, no cookie set | ✅ auto |
| A4 | Log in with correct credentials | Lands on `/book` | ✅ auto |
| A5 | Reload the page | Still logged in | ✅ auto |
| A6 | Edit the cookie value in devtools | Next request bounces to `/login` | ✅ auto |

A6 forges two different lies, not one: a tampered signature, and an extended
expiry carrying the signature that was only ever valid for the original. The
second is the one a naive "is it expired?" check would let through.

## B. Availability

| # | Action | Expected | |
|---|---|---|---|
| B1 | Open `/book` | Today's date preselected, availability already loaded | ✅ auto |
| B2 | Fresh date, no bookings | All 8 periods selectable | ✅ auto |
| B3 | Change the date | List refetches; previously selected period is cleared | 🟡 server side auto |
| B4 | `?date=2026-02-31` | `400` | ✅ auto |

B1 asserts on the *served HTML*, not just the API: the date input must arrive
with today's Asia/Kolkata date already in it, so no teacher sees an empty date
field flash before hydration.

B3 is split. That each date reports only its own bookings is checked; that the
selected radio clears when the date changes is client state
([`app/book/page.tsx`](../app/book/page.tsx) stamps the pick with its date) and
is confirmed in the F2 pass on a real device.

B4 covers seven malformed inputs, not one: `2026-02-31`, `2026-13-01`, the
unpadded `2026-9-1`, a full ISO timestamp, junk, empty, and the parameter
omitted entirely.

## C. Booking

| # | Action | Expected | |
|---|---|---|---|
| C1 | Book Period 3 | Confirmation shown; Period 3 flips to booked | ✅ auto |
| C2 | Reload the page | Period 3 still booked — proves it's in the DB, not client state | ✅ auto |
| C3 | Check Postgres | Exactly one row, `date` at `00:00:00` UTC | ✅ auto |
| C4 | Submit with a blank teacher name | `400`, clear message | ✅ auto |
| C5 | Double-click submit | Only one booking created | ✅ auto |

C2 re-reads through a **second, independent session**, so nothing it sees can
be client-side state.

C3 reads the stored timestamp raw. `Booking.date` is `timestamp without time
zone` holding the UTC wall clock, so an `AT TIME ZONE 'UTC'` in the check would
re-project it into the session's zone and report `05:30` on an Indian laptop —
which is how this row first failed, in the checking query rather than in the
data. It also asserts the row reads back on the same calendar day through the
API, which is the failure the row is really guarding against.

C4 tries `""`, whitespace, `null` and a missing field, and then confirms the
rejected slot is still free.

## D. The race (the whole point)

| # | Action | Expected | |
|---|---|---|---|
| D1 | Two tabs, same date, both load availability showing Period 5 free | — | ✅ auto |
| D2 | Book Period 5 in tab 1 | `201`, success | ✅ auto |
| D3 | Book Period 5 in tab 2 | `409` and a readable "just got booked" message — **not** a crash or a stack trace | ✅ auto |
| D4 | Check Postgres | Exactly one row for that slot | ✅ auto |

Automated as **four** concurrent requests across two sessions, not two: two
requests can be serialised by luck, and this is the one row that must not pass
by accident. The check asserts one `201`, three `409`s, no `5xx`, and that each
409 message names the period, says it was booked, and contains no stack trace.

Observed: `[201, 409, 409, 409]` → *"Period 5 was just booked by someone
else."*, one row in Postgres, held by the tab that got the 201.

If D3 shows a 500, the `P2002` handling in [Step 6](06-booking-api.md) is wrong.
This is the test that matters most — it's the failure the Google Form had.

## E. Notifications

| # | Action | Expected | |
|---|---|---|---|
| E1 | Make a booking | Both email recipients receive it; date + period visible in the subject line | ☐ **manual** |
| E2 | Same booking | Recipient receives **exactly one** WhatsApp message | ☐ **manual** |
| E3 | Inspect the WhatsApp message | Contains an English block *and* a Kannada block | ☐ **manual** |
| E4 | **Ask the recipient to read it on their phone** | Kannada renders as text, not tofu boxes; wording is natural to them | ☐ **manual** |
| E5 | Break `GMAIL_APP_PASSWORD`, book | Booking still succeeds (`201`); WhatsApp still arrives; failure logged | 🟡 half auto |
| E6 | Break the Twilio token, book | Booking still succeeds; email still arrives | 🟡 half auto |

Every default run proves the half of E5/E6 that costs nothing: with both
channels broken a booking still returns `201`, reports `notified: false`, logs
one failure line per channel, and really holds the slot. The other half — that
breaking *one* channel leaves the other one delivering — sends real messages,
so it is behind `--live-notifications`, which boots a server per case with that
one credential corrupted and asserts only the broken channel logged a failure.

E1–E4 stay manual and are not optional. E4 in particular is not a formality: it
is the requirement that motivated the bilingual message, and it can only be
confirmed by the person it was built for. The Kannada wording in
[`lib/messages.ts`](../lib/messages.ts) has still not been read by a native
speaker — see the warning at the top of that file, and ask the recipient
whether they would rather read "ಅವಧಿ" or "ಪೀರಿಯಡ್".

`npm run check:services` ([Step 8](08-external-services.md)) is the faster
first move here: it proves the credentials are live before you spend a real
booking finding out they aren't.

## F. Real-device pass

| # | Action | Expected | |
|---|---|---|---|
| F1 | Open on a phone (~400px) | No horizontal scroll; radios are comfortably tappable | ☐ **manual** |
| F2 | Book a slot from the phone | Works end to end | ☐ **manual** |
| F3 | Open on the school network | Reachable | ☐ **manual** |

F3 can't start until [Step 9](09-deployment.md) is actually provisioned —
nothing is deployed yet.

## G. Dry run with a real teacher

☐ **manual.** Have **one teacher who hasn't seen it** book a slot with no
instructions, while you watch without helping.

Every question they ask out loud is a UI fix. This catches what no checklist
does — whether "Period 4 — booked by Mrs. Rao" reads as *unavailable* or as
*selectable*, and whether they understand the booking was sent to anyone.

## Found by this pass

- **`app/layout.tsx` still carried the scaffold's metadata** — the browser tab
  and any phone-home-screen bookmark read "Create Next App". Fixed to "Lab
  Booking". Exactly the class of thing F and G exist to catch, found early only
  because the B1 check reads the served HTML.
- **C3 failed on its first run in the checking query, not in the app** — see
  the note under section C. Worth knowing, because the same `AT TIME ZONE`
  reflex would misread the data in any future debugging session.

## Reset between test runs

`npm run verify` cleans up after itself. To clear everything by hand:

```bash
psql -h localhost -p 5432 -U "$(whoami)" -d lab_booking_system -c 'TRUNCATE "Booking";'
```

Local development database only. Never point this at production.
