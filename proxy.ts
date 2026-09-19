import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const ok = await verifySessionToken(req.cookies.get(COOKIE_NAME)?.value);
  if (ok) return NextResponse.next();

  // APIs get a status code; pages get a redirect.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

// `/login` and `/api/login` stay outside the matcher, or the redirect loops.
// `/` is the public overview page and stays outside it too.
export const config = {
  matcher: [
    "/book/:path*",
    "/availability/:path*",
    "/bookings/:path*",
    "/api/bookings/:path*",
    "/api/availability/:path*",
  ],
};
