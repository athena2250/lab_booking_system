import { randomInt } from "node:crypto";

/**
 * The rules a teacher account has to satisfy, in one place. `scripts/teachers.mjs`
 * and the admin screens both import this so a passcode generated on the command
 * line and one generated in the browser can never drift apart, and so a username
 * the CLI would refuse can't be created through the UI instead.
 *
 * Node-only (`node:crypto`), so this is for route handlers, server actions and
 * the CLI — never `proxy.ts` or a component.
 */

// No l/I/1/O/0 — these get read off a slip of paper and typed on a phone.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassword(length = 12): string {
  return Array.from(
    { length },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join("");
}

export const USERNAME_RULE =
  "Username must be 3-40 characters, lowercase letters, digits, dot, dash or underscore.";

/**
 * The stored form of a username, or null if it isn't one. The login route
 * lowercases and trims what it is given, so anything that wouldn't survive that
 * round trip has to be refused here rather than stored as an account nobody can
 * sign in to.
 */
export function normaliseUsername(value: unknown): string | null {
  const username = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[a-z0-9._-]{3,40}$/.test(username) ? username : null;
}

export const NAME_RULE = "Name must be 2-80 characters.";

export function normaliseName(value: unknown): string | null {
  const name = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 80 ? name : null;
}
