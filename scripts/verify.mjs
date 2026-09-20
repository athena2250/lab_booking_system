/**
 * Step 10 end-to-end verification — plan/10-verification.md.
 *
 * Runs every row of the checklist that a machine can honestly answer, against
 * a real server talking to a real Postgres. It is not a unit test suite: it
 * makes HTTP requests the way a browser does, and reads the database the way
 * `psql` does, because the question Step 10 asks is "can a teacher book a lab
 * and did three people find out", not "do the functions return the right
 * types".
 *
 *   npm run verify                  # sections A-D, plus the E5/E6 property
 *   npm run verify -- --prod        # against `next build && next start`
 *   npm run verify -- --live-notifications
 *   npm run verify -- --base-url=https://…   # a deployment; skips E, needs DB access for C3/D4
 *
 * Rows that only a person can answer — a phone rendering Kannada, a teacher
 * booking unaided — are printed as MANUAL at the end rather than silently
 * dropped. A green run here is a precondition for handing over the URL, not a
 * substitute for sections E1-E4, F and G.
 *
 * By default the spawned server gets EMPTY notification credentials, so no
 * real email or WhatsApp goes out on a verification run. That is deliberate
 * and does double duty: every booking below is made through a server whose
 * notifications are broken, which is exactly the property E5/E6 exist to
 * check — the booking must still succeed.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const PROD = flag("prod");
const LIVE_NOTIFICATIONS = flag("live-notifications");
const EXTERNAL_BASE = option("base-url", null);
const PORT = Number(option("port", "3210"));

// Far-future dates so a verification run can never collide with — or be
// mistaken for — a booking a teacher actually made. Everything at or after
// this date is scratch data and is deleted before and after the run.
const SCRATCH_FROM = "2099-01-01";
const D = {
  auth: "2099-01-02",
  fresh: "2099-01-03",
  booking: "2099-01-04",
  other: "2099-01-05",
  doubleClick: "2099-01-06",
  race: "2099-01-07",
  notify: "2099-01-08",
  notifyCount: "2099-01-11",
};

// ------------------------------------------------------------------ results

const results = [];
const record = (id, title, state, detail) =>
  results.push({ id, title, state, detail });

/** Runs one checklist row. A thrown Error is a failure, not a crash. */
async function check(id, title, fn) {
  try {
    const detail = await fn();
    record(id, title, "pass", detail ?? "");
    console.log(`  ✓ ${id}  ${title}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    const detail = error?.message ?? String(error);
    record(id, title, "fail", detail);
    console.error(`  ✗ ${id}  ${title}\n      ${detail}`);
  }
}

/** A row no machine can answer. Printed at the end so it can't be forgotten. */
function manual(id, title, why) {
  record(id, title, "manual", why);
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectStatus(res, status, label) {
  expect(
    res.status === status,
    `${label}: expected ${status}, got ${res.status}`,
  );
}

// ----------------------------------------------------------------- database
//
// Read through `psql` rather than Prisma: this script must be able to run
// before/without a generated client, and reading the rows with a different
// tool than the one that wrote them is the point of C3 and D4.

let dbUrl = null;

function psqlUrl(raw) {
  // libpq rejects unknown URI parameters, and Prisma's URL carries
  // `?schema=public`.
  const url = new URL(raw);
  url.search = "";
  return url.toString();
}

async function sql(query) {
  const { stdout } = await execFileAsync(
    "psql",
    [dbUrl, "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", query],
    { cwd: ROOT },
  );
  return stdout.trim();
}

async function dbAvailable() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return false;
  try {
    dbUrl = psqlUrl(raw);
    await sql("select 1");
    return true;
  } catch {
    dbUrl = null;
    return false;
  }
}

const clearScratch = () =>
  sql(`DELETE FROM "Booking" WHERE date >= '${SCRATCH_FROM}'`);

// ------------------------------------------------------------------- server

/** Poll until the server answers, so we never race its startup. */
async function waitForServer(base, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`${base}/login`, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not become ready within ${timeoutMs}ms`);
}

/**
 * Spawns the app with `envOverrides` applied on top of the real environment,
 * runs `fn`, and always tears the server down.
 *
 * Overrides win over `.env`: @next/env only fills in variables that are
 * `undefined` in the inherited environment, and an empty string is not
 * undefined — which is how the notification credentials get broken here
 * without touching the file.
 */
async function withServer(envOverrides, fn) {
  const base = `http://127.0.0.1:${PORT}`;
  const bin = path.join(ROOT, "node_modules", ".bin", "next");
  const args = PROD
    ? ["start", "--port", String(PORT)]
    : ["dev", "--port", String(PORT)];

  const child = spawn(bin, args, {
    cwd: ROOT,
    env: { ...process.env, ...envOverrides, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  const collect = (chunk) => {
    log += chunk.toString();
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const ctx = {
    base,
    /** Server-side log output since `mark()`. E5/E6 assert on what it logged. */
    mark: () => log.length,
    since: (at) => log.slice(at),
  };

  try {
    await waitForServer(base, child);
    return await fn(ctx);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 5000))]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

// Every notification variable blanked: `requireEnv` in lib/notify.ts rejects
// immediately, so nothing is dialled out to Gmail or Twilio and a run stays
// fast and offline-safe.
const NOTIFICATIONS_OFF = Object.fromEntries(
  [
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
    "RECIPIENT_EMAILS",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "TWILIO_WHATSAPP_TO",
  ].map((name) => [name, ""]),
);

// --------------------------------------------------------------- HTTP helpers

const SESSION_COOKIE = "lab_session";

function sessionCookie(res) {
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    if (name.trim() === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

async function login(base, { username, password } = {}) {
  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: username ?? process.env.TEACHER_USERNAME,
      password: password ?? process.env.TEACHER_PASSWORD,
    }),
  });
  const value = sessionCookie(res);
  return { res, cookie: value ? `${SESSION_COOKIE}=${value}` : null };
}

const withCookie = (cookie, init = {}) => ({
  ...init,
  redirect: "manual",
  headers: { ...(init.headers ?? {}), cookie },
});

const getAvailability = (base, cookie, date) =>
  fetch(
    `${base}/api/availability?date=${encodeURIComponent(date)}`,
    withCookie(cookie),
  );

const postBooking = (base, cookie, body) =>
  fetch(
    `${base}/api/bookings`,
    withCookie(cookie, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const bookingBody = (date, period, overrides = {}) => ({
  date,
  period,
  teacherName: "Verification Script",
  classSubject: "9A Physics",
  purpose: "Step 10 verification",
  ...overrides,
});

/** Today in school-local time — the same rule app/book/page.tsx uses. */
const todayIST = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );

const looksLikeStackTrace = (text) =>
  /\n\s+at\s+\S+|PrismaClient|node_modules/.test(text);

// ================================================================= sections

async function sectionA(base) {
  console.log("\nA. Auth");

  await check("A1", "GET /book logged out redirects to /login", async () => {
    const res = await fetch(`${base}/book`, { redirect: "manual" });
    expect(
      res.status >= 300 && res.status < 400,
      `expected a redirect, got ${res.status}`,
    );
    const location = res.headers.get("location") ?? "";
    expect(
      new URL(location, base).pathname === "/login",
      `redirected to ${location}, not /login`,
    );
    return `${res.status} → ${new URL(location, base).pathname}`;
  });

  await check("A2", "GET /api/availability logged out is 401, not a redirect", async () => {
    const res = await fetch(`${base}/api/availability?date=${D.auth}`, {
      redirect: "manual",
    });
    expectStatus(res, 401, "availability");
    const body = await res.json();
    expect(typeof body.error === "string", "401 body carried no error message");
    return `401 "${body.error}"`;
  });

  await check("A3", "Wrong password is rejected and sets no cookie", async () => {
    const { res, cookie } = await login(base, { password: "definitely-wrong" });
    expectStatus(res, 401, "login");
    expect(cookie === null, "a session cookie was set for a failed login");
    const body = await res.json();
    expect(typeof body.error === "string", "401 body carried no error message");
    return `401 "${body.error}", no cookie`;
  });

  await check("A4", "Correct credentials sign in and reach /book", async () => {
    const { res, cookie } = await login(base);
    expectStatus(res, 200, "login");
    expect(cookie !== null, "login succeeded but set no session cookie");
    const page = await fetch(`${base}/book`, withCookie(cookie));
    expectStatus(page, 200, "/book");
    return "200, /book served";
  });

  await check("A5", "The session survives a reload", async () => {
    const { cookie } = await login(base);
    for (const attempt of [1, 2]) {
      const page = await fetch(`${base}/book`, withCookie(cookie));
      expectStatus(page, 200, `/book (request ${attempt})`);
    }
    const api = await getAvailability(base, cookie, D.auth);
    expectStatus(api, 200, "availability on the same session");
    return "same cookie, three requests, all accepted";
  });

  await check("A6", "A tampered cookie is rejected", async () => {
    const { cookie } = await login(base);
    const value = cookie.slice(SESSION_COOKIE.length + 1);
    const [expiresAt, signature] = value.split(".");

    // Two separate lies: a forged signature, and an extended expiry carrying
    // the signature that was only ever valid for the original one.
    const forgedSignature = `${expiresAt}.${signature.slice(0, -1)}${
      signature.at(-1) === "A" ? "B" : "A"
    }`;
    const extendedExpiry = `${Number(expiresAt) + 86_400_000}.${signature}`;

    for (const [label, forged] of [
      ["forged signature", forgedSignature],
      ["extended expiry", extendedExpiry],
    ]) {
      const forgedCookie = `${SESSION_COOKIE}=${forged}`;
      const page = await fetch(`${base}/book`, withCookie(forgedCookie));
      expect(
        page.status >= 300 && page.status < 400,
        `${label}: /book returned ${page.status} instead of a redirect`,
      );
      expect(
        new URL(page.headers.get("location") ?? "", base).pathname === "/login",
        `${label}: /book did not bounce to /login`,
      );
      const api = await getAvailability(base, forgedCookie, D.auth);
      expectStatus(api, 401, `${label}: availability`);
    }
    return "forged signature and extended expiry both rejected";
  });
}

async function sectionB(base, cookie) {
  console.log("\nB. Availability");

  await check("B1", "/book preselects today and loads availability", async () => {
    const today = todayIST();
    const page = await fetch(`${base}/book`, withCookie(cookie));
    expectStatus(page, 200, "/book");
    const html = await page.text();
    // The date input is server-rendered with today's value, so the teacher
    // never sees an empty date field flash before hydration.
    expect(
      html.includes(`value="${today}"`),
      `served HTML does not preselect today (${today})`,
    );
    const res = await getAvailability(base, cookie, today);
    expectStatus(res, 200, "availability for today");
    const body = await res.json();
    expect(body.slots?.length === 8, "today's availability was not 8 periods");
    return `${today} preselected, 8 periods returned`;
  });

  await check("B2", "A fresh date offers all 8 periods", async () => {
    const res = await getAvailability(base, cookie, D.fresh);
    expectStatus(res, 200, "availability");
    const { slots } = await res.json();
    expect(slots.length === 8, `expected 8 periods, got ${slots.length}`);
    expect(
      slots.every((s) => s.booked === false && s.bookedBy === null),
      "a period on an unbooked date came back booked",
    );
    expect(
      slots.map((s) => s.period).join(",") === "1,2,3,4,5,6,7,8",
      "periods were not 1-8 in order",
    );
    return "periods 1-8, all selectable";
  });

  await check("B3", "Each date reports only its own bookings", async () => {
    await postBooking(base, cookie, bookingBody(D.other, 1));
    const [booked, untouched] = await Promise.all([
      getAvailability(base, cookie, D.other).then((r) => r.json()),
      getAvailability(base, cookie, D.fresh).then((r) => r.json()),
    ]);
    expect(
      booked.slots.find((s) => s.period === 1)?.booked === true,
      `period 1 on ${D.other} should read as booked`,
    );
    expect(
      untouched.slots.every((s) => !s.booked),
      `a booking on ${D.other} leaked into ${D.fresh}`,
    );
    return `${D.other} P1 booked; ${D.fresh} still clear`;
  });

  await check("B4", "Malformed dates are rejected with 400", async () => {
    const bad = [
      "2026-02-31", // the checklist's case: a date that does not exist
      "2026-13-01",
      "2026-9-1", // unpadded
      "not-a-date",
      "2026-09-14T00:00:00Z",
      "",
    ];
    for (const date of bad) {
      const res = await getAvailability(base, cookie, date);
      expectStatus(res, 400, `date=${JSON.stringify(date)}`);
    }
    const missing = await fetch(`${base}/api/availability`, withCookie(cookie));
    expectStatus(missing, 400, "date omitted entirely");
    return `${bad.length + 1} malformed inputs, all 400`;
  });
}

async function sectionC(base, cookie, hasDb) {
  console.log("\nC. Booking");

  await check("C1", "Booking Period 3 confirms and flips the slot", async () => {
    const res = await postBooking(base, cookie, bookingBody(D.booking, 3));
    expectStatus(res, 201, "booking");
    const body = await res.json();
    expect(body.booking?.period === 3, "response did not echo the booking");
    expect(body.booking?.id, "response carried no booking id");
    expect(typeof body.notified === "boolean", "response omitted `notified`");

    const after = await getAvailability(base, cookie, D.booking).then((r) =>
      r.json(),
    );
    const slot = after.slots.find((s) => s.period === 3);
    expect(slot.booked === true, "Period 3 did not flip to booked");
    // The name comes from the signed-in account, not from the request body, so
    // what matters is that availability reports the same name the booking did.
    // Who that is, is C4's business.
    expect(
      slot.bookedBy === body.booking.teacherName,
      `booked-by read "${slot.bookedBy}", but the booking said "${body.booking.teacherName}"`,
    );
    return `201, Period 3 now "booked by ${slot.bookedBy}"`;
  });

  await check("C2", "The booking survives a reload", async () => {
    // A second, independent session: nothing here can be client-side state.
    const { cookie: freshCookie } = await login(base);
    const res = await getAvailability(base, freshCookie, D.booking);
    expectStatus(res, 200, "availability");
    const { slots } = await res.json();
    expect(
      slots.find((s) => s.period === 3)?.booked === true,
      "Period 3 came back free on a fresh session",
    );
    return "still booked from a new session";
  });

  await check("C3", "Postgres holds exactly one row, dated 00:00:00 UTC", async () => {
    expect(hasDb, "no database access — set DATABASE_URL and install psql");
    // `date` is `timestamp without time zone` holding the UTC wall clock
    // (plan/02-database-and-prisma.md). Read it back raw: an `AT TIME ZONE`
    // here would re-project it into the session's zone and report 05:30 in
    // India — exactly the confusion this row exists to rule out.
    const row = await sql(
      `SELECT count(*), to_char(min(date), 'YYYY-MM-DD HH24:MI:SS') ` +
        `FROM "Booking" WHERE date = TIMESTAMP '${D.booking} 00:00:00' AND period = 3`,
    );
    const [count, stamp] = row.split("|");
    expect(count === "1", `expected 1 row, found ${count}`);
    expect(
      stamp === `${D.booking} 00:00:00`,
      `stored time was ${stamp}, not midnight`,
    );
    // And it must read back as the same calendar day, whatever the server's
    // clock: a booking made from India must not surface as the day before.
    const { slots } = await getAvailability(base, cookie, D.booking).then((r) =>
      r.json(),
    );
    expect(
      slots.find((s) => s.period === 3)?.booked === true,
      `the row stored at ${stamp} did not come back on ${D.booking}`,
    );
    return `1 row, date = ${stamp} UTC, reads back on ${D.booking}`;
  });

  await check(
    "C4",
    "A booking is attributed to the signed-in teacher, not the request body",
    async () => {
      // Teachers sign in as themselves, so the name on a booking comes from the
      // session. A name in the body is ignored — this is what stops one teacher
      // booking in another's name by editing the payload.
      const spoofed = await postBooking(
        base,
        cookie,
        bookingBody(D.booking, 4, { teacherName: "Someone Else" }),
      );
      expectStatus(spoofed, 201, "spoofed teacherName");
      const claimed = (await spoofed.json()).booking?.teacherName;
      expect(
        typeof claimed === "string" && claimed.length > 0,
        "the booking came back with no teacher name",
      );
      expect(
        claimed !== "Someone Else",
        `the body's teacherName was stored — got "${claimed}"`,
      );

      // Omitting it entirely is not a validation error either, for the same
      // reason: the field is not an input any more.
      for (const teacherName of ["", "   ", null, undefined]) {
        const res = await postBooking(
          base,
          cookie,
          bookingBody(D.other, 4, { teacherName }),
        );
        // Only the first of these can win the slot; the rest must lose it to the
        // unique constraint, never to a complaint about the name.
        expect(
          res.status === 201 || res.status === 409,
          `teacherName=${JSON.stringify(teacherName)} gave ${res.status}`,
        );
        const body = await res.json();
        if (res.status === 201) {
          expect(
            body.booking?.teacherName === claimed,
            `attributed to "${body.booking?.teacherName}", not "${claimed}"`,
          );
        }
        expect(
          !looksLikeStackTrace(body.error ?? ""),
          `response leaked internals: ${body.error}`,
        );
      }

      // And the name the API reported is the name the availability list shows.
      const { slots } = await getAvailability(base, cookie, D.booking).then(
        (r) => r.json(),
      );
      expect(
        slots.find((s) => s.period === 4)?.bookedBy === claimed,
        "availability shows a different name than the booking did",
      );
      return `attributed to "${claimed}" from the session, body ignored`;
    },
  );

  await check("C5", "A double-click creates one booking", async () => {
    const body = bookingBody(D.doubleClick, 2);
    const responses = await Promise.all([
      postBooking(base, cookie, body),
      postBooking(base, cookie, body),
    ]);
    const codes = responses.map((r) => r.status).sort();
    expect(
      codes.filter((c) => c === 201).length === 1,
      `expected exactly one 201, got [${codes}]`,
    );
    expect(
      codes.every((c) => c === 201 || c === 409),
      `a double-click produced [${codes}]`,
    );
    if (hasDb) {
      const count = await sql(
        `SELECT count(*) FROM "Booking" WHERE date = TIMESTAMP '${D.doubleClick} 00:00:00' AND period = 2`,
      );
      expect(count === "1", `expected 1 row, found ${count}`);
    }
    return `[${codes}]${hasDb ? ", 1 row" : ""}`;
  });
}

async function sectionD(base, hasDb) {
  console.log("\nD. The race (the whole point)");

  // Two independent sessions — two teachers, two tabs, two browsers.
  const [tab1, tab2] = await Promise.all([login(base), login(base)]);
  expect(tab1.cookie && tab2.cookie, "could not open two sessions");

  await check("D1", "Both tabs see Period 5 free", async () => {
    const [a, b] = await Promise.all([
      getAvailability(base, tab1.cookie, D.race).then((r) => r.json()),
      getAvailability(base, tab2.cookie, D.race).then((r) => r.json()),
    ]);
    for (const [label, view] of [["tab 1", a], ["tab 2", b]]) {
      expect(
        view.slots.find((s) => s.period === 5)?.booked === false,
        `${label} did not show Period 5 as free`,
      );
    }
    return "both tabs show Period 5 free";
  });

  let raced = [];

  await check("D2/D3", "One tab gets 201, the other a readable 409", async () => {
    // Four in flight, not two: two requests can be serialised by luck, and
    // this is the one row of the checklist that must not pass by accident.
    const sessions = [tab1.cookie, tab2.cookie, tab1.cookie, tab2.cookie];
    raced = await Promise.all(
      sessions.map((cookie, i) =>
        postBooking(
          base,
          cookie,
          bookingBody(D.race, 5, { teacherName: `Tab ${(i % 2) + 1}` }),
        ).then(async (res) => ({
          status: res.status,
          body: await res.json().catch(() => null),
        })),
      ),
    );

    const codes = raced.map((r) => r.status);
    const created = raced.filter((r) => r.status === 201);
    const conflicts = raced.filter((r) => r.status === 409);

    expect(
      !codes.some((c) => c >= 500),
      `a racing request returned ${codes.find((c) => c >= 500)} — the P2002 ` +
        `handling in app/api/bookings/route.ts is wrong (plan/06-booking-api.md)`,
    );
    expect(created.length === 1, `expected exactly one 201, got [${codes}]`);
    expect(
      conflicts.length === codes.length - 1,
      `expected ${codes.length - 1} conflicts, got [${codes}]`,
    );

    for (const conflict of conflicts) {
      const message = conflict.body?.error ?? "";
      expect(message.length > 0, "409 carried no message");
      expect(
        !looksLikeStackTrace(message),
        `409 leaked a stack trace: ${message}`,
      );
      expect(
        /\bbook/i.test(message) && /\b5\b/.test(message),
        `409 message is not readable to a teacher: "${message}"`,
      );
    }
    return `[${codes.join(", ")}] — "${conflicts[0].body.error}"`;
  });

  await check("D4", "Postgres holds exactly one row for that slot", async () => {
    expect(hasDb, "no database access — set DATABASE_URL and install psql");
    const row = await sql(
      `SELECT count(*), string_agg("teacherName", ' / ') FROM "Booking" ` +
        `WHERE date = TIMESTAMP '${D.race} 00:00:00' AND period = 5`,
    );
    const [count, holder] = row.split("|");
    expect(count === "1", `expected 1 row, found ${count}`);
    const winner = raced.find((r) => r.status === 201)?.body?.booking;
    if (winner) {
      expect(
        holder === winner.teacherName,
        `the row belongs to "${holder}" but "${winner.teacherName}" got the 201`,
      );
    }
    return `1 row, held by ${holder}`;
  });
}

// ------------------------------------------------- the message modules, live
//
// E1 and E3 ask what the recipients actually SEE. Delivery needs a real inbox
// and a real phone, but the content is decidable here — so it is checked
// against the real `lib/messages.ts`, not a copy of it. The file is TypeScript
// behind a `@/` alias, so it is transpiled to a scratch directory and
// imported; nothing is sent and no server is involved.

async function loadMessages() {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "lab-verify-"));
  const tsconfig = path.join(out, "tsconfig.json");
  await fs.writeFile(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: "es2022",
        module: "esnext",
        moduleResolution: "bundler",
        outDir: out,
        skipLibCheck: true,
        noEmitOnError: true,
        baseUrl: ROOT,
        paths: { "@/*": ["./*"] },
      },
      files: [path.join(ROOT, "lib", "messages.ts")],
    }),
  );

  const tsc = path.join(ROOT, "node_modules", ".bin", "tsc");
  try {
    await execFileAsync(tsc, ["-p", tsconfig], { maxBuffer: 1 << 24 });
  } catch (error) {
    throw new Error(
      `could not transpile lib/messages.ts: ${error.stdout || error.message}`,
    );
  }

  // The emitted tree mirrors the repo, so the alias resolves to a sibling.
  const entry = path.join(out, "lib", "messages.js");
  const js = await fs.readFile(entry, "utf-8");
  await fs.writeFile(entry, js.replace(/"@\/lib\/slots"/g, '"./slots.js"'));

  const mod = await import(pathToFileURL(entry).href);
  return { mod, cleanup: () => fs.rm(out, { recursive: true, force: true }) };
}

