import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { TeacherAdmin } from "./teacher-admin";

// Account changes have to be visible the moment they are made — an admin who
// resets a passcode and sees the old list can't tell whether it worked.
export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const admin = await requireAdmin();

  const teachers = await prisma.teacher.findMany({
    // Admins first, then retired accounts sink below the people who can sign in.
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      _count: { select: { bookings: true } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 pt-9 pb-25">
      <Link
        href="/admin"
        className="text-muted-3 hover:text-fg mb-4 inline-block text-[13px] no-underline"
      >
        &larr; Admin
      </Link>
      <h1 className="font-display m-0 mb-1.5 text-[28px] font-semibold tracking-[-0.025em]">
        Teacher accounts
      </h1>
      <p className="text-muted-3 m-0 mb-[26px] text-[14.5px]">
        One account per teacher, keyed on their school email. Teachers sign
        themselves up and choose their own password; the passcodes issued here
        are for seeding an account or unlocking someone who is stuck. They are
        stored hashed, so a lost one is reset rather than looked up.
      </p>

      <TeacherAdmin
        teachers={teachers.map((t) => ({
          id: t.id,
          name: t.name,
          email: t.email,
          role: t.role,
          active: t.active,
          bookings: t._count.bookings,
        }))}
        currentAdminId={admin.id}
      />
    </main>
  );
}
