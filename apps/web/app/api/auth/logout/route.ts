import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/google";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete(sessionCookie);
  return response;
}
