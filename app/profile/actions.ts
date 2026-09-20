"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { currentAccount, type Account } from "@/lib/teachers";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_TTL_MS,
  createSessionToken,
} from "@/lib/auth";
import { NAME_RULE, normaliseName, passwordProblem } from "@/lib/account-rules";
import type { ProfileResult } from "@/app/profile/action-result";

/**
 * What a teacher may change about their own account: their display name and
 * their password. Not their email — that is the sign-in identity and the thing
 * the school issued, so moving it is an admin's job with the CLI, not a text
 * field. Not their role or their active flag either, for the obvious reason.
 *
 * These are reachable by POST without going through the page that renders the
 * form, so each one re-reads the account from the database rather than trusting
 * the cookie's copy: a retired teacher's session is still a valid signature
 * until it expires.
 */
async function me(): Promise<Account> {
  const session = await getSession();
  if (!session) throw new Error("You are not signed in.");
  const account = await currentAccount(session.teacherId);
  if (!account) throw new Error("Your account is no longer active.");
  return account;
}

/** Turns a thrown guard into a result the screen can render. */
async function attempt(
  run: () => Promise<ProfileResult>,
): Promise<ProfileResult> {
  try {
    return await run();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/**
 * Re-issues the session cookie.
 *
 * The cookie carries a copy of the name so the header can render without a
 * query. Renaming without this leaves the old name in the header — and in every
 * other page that reads the session — for up to twelve hours, which reads as
 * the rename having failed.
 */
async function refreshSession(account: Account): Promise<void> {
  (await cookies()).set({
    name: COOKIE_NAME,
    value: await createSessionToken(account),
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function updateName(
  _prev: ProfileResult,
  formData: FormData,
): Promise<ProfileResult> {
  return attempt(async () => {
    const account = await me();

    const name = normaliseName(formData.get("name"));
    if (!name) return { ok: false, error: NAME_RULE };
    if (name === account.name) {
      return { ok: true, message: "That is already your name." };
    }

    await prisma.teacher.update({ where: { id: account.id }, data: { name } });

    // Only future bookings pick this up. `Booking.teacherName` is a snapshot of
    // the name at booking time, and the notifications already sent under the
    // old one are not being rewritten to match.
    await refreshSession({ ...account, name });

    revalidatePath("/profile");
    revalidatePath("/my");
    return {
      ok: true,
      message: `Your name is now "${name}". Bookings you already made keep the name they were made under.`,
    };
  });
}

export async function changePassword(
  _prev: ProfileResult,
  formData: FormData,
): Promise<ProfileResult> {
  return attempt(async () => {
    const account = await me();

    const current = String(formData.get("currentPassword") ?? "");
    const next = String(formData.get("newPassword") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");

    // The current password is required even though the session already proves
    // who this is: it is what stops a walked-away-from staff-room laptop from
    // becoming a permanent handover of somebody's account.
    const stored = await prisma.teacher.findUnique({
      where: { id: account.id },
      select: { passwordHash: true },
    });
    if (!stored || !(await verifyPassword(current, stored.passwordHash))) {
      return { ok: false, error: "That isn't your current password." };
    }

    const problem = passwordProblem(next, account.email);
    if (problem) return { ok: false, error: problem };
    if (next !== confirm) {
      return { ok: false, error: "The two new passwords don't match." };
    }
    if (next === current) {
      return { ok: false, error: "That is already your password." };
    }

    await prisma.teacher.update({
      where: { id: account.id },
      data: { passwordHash: await hashPassword(next) },
    });

    // Sessions are stateless signatures over the teacher's id, so changing the
    // password does not invalidate any that are already out — including one on
    // a device this teacher is trying to lock out. Say so rather than let them
    // assume otherwise; SESSION_SECRET is the only thing that revokes sessions.
    return {
      ok: true,
      message:
        "Password changed. Sessions already signed in elsewhere stay signed in until they expire — sign out on that device too.",
    };
  });
}
