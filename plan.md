# Lab Booking System — Implementation Plan

Detailed plan for each step lives in [`plan/`](plan/). This file is the index and the shared context.

## Context

The lab is currently booked through a Google Form that shows no availability, so two teachers can claim the same period and nobody finds out until the clash. This replaces it with a small web app that:

1. Shows a teacher **live availability** for a chosen date before they pick a slot.
2. **Notifies three people automatically** when a booking is made — 2 by email, 1 by WhatsApp **in English and Kannada**, because that recipient isn't comfortable in English and an English-only message means they effectively aren't told.

## Steps

| # | Step | Status |
|---|---|---|
| 1 | [Project scaffold](plan/01-project-scaffold.md) | ✅ Done |
| 2 | [Database & Prisma](plan/02-database-and-prisma.md) | ✅ Done (local dev) |
| 3 | [Shared login (auth gate)](plan/03-auth-login.md) | ✅ Done |
| 4 | [Availability API](plan/04-availability-api.md) | ⬜ |
| 5 | [Booking form UI](plan/05-booking-form-ui.md) | ⬜ |
| 6 | [Booking API & double-booking protection](plan/06-booking-api.md) | ⬜ |
| 7 | [Notifications (email + bilingual WhatsApp)](plan/07-notifications.md) | ⬜ |
| 8 | [External service setup](plan/08-external-services.md) | 🟡 Repo side done — blocked on Gmail/Twilio accounts |
| 9 | [Deployment](plan/09-deployment.md) | ⬜ — has an open decision |
| 10 | [End-to-end verification](plan/10-verification.md) | ⬜ |

Steps 3–7 are the build and are best done in order. Step 8 (accounts and credentials) can start any time and **should start early** — the production WhatsApp sender needs Meta approval, which is the longest-lead item in the project.

## Scope decisions

| Decision | Choice |
|---|---|
| Platform | Custom web app (not Forms/Sheets), Next.js on Vercel |
| Labs | One lab |
| Slots | Period 1–8, no clock times — same as the current form |
| Login | One shared username/password, not per-teacher accounts |
| Email | Gmail SMTP (`nodemailer`) to 2 recipients |
| Mobile | WhatsApp via Twilio to 1 recipient |
| Kannada | Fixed template, not a translation API |

## Stack

Next.js 16.3.5 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma 6.19.3 · PostgreSQL · nodemailer · twilio

## Shared conventions

**Dates are date-only, stored as UTC midnight.** Always build them with `new Date(\`${yyyyMmDd}T00:00:00.000Z\`)` via `parseDateOnly()` in `lib/slots.ts`. A local-time `Date` would carry a time component and silently defeat the unique constraint that prevents double-booking. Always format with `timeZone: "UTC"`.

**The database prevents double-booking, not the application.** `@@unique([date, period])` is the guarantee; check-then-insert is a race and must not be used.

**Notifications never fail a booking.** `notifyBooking()` catches its own errors. A committed booking is valid whether or not the messages went out.

**Import Prisma from `@/app/generated/prisma/client`** — this generator emits no `index.ts`.

**Use `proxy.ts`, not `middleware.ts`** — Next.js 16 deprecates the older name. It runs on the Node.js runtime and the `runtime` option is not configurable there.

## Open items

- **Production database** — the app currently points at local Postgres, which Vercel cannot reach. See [Step 9](plan/09-deployment.md).
- **Kannada wording needs a native-speaker review** before go-live, and before any WhatsApp template is submitted to Meta for approval. See [Step 7](plan/07-notifications.md).
- **No cancel/edit and no week view** in v1. Both are likely first requests; see the end of [Step 9](plan/09-deployment.md).
