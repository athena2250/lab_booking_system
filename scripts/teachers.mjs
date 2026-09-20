/**
 * Teacher account management from the command line.
 *
 *   node scripts/teachers.mjs list
 *   node scripts/teachers.mjs add "Asha Rao" asha@ncfe.ac.in [--admin] [--password X]
 *   node scripts/teachers.mjs passwd asha@ncfe.ac.in [--password X]
 *   node scripts/teachers.mjs role asha@ncfe.ac.in teacher|admin
 *   node scripts/teachers.mjs retire asha@ncfe.ac.in
 *   node scripts/teachers.mjs restore asha@ncfe.ac.in
 *   node scripts/teachers.mjs bootstrap        # account from TEACHER_EMAIL/PASSWORD
 *
 * Teachers normally sign themselves up at /signup with their school email and
 * choose their own password. This is the other way in: seeding the first admin
 * against an empty database, and putting an account right when nobody can sign
 * in to fix it through the UI.
 *
 * Every address argument may be given bare — "asha" is expanded to
 * asha@ncfe.ac.in — because typing the school domain forty times is how a typo
 * gets in.
 *
 * With no --password a readable passcode is generated and printed once. It is
 * stored only as a scrypt hash, so a lost passcode is reset, never recovered.
 *
 * The passcode alphabet lives in `lib/accounts.ts` and the rules about what a
 * valid account looks like in `lib/account-rules.ts`, both of which the app
 * imports too — the ways of creating an account have to agree.
 *
 * `@prisma/client` here, not app/generated/prisma: the generated client is
 * TypeScript with extensionless imports, which Next bundles and plain Node
 * cannot resolve. `prisma generate` emits both — see the second generator block
 * in prisma/schema.prisma. The hashing is imported straight from the app's own
 * lib so the CLI and the login route can never disagree about the format.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password.ts";
import { generatePassword } from "../lib/accounts.ts";
import {
  EMAIL_RULE,
  SCHOOL_EMAIL_DOMAIN,
  normaliseEmail as parseEmail,
} from "../lib/account-rules.ts";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--admin") flags.set("admin", true);
  else if (arg === "--password") flags.set("password", argv[++i]);
  else if (arg.startsWith("--password=")) flags.set("password", arg.slice(11));
  else positional.push(arg);
}

function normaliseEmail(value) {
  // A bare local part is expanded, so `add "Asha Rao" asha` and
  // `add "Asha Rao" asha@ncfe.ac.in` mean the same account.
  const given = String(value ?? "").trim();
  const email = parseEmail(
    given.includes("@") ? given : `${given}@${SCHOOL_EMAIL_DOMAIN}`,
  );
  if (!email) fail(EMAIL_RULE);
  return email;
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

async function findOrFail(email) {
  const address = normaliseEmail(email);
  const teacher = await prisma.teacher.findUnique({
    where: { email: address },
  });
  if (!teacher) fail(`No account for "${address}".`);
  return teacher;
}

async function list() {
  const teachers = await prisma.teacher.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { _count: { select: { bookings: true } } },
  });

  if (teachers.length === 0) {
    console.log(
      "No accounts yet. Create the first one:\n" +
        `  node scripts/teachers.mjs add "Your Name" you@${SCHOOL_EMAIL_DOMAIN} --admin`,
    );
    return;
  }

  const pad = (value, width) => String(value).padEnd(width);
  const nameWidth = Math.max(4, ...teachers.map((t) => t.name.length));
  const mailWidth = Math.max(5, ...teachers.map((t) => t.email.length));

  console.log(
    `${pad("NAME", nameWidth)}  ${pad("EMAIL", mailWidth)}  ROLE     STATUS   BOOKINGS`,
  );
  for (const t of teachers) {
    console.log(
      `${pad(t.name, nameWidth)}  ${pad(t.email, mailWidth)}  ` +
        `${pad(t.role.toLowerCase(), 7)}  ${pad(t.active ? "active" : "retired", 7)}  ${t._count.bookings}`,
    );
  }
}

async function add([name, email]) {
  if (!name || !email) {
    fail('Usage: add "Full Name" email [--admin] [--password X]');
  }
  const password = flags.get("password") ?? generatePassword();
  const teacher = await prisma.teacher.create({
    data: {
      name: String(name).trim(),
      email: normaliseEmail(email),
      passwordHash: await hashPassword(password),
      role: flags.get("admin") ? "ADMIN" : "TEACHER",
    },
  });
  console.log(`✔ Created ${teacher.role.toLowerCase()} "${teacher.name}"`);
  announce(teacher.email, password);
}

async function passwd([email]) {
  const teacher = await findOrFail(email);
  const password = flags.get("password") ?? generatePassword();
  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { passwordHash: await hashPassword(password) },
  });
  console.log(`✔ Reset the passcode for "${teacher.name}"`);
  announce(teacher.email, password);
}

async function role([email, role]) {
  const next = String(role ?? "").toUpperCase();
  if (next !== "TEACHER" && next !== "ADMIN") {
    fail("Usage: role <email> teacher|admin");
  }
  const teacher = await findOrFail(email);
  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { role: next },
  });
  console.log(`✔ "${teacher.name}" is now ${next.toLowerCase()}`);
}

async function setActive([email], active) {
  const teacher = await findOrFail(email);
  await prisma.teacher.update({ where: { id: teacher.id }, data: { active } });
  // Retiring keeps the row, so the bookings this teacher made keep pointing at
  // a name rather than becoming anonymous history.
  console.log(
    `✔ "${teacher.name}" ${active ? "can sign in again" : "can no longer sign in — their bookings are kept"}`,
  );
}

/** The first account, from the env vars the deployment already carries. Lets a
 *  fresh database be made usable by `npm run teachers:bootstrap` with nothing
 *  typed in, and is what `scripts/verify.mjs` signs in as. */
