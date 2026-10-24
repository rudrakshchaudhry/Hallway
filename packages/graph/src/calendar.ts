import type { CalendarItem, Clash, Conference } from "@hallway/types";
import type { Graph } from "falkordb";

const MINUTE = 60_000;
const DEFAULT_EVENT_MINUTES = 120;

type Row = { id: string; label: string; title: string; start: string; end: string | null; location: string | null };
type MeetingRow = { id: string; title: string; start: string; end: string; location: string; status: string; personId: string };

/** The user's confirmed items (query 5): planned talks and side events plus accepted meetings, by start. */
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

  const items: CalendarItem[] = [
    ...(planned.data ?? []).map((r) => ({
      id: r.id,
      kind: r.label === "Talk" ? ("talk" as const) : ("event" as const),
      title: r.title,
      start: r.start,
      end: r.end ?? new Date(Date.parse(r.start) + DEFAULT_EVENT_MINUTES * MINUTE).toISOString(),
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
      ? [{ itemId: candidate.id, withId: item.id, withTitle: item.title, overlapMinutes: Math.round(overlap / MINUTE) }]
      : [];
  });
}

/** Conference hours (09:00–18:00 venue time) for each conference day, in the conference's UTC offset. */
export function conferenceDays(conference: Pick<Conference, "start" | "end">): { start: string; end: string }[] {
  const offset = conference.start.match(/([+-]\d{2}:\d{2}|Z)$/)?.[1] ?? "Z";
  const days: { start: string; end: string }[] = [];
  const first = conference.start.slice(0, 10);
  const last = conference.end.slice(0, 10);
  for (let day = first; day <= last; day = nextDay(day)) {
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
    let t = Math.max(Date.parse(w.start), Math.ceil(notBefore / step) * step);
    while (t + length <= wEnd && slots.length < limit) {
      const clash = blocks.find(([s, e]) => t < e && t + length > s);
      if (clash) {
        t = Math.ceil(clash[1] / step) * step;
        continue;
      }
      slots.push({ start: new Date(t).toISOString(), end: new Date(t + length).toISOString() });
      t += length;
    }
  }
  return slots;
}
