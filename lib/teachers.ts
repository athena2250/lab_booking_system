import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import type { Role } from "@/lib/auth";

export type Account = { id: string; name: string; role: Role };

/**
 * Username + passcode against the Teacher table. Returns null for every kind of
 * failure — unknown username, wrong passcode, retired account — so the login
 * route cannot accidentally tell an attacker which usernames exist.
 *
 * A miss still runs `verifyPassword` against a dummy hash so an unknown
 * username costs the same ~100ms as a known one; otherwise the response time
 * enumerates the staff room.
 */
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export async function authenticate(
  username: string,
  password: string,
): Promise<Account | null> {
  const teacher = await prisma.teacher.findUnique({
    where: { username: username.trim().toLowerCase() },
    select: {
      id: true,
      name: true,
      role: true,
      active: true,
      passwordHash: true,
    },
  });

  const ok = await verifyPassword(password, teacher?.passwordHash ?? DUMMY_HASH);
  if (!teacher || !teacher.active || !ok) return null;

  return { id: teacher.id, name: teacher.name, role: teacher.role };
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
    select: { id: true, name: true, role: true, active: true },
  });
  if (!teacher || !teacher.active) return null;
  return { id: teacher.id, name: teacher.name, role: teacher.role };
}
