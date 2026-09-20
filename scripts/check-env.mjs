/**
 * Step 9 deployment preflight — plan/09-deployment.md.
 *
 * Turns the runbook's manual "set every var" checklist into a build failure.
 *
 * The problem this exists for: Vercel does not read the local `.env`, and
 * nothing in the app reads its configuration at import time — `lib/notify.ts`
 * builds its clients per call and `lib/auth.ts` reads SESSION_SECRET inside
 * the HMAC helper, both deliberately, so one missing credential degrades one
 * channel instead of crashing every route. The cost of that design is that a
 * forgotten variable is invisible until a teacher makes a real booking and
 * something silently does not arrive. This script moves that discovery to
 * build time, where it is free.
 *
 *   node scripts/check-env.mjs            # infer the target from VERCEL_ENV
 *   node scripts/check-env.mjs --env=production
 *   node scripts/check-env.mjs --warn-only        # report, never exit non-zero
 *
 * The key list is read from `.env.example` rather than hardcoded, so a new
 * variable cannot be added to the app and forgotten here.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const option = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
};
const warnOnly = argv.includes("--warn-only");

// VERCEL_ENV is "production" | "preview" | "development" on Vercel, and unset
// on a laptop. Anything that is not a production build is treated leniently.
const target = option("env") ?? process.env.VERCEL_ENV ?? "development";
const isProduction = target === "production";

// ------------------------------------------------------------- the key list

/** Every key named in .env.example, in file order. */
function keysFromEnvExample() {
  const file = path.join(ROOT, ".env.example");
  if (!fs.existsSync(file)) {
    console.error("✗ .env.example is missing — it is the list of required keys.");
    process.exit(1);
  }
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line.trim())?.[1])
    .filter(Boolean);
}

// Vars the app cannot start without: without these there is no database and
// no way to sign in at all — TEACHER_USERNAME/PASSWORD seed the bootstrap
// account, so a deploy missing them has no way in until someone creates an
// account by hand. These fail the build in every environment.
const CRITICAL = new Set([
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "TEACHER_USERNAME",
  "TEACHER_PASSWORD",
  "SESSION_SECRET",
]);

// The notification credentials are only critical in production. Leaving them
// blank on Preview is the setup plan/09-deployment.md actively recommends, so
// that a test booking on a preview URL cannot email the principal — failing
// the build on it would break the safe configuration.
// Keys with a working default in code. Absent is a legitimate configuration,
// so an unset one is not worth even a warning.
const OPTIONAL = new Set(["TEACHER_NAME"]);

function severityFor(key) {
  if (CRITICAL.has(key)) return "error";
  if (OPTIONAL.has(key)) return "optional";
  return isProduction ? "error" : "warn";
}

// ------------------------------------------------------------- value checks
// Cheap format checks only, for the mistakes that otherwise surface as an
// opaque error from Postgres, Gmail or Twilio far from their cause.

const VALIDATORS = {
  DATABASE_URL(value) {
    if (!/^postgres(ql)?:\/\//.test(value)) {
      return { level: "error", message: 'must be a postgresql:// URL' };
    }
    // Neon hands out both; only the pooled one survives serverless concurrency.
    if (isProduction && !value.includes("-pooler")) {
      return {
        level: "warn",
        message:
          "does not look like Neon's pooled host (no '-pooler'). Serverless " +
          "functions open a connection per instance and will exhaust the limit.",
      };
    }
    return null;
  },
  DIRECT_DATABASE_URL(value) {
    if (!/^postgres(ql)?:\/\//.test(value)) {
      return { level: "error", message: "must be a postgresql:// URL" };
    }
    if (isProduction && value.includes("-pooler")) {
      return {
        level: "error",
        message:
          "is the pooled host, but `prisma migrate deploy` needs the unpooled " +
          "one — a pooler cannot hold the session state migrations require.",
      };
    }
    return null;
  },
  SESSION_SECRET(value) {
    // It keys an HMAC over the session cookie; a short one is guessable.
    if (value.length < 32) {
      return {
        level: isProduction ? "error" : "warn",
        message: `is only ${value.length} chars. Use: openssl rand -base64 32`,
      };
    }
    return null;
  },
  RECIPIENT_EMAILS(value) {
    const list = value.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.some((address) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address))) {
      return { level: "error", message: "contains an address that is not an email" };
    }
    if (value !== value.trim() || /,\s/.test(value)) {
      return { level: "warn", message: "should be comma-separated with no spaces" };
    }
    if (list.length < 2) {
      return {
        level: "warn",
        message: `has ${list.length} recipient; the plan expects the HOD and the principal`,
      };
    }
    return null;
  },
  TWILIO_WHATSAPP_FROM: whatsappNumber,
  TWILIO_WHATSAPP_TO: whatsappNumber,
};

function whatsappNumber(value) {
  // lib/notify.ts passes these straight to Twilio, so a dropped prefix fails
  // at the API with an error that names nothing useful.
  if (!/^whatsapp:\+\d{6,}$/.test(value)) {
    return {
      level: "error",
      message: 'must keep the literal prefix and be E.164, e.g. "whatsapp:+14155238886"',
    };
  }
  return null;
}

// ---------------------------------------------------------------- the check

const errors = [];
const warnings = [];

console.log(`Checking environment for: ${target}`);

for (const key of keysFromEnvExample()) {
  const value = process.env[key]?.trim();

  if (!value) {
    const level = severityFor(key);
    // An unset optional key is the documented default, not a finding.
    if (level === "optional") continue;
    const note =
      level === "warn"
        ? `${key} is not set (fine here; required in production)`
        : `${key} is not set`;
    (level === "error" ? errors : warnings).push(note);
    continue;
  }

  const problem = VALIDATORS[key]?.(value);
  if (problem) {
    (problem.level === "error" ? errors : warnings).push(
      `${key} ${problem.message}`,
    );
  }
}

for (const warning of warnings) console.warn(`  ! ${warning}`);
for (const error of errors) console.error(`  ✗ ${error}`);

if (errors.length === 0) {
  const tail = warnings.length ? ` (${warnings.length} warning(s))` : "";
  console.log(`✓ Environment OK for ${target}${tail}.`);
  process.exit(0);
}

console.error(
  `\n✗ ${errors.length} problem(s) in the ${target} environment.\n` +
    "  Vercel does not read your local .env — set these in Project Settings →\n" +
    `  Environment Variables, or with \`vercel env add <NAME> ${target}\`.\n` +
    "  The full list and what each value is: docs/DEPLOYMENT.md §3.",
);
process.exit(warnOnly ? 0 : 1);
