import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_TTL_MS,
  createSessionToken,
} from "@/lib/auth";
import { authenticate } from "@/lib/teachers";

// In-memory attempt counter. Resets on redeploy and isn't shared between
// serverless instances — good enough to blunt a script on a school LAN,
// and not relied on for anything else.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; firstAt: number }>();

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function isRateLimited(ip: string): boolean {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(ip: string): void {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    failures.set(ip, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = typeof body?.username === "string" ? body.username : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const account = await authenticate(username, password);
  if (!account) {
    recordFailure(ip);
    // Deliberately one message for a wrong passcode, an unknown username and a
    // retired account: which of the three it was is not the sign-in form's
    // business to disclose.
    return NextResponse.json(
      { error: "Incorrect username or password." },
      { status: 401 },
    );
  }

  failures.delete(ip);

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
