import type { CalendarItem, Clash, Conference } from "@hallway/types";
import type { Graph } from "falkordb";

const MINUTE = 60_000;
export const DEFAULT_EVENT_MINUTES = 120;

/** End of a talk, event or block; side events without an end last DEFAULT_EVENT_MINUTES. */
export function itemEnd(item: { start: string; end?: string | null }): string {
  return item.end ?? new Date(Date.parse(item.start) + DEFAULT_EVENT_MINUTES * MINUTE).toISOString();
}

type Row = { id: string; label: string; title: string; start: string; end: string | null; location: string | null };
type MeetingRow = { id: string; title: string; start: string; end: string; location: string; status: string; personId: string };
type BlockRow = { id: string; title: string; start: string; end: string };

/**
 * The user's calendar (query 5), by start: planned talks and side events, accepted meetings,
 * and busy blocks imported from their own calendar.
 */
export async function getCalendar(graph: Graph, me: string): Promise<CalendarItem[]> {
  const planned = await graph.roQuery<Row>(
    `MATCH (:Person {id: $me})-[:PLANS]->(x)
     WHERE x:Talk OR x:SideEvent
     RETURN x.id AS id, labels(x)[0] AS label, coalesce(x.title, x.name) AS title,
            x.start AS start, x.end AS end, coalesce(x.room, x.venue) AS location`,
    { params: { me } },
  );
  // Accepted meetings the user organised or was invited to.
  const meetings = await graph.roQuery<MeetingRow>(
    `MATCH (u:Person {id: $me})
     MATCH (a:Person)-[:ORGANIZES]->(m:Meeting {status: 'accepted'})-[:WITH]->(b:Person)
     WHERE a = u OR b = u
     WITH m, CASE WHEN a = u THEN b ELSE a END AS other
     RETURN m.id AS id, 'Meet ' + other.name AS title, m.start AS start, m.end AS end,
            m.place AS location, m.status AS status, other.id AS personId`,
    { params: { me } },
  );
  const blocks = await graph.roQuery<BlockRow>(
    `MATCH (:Person {id: $me})-[:HAS_BLOCK]->(b:CalendarBlock)
     RETURN b.id AS id, b.title AS title, b.start AS start, b.end AS end`,
    { params: { me } },
  );

  const items: CalendarItem[] = [
    ...(planned.data ?? []).map((r) => ({
      id: r.id,
      kind: r.label === "Talk" ? ("talk" as const) : ("event" as const),
      title: r.title,
      start: r.start,
      end: itemEnd(r),
      ...(r.location ? { location: r.location } : {}),
    })),
    ...(meetings.data ?? []).map((r) => ({
      id: r.id,
      kind: "meeting" as const,
      title: r.title,
      start: r.start,
      end: r.end,
      location: r.location,
      status: "accepted" as const,
      personId: r.personId,
    })),
    ...(blocks.data ?? []).map((r) => ({ id: r.id, kind: "busy" as const, title: r.title, start: r.start, end: r.end })),
  ];
  return items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Clash check (query 3): every calendar item the candidate overlaps. */
export function findClashes(calendar: CalendarItem[], candidate: Pick<CalendarItem, "id" | "start" | "end">): Clash[] {
  const start = Date.parse(candidate.start);
  const end = Date.parse(candidate.end);
  return calendar.flatMap((item) => {
    if (item.id === candidate.id) return [];
    const overlap = Math.min(end, Date.parse(item.end)) - Math.max(start, Date.parse(item.start));
    return overlap > 0
      ? [{ itemId: candidate.id, withId: item.id, withTitle: item.title, overlapMinutes: Math.max(1, Math.ceil(overlap / MINUTE)) }]
      : [];
  });
}

/** "+HH:MM"/"-HH:MM" offset of an IANA time zone at an instant. */
function offsetAt(tz: string, instant: number): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return match?.[1] ?? "+00:00";
}

/** Local calendar date (YYYY-MM-DD) of an instant in a time zone. */
function localDate(tz: string, instant: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/**
 * Conference hours, 09:00–18:00 venue time, for each conference day. Each day uses the
 * venue's own UTC offset, so DST changes are handled.
 */
export function conferenceDays(conference: Pick<Conference, "start" | "end" | "tz">): { start: string; end: string }[] {
  const tz = conference.tz;
  const last = localDate(tz, Date.parse(conference.end));
  const days: { start: string; end: string }[] = [];
  for (let day = localDate(tz, Date.parse(conference.start)); day <= last; day = nextDay(day)) {
    const offset = offsetAt(tz, Date.parse(`${day}T12:00:00Z`));
    days.push({ start: `${day}T09:00:00${offset}`, end: `${day}T18:00:00${offset}` });
  }
  return days;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Free slots of `minutes` inside the windows, avoiding every busy interval, starting no
 * earlier than `notBefore`. Slots start on 15-minute boundaries.
 */
export function freeSlots(
  windows: { start: string; end: string }[],
  busy: { start: string; end: string }[],
  { minutes = 30, limit = 3, notBefore = 0 }: { minutes?: number; limit?: number; notBefore?: number } = {},
): { start: string; end: string }[] {
  const step = 15 * MINUTE;
  const length = minutes * MINUTE;
  const blocks = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);
  const slots: { start: string; end: string }[] = [];
  for (const w of windows) {
    const wEnd = Date.parse(w.end);
    const align = (ms: number) => Math.ceil(ms / step) * step;
    let t = align(Math.max(Date.parse(w.start), notBefore));
    while (t + length <= wEnd && slots.length < limit) {
      const clash = blocks.find(([s, e]) => t < e && t + length > s);
      if (clash) {
        t = align(clash[1]);
        continue;
      }
      slots.push({ start: new Date(t).toISOString(), end: new Date(t + length).toISOString() });
      t = align(t + length);
    }
  }
  return slots;
}
