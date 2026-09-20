import { randomInt } from "node:crypto";

/**
 * Passcode generation for admin-issued accounts.
 *
 * Teachers sign up for themselves and choose their own password, so this is
 * only for the other path: an admin creating an account on someone's behalf, or
 * resetting one for a teacher who is locked out. The passcode is handed over in
 * person and the teacher changes it from their profile page.
 *
 * Node-only (`node:crypto`), so this is for route handlers, server actions and
 * the CLI — never `proxy.ts` or a component. The rules about what a valid
 * account looks like live in `lib/account-rules.ts`, which has no such
 * restriction and is what the forms import.
 */

// No l/I/1/O/0 — these get read off a slip of paper and typed on a phone.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassword(length = 12): string {
  return Array.from(
    { length },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join("");
}
