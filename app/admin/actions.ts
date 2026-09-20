"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { createAccount } from "@/lib/teachers";
import { generatePassword } from "@/lib/accounts";
import {
  EMAIL_RULE,
  NAME_RULE,
  normaliseEmail,
  normaliseName,
} from "@/lib/account-rules";
import type { Role } from "@/lib/auth";
import type { ActionResult } from "@/app/admin/action-result";

/**
 * Everything the admin screens can change. These are reachable by POST without
 * going through the page that renders the button, so each one starts with
 * `requireAdmin()` — the proxy's cookie check is a convenience, not the
 * authorisation.
 */

/** Refreshes every screen that reads the Teacher table. */
function revalidateTeachers() {
  revalidatePath("/admin");
  revalidatePath("/admin/teachers");
}

/**
 * Keeps at least one admin able to sign in.
 *
 * This one rule is enough on its own. `requireAdmin()` only returns for an
 * account that is *currently* an active admin, so whoever is acting is already
 * one of the admins being counted — if the target is somebody else, there are at
 * least two, and demoting or retiring them leaves the actor. Refusing to act on
 * yourself therefore makes "no admins left" unreachable, and a separate
 * last-admin count would be dead code that implies a check that never runs.
 *
 * Recovery, if it ever were reached, is `scripts/teachers.mjs` against the
 * production database — which is exactly the situation worth not creating.
 */
function assertNotSelf(adminId: string, targetId: string) {
  if (adminId === targetId) {
    throw new Error(
      "You can't change your own role or retire your own account. Ask another admin.",
    );
  }
}

/** Turns a thrown guard into a result the screen can render. */
async function attempt(
  run: () => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    return await run();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

export async function createTeacher(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    await requireAdmin();

    const name = normaliseName(formData.get("name"));
    if (!name) return { ok: false, error: NAME_RULE };

    const email = normaliseEmail(formData.get("email"));
    if (!email) return { ok: false, error: EMAIL_RULE };

    const role: Role = formData.get("role") === "ADMIN" ? "ADMIN" : "TEACHER";

    // Teachers normally sign themselves up and pick their own password. This
    // path stays for the two cases that can't: seeding an admin, and making an
    // account for someone who hasn't got round to it. The generated passcode is
    // a starting point the teacher replaces from their profile page.
    const passcode = generatePassword();
    const created = await createAccount({ name, email, password: passcode, role });
    if (!created.ok) return { ok: false, error: created.error };

    revalidateTeachers();
    return {
      ok: true,
      message: `Created ${role === "ADMIN" ? "admin" : "teacher"} "${name}".`,
      credentials: { email, passcode },
    };
  });
}

export async function resetPasscode(id: string): Promise<ActionResult> {
  return attempt(async () => {
    await requireAdmin();

    const teacher = await prisma.teacher.findUnique({
      where: { id },
      select: { email: true, name: true },
    });
    if (!teacher) return { ok: false, error: "That account no longer exists." };

    const passcode = generatePassword();
    await prisma.teacher.update({
      where: { id },
      data: { passwordHash: await hashPassword(passcode) },
    });

    revalidateTeachers();
    return {
      ok: true,
      message: `New passcode for ${teacher.name}.`,
      credentials: { email: teacher.email, passcode },
    };
  });
}

export async function setRole(id: string, role: Role): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireAdmin();
    assertNotSelf(admin.id, id);

    const teacher = await prisma.teacher.update({
      where: { id },
      data: { role },
      select: { name: true },
    });

    revalidateTeachers();
    return {
      ok: true,
      message: `${teacher.name} is now ${role === "ADMIN" ? "an admin" : "a teacher"}.`,
    };
  });
}

export async function setActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireAdmin();
    assertNotSelf(admin.id, id);

    // Retiring keeps the row, so the bookings this teacher made keep pointing at
    // a name rather than becoming anonymous history.
    const teacher = await prisma.teacher.update({
      where: { id },
      data: { active },
      select: { name: true },
    });

    revalidateTeachers();
    return {
      ok: true,
      message: active
        ? `${teacher.name} can sign in again.`
        : `${teacher.name} can no longer sign in. Their bookings are kept.`,
    };
  });
}

/**
 * Frees a period. The row is deleted outright rather than flagged: `@@unique
 * ([date, period])` is what stops double-booking, so anything left behind would
 * keep the slot claimed and the next teacher would still be turned away.
 */
export async function cancelBooking(id: string): Promise<ActionResult> {
  return attempt(async () => {
    await requireAdmin();

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { teacherName: true, period: true },
    });
    if (!booking) return { ok: false, error: "That booking is already gone." };

    await prisma.booking.delete({ where: { id } });

    // Every screen that reads a period's occupancy.
    revalidatePath("/bookings");
    revalidatePath("/admin");
    revalidatePath("/availability");
    revalidatePath("/my");
    return {
      ok: true,
      message: `Cancelled ${booking.teacherName}'s period ${booking.period}.`,
    };
  });
}
