# Deploying the Lab Booking System

A runbook for putting this app online and keeping it there. Follow it top to
bottom the first time; after that only "Routine deploys" and "Schema changes"
matter.

Plan reference: [plan/09-deployment.md](../plan/09-deployment.md).

## What was decided

The app deploys to **Vercel**, with **Neon Postgres** (via the Vercel
Marketplace) as the production database. Local development keeps using the
Homebrew Postgres on your laptop — same schema, same migrations, different
database. Nothing about the code changes between the two.

## 0. Before you start

You need:

- The repo pushed to GitHub.
- A Vercel account with access to create a project.
- The Gmail and Twilio credentials from
  [plan/08-external-services.md](../plan/08-external-services.md) — production
  will not work without them, and a missing one fails at *runtime*, not at
  build time.

Install the CLI once (everything below can also be done in the dashboard):

```bash
npm i -g vercel
vercel login
```

## 1. Create the project

```bash
vercel link          # from the repo root; creates .vercel/ (already gitignored)
```

Or import the GitHub repo at vercel.com/new. Framework detection picks Next.js;
leave the build and output settings alone — the `build` script in
`package.json` does the extra work.

## 2. Provision Neon Postgres

```bash
vercel integration add neon
```

Or: Vercel dashboard → project → Storage → Neon. Pick the region closest to the
school; every request pays that round trip.

The integration writes the connection strings into the project's environment
variables automatically. Check what landed:

```bash
vercel env ls
```

You need **two** database URLs, and they are not interchangeable:

| Variable | Neon value | Used by |
| --- | --- | --- |
| `DATABASE_URL` | the **pooled** string — host contains `-pooler` | the app, every request |
| `DIRECT_DATABASE_URL` | the **unpooled** string — no `-pooler` | `prisma migrate deploy` only |

Serverless functions open a connection per instance; without the pooler,
Postgres hits its connection limit under even light concurrency. Migrations,
conversely, need session state a pooler will not give them.

If the integration only set `DATABASE_URL`, copy the unpooled string from the
Neon console and add it yourself:

```bash
vercel env add DIRECT_DATABASE_URL production
```

## 3. Set the rest of the environment

Vercel **does not read your local `.env`**. Every key in
[`.env.example`](../.env.example) must exist in Project Settings →
Environment Variables for **Production**:

- [ ] `DATABASE_URL` (pooled)
- [ ] `DIRECT_DATABASE_URL` (unpooled)
- [ ] `TEACHER_USERNAME`
- [ ] `TEACHER_PASSWORD`
- [ ] `SESSION_SECRET` — generate a fresh one for production: `openssl rand -base64 32`
- [ ] `GMAIL_USER`
- [ ] `GMAIL_APP_PASSWORD`
- [ ] `RECIPIENT_EMAILS` — comma-separated, no spaces
- [ ] `TWILIO_ACCOUNT_SID`
- [ ] `TWILIO_AUTH_TOKEN`
- [ ] `TWILIO_WHATSAPP_FROM` — keeps the literal `whatsapp:` prefix
- [ ] `TWILIO_WHATSAPP_TO`

Do not reuse the development `SESSION_SECRET`: it signs login cookies, and a
leaked dev value would let anyone mint a valid session.

Verify the credentials themselves — separately from the deploy — by pulling
them down and running the Step 8 smoke test:

```bash
vercel env pull .env.production.local
node --env-file=.env.production.local scripts/check-services.mjs --dry   # env only
node --env-file=.env.production.local scripts/check-services.mjs         # actually sends
```

`.env.production.local` is gitignored by the `.env*` rule. Delete it when done.

## 4. Deploy

```bash
vercel deploy --prod
```

The build script runs three things, in order:

```
prisma generate && prisma migrate deploy && next build
```

- `prisma generate` — the client is generated into `app/generated/prisma/`,
  which is gitignored, so it does not exist in a fresh checkout. Without this
  step the build fails on a missing module. It also defeats Vercel's
  `node_modules` cache serving a stale client after a schema change.
- `prisma migrate deploy` — applies pending migrations to the production
  database, using `DIRECT_DATABASE_URL`. It never resets data (unlike
  `prisma migrate dev`, which must **never** be pointed at production).
  A failed migration fails the deploy, which is the behaviour you want.
- `next build` — the app itself.

## 5. Post-deploy checks

Run these against the real URL, once:

- [ ] `/login` loads; visiting `/book` while logged out redirects there
- [ ] Logging in with the production `TEACHER_USERNAME` / `TEACHER_PASSWORD` works
- [ ] A real booking round-trips and shows up in the Neon database
- [ ] Both emails arrive, and the WhatsApp message reaches the lab in-charge
- [ ] The double-booking guard still holds: book the same date and period twice,
      second attempt is refused
- [ ] Teachers can reach the URL on the school network, on phones

To look at production data:

```bash
DATABASE_URL="<the pooled Neon URL>" npx prisma studio
```

## Preview deployments

⚠️ Preview builds inherit Production environment variables unless Preview has
its own. That means **a test booking on a preview URL sends a real email and a
real WhatsApp message to the lab in-charge**, and writes to the production
database.

Pick one before anyone opens a preview URL:

- Give Preview its own values — a separate Neon branch for the two database
  URLs, and blank notification vars. Blank is safe: `lib/notify.ts` builds its
  clients per call, so a missing credential fails that one channel, gets
  logged, and leaves the booking itself successful. Nothing is sent, and
  nothing crashes. Or
- Turn preview deployments off for this project.

## Routine deploys

Pushing to the default branch deploys to production automatically once the repo
is connected. Otherwise `vercel deploy --prod`. Nothing else is required — the
build script handles the client and the migrations.

## Schema changes

1. Change `prisma/schema.prisma`.
2. Locally: `npx prisma migrate dev --name <what_changed>` — this creates the
   migration file. Commit it.
3. Deploy. `prisma migrate deploy` applies it to production during the build.

Never run `prisma migrate dev` or `prisma migrate reset` with production
credentials in the environment.

## Rollback

```bash
vercel rollback           # previous production deployment
```

Code rolls back; **migrations do not**. A deploy that added a column leaves the
column in place. For anything destructive, take a Neon branch or snapshot
first.

## Known gaps

Named here so they are not a surprise. All out of scope for v1:

- **Backups.** Neon's free tier keeps limited history — check the retention
  setting against how much a term's bookings are worth. Losing them is cheap
  but annoying.
- **No cancellation or edit.** A wrongly-booked slot can only be fixed by hand
  in the database. This will come up in the first week; decide then whether to
  build it.
- **No booking list view.** Availability is visible one date at a time; nobody
  can see the week at a glance. Likely the first feature request.
- **One shared login.** Every teacher uses the same credentials, so a booking's
  `teacherName` is self-reported and unverified.
