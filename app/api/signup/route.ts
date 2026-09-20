import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_TTL_MS,
  createSessionToken,
} from "@/lib/auth";
import { createAccount } from "@/lib/teachers";
import { clientIp, createLimiter } from "@/lib/rate-limit";
import {
  EMAIL_RULE,
  NAME_RULE,
  normaliseEmail,
  normaliseName,
  passwordProblem,
} from "@/lib/account-rules";

/**
 * Teacher self-registration.
 *
 * The school email domain is the whole membership check: anyone who can type an
 * @ncfe.ac.in address gets a working TEACHER account immediately, and the
 * address is not verified by mail. That is the deliberate trade — a teacher can
 * book a period on their first day without waiting for an admin — and it is why
 * this can never create an ADMIN. Promotion is an existing admin's decision on
 * `/admin/teachers`, not something a sign-up form can ask for.
 *
 * On success the session cookie is set here, so signing up lands the teacher in
 * the app rather than back on the sign-in form retyping what they just chose.
 */

/**
 * Unlike sign-in's limiter, this one counts *successes* too and is never
 * cleared. What is worth limiting here is accounts created, not passwords
 * guessed — a script that registers successfully every time is exactly the
 * abuse case, and a counter reset by success would never see it.
 *
 * The cap is generous because a school LAN is one IP: a staff meeting where
 * thirty teachers sign up at once must not lock out the last twenty. Twenty an
 * hour clears that and still makes bulk registration pointless.
 */
const attempts = createLimiter(20, 60 * 60 * 1000);

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (attempts.isLimited(ip)) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Counted before the checks, not after: probing for which staff addresses are
  // already registered is a use of this endpoint worth rationing too.
  attempts.record(ip);

  const name = normaliseName(body?.name);
  if (!name) return bad(NAME_RULE);

  const email = normaliseEmail(body?.email);
  if (!email) return bad(EMAIL_RULE);

  const password = typeof body?.password === "string" ? body.password : "";
  const problem = passwordProblem(password, email);
  if (problem) return bad(problem);

  if (password !== body?.confirmPassword) {
    return bad("The two passwords don't match.");
  }

  const created = await createAccount({ name, email, password });
  if (!created.ok) {
    // An address that is already registered. Saying so is a small disclosure,
    // but the alternative — a teacher told only "something went wrong" when
    // they already have an account — costs the lab in-charge a phone call.
    return NextResponse.json({ error: created.error }, { status: 409 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: await createSessionToken(created.account),
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
