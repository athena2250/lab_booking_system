# Step 3 — Shared Login (Auth Gate)

**Status:** ✅ Done

## Goal

Keep the booking form off the open internet without building per-teacher accounts. One shared username/password that the staff room knows, held in a signed cookie.

## Why not a real auth library

Decided scope: no per-teacher accounts, no password resets, no user table. NextAuth/Clerk would add a dependency, a provider config, and a session store to protect a form whose worst-case abuse is a prank booking that the lab in-charge sees by email within seconds. A signed cookie is proportionate.

Consequence to accept: bookings are attributed by a **typed-in teacher name**, not a verified identity. Anyone with the shared password can type any name. If that becomes a problem, revisit with individual accounts.

## Files

| File | Purpose |
|---|---|
| `lib/auth.ts` | Sign/verify the session cookie; credential check |
| `app/login/page.tsx` | Login form |
| `app/api/login/route.ts` | `POST` — validate credentials, set cookie |
| `app/api/logout/route.ts` | `POST` — clear cookie |
| `proxy.ts` | Route protection (repo root) |

## `proxy.ts`, not `middleware.ts`

Next.js 16 **deprecates the `middleware.ts` convention** in favour of `proxy.ts` — `next build` emits:

> The "middleware" file convention is deprecated. Please use "proxy" instead.

Use `proxy.ts` at the repo root. Same API.

**Runtime correction (verified against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`):** Proxy defaults to the **Node.js** runtime, not Edge, and the `runtime` config option is unavailable — setting it throws. The plan originally assumed Edge. This doesn't change the code: `lib/auth.ts` uses the Web Crypto API (`crypto.subtle`), which is available in both runtimes, so the same module serves the proxy and the route handlers either way.

## `lib/auth.ts`

Cookie value is `<expiresAtMs>.<base64url HMAC-SHA256 of expiresAtMs>`. Stateless — no session store, and the expiry is self-describing and tamper-evident.

```ts
const COOKIE_NAME = "lab_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // one school day
const encoder = new TextEncoder();

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(): Promise<string> {
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(expiresAt));
  return `${expiresAt}.${base64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expiresAt, sig] = token.split(".");
  if (!expiresAt || !sig) return false;
  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) < Date.now()) return false;

  const expected = base64url(
    await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(expiresAt)),
  );
  return sig === expected;
}

export function checkCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.TEACHER_USERNAME;
  const expectedPass = process.env.TEACHER_PASSWORD;
  // Without both configured there is no correct answer, so nobody gets in.
  if (!expectedUser || !expectedPass) return false;
  return username === expectedUser && password === expectedPass;
}

export { COOKIE_NAME, SESSION_TTL_MS };
```

Cookie flags when setting: `httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`, `path: "/"`, `maxAge: SESSION_TTL_MS / 1000`.

Those flags (minus `maxAge`) are exported as `SESSION_COOKIE_OPTIONS` so the login and logout routes can't drift apart — a clearing cookie has to match the original's `path` and flags or the browser keeps the old one.

## `proxy.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const ok = await verifySessionToken(req.cookies.get(COOKIE_NAME)?.value);
  if (ok) return NextResponse.next();

  // APIs get a status code; pages get a redirect.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/book/:path*", "/api/bookings/:path*", "/api/availability/:path*"],
};
```

`/login` and `/api/login` must stay **outside** the matcher or the redirect loops.

## Rate limiting

A small in-memory attempt counter in `app/api/login/route.ts`: 10 failures per IP per 15 min → 429. IP comes from `x-forwarded-for` (first hop), falling back to `x-real-ip`, then the literal `"unknown"` — so in local dev every client shares one bucket. Good enough for a school LAN; it resets on redeploy and isn't shared across serverless instances, which is an acceptable limitation here.

Once locked out, even the correct password gets a 429 until the window passes. That's the intended behaviour, not a bug.

## Env vars introduced

```
TEACHER_USERNAME=
TEACHER_PASSWORD=
SESSION_SECRET=      # openssl rand -base64 32
```

## Notes / gotchas

- Rotating `SESSION_SECRET` invalidates every live session — fine, that's the logout-everyone lever.
- `checkCredentials` uses plain `===`, which is not constant-time. Against a shared password over the network with rate limiting, the timing channel is not a realistic attack path; noted rather than defended.
- Don't put the password in `NEXT_PUBLIC_*` — it would be inlined into the client bundle.

## Acceptance criteria

- [x] Logged out, visiting `/book` redirects to `/login` — 307 → `/login`
- [x] Logged out, `GET /api/availability?date=...` returns 401 (not a redirect) — the matcher's `/:path*` covers the bare path, not just sub-paths
- [x] Correct credentials set the session cookie (`HttpOnly`, `SameSite=lax`, `Max-Age=43200`) and it passes verification on the next request
- [x] Wrong credentials return 401 with no `Set-Cookie`
- [x] Hand-editing the cookie value (bumping the expiry, mangling the signature, truncating it) fails verification
- [x] 11th failed attempt from one IP returns 429
- [x] `POST /api/logout` clears the cookie
- [x] `next build` emits no middleware-deprecation warning; the route table lists `ƒ Proxy (Middleware)`

Verified with `curl` against `next dev`. `/book` itself 404s until [Step 5](05-booking-form-ui.md) builds it — the gate is what's under test here, and the authenticated request reaches the 404 instead of being redirected.