async function bootstrap() {
  const email = process.env.TEACHER_EMAIL;
  const password = process.env.TEACHER_PASSWORD;
  if (!email || !password) {
    fail("Set TEACHER_EMAIL and TEACHER_PASSWORD in .env first.");
  }

  const name = process.env.TEACHER_NAME?.trim() || "Staff Room";
  const normalised = normaliseEmail(email);
  const passwordHash = await hashPassword(password);

  // Idempotent: running it twice re-syncs the passcode to .env rather than
  // failing on the unique email.
  const teacher = await prisma.teacher.upsert({
    where: { email: normalised },
    update: { passwordHash, active: true },
    create: { name, email: normalised, passwordHash, role: "ADMIN" },
  });
  console.log(
    `✔ Bootstrap ${teacher.role.toLowerCase()} account "${teacher.name}" (${teacher.email}) is ready — passcode is TEACHER_PASSWORD from .env`,
  );
}

function announce(email, password) {
  if (flags.get("password")) return;
  console.log(
    `\n  email:    ${email}\n  passcode: ${password}\n\n` +
      "  This is the only time the passcode is shown. Hand it over in person;\n" +
      "  if it is lost, reset it with `passwd` rather than looking it up.",
  );
}

const COMMANDS = {
  list,
  add,
  passwd,
  role,
  retire: (args) => setActive(args, false),
  restore: (args) => setActive(args, true),
  bootstrap,
};

const [command, ...args] = positional;
const run = COMMANDS[command ?? "list"];

if (!run) {
  console.error(
    `Unknown command "${command}". One of: ${Object.keys(COMMANDS).join(", ")}`,
  );
  process.exitCode = 1;
} else {
  try {
    await run(args);
  } catch (error) {
    if (process.exitCode !== 1) {
      console.error(`✖ ${error?.message ?? error}`);
      process.exitCode = 1;
    }
  }
}

await prisma.$disconnect();
