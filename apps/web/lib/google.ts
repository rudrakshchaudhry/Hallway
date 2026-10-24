import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";

function loadRootEnv() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      if (!process.env[key]) process.env[key] = value;
    }
    return;
  }
}

loadRootEnv();

const SESSION = "hallway_google";
const STATE = "hallway_oauth_state";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export type Session = {
  refreshToken: string;
  email: string;
  /** The Hallway person who connected this Google account; other profiles never see it. */
  personId: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  time: string;
  day: string;
  place: string;
  allDay: boolean;
  /** Minutes from midnight in the calendar timezone. Empty for an all-day event. */
  minutes: number | null;
  /** ISO start instant, or YYYY-MM-DD for all-day events. */
  start: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function googleAuthUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", required("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", required("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    redirect_uri: required("GOOGLE_REDIRECT_URI"),
    grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("Google token exchange failed");
  return response.json() as Promise<TokenResponse>;
}

export async function accessTokenFor(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("Google refresh failed");
  const json = (await response.json()) as TokenResponse;
  return json.access_token;
}

export async function googleEmail(accessToken: string): Promise<string> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Google profile failed");
  const json = (await response.json()) as { email?: string };
  return json.email ?? "Signed in";
}

// The session holds a Google refresh token, so the cookie is encrypted and authenticated
// (AES-256-GCM). Without COOKIE_SECRET a per-process key is used: sessions end on restart.
const fallbackKey = randomBytes(32);
const sessionKey = () =>
  process.env.COOKIE_SECRET ? createHash("sha256").update(`google-session:${process.env.COOKIE_SECRET}`).digest() : fallbackKey;

export function encodeSession(session: Session): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function decodeSession(raw: string): Session | null {
  const buf = Buffer.from(raw, "base64url");
  if (buf.length < 29) return null;
  const decipher = createDecipheriv("aes-256-gcm", sessionKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  return JSON.parse(json) as Session;
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION)?.value;
  if (!raw) return null;
  try {
    const parsed = decodeSession(raw);
    if (!parsed?.refreshToken) return null;
    const { getMe } = await import("./identity");
    if (parsed.personId !== (await getMe())) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const sessionCookie = SESSION;
export const stateCookie = STATE;

type GoogleEvent = {
  id: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
};

function dayBounds(timeZone: string, now = new Date()): { timeMin: string; timeMax: string; label: string } {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return {
    label,
    timeMin: wallTimeToIso(date, "00:00:00", timeZone),
    timeMax: wallTimeToIso(date, "23:59:59", timeZone),
  };
}

function wallTimeToIso(date: string, time: string, timeZone: string): string {
  const guess = new Date(`${date}T${time}Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second),
  );
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString();
}

async function calendarTimeZone(accessToken: string): Promise<string> {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const calendar = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!calendar.ok) return fallback;
  const meta = (await calendar.json()) as { timeZone?: string };
  return meta.timeZone || fallback;
}

async function listEvents(accessToken: string, timeMin: string, timeMax: string): Promise<GoogleEvent[]> {
  const items: GoogleEvent[] = [];
  let pageToken = "";
  // Follow nextPageToken to the end (hard stop at 40 pages / 2,000 events).
  for (let page = 0; page < 40; page += 1) {
    const listUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    listUrl.searchParams.set("timeMin", timeMin);
    listUrl.searchParams.set("timeMax", timeMax);
    listUrl.searchParams.set("singleEvents", "true");
    listUrl.searchParams.set("orderBy", "startTime");
    listUrl.searchParams.set("maxResults", "50");
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);
    const listed = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listed.ok) {
      const detail = await listed.text();
      throw new Error(`Google events failed (${listed.status}) ${detail.slice(0, 180)}`);
    }
    const body = (await listed.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
    items.push(...(body.items ?? []));
    pageToken = body.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return items;
}

function toCalendarEvent(item: GoogleEvent, timeZone: string): CalendarEvent {
  const allDay = Boolean(item.start?.date && !item.start.dateTime);
  const start = item.start?.dateTime ? new Date(item.start.dateTime) : null;
  const daySource = item.start?.dateTime ?? item.start?.date ?? "";
  const day = daySource
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: item.start?.dateTime ? timeZone : "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(item.start?.dateTime ? new Date(daySource) : new Date(`${daySource}T00:00:00Z`))
    : "";
  const clock = start
    ? new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        hour: "2-digit",
        minute: "2-digit",
      }).formatToParts(start)
    : [];
  const clockPart = Object.fromEntries(clock.map((part) => [part.type, part.value]));
  const hour = Number(clockPart.hour);
  const minute = Number(clockPart.minute);
  return {
    id: item.id,
    title: item.summary ?? "Busy",
    time: start ? new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(start) : "All day",
    day,
    place: item.location ?? "",
    allDay,
    minutes: start && Number.isFinite(hour) && Number.isFinite(minute) ? (hour % 24) * 60 + minute : null,
    // Raw start (ISO instant, or YYYY-MM-DD for all-day) so callers can bucket in their own zone.
    start: item.start?.dateTime ?? item.start?.date ?? "",
  };
}

export async function todaysEvents(accessToken: string): Promise<{ label: string; events: CalendarEvent[] }> {
  const timeZone = await calendarTimeZone(accessToken);
  const bounds = dayBounds(timeZone);
  const items = await listEvents(accessToken, bounds.timeMin, bounds.timeMax);
  return { label: bounds.label, events: items.map((item) => toCalendarEvent(item, timeZone)) };
}

/** Events that started before today, newest first. Today itself stays on the Today screen. */
export async function pastEvents(accessToken: string): Promise<CalendarEvent[]> {
  const timeZone = await calendarTimeZone(accessToken);
  const today = dayBounds(timeZone);
  const start = new Date(today.timeMin);
  start.setUTCDate(start.getUTCDate() - 180);
  const items = await listEvents(accessToken, start.toISOString(), today.timeMin);
  return items.map((item) => toCalendarEvent(item, timeZone)).reverse();
}

/** Events between two instants (e.g. the conference days), in the calendar's own time zone. */
export async function eventsBetween(accessToken: string, timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  const timeZone = await calendarTimeZone(accessToken);
  return (await listEvents(accessToken, timeMin, timeMax)).map((item) => toCalendarEvent(item, timeZone));
}

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
