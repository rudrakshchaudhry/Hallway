import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accessTokenFor, encodeSession, exchangeCode, googleEmail, sessionCookie, stateCookie } from "@/lib/google";
import { getMe } from "@/lib/identity";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = (await cookies()).get(stateCookie)?.value;
  const home = new URL("/", url.origin);

  if (!code || !state || !saved || saved !== state) {
    home.searchParams.set("auth", "denied");
    return NextResponse.redirect(home);
  }

  try {
    const tokens = await exchangeCode(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("No refresh token");
    const accessToken = tokens.access_token || (await accessTokenFor(refreshToken));
    const email = await googleEmail(accessToken);
    const feed = new URL("/feed", url.origin);
    const response = NextResponse.redirect(feed);
    response.cookies.set(sessionCookie, encodeSession({ refreshToken, email, personId: await getMe() }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.delete(stateCookie);
    return response;
  } catch {
    home.searchParams.set("auth", "failed");
    return NextResponse.redirect(home);
  }
}
