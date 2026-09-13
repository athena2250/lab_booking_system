import { NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}
