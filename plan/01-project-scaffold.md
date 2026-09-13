# Step 1 — Project Scaffold

**Status:** ✅ Done

## Goal

Get a runnable Next.js app in this repo so every later step has somewhere to live.

## What was done

Scaffolded with `create-next-app` into the existing repo (the pre-existing `README.md` and `plan.md` were moved aside during scaffolding and restored afterwards, since `create-next-app` refuses to run in a non-empty directory).

```bash
npx create-next-app@latest . --typescript --eslint --tailwind --app \
  --no-src-dir --import-alias "@/*" --use-npm
```

## Resulting stack

| Thing | Version / choice |
|---|---|
| Next.js | 16.3.5, App Router |
| React | 19.2.8 |
| TypeScript | ^5 |
| Tailwind CSS | v4 (via `@tailwindcss/postcss`) |
| Directory layout | no `src/` — `app/` at repo root |
| Import alias | `@/*` → `./*` |
| Package manager | npm |

## Layout

```
app/
  layout.tsx
  page.tsx
  globals.css
public/
lib/                 # added by hand in Step 2
plan/                # these planning docs
eslint.config.mjs
next.config.ts
postcss.config.mjs
tsconfig.json
```

## Dependencies installed for later steps

- `prisma`, `@prisma/client` — Step 2
- `nodemailer`, `@types/nodemailer` — Step 7 (email)
- `twilio` — Step 7 (WhatsApp)
- `dotenv` (dev) — required by `prisma.config.ts`

## Notes / gotchas

- `create-next-app` also generated an `AGENTS.md` and `CLAUDE.md` at the repo root. Harmless; delete if unwanted.
- The README keeps the original project description at the top, with the generated Next.js boilerplate below it.

## Acceptance criteria

- [x] `npm run dev` boots and serves the default page on `http://localhost:3000`
- [x] `npx tsc --noEmit` passes
- [x] `plan.md` and the original README description survived the scaffold
