# Step 10 — End-to-End Verification

**Status:** 🟡 Every row a machine can answer is done and passing (22/22 on a
production build, 2026-09-16). What remains is blocked on things this repo does
not contain: **the external services are not provisioned** (`RECIPIENT_EMAILS`,
the Gmail and Twilio credentials are all unset, so E1–E4 cannot be attempted at
all), **nothing is deployed** (F3), and F1/F2/G need a real phone and a real
teacher. The app is **not** ready to hand over.

Three rows moved from ☐ to half-auto in this pass — E1, E2 and E3 each had a
half that turned out to be decidable here. See section E.

Run this before handing the URL to teachers. Type checks and unit tests don't
tell you whether a teacher can book a lab and whether three people found out.

## How to run it

```bash
npm run verify              # sections A–D, E1a/E2a/E3a and the E5/E6 property, against `next dev`
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
| E1a | Compose the email | Subject names the date and the period | ✅ auto |
| E1b | Check the recipient list | `RECIPIENT_EMAILS` holds two valid, distinct addresses | ☐ **unset** |
| E1 | Make a booking | Both email recipients actually receive it | ☐ **manual** |
| E2a | Make a booking | The app makes **exactly one** WhatsApp attempt; the duplicate 409 makes none | ✅ auto |
| E2 | Same booking | Recipient's phone buzzes **once** | ☐ **manual** |
| E3a | Compose the WhatsApp body | One body, English block then Kannada block, values verbatim in both | ✅ auto |
| E3 | Inspect the delivered message | Both blocks survive WhatsApp's own rendering | ☐ **manual** |
| E4 | **Ask the recipient to read it on their phone** | Kannada renders as text, not tofu boxes; wording is natural to them | ☐ **manual** |
| E5 | Break `GMAIL_APP_PASSWORD`, book | Booking still succeeds (`201`); WhatsApp still arrives; failure logged | 🟡 half auto |
| E6 | Break the Twilio token, book | Booking still succeeds; email still arrives | 🟡 half auto |

Every default run proves the half of E5/E6 that costs nothing: with both
channels broken a booking still returns `201`, reports `notified: false`, logs
one failure line per channel, and really holds the slot. The other half — that
breaking *one* channel leaves the other one delivering — sends real messages,
so it is behind `--live-notifications`, which boots a server per case with that
one credential corrupted and asserts only the broken channel logged a failure.

**E1a and E3a read the real `lib/messages.ts`**, transpiled to a scratch
directory and imported — not a copy of the templates, which could drift. E1a
formats its expected date with its own `Intl` call rather than the app's
`formatDateLong`, because a check that reuses the code under test can only ever
agree with it. E3a asserts English leads, that the two blocks are one body
rather than two messages, and that the teacher's own values survive verbatim
into both — which is the property the no-translation-API decision rests on.

**E2a counts, it does not look.** With the credentials blanked, every send
fails loudly, so the server's own log is an exact count of attempts. One
booking must produce exactly one WhatsApp line and one email line, and the
double-submit that gets a `409` must produce none — a teacher who taps twice
must not make the recipient's phone buzz twice. That is the half of E2 that
does not need the phone.

**E1b is reported as ☐, not ✗.** `RECIPIENT_EMAILS` is unset, which is a
Step 8 gap rather than a bug, so a default run stays green while the row stays
loudly open. Once it is set, a list with one address or a malformed one
*fails*. The same gap makes `--live-notifications` refuse to start rather than
break one of two already-broken channels and report something confusing.

E1–E4 stay manual and are not optional. E4 in particular is not a formality: it
is the requirement that motivated the bilingual message, and it can only be
confirmed by the person it was built for. The Kannada wording in
[`lib/messages.ts`](../lib/messages.ts) has still not been read by a native
speaker — see the warning at the top of that file, and ask the recipient
whether they would rather read "ಅವಧಿ" or "ಪೀರಿಯಡ್", and whether the Kannada
date reading "ಸೆಪ್ಟೆಂಬರ್ 14" (month first, which is what ICU does for `kn-IN`)
is right when the English line above it says "14 September".

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

F1 and F2 stayed manual on purpose rather than for want of trying: the honest
version of F1 needs a real rendering engine, and "comfortably tappable" is a
human judgement even then. A headless-browser check of `scrollWidth` at 400px
would cover part of F1 and the client half of B3, at the cost of a browser
download in the dev dependencies — worth doing if this checklist is ever run
by someone who is not holding the phone.

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
- **The Kannada date renders month-first** — `formatDateKannada` produces
  "ಸೋಮವಾರ, ಸೆಪ್ಟೆಂಬರ್ 14, 2026", not the day-first order the doc comment in
  [`lib/messages.ts`](../lib/messages.ts) claimed. That is ICU's `kn-IN` locale
  data rather than a bug, and the comment has been corrected — but it is now on
  the list of things to put to the native speaker in E4, because the English
  block directly above it reads "14 September".
- **No notification credential is set in this checkout**, which is why E1b
  reports unset. `npm run check:services` will fail until
  [Step 8](08-external-services.md) is provisioned, and E1–E4 cannot begin
  before that.

## Reset between test runs

`npm run verify` cleans up after itself. To clear everything by hand:

```bash
psql -h localhost -p 5432 -U "$(whoami)" -d lab_booking_system -c 'TRUNCATE "Booking";'
```

Local development database only. Never point this at production.
