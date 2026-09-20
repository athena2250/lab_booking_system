/**
 * What a valid account looks like, with no Node-only imports.
 *
 * Split out of `lib/accounts.ts` so the sign-up and sign-in pages — client
 * components — can show the same rules the server enforces. `lib/accounts.ts`
 * pulls in `node:crypto` for passcode generation, and importing that from a
 * component takes the whole module graph down.
 *
 * Every way of creating an account (sign-up, the admin screens, the CLI) goes
 * through these, so the three can never drift apart about what they accept.
 */

/** Staff addresses only. Sign-up is open to anyone holding one of these, so
 *  this constant is the entire membership rule — there is nothing else between
 *  the form and a working account. */
export const SCHOOL_EMAIL_DOMAIN = "ncfe.ac.in";

export const EMAIL_RULE = `Use your school email address — it must end in @${SCHOOL_EMAIL_DOMAIN}.`;

// Deliberately narrower than what RFC 5322 permits: school addresses are
// issued, not invented, so anything exotic here is a typo rather than a mailbox.
const LOCAL_PART = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

/**
 * The stored form of an email address, or null if it isn't one we accept.
 *
 * Addresses are stored lowercased and trimmed, and sign-in normalises the same
 * way, so "Asha.Rao@NCFE.ac.in" on the form and `asha.rao@ncfe.ac.in` in the
 * database are the same person and not two accounts.
 */
export function normaliseEmail(value: unknown): string | null {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();

  const at = email.indexOf("@");
  if (at < 1) return null;
  if (email.slice(at + 1) !== SCHOOL_EMAIL_DOMAIN) return null;

  const local = email.slice(0, at);
  if (local.length > 64 || !LOCAL_PART.test(local)) return null;

  return email;
}

/** The part before the @, for showing an address compactly in a dense table. */
export function emailLocalPart(email: string): string {
  return email.split("@")[0];
}

export const NAME_RULE = "Name must be 2-80 characters.";

export function normaliseName(value: unknown): string | null {
  const name = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 80 ? name : null;
}

export const PASSWORD_MIN_LENGTH = 8;
// scrypt's cost is paid per attempt by the server, so an unbounded password is
// a free way to make sign-in expensive. Nothing anyone types is near this.
export const PASSWORD_MAX_LENGTH = 200;

export const PASSWORD_RULE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;

/**
 * Why this password is unacceptable, or null if it is fine.
 *
 * The rules are length and "not your own email address" — no character-class
 * requirements. Those push people towards `Password1!` and a note taped to the
 * monitor, which is a worse outcome for a staff room than a long simple phrase.
 */
export function passwordProblem(
  password: string,
  email?: string | null,
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_RULE;
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (!password.trim()) return "Password can't be only spaces.";
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) {
    return "Password can't be your email address.";
  }
  return null;
}