// Kannada block, U+0C80-U+0CFF. Tofu on the recipient's phone is E4's
// question; that the codepoints are there at all is this one's.
const KANNADA = /[ಀ-೿]/;

/** A Booking row as lib/messages.ts sees it — the notification path reads
 *  only these fields. */
const sampleBooking = () => ({
  id: "verify-sample",
  date: new Date(`${D.notify}T00:00:00.000Z`),
  period: 3,
  teacherName: "Verification Script",
  classSubject: "9A Physics",
  purpose: "Step 10 verification",
});

async function sectionEContent() {
  console.log("\nE. Notifications (message content)");

  let loaded;
  try {
    loaded = await loadMessages();
  } catch (error) {
    await check("E1a/E3a", "The composed message can be read", () => {
      throw error;
    });
    return;
  }

  const { englishMessage, kannadaMessage, bilingualMessage, emailSubject } =
    loaded.mod;
  const booking = sampleBooking();

  try {
    await check(
      "E1a",
      "The email subject carries the date and the period",
      async () => {
        const subject = emailSubject(booking);
        // Formatted here rather than with lib/slots' own formatter: a check
        // that reuses the code under test can only ever agree with it.
        const date = new Intl.DateTimeFormat("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(booking.date);
        expect(
          subject.includes(date),
          `the subject does not name the date (${date}): ${subject}`,
        );
        expect(
          new RegExp(`\\bPeriod ${booking.period}\\b`).test(subject),
          `the subject does not name the period: ${subject}`,
        );
        expect(
          !/Invalid Date|undefined|NaN/.test(subject),
          `the subject has an unrendered value: ${subject}`,
        );

        return `"${subject}"`;
      },
    );

    // "BOTH email recipients" is the other half of E1 a machine can reach: a
    // message composed perfectly and addressed to one person still fails the
    // row. Unconfigured is not the same as wrong — an unset RECIPIENT_EMAILS
    // means Step 8 has not been provisioned yet, so it is reported as pending
    // rather than failed. A configured-but-wrong list is a real failure.
    const raw = process.env.RECIPIENT_EMAILS ?? "";
    const recipients = [
      ...new Set(
        raw
          .split(",")
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];

    if (recipients.length === 0) {
      manual(
        "E1b",
        "Two email recipients are configured",
        "RECIPIENT_EMAILS is unset — external services (plan/08-external-services.md) " +
          "are not provisioned, so E1-E4 cannot be attempted at all yet",
      );
      console.log(
        "  ☐ E1b  Two email recipients are configured — RECIPIENT_EMAILS is unset",
      );
    } else {
      await check("E1b", "Two email recipients are configured", async () => {
        expect(
          recipients.length >= 2,
          `RECIPIENT_EMAILS names ${recipients.length} address; E1 expects two`,
        );
        expect(
          recipients.every((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)),
          `RECIPIENT_EMAILS contains a malformed address: ${raw}`,
        );
        return `${recipients.length} distinct recipients`;
      });
    }

    await check(
      "E3a",
      "One WhatsApp body carries an English block then a Kannada block",
      async () => {
        const body = bilingualMessage(booking);
        const english = englishMessage(booking);
        const kannada = kannadaMessage(booking);

        expect(body.includes(english), "the English block is missing");
        expect(body.includes(kannada), "the Kannada block is missing");
        expect(
          body.indexOf(english) < body.indexOf(kannada),
          "Kannada leads — English must come first (plan/07-notifications.md)",
        );
        expect(
          !KANNADA.test(english),
          "the English block contains Kannada characters",
        );
        expect(
          KANNADA.test(kannada),
          "the Kannada block has no Kannada characters — labels were lost",
        );
        expect(
          !/Invalid Date|undefined|NaN/.test(body),
          "the message has an unrendered value",
        );

        // The values the teacher typed must survive verbatim in both blocks —
        // the no-translation-API decision only holds if nothing mangles them.
        for (const value of [booking.teacherName, booking.classSubject, booking.purpose]) {
          expect(
            english.includes(value) && kannada.includes(value),
            `"${value}" did not survive into both blocks`,
          );
        }

        // Twilio sends one body; both languages must be inside it.
        const kannadaChars = [...body].filter((c) => KANNADA.test(c)).length;
        return `1 body, ${body.split("\n").length} lines, ${kannadaChars} Kannada chars, English first`;
      },
    );
  } finally {
    await loaded.cleanup();
  }
}

async function sectionE(ctx, cookie) {
  console.log("\nE. Notifications");

  await check("E5/E6", "A booking survives broken notification credentials", async () => {
    const at = ctx.mark();
    const res = await postBooking(ctx.base, cookie, bookingBody(D.notify, 6));
    expectStatus(res, 201, "booking with notifications broken");
    const body = await res.json();
    expect(
      body.notified === false,
      "`notified` claimed success while the credentials were broken",
    );
    expect(body.booking?.id, "no booking was returned");

    // "failure logged" is half of what E5 asks for, and the only half a
    // script can see. lib/notify.ts logs one line per failed channel.
    const log = ctx.since(at);
    expect(
      log.includes(`Booking ${body.booking.id} email failed`),
      "the email failure was not logged",
    );
    expect(
      log.includes(`Booking ${body.booking.id} WhatsApp failed`),
      "the WhatsApp failure was not logged",
    );

    // And the slot really is held — the teacher must not be told to rebook.
    const { slots } = await getAvailability(ctx.base, cookie, D.notify).then(
      (r) => r.json(),
    );
    expect(
      slots.find((s) => s.period === 6)?.booked === true,
      "the booking was reported but not stored",
    );
    return "201, notified=false, both failures logged, slot held";
  });

  // E2 asks for EXACTLY one WhatsApp message per booking. Whether it lands on
  // the recipient's phone is manual; how many times the app tries is not.
  // With the credentials blanked every attempt fails loudly, which turns the
  // server log into an exact count of attempts.
  await check("E2a", "One booking makes exactly one WhatsApp attempt", async () => {
    // Counted by splitting rather than by regex: the booking id is a cuid and
    // the channel name is fixed, so a literal suffix is exact and unescapable.
    const countAttempts = (log, channel) =>
      log.split(` ${channel} failed`).length - 1;

    const at = ctx.mark();
    const res = await postBooking(ctx.base, cookie, bookingBody(D.notifyCount, 1));
    expectStatus(res, 201, "booking");
    const first = ctx.since(at);
    expect(
      countAttempts(first, "WhatsApp") === 1,
      `one booking made ${countAttempts(first, "WhatsApp")} WhatsApp attempts`,
    );
    expect(
      countAttempts(first, "email") === 1,
      `one booking made ${countAttempts(first, "email")} email sends`,
    );

    // The duplicate half: a teacher who submits the same slot twice must not
    // make the recipient's phone buzz twice. The 409 path must notify nobody.
    const dupeAt = ctx.mark();
    const dupe = await postBooking(ctx.base, cookie, bookingBody(D.notifyCount, 1));
    expectStatus(dupe, 409, "duplicate booking");
    const after = ctx.since(dupeAt);
    expect(
      countAttempts(after, "WhatsApp") === 0,
      "the rejected duplicate still sent a WhatsApp message",
    );
    expect(
      countAttempts(after, "email") === 0,
      "the rejected duplicate still sent an email",
    );
    return "1 WhatsApp + 1 email per booking; the 409 sent nothing";
  });
}

/**
 * E5 and E6 proper: break exactly one channel and confirm the *other* one
 * still goes out. Only meaningful with real credentials, and it sends real
 * messages, so it is opt-in.
 */
async function sectionELive() {
  console.log("\nE. Notifications (live — real messages will be sent)");

  const cases = [
    {
      id: "E5",
      title: "Email broken: booking succeeds, WhatsApp still sent",
      env: { GMAIL_APP_PASSWORD: "xxxxxxxxxxxxxxxx" },
      date: "2099-01-09",
      period: 7,
      brokenChannel: "email",
      workingChannel: "WhatsApp",
    },
    {
      id: "E6",
      title: "Twilio broken: booking succeeds, email still sent",
      env: { TWILIO_AUTH_TOKEN: "0".repeat(32) },
      date: "2099-01-10",
      period: 8,
      brokenChannel: "WhatsApp",
      workingChannel: "email",
    },
  ];

  for (const c of cases) {
    await withServer(c.env, async (ctx) => {
      const { cookie } = await login(ctx.base);
      await check(c.id, c.title, async () => {
        const at = ctx.mark();
        const res = await postBooking(
          ctx.base,
          cookie,
          bookingBody(c.date, c.period, { teacherName: `${c.id} check` }),
        );
        expectStatus(res, 201, "booking");
        const body = await res.json();
        const log = ctx.since(at);
        expect(
          log.includes(`Booking ${body.booking.id} ${c.brokenChannel} failed`),
          `${c.brokenChannel} was expected to fail but did not`,
        );
        expect(
          !log.includes(`Booking ${body.booking.id} ${c.workingChannel} failed`),
          `${c.workingChannel} failed too — it should have been unaffected`,
        );
        return `201; ${c.brokenChannel} failed, ${c.workingChannel} sent — confirm it arrived`;
      });
    });
  }
}

// ------------------------------------------------------------------- report

function reportManual() {
  manual("E1", "Both email recipients actually receive it",
    "E1a/E1b checked the subject and the recipient list — delivery needs a real inbox");
  manual("E2", "The message arrives on the recipient's phone, once",
    "E2a checked the app sends exactly one — arrival needs the phone");
  manual("E3", "Both blocks survive WhatsApp's own rendering",
    "E3a checked the composed body carries English then Kannada");
  manual("E4", "The recipient reads it on their phone: Kannada renders, wording is natural",
    "only the person it was built for can answer this — see plan/07-notifications.md");
  manual("F1", "Phone at ~400px: no horizontal scroll, radios comfortably tappable",
    "real device");
  manual("F2", "Book a slot from the phone, end to end", "real device");
  manual("F3", "Reachable on the school network", "real network");
  manual("G", "Dry run: a teacher who has not seen it books unaided while you watch",
    "the row no checklist can replace");
}

function summarise() {
  const failed = results.filter((r) => r.state === "fail");
  const passed = results.filter((r) => r.state === "pass");
  const pending = results.filter((r) => r.state === "manual");

  console.log(`\n${"─".repeat(64)}`);
  console.log(`Automated: ${passed.length} passed, ${failed.length} failed`);

  if (failed.length) {
    console.log("\nFailed:");
    for (const r of failed) console.log(`  ✗ ${r.id}  ${r.title}\n      ${r.detail}`);
  }

  console.log("\nStill to do by hand (plan/10-verification.md):");
  for (const r of pending) console.log(`  ☐ ${r.id}  ${r.title}\n      ${r.detail}`);

  console.log(
    `\n${failed.length ? "✗ Verification failed." : "✓ Automated verification passed."}` +
      " Sections E1-E4, F and G are not done until a person has done them.",
  );
  return failed.length === 0;
}

// --------------------------------------------------------------------- main

async function main() {
  const missing = ["TEACHER_USERNAME", "TEACHER_PASSWORD", "SESSION_SECRET"].filter(
    (name) => !process.env[name],
  );
  if (missing.length) {
    console.error(`Cannot verify: ${missing.join(", ")} not set. See .env.example.`);
    process.exit(1);
  }

  // --live-notifications breaks ONE credential and expects the other channel
  // to deliver. With the credentials absent entirely both channels fail and
  // the run reports a confusing "the working channel failed too". Say so up
  // front instead.
  if (LIVE_NOTIFICATIONS) {
    const unset = [
      "GMAIL_USER",
      "GMAIL_APP_PASSWORD",
      "RECIPIENT_EMAILS",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_WHATSAPP_FROM",
      "TWILIO_WHATSAPP_TO",
    ].filter((name) => !process.env[name]);
    if (unset.length) {
      console.error(
        `Cannot run --live-notifications: ${unset.join(", ")} not set.\n` +
          "  Provision the external services first (plan/08-external-services.md),\n" +
          "  then confirm them with `npm run check:services`.",
      );
      process.exit(1);
    }
  }

  const hasDb = await dbAvailable();
  if (!hasDb) {
    console.warn(
      "! No database access (DATABASE_URL / psql) — C3 and D4 will fail.\n" +
        "  They are the rows that prove the data is really in Postgres, so this is not a detail.",
    );
  } else {
    await clearScratch();
  }

  if (EXTERNAL_BASE) {
    console.log(`Verifying the server already running at ${EXTERNAL_BASE}`);
  } else if (PROD) {
    console.log("Building for production (`next build`) — this is the faithful run…");
    await execFileAsync("npm", ["run", "build"], { cwd: ROOT, maxBuffer: 1 << 26 });
  } else {
    console.log("Verifying against `next dev`. Use --prod for the pre-handover run.");
  }

  const run = async (ctx) => {
    await sectionA(ctx.base);
    const { cookie } = await login(ctx.base);
    // Sign-in is against the Teacher table now, not the env vars directly: the
    // env pair only seeds the bootstrap account, so a fresh database needs
    // `npm run teachers:bootstrap` before this can pass.
    expect(
      cookie,
      "could not sign in — check TEACHER_USERNAME / TEACHER_PASSWORD and run `npm run teachers:bootstrap`",
    );
    await sectionB(ctx.base, cookie);
    await sectionC(ctx.base, cookie, hasDb);
    await sectionD(ctx.base, hasDb);
    if (EXTERNAL_BASE) {
      manual("E5/E6", "Booking survives broken notification credentials",
        "cannot break a remote server's credentials from here — run locally");
      manual("E2a", "One booking makes exactly one WhatsApp attempt",
        "counted from the server's own log — run locally");
    } else {
      await sectionE(ctx, cookie);
    }
  };

  if (EXTERNAL_BASE) {
    await run({ base: EXTERNAL_BASE.replace(/\/$/, ""), mark: () => 0, since: () => "" });
  } else {
    await withServer(NOTIFICATIONS_OFF, run);
    if (LIVE_NOTIFICATIONS) await sectionELive();
  }

  // Pure composition: no server, no database, nothing sent — so it runs in
  // every mode, including against a deployment.
  await sectionEContent();

  if (hasDb) await clearScratch();

  reportManual();
  process.exit(summarise() ? 0 : 1);
}

main().catch((error) => {
  console.error("\nVerification aborted:", error);
  process.exit(1);
});
