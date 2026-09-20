/**
 * Teacher account management from the command line.
 *
 *   node scripts/teachers.mjs list
 *   node scripts/teachers.mjs add "Asha Rao" asha [--admin] [--password X]
 *   node scripts/teachers.mjs passwd asha [--password X]
 *   node scripts/teachers.mjs role asha teacher|admin
 *   node scripts/teachers.mjs retire asha
 *   node scripts/teachers.mjs restore asha
 *   node scripts/teachers.mjs bootstrap        # account from TEACHER_USERNAME/PASSWORD
 *
 * With no --password a readable passcode is generated and printed once. It is
 * stored only as a scrypt hash, so a lost passcode is reset, never recovered.
 *
 * The passcode alphabet and the username rules live in `lib/accounts.ts`, which
 * the admin screens import too — the two ways of creating an account have to
 * agree about what a valid one looks like.
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
import {
  USERNAME_RULE,
  generatePassword,
  normaliseUsername as parseUsername,
} from "../lib/accounts.ts";

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

function normaliseUsername(value) {
  const username = parseUsername(value);
  if (!username) fail(USERNAME_RULE);
  return username;
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

async function findOrFail(username) {
  const teacher = await prisma.teacher.findUnique({
    where: { username: normaliseUsername(username) },
  });
  if (!teacher) fail(`No account with username "${username}".`);
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
        '  node scripts/teachers.mjs add "Your Name" yourname --admin',
    );
    return;
  }

  const pad = (value, width) => String(value).padEnd(width);
  const nameWidth = Math.max(4, ...teachers.map((t) => t.name.length));
  const userWidth = Math.max(8, ...teachers.map((t) => t.username.length));

  console.log(
    `${pad("NAME", nameWidth)}  ${pad("USERNAME", userWidth)}  ROLE     STATUS   BOOKINGS`,
  );
  for (const t of teachers) {
    console.log(
      `${pad(t.name, nameWidth)}  ${pad(t.username, userWidth)}  ` +
        `${pad(t.role.toLowerCase(), 7)}  ${pad(t.active ? "active" : "retired", 7)}  ${t._count.bookings}`,
    );
  }
}

async function add([name, username]) {
  if (!name || !username) {
    fail('Usage: add "Full Name" username [--admin] [--password X]');
  }
  const password = flags.get("password") ?? generatePassword();
  const teacher = await prisma.teacher.create({
    data: {
      name: String(name).trim(),
      username: normaliseUsername(username),
      passwordHash: await hashPassword(password),
      role: flags.get("admin") ? "ADMIN" : "TEACHER",
    },
  });
  console.log(`✔ Created ${teacher.role.toLowerCase()} "${teacher.name}"`);
  announce(teacher.username, password);
}

async function passwd([username]) {
  const teacher = await findOrFail(username);
  const password = flags.get("password") ?? generatePassword();
  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { passwordHash: await hashPassword(password) },
  });
  console.log(`✔ Reset the passcode for "${teacher.name}"`);
  announce(teacher.username, password);
}

async function role([username, role]) {
  const next = String(role ?? "").toUpperCase();
  if (next !== "TEACHER" && next !== "ADMIN") {
    fail("Usage: role <username> teacher|admin");
  }
  const teacher = await findOrFail(username);
  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { role: next },
  });
  console.log(`✔ "${teacher.name}" is now ${next.toLowerCase()}`);
}

async function setActive([username], active) {
  const teacher = await findOrFail(username);
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
  const username = process.env.TEACHER_USERNAME;
  const password = process.env.TEACHER_PASSWORD;
  if (!username || !password) {
    fail("Set TEACHER_USERNAME and TEACHER_PASSWORD in .env first.");
  }

  const name = process.env.TEACHER_NAME?.trim() || "Staff Room";
  const normalised = normaliseUsername(username);
  const passwordHash = await hashPassword(password);

  // Idempotent: running it twice re-syncs the passcode to .env rather than
  // failing on the unique username.
  const teacher = await prisma.teacher.upsert({
    where: { username: normalised },
    update: { passwordHash, active: true },
    create: { name, username: normalised, passwordHash, role: "ADMIN" },
  });
  console.log(
    `✔ Bootstrap ${teacher.role.toLowerCase()} account "${teacher.name}" (${teacher.username}) is ready — passcode is TEACHER_PASSWORD from .env`,
  );
}

function announce(username, password) {
  if (flags.get("password")) return;
  console.log(
    `\n  username: ${username}\n  passcode: ${password}\n\n` +
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
