import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionToken, type Session } from "@/lib/auth";
import { currentAccount, type Account } from "@/lib/teachers";

/** The signed-in teacher, for server components and route handlers. Kept apart
 *  from `lib/auth.ts` because `next/headers` has no meaning inside `proxy.ts`,
 *  which imports the verification half of this. */
export async function getSession(): Promise<Session | null> {
  return verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
}

/** For pages the proxy already guards: the session is guaranteed there, so a
 *  missing one is a wiring bug and should be loud rather than silently empty. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("No session — route is missing proxy coverage");
  return session;
}

/**
 * The admin behind the current request, re-read from the database.
 *
 * `proxy.ts` already bounces non-admins off `/admin` and `/api/admin`, but it
 * checks the *cookie*, which a retired or demoted account still carries until it
 * expires — and a server action is reachable by POST without ever touching the
 * page that renders its button. Every admin mutation goes through this, so the
 * authoritative check is the row, not the cookie.
 */
export async function requireAdmin(): Promise<Account> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  const account = await currentAccount(session.teacherId);
  if (!account || account.role !== "ADMIN") throw new Error("Not allowed");
  return account;
}
