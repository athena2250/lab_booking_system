import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for teacher accounts, on `node:crypto` scrypt rather than a
 * dependency. scrypt is memory-hard and ships with Node, so there is no native
 * build to break on Vercel and nothing extra to keep patched.
 *
 * Only ever imported by route handlers and the CLI script — never by `proxy.ts`
 * or a component — so the Node-only import stays out of the request pipeline.
 */

const KEY_LEN = 64;
const SALT_LEN = 16;
// Node's defaults are N=16384, r=8, p=1. N is raised one notch: ~100ms per
// hash on a small serverless instance, which a person signing in never notices
// and a script guessing passcodes very much does.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 128 * 32768 * 8 * 2 } as const;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LEN, PARAMS, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** "scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>" — the parameters travel with the
 *  hash so raising them later doesn't invalidate existing passwords. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await derive(password, salt);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, N, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, "base64");
  const salt = Buffer.from(saltB64, "base64");

  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      expected.length,
      // Read back from the stored string, not from PARAMS, so a hash written
      // under older parameters still verifies.
      { N: Number(N), r: Number(r), p: Number(p), maxmem: 512 * 1024 * 1024 },
      (err, out) => (err ? reject(err) : resolve(out)),
    );
  }).catch(() => null);

  if (!key || key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}
