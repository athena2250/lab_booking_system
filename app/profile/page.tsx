import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { currentAccount } from "@/lib/teachers";
import { NameForm, PasswordForm } from "./profile-forms";

// A teacher opens this straight after changing something, so it must never be
// served from a cache built before that change.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireSession();

  // Not the cookie's copy: it holds the name and role as they were when the
  // teacher signed in, and this is the page where those are edited.
  const account = await currentAccount(session.teacherId);
  if (!account) {
    // The proxy let them through on a still-valid signature, but the row behind
    // it has been retired since. Nothing here is theirs to edit any more.
    return (
      <main className="mx-auto w-full max-w-[720px] px-6 pt-9 pb-25">
        <h1 className="font-display m-0 mb-1.5 text-[28px] font-semibold tracking-[-0.025em]">
          Account unavailable
        </h1>
        <p className="text-muted-3 m-0 text-[14.5px]">
          This account can no longer sign in. Ask the lab in-charge to restore
          it.
        </p>
      </main>
    );
  }

  const [teacher, bookings] = await Promise.all([
    prisma.teacher.findUnique({
      where: { id: account.id },
      select: { createdAt: true },
    }),
    prisma.booking.count({ where: { teacherId: account.id } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-[720px] px-6 pt-9 pb-25">
      <h1 className="font-display m-0 mb-1.5 text-[28px] font-semibold tracking-[-0.025em]">
        Your profile
      </h1>
      <p className="text-muted-3 m-0 mb-[26px] text-[14.5px]">
        Your sign-in details and what the lab knows about you.
      </p>

      <dl className="border-edge bg-surface mb-6 grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl border p-5 sm:grid-cols-4">
        <Fact label="Name" value={account.name} />
        <Fact label="Role" value={account.role === "ADMIN" ? "Admin" : "Teacher"} />
        <Fact
          label="Lab periods"
          value={
            <Link href="/my" className="text-accent-2 no-underline">
              {bookings}
            </Link>
          }
        />
        <Fact
          label="Account since"
          value={teacher ? formatDate(teacher.createdAt) : "—"}
        />
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-muted-2 mb-1.5 text-[11px] tracking-[0.1em] uppercase">
            School email
          </dt>
          <dd className="text-fg-2 m-0 font-mono text-[14px] break-all">
            {account.email}
          </dd>
          <p className="text-muted-3 mt-1.5 mb-0 text-[12px]">
            This is how you sign in. It was issued by the school, so it can only
            be changed by the lab in-charge.
          </p>
        </div>
      </dl>

      <div className="flex flex-col gap-6">
        <NameForm name={account.name} />
        <PasswordForm />
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-2 mb-1.5 text-[11px] tracking-[0.1em] uppercase">
        {label}
      </dt>
      <dd className="text-fg-2 m-0 text-[15px]">{value}</dd>
    </div>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
