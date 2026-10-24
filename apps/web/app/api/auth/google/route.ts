import { NextResponse } from "next/server";
import { googleAuthUrl, stateCookie } from "@/lib/google";

export async function GET() {
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(googleAuthUrl(state));
  response.cookies.set(stateCookie, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
