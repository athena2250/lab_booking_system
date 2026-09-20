import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_TTL_MS,
  createSessionToken,
} from "@/lib/auth";
import { authenticate } from "@/lib/teachers";
import { clientIp, createLimiter } from "@/lib/rate-limit";

const failures = createLimiter(10, 15 * 60 * 1000);

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (failures.isLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const account = await authenticate(email, password);
  if (!account) {
    failures.record(ip);
    // Deliberately one message for a wrong password, an unknown address, an
    // address outside the school domain and a retired account: which of the
    // four it was is not the sign-in form's business to disclose.
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 },
    );
  }

  failures.clear(ip);

  // The role travels back so the login form knows where to land the person.
  const response = NextResponse.json({ ok: true, role: account.role });
  response.cookies.set({
    name: COOKIE_NAME,
    value: await createSessionToken(account),
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
