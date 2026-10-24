import { createHash, randomBytes } from "node:crypto";

export const newToken = () => randomBytes(16).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Origin for links people open on their phones: PUBLIC_URL (the tunnel) when set. */
export function publicOrigin(req: Request): string {
  return (process.env.PUBLIC_URL?.startsWith("https://") ? process.env.PUBLIC_URL : new URL(req.url).origin).replace(/\/$/, "");
}

/** Prefilled Google Calendar "create event" link. */
export function gcalUrl({ title, start, end, place, details }: { title: string; start: string; end: string; place: string; details: string }) {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", title);
  url.searchParams.set("dates", `${fmt(start)}/${fmt(end)}`);
  url.searchParams.set("location", place);
  url.searchParams.set("details", details);
  return url.toString();
}
