import { Conference, type ConferenceSummary } from "@hallway/types";
import type { Graph } from "falkordb";

type Row = { c: { properties: Record<string, unknown> }; talks: number; speakers: number; events: number };

/** Every ingested conference with talk, speaker and side-event counts, newest first. */
export async function listConferences(graph: Graph): Promise<ConferenceSummary[]> {
  const res = await graph.roQuery<Row>(
    `MATCH (c:Conference)
     OPTIONAL MATCH (t:Talk)-[:PART_OF]->(c)
     OPTIONAL MATCH (s:Person)-[:SPEAKS_AT]->(t)
     WITH c, count(DISTINCT t) AS talks, count(DISTINCT s) AS speakers
     OPTIONAL MATCH (e:SideEvent)-[:NEAR]->(c)
     RETURN c, talks, speakers, count(DISTINCT e) AS events`,
  );
  const list = (res.data ?? []).flatMap((row) => {
    const parsed = Conference.safeParse({ label: "Conference", ...row.c.properties });
    return parsed.success ? [{ conference: parsed.data, counts: { talks: row.talks, speakers: row.speakers, events: row.events } }] : [];
  });
  // Sort by instant, not by string: start times may carry different UTC offsets.
  return list.sort((a, b) => Date.parse(b.conference.start) - Date.parse(a.conference.start));
}

export async function getConference(graph: Graph, id: string) {
  return (await listConferences(graph)).find((c) => c.conference.id === id)?.conference;
}
