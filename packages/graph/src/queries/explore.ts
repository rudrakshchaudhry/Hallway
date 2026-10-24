import type { Conference, ExploreItem, SideEvent } from "@hallway/types";
import type { Graph } from "falkordb";
import { findClashes, getCalendar, itemEnd } from "../calendar.ts";
import { loadMe, toNode, walk, type RawNode } from "./shared.ts";

type Row = { e: RawNode; hosts: { id: string; label: string; name: string; headline: string | null }[]; speakerHosts: number };

/** Side events near the conference (PLAN.md 6.2 #4), ranked by learned preferences and host fit. */
export async function exploreFor(graph: Graph, me: string, conference: Conference): Promise<ExploreItem[]> {
  const user = await loadMe(graph, me);
  const res = await graph.roQuery<Row>(
    `MATCH (e:SideEvent)-[:NEAR]->(:Conference {id: $conf})
     OPTIONAL MATCH (h)-[:HOSTS]->(e)
     OPTIONAL MATCH (h)-[:SPEAKS_AT]->(:Talk)
     RETURN e, collect(DISTINCT {id: h.id, label: labels(h)[0], name: h.name, headline: h.headline}) AS hosts,
            count(DISTINCT h) AS speakerHosts`,
    { params: { conf: conference.id } },
  );
  const calendar = await getCalendar(graph, me);
  const planned = new Set(calendar.map((c) => c.id));
  return (res.data ?? [])
    .flatMap((row): ExploreItem[] => {
      const event = toNode(row.e, "SideEvent") as SideEvent | null;
      if (!event) return [];
      const hosts = row.hosts
        .filter((h) => h.id && (h.label === "Person" || h.label === "Company"))
        .map((h) => ({ id: h.id, label: h.label as "Person" | "Company", name: h.name, ...(h.headline ? { headline: h.headline } : {}) }));
      const prefScore = hosts.reduce((s, h) => s + (user.prefs.get(h.id) ?? 0), 0);
      const score = 1 + prefScore + (user.goals.has("networking") ? 0.5 : 0) + Math.min(hosts.length, 3) * 0.2;
      const reasons = [hosts.length ? `Hosted by ${hosts.slice(0, 2).map((h) => h.name).join(" and ")}` : "Public event", ...(user.goals.has("networking") ? ["Good for networking"] : [])];
      const host = hosts[0];
      const span = { id: event.id, start: event.start, end: itemEnd(event) };
      return [
        {
          event,
          hosts,
          topics: [],
          score: Math.round(score * 100) / 100,
          reasons,
          planned: planned.has(event.id),
          clashes: planned.has(event.id) ? [] : findClashes(calendar, span),
          ...(host
            ? {
                path: walk(
                  [
                    { id: host.id, label: host.label, name: host.name },
                    { id: event.id, label: "SideEvent", name: event.name },
                    { id: conference.id, label: "Conference", name: conference.name },
                  ],
                  ["HOSTS", "NEAR"],
                  [true, true],
                  [`${host.name} hosts ${event.name}`, `It's during ${conference.name}`],
                ),
              }
            : {}),
        },
      ];
    })
    .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));
}
