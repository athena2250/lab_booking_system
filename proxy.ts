import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";

// Paths only an ADMIN may open. Everything else behind the matcher is open to
// any signed-in teacher. This is an optimistic check on the signed cookie — the
// route handlers and pages re-read the account, so a demoted admin loses access
// without waiting for their session to expire.
const ADMIN_ONLY = ["/admin", "/bookings", "/api/admin"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const session = await verifySessionToken(req.cookies.get(COOKIE_NAME)?.value);

  if (!session) {
    // APIs get a status code; pages get a redirect.
    if (isApi) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const adminOnly = ADMIN_ONLY.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (adminOnly && session.role !== "ADMIN") {
    if (isApi) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    // A teacher who follows an admin link lands somewhere useful rather than on
    // a dead end — their own bookings are what they were probably after.
    return NextResponse.redirect(new URL("/my", req.url));
  }

  return NextResponse.next();
}

// `/login` and `/api/login` stay outside the matcher, or the redirect loops.
// `/` is the public overview page and stays outside it too.
export const config = {
  matcher: [
    "/book/:path*",
    "/availability/:path*",
    "/my/:path*",
    "/bookings/:path*",
    "/admin/:path*",
    "/api/bookings/:path*",
    "/api/availability/:path*",
    "/api/admin/:path*",
  ],
};
