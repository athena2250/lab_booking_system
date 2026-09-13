# Step 9 — Deployment

**Status:** ⬜ Not started — **contains one open decision**

## ⚠️ Open decision: the production database

[Step 2](02-database-and-prisma.md) set up Postgres on **your laptop** (`localhost:5432`, Homebrew, trust auth). That is right for development and **cannot serve a Vercel deployment** — Vercel's functions run in the cloud and cannot reach `localhost`, and the laptop isn't always on.

So production needs a decision before going live:

### Option A — Hosted Postgres (recommended)

Provision **Neon Postgres** through the Vercel Marketplace (`vercel integration add neon`, or the dashboard). It sets `DATABASE_URL` in the Vercel project automatically, has a free tier that comfortably fits a school lab's booking volume, and is serverless-friendly.

Local development keeps using local Postgres; only the deployed environment uses Neon. Same schema, same migrations.

### Option B — Don't deploy to Vercel

If the school already runs a server, host the app there next to Postgres. Teachers on the school network reach it directly. Removes the hosted-DB dependency and keeps data on-premises, but someone has to own uptime, backups, and TLS.

**Option A is the recommendation**, but this is a school-infrastructure question as much as a technical one — confirm before provisioning anything.

---

## Connection pooling (if Option A)

Serverless functions open a connection per instance and Postgres will exhaust its connection limit under any concurrency. Neon's **pooled connection string** (the `-pooler` host) solves this — use it for `DATABASE_URL`.

Prisma migrations need a **direct** (unpooled) connection, so keep both:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        // pooled — runtime
  directUrl = env("DIRECT_DATABASE_URL") // unpooled — migrations
}
```

## Build configuration

The generated Prisma client (`app/generated/prisma/`) is **gitignored**, so it doesn't exist in a fresh checkout. Without a build step, the deploy fails on a missing module:

```json
{
  "scripts": {
    "build": "prisma generate && next build"
  }
}
```

Vercel also caches `node_modules` between builds, which can serve a stale client after a schema change — `prisma generate` on every build avoids that too.

## Running migrations

Do **not** run `prisma migrate dev` against production (it can reset data). Use:

```bash
npx prisma migrate deploy
```

Either as a one-off against the production `DIRECT_DATABASE_URL`, or wired into the build:

```json
"build": "prisma generate && prisma migrate deploy && next build"
```

Migrating in the build is convenient and fine at this scale; be aware it means a failed migration fails the deploy, which is usually the behaviour you want.

## Deploy

1. Push to GitHub.
2. Import the repo in Vercel (or `vercel link`).
3. Set **every** var from [Step 8](08-external-services.md)'s `.env.example` in Project Settings → Environment Variables, for Production (and Preview if used).
4. Deploy, then run/verify migrations against the production database.

**Vercel does not read your local `.env`** — a missing var surfaces as a runtime crash in a function, not a build error. Check the full list before the first real booking.

## Preview deployments

Preview builds share the production env vars unless overridden — meaning **a test booking on a preview URL sends real emails and a real WhatsApp message to the lab in-charge**. Either give Preview its own dummy/blank notification vars, or don't use preview deployments here.

## Post-deploy checklist

- [ ] Deployed URL serves `/login`; `/book` redirects there when logged out
- [ ] A real booking round-trips and appears in the production database
- [ ] Both emails and the WhatsApp message arrive from the deployed app
- [ ] `next build` shows no middleware-deprecation warning ([Step 3](03-auth-login.md))
- [ ] Teachers can reach the URL on the school network, on phones

## Operational leftovers

Worth naming now, out of scope for v1:

- **Backups.** Neon's free tier retains limited history. A term's bookings are cheap to lose but annoying; check the retention.
- **No cancellation/edit.** A wrongly-booked slot can currently only be fixed in the database by hand. This will come up in the first week — decide then whether to build it.
- **No booking list view.** Nobody can see the week at a glance; they only see availability one date at a time. Likely the first feature request.
