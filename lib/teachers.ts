import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { normaliseEmail } from "@/lib/account-rules";
import type { Role } from "@/lib/auth";

export type Account = { id: string; name: string; email: string; role: Role };

/**
 * School email + password against the Teacher table. Returns null for every
 * kind of failure — unknown address, wrong password, retired account — so the
 * login route cannot accidentally tell an attacker which staff addresses exist.
 *
 * A miss still runs `verifyPassword` against a dummy hash so an unknown address
 * costs the same ~100ms as a known one; otherwise the response time enumerates
 * the staff room.
 */
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export async function authenticate(
  email: unknown,
  password: string,
): Promise<Account | null> {
  const address = normaliseEmail(email);

  // An address that isn't a school one can't match a row, but it still gets a
  // hash's worth of work: bailing out early here would make "wrong domain" and
  // "wrong password" tell themselves apart by how fast they come back.
  const teacher = address
    ? await prisma.teacher.findUnique({
        where: { email: address },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          passwordHash: true,
        },
      })
    : null;

  const ok = await verifyPassword(password, teacher?.passwordHash ?? DUMMY_HASH);
  if (!teacher || !teacher.active || !ok) return null;

  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    role: teacher.role,
  };
}

/** The account behind a session cookie, re-read from the database. The cookie's
 *  own copy of the name and role is enough to render a header, but anything that
 *  authorises a write goes through this: it is how a retired account or a
 *  demoted admin stops working before their twelve-hour session expires. */
export async function currentAccount(
  teacherId: string,
): Promise<Account | null> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!teacher || !teacher.active) return null;
  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    role: teacher.role,
  };
}

/**
 * Creates a teacher account, or reports why it couldn't.
 *
 * Shared by sign-up and the admin screens so the two can't disagree about what
 * gets stored. The caller has already validated its inputs — what this adds is
 * the address collision, which can only be decided against the database and
 * which the unique index would otherwise raise as a Prisma error far from the
 * form that caused it.
 */
export async function createAccount(input: {
  name: string;
  email: string;
  password: string;
  role?: Role;
}): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const taken = await prisma.teacher.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (taken) {
    return {
      ok: false,
      error: `There is already an account for ${input.email}.`,
    };
  }

  try {
    const teacher = await prisma.teacher.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: input.role ?? "TEACHER",
      },
      select: { id: true, name: true, email: true, role: true },
    });
    return { ok: true, account: teacher };
  } catch (error) {
    // Two sign-ups for one address, submitted close enough together that both
    // passed the check above. The unique index is what actually decides it;
    // the loser gets the same message as if they had been a moment later.
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: `There is already an account for ${input.email}.`,
      };
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
