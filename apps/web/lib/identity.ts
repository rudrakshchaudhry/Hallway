import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// "Me" for every API route. Write routes never take the user from the request body
// (PLAN.md 6.4); they call getMe(). Without a cookie, the demo persona is used, which is
// what "Use demo profile" means in this single-laptop demo.
export const IDENTITY_COOKIE = "hallway_user";

// Without COOKIE_SECRET, a random per-process secret: cookies reset on restart, but nobody
// can forge one from the source code.
// Shared via globalThis: Next bundles routes separately, and every route must sign and verify alike.
const g = globalThis as typeof globalThis & { __hallwayCookieSecret?: string };
g.__hallwayCookieSecret ??= randomBytes(32).toString("hex");
const fallbackSecret = g.__hallwayCookieSecret;

function sign(personId: string): string {
  const secret = process.env.COOKIE_SECRET || fallbackSecret;
  return createHmac("sha256", secret).update(personId).digest("base64url");
}

export function demoPersonId(): string {
  return `person:${process.env.DEMO_HANDLE || "demo"}`;
}

/** Signed cookie value for a person id. */
export function identityValue(personId: string): string {
  return `${personId}.${sign(personId)}`;
}

export function verifyIdentity(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const personId = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(personId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? personId : null;
}

/** The signed-in user from the cookie, or null (no demo fallback). */
export async function getCookieIdentity(): Promise<string | null> {
  return verifyIdentity((await cookies()).get(IDENTITY_COOKIE)?.value);
}

/** The current user's Person id. */
export async function getMe(): Promise<string> {
  return verifyIdentity((await cookies()).get(IDENTITY_COOKIE)?.value) ?? demoPersonId();
}

/** Called by POST /api/profile after onboarding. */
export async function setMe(personId: string): Promise<void> {
  (await cookies()).set(IDENTITY_COOKIE, identityValue(personId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
