/**
 * What a profile action reports back.
 *
 * Kept out of `actions.ts` because that file carries `"use server"`, and such a
 * file may only export async functions — exporting the idle constant from there
 * compiles and builds fine, then fails at the first invocation.
 */
export type ProfileResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** `useActionState`'s starting value: settled, with nothing to report. */
export const IDLE_PROFILE_RESULT: ProfileResult = { ok: true, message: "" };
