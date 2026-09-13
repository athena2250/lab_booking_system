# lab_booking_system

School lab booking system for teachers. Teachers log in with one shared
staff-room account, pick a date and a free period, and book the lab; the HOD
and principal get an email and the lab in-charge gets a WhatsApp message in
English and Kannada.

See [plan.md](plan.md) for the implementation plan.

## Local development

Requires Node 20+ and a local PostgreSQL.

```bash
cp .env.example .env      # then fill in every value — see plan/08-external-services.md
npx prisma migrate dev    # create the schema
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Locally there is no connection pooler, so `DATABASE_URL` and
`DIRECT_DATABASE_URL` hold the same local connection string. Both are required.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` → `prisma migrate deploy` → `next build` |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm run check:services` | Send a test email and WhatsApp message to prove the credentials work (`--dry` checks env only) |
| `npm run verify` | End-to-end verification — auth, availability, booking, the double-booking race (`--prod` for the pre-handover run). See [plan/10-verification.md](plan/10-verification.md) |

## Deployment

Vercel, with Neon Postgres. The full runbook — environment variables,
migrations, preview-deployment hazards, rollback — is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
