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
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    encoder.encode(expiresAt),
  );
  return `${expiresAt}.${base64url(sig)}`;
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const [expiresAt, sig] = token.split(".");
  if (!expiresAt || !sig) return false;
  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) < Date.now()) {
    return false;
  }

  const expected = base64url(
    await crypto.subtle.sign(
      "HMAC",
      await hmacKey(),
      encoder.encode(expiresAt),
    ),
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

/** Cookie flags shared by the login and logout routes. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export { COOKIE_NAME, SESSION_TTL_MS };
