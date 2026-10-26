import type { CalendarItem, Clash, Conference, FeedCard, FeedResponse, PastGraphResponse } from "@hallway/types";
import type { Graph } from "falkordb";
import { findClashes, getCalendar } from "../calendar.ts";
import { agendaFor } from "./agenda.ts";
import { exploreFor } from "./explore.ts";
import { requestsSent } from "./invites.ts";
import { deckFor } from "./people.ts";

/** My Feed: calendar, clashes, confirmed cards with detail, requests sent, and suggestions. */
export async function feedFor(graph: Graph, me: string, conference: Conference): Promise<FeedResponse> {
  const calendar = await getCalendar(graph, me);
  const clashes: Clash[] = [];
  calendar.forEach((item, i) => clashes.push(...findClashes(calendar.slice(i + 1), item)));

  const details = await graph.roQuery<{ id: string; label: string; abstract: string | null; place: string | null; note: string | null; speakers: string[]; hosts: string[]; withName: string | null }>(
    `UNWIND $ids AS id MATCH (x {id: id})
     OPTIONAL MATCH (s:Person)-[:SPEAKS_AT]->(x)
     OPTIONAL MATCH (h)-[:HOSTS]->(x)
     OPTIONAL MATCH (x)-[:WITH]->(o:Person)
     RETURN id, labels(x)[0] AS label, x.abstract AS abstract, x.place AS place, x.note AS note,
            collect(DISTINCT s.name) AS speakers, collect(DISTINCT h.name) AS hosts, head(collect(o.name)) AS withName`,
    { params: { ids: calendar.map((c) => c.id) as never } },
  );
  const describe = (d: NonNullable<typeof details.data>[number]): string => {
    switch (d.label) {
      case "Talk":
        return [d.abstract ?? "", d.speakers.length ? `With ${d.speakers.slice(0, 3).join(", ")}` : ""].filter(Boolean).join(" · ");
      case "SideEvent":
        return d.hosts.length ? `Hosted by ${d.hosts.slice(0, 2).join(", ")}` : "Side event";
      case "Meeting":
        return [`Meeting ${d.withName ?? ""} at ${d.place ?? ""}`.trim(), d.note ?? ""].filter(Boolean).join(" · ");
      default:
        return "";
    }
  };
  const detailBy = new Map((details.data ?? []).map((d) => [d.id, describe(d)]));
  const confirmed: FeedCard[] = calendar
    .filter((c: CalendarItem) => c.kind !== "busy")
    .map((item) => ({ item, detail: (detailBy.get(item.id) ?? "").slice(0, 280) }));

  const [agenda, deck, explore, requests] = await Promise.all([
    agendaFor(graph, me, conference),
    deckFor(graph, me, conference),
    exploreFor(graph, me, conference),
    requestsSent(graph, me),
  ]);
  const suggestions: FeedResponse["suggestions"] = [
    ...agenda.filter((a) => !a.planned && !a.clashes.length).slice(0, 2).map((item) => ({ kind: "session" as const, item })),
    ...deck.slice(0, 2).map((card) => ({ kind: "person" as const, card })),
    ...explore.filter((e) => !e.planned && !e.clashes.length).slice(0, 1).map((item) => ({ kind: "event" as const, item })),
  ];
  return { conference, calendar, clashes, confirmed, requests, suggestions };
}

/** Agenda / Past: everything the user did in Hallway, as a graph (docs/ARCHITECTURE.md#queries). */
export async function pastGraph(graph: Graph, me: string): Promise<PastGraphResponse> {
  const res = await graph.roQuery<{ a: { id: string; label: string; name: string | null }; type: string; props: Record<string, string | number | boolean>; b: { id: string; label: string; name: string | null; status: string | null } }>(
    `MATCH (u:Person {id: $me})-[r:TARGETS|PLANS|SWIPED|ORGANIZES|MET|HAS_GOAL|PREFERS|INTERESTED_IN|SKILLED_IN|WORKED_AT|WORKS_AT]->(n)
     RETURN {id: u.id, label: labels(u)[0], name: u.name} AS a, type(r) AS type, properties(r) AS props,
            {id: n.id, label: labels(n)[0], name: coalesce(n.name, n.title, n.place), status: n.status} AS b
     UNION ALL
     MATCH (:Person {id: $me})-[:ORGANIZES]->(m:Meeting)-[r:WITH]->(p:Person)
     RETURN {id: m.id, label: 'Meeting', name: 'Meeting at ' + m.place} AS a, 'WITH' AS type, properties(r) AS props,
            {id: p.id, label: 'Person', name: p.name, status: null} AS b
     LIMIT 200`,
    { params: { me } },
  );
  const nodes = new Map<string, PastGraphResponse["nodes"][number]>();
  const edges: PastGraphResponse["edges"] = [];
  for (const row of res.data ?? []) {
    for (const n of [row.a, row.b] as { id: string; label: string; name: string | null; status?: string | null }[]) {
      if (nodes.has(n.id)) continue;
      nodes.set(n.id, { id: n.id, label: n.label as PastGraphResponse["nodes"][number]["label"], name: n.name ?? n.id, ...(n.status ? { props: { status: n.status } } : {}) });
    }
    const { id: _id, ...props } = row.props ?? {};
    edges.push({ id: String(row.props?.id ?? `${row.a.id}|${row.type}|${row.b.id}`), type: row.type as never, from: row.a.id, to: row.b.id, ...(Object.keys(props).length ? { props } : {}) });
  }
  return { nodes: [...nodes.values()], edges };
}
