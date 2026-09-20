const COOKIE_NAME = "lab_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // one school day
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type Role = "TEACHER" | "ADMIN";

/** Who the current request belongs to. The name and role are copied into the
 *  cookie so the header and the proxy can render and route without a query;
 *  anything that *authorises* a write re-reads the row by `teacherId`. */
export type Session = {
  teacherId: string;
  name: string;
  role: Role;
  expiresAt: number;
};

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
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

async function sign(payload: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    encoder.encode(payload),
  );
  return base64url(new Uint8Array(sig));
}

/** "<payload>.<hmac>" where payload is base64url JSON. The signature covers the
 *  whole payload, so the teacher id, the name and the role are all as
 *  untamperable as the expiry was when the cookie only held an expiry. */
export async function createSessionToken(teacher: {
  id: string;
  name: string;
  role: Role;
}): Promise<string> {
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        sub: teacher.id,
        name: teacher.name,
        role: teacher.role,
        exp: Date.now() + SESSION_TTL_MS,
      }),
    ),
  );
  return `${payload}.${await sign(payload)}`;
}

/** The session the token carries, or null if it is missing, malformed, forged
 *  or expired. Callers treat null as "not signed in" — there is deliberately no
 *  way to tell those cases apart from the outside. */
export async function verifySessionToken(
  token: string | undefined,
): Promise<Session | null> {
  if (!token) return null;

  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (sig !== (await sign(payload))) return null;

  const bytes = fromBase64url(payload);
  if (!bytes) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }

  if (!claims || typeof claims !== "object") return null;
  const { sub, name, role, exp } = claims as Record<string, unknown>;

  if (typeof sub !== "string" || !sub) return null;
  if (typeof name !== "string" || !name) return null;
  if (role !== "TEACHER" && role !== "ADMIN") return null;
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp < Date.now()) {
    return null;
  }

  return { teacherId: sub, name, role, expiresAt: exp };
}

/** Cookie flags shared by the login and logout routes. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export { COOKIE_NAME, SESSION_TTL_MS };
