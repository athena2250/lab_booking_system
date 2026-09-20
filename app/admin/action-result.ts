/**
 * What an admin action reports back.
 *
 * Kept out of `actions.ts` because that file carries `"use server"`, and such a
 * file may only export async functions — exporting the idle constant from there
 * compiles and builds fine, then fails at the first invocation with
 * "a use server file can only export async functions, found object".
 */

/** Shown once, then gone — the passcode is stored only as a scrypt hash. */
export type Credentials = { email: string; passcode: string };

export type ActionResult =
  | { ok: true; message: string; credentials?: Credentials }
  | { ok: false; error: string };

/** `useActionState`'s starting value: settled, with nothing to report. */
export const IDLE_RESULT: ActionResult = { ok: true, message: "" };
