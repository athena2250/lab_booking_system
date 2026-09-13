# Step 2 — Database & Prisma

**Status:** ✅ Done (local dev only — production DB still open, see [Step 9](09-deployment.md))

## Goal

A `Booking` table that makes double-booking impossible at the database level, plus a Prisma client the app can import.

## Database

Uses the **local Homebrew Postgres 17** instance already running on this machine (the one DBeaver connects to, alongside `mverick`, `ai_os_assistant_view`, `quantara`). Local auth is trust-based, so no password.

```bash
psql -h localhost -p 5432 -U "$(whoami)" -d postgres -c "CREATE DATABASE lab_booking_system;"
```

Also registered as a DBeaver connection named `lab_booking_system` in
`~/Library/DBeaverData/workspace6/General/.dbeaver/data-sources.json`.

> If DBeaver was open when that file was edited, restart it — a running instance can overwrite the file on close.

## Connection string

`.env` (gitignored via the `.env*` rule):

```
DATABASE_URL="postgresql://rithvikat@localhost:5432/lab_booking_system?schema=public"
```

## Schema

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../app/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Booking {
  id           String   @id @default(cuid())
  date         DateTime
  period       Int
  teacherName  String
  classSubject String
  purpose      String?
  createdAt    DateTime @default(now())

  @@unique([date, period])
}
```

`@@unique([date, period])` is the core safety property: two teachers submitting the same slot at the same moment cannot both succeed. [Step 6](06-booking-api.md) turns the resulting error into a friendly message.

### Date convention

`date` is **date-only, stored as UTC midnight**. Always construct it as `new Date(\`${yyyyMmDd}T00:00:00.000Z\`)` — never from a local-time `Date`, or the unique constraint silently stops working (two "same day" rows with different times both insert fine).

This parsing lives in one place — `lib/slots.ts` (see [Step 4](04-availability-api.md)) — so no route re-implements it.

## Migration

```bash
npx prisma migrate dev --name init
```

Created `prisma/migrations/20260913160747_init/` and generated the client.

## Prisma client singleton

`lib/db.ts`:

```ts
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

The singleton matters in dev: Next.js hot-reload would otherwise open a new connection pool on every edit until Postgres refuses connections.

## Notes / gotchas

- **Prisma version is pinned to 6.x deliberately.** Installing `prisma` unpinned resolved to an `8.0.0-rc` release candidate, which uses a different config format, generated no `schema.prisma`, and added a `postinstall: prisma skills sync` hook plus `.cursor/.agents/.devin/.claude` skill directories. All of that was removed and the dependency pinned to `prisma@6` / `@prisma/client@6` (6.19.3).
- This Prisma version uses the newer `prisma-client` generator, which emits **no `index.ts`**. Import from `@/app/generated/prisma/client`, not `@/app/generated/prisma`.
- Generated client output `app/generated/prisma/` is already gitignored — so **`prisma generate` must run on every fresh clone and in CI/build** (see [Step 9](09-deployment.md)).
- `prisma.config.ts` loads `.env` via `dotenv/config`. Next.js loads `.env` on its own, but standalone scripts need `import "dotenv/config"` explicitly.

## Acceptance criteria

- [x] `lab_booking_system` database exists on local Postgres
- [x] `Booking` table exists with the `Booking_date_period_key` unique index (verified via `psql -d lab_booking_system -c '\d "Booking"'`)
- [x] `npx tsc --noEmit` passes with `lib/db.ts` in place
- [x] Runtime check succeeded: `prisma.booking.count()` returned `0`
