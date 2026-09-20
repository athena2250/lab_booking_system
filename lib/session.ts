import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionToken, type Session } from "@/lib/auth";

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
