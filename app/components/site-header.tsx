"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LAB_NAME } from "@/lib/branding";
import type { Session } from "@/lib/auth";

// What every signed-in teacher gets. The admin screens are a separate area and
// are added to this list below rather than shown to everyone and then bounced by
// the proxy.
const TEACHER_LINKS = [
  { href: "/availability", label: "Availability" },
  { href: "/book", label: "Book a slot" },
  { href: "/my", label: "My bookings" },
] as const;

const ADMIN_LINKS = [
  { href: "/admin", label: "Admin" },
  { href: "/bookings", label: "All bookings" },
] as const;

export function SiteHeader({ session }: { session: Session | null }) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const links = session
    ? session.role === "ADMIN"
      ? [...TEACHER_LINKS, ...ADMIN_LINKS]
      : TEACHER_LINKS
    : [];

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // The cookie may still be live, so don't claim otherwise — sending the
      // teacher to /login either way makes the outcome visible: they land on
      // the form if it worked, and back on the app if it didn't.
    }
    // Full navigation so the cleared cookie is what the next request carries.
    window.location.replace("/login");
  }

  return (
    <header className="border-line sticky top-0 z-50 border-b bg-[rgba(9,9,11,0.82)] backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-5 gap-y-3 px-6 py-3.5">
        <Link
          href="/"
          className="mr-auto flex items-center gap-2.5 text-fg no-underline"
        >
          <span className="bg-accent text-ink font-display grid size-[26px] place-items-center rounded-[7px] text-sm font-bold">
            L
          </span>
          <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">
            {LAB_NAME}
          </span>
        </Link>

        {session ? (
          <>
            {/* Which account the staff-room laptop is currently signed in as —
                bookings are attributed to it, so it must not be a guess. */}
            <span className="text-muted-3 hidden text-[13px] sm:inline">
              {session.name}
              {session.role === "ADMIN" && (
                <span className="border-edge text-muted-2 ml-2 rounded-[5px] border px-1.5 py-0.5 text-[11px] tracking-[0.06em] uppercase">
                  Admin
                </span>
              )}
            </span>
            <nav className="border-edge flex flex-wrap items-center gap-1 rounded-[10px] border bg-[#131316] p-1">
              {links.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-[7px] px-3.5 py-[7px] text-[13.5px] font-medium no-underline ${
                      active
                        ? "bg-[#26262b] text-fg"
                        : "text-muted-3 hover:text-fg"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="text-muted-3 hover:text-fg cursor-pointer rounded-[7px] px-3.5 py-[7px] text-[13.5px] font-medium disabled:opacity-60"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </nav>
          </>
        ) : (
          <Link
            href="/login"
            className="border-edge-strong text-fg rounded-[10px] border px-4 py-2 text-[13.5px] font-medium no-underline"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
