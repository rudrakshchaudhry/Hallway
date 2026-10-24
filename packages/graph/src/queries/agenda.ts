import type { AgendaItem, Conference, PastTalk, Person, Talk } from "@hallway/types";
import type { Graph } from "falkordb";
import { findClashes, getCalendar } from "../calendar.ts";
import { loadMe, toNode, walk, type RawNode } from "./shared.ts";

type Row = { t: RawNode; speakers: RawNode[]; topics: { id: string; name: string }[]; hiring: number };
type RerunRow = { id: string; old: RawNode; score: number };

/**
 * Session priority (PLAN.md 6.2 #2): the conference's talks scored by topic match, goal
 * boosts and learned preferences, with rerun flags and clashes against the user's calendar.
 */
export async function agendaFor(graph: Graph, me: string, conference: Conference): Promise<AgendaItem[]> {
  const user = await loadMe(graph, me);
  const res = await graph.roQuery<Row>(
    `MATCH (t:Talk)-[:PART_OF]->(:Conference {id: $conf})
     OPTIONAL MATCH (s:Person)-[:SPEAKS_AT]->(t)
     OPTIONAL MATCH (t)-[:ABOUT]->(tp:Topic)
     OPTIONAL MATCH (s)-[:WORKS_AT]->(:Company)-[:HIRING_FOR]->(sk:Skill)<-[:SKILLED_IN]-(:Person {id: $me})
     RETURN t, collect(DISTINCT s) AS speakers, collect(DISTINCT {id: tp.id, name: tp.name}) AS topics, count(DISTINCT sk) AS hiring`,
    { params: { conf: conference.id, me } },
  );
  const reruns = await graph.roQuery<RerunRow>(
    `MATCH (s:Person)-[:SPEAKS_AT]->(t:Talk)-[r:SIMILAR_TO]->(old:PastTalk)<-[:GAVE]-(s)
     WHERE r.score > 0.8 AND (t)-[:PART_OF]->(:Conference {id: $conf})
     RETURN t.id AS id, old, r.score AS score`,
    { params: { conf: conference.id } },
  );
  const rerunBy = new Map((reruns.data ?? []).map((r) => [r.id, r]));
  const calendar = await getCalendar(graph, me);
  const planned = new Set(calendar.map((c) => c.id));

  const items = (res.data ?? []).flatMap((row): AgendaItem[] => {
    const talk = toNode(row.t, "Talk") as Talk | null;
    if (!talk) return [];
    const speakers = row.speakers.map((s) => toNode(s, "Person")).filter((p): p is Person => !!p);
    const topics = row.topics.filter((t) => t.id);
    const matched = topics.filter((t) => user.topics.has(t.id));
    const reasons: string[] = [];
    let priority = 0;
    if (matched.length) {
      priority += 2 * matched.length;
      reasons.push(`About ${matched.map((t) => t.name).join(", ")}`);
    }
    for (const t of topics) priority += user.prefs.get(t.id) ?? 0;
    if (user.goals.has("learn") && talk.kind === "workshop") {
      priority += 1.5;
      reasons.push("Hands-on workshop");
    }
    if (user.goals.has("networking") && (talk.kind === "keynote" || talk.kind === "panel")) {
      priority += 1;
      reasons.push(talk.kind === "panel" ? "Panel: lots of people to meet" : "Keynote");
    }
    if (user.goals.has("job") && row.hiring > 0) {
      priority += 1.5;
      reasons.push("Speaker's company is hiring for your skills");
    }
    const rerun = rerunBy.get(talk.id);
    const pastTalk = rerun ? (toNode(rerun.old, "PastTalk") as PastTalk | null) : null;
    if (pastTalk) {
      priority -= 1;
      reasons.push(`Rerun of a ${pastTalk.year} ${pastTalk.conf} talk`);
    }
    const first = matched[0];
    return [
      {
        talk,
        speakers,
        priority,
        reasons: reasons.length ? reasons : [talk.kind === "keynote" ? "Keynote" : "On the schedule"],
        ...(pastTalk && rerun ? { rerun: { pastTalk, similarity: rerun.score } } : {}),
        planned: planned.has(talk.id),
        clashes: planned.has(talk.id) ? [] : findClashes(calendar, talk),
        ...(first
          ? {
              path: walk(
                [
                  { id: me, label: "Person", name: user.name },
                  { id: first.id, label: "Topic", name: first.name },
                  { id: talk.id, label: "Talk", name: talk.title },
                ],
                ["INTERESTED_IN", "ABOUT"],
                [true, false],
                [`You're into ${first.name}`, `"${talk.title}" is about ${first.name}`],
              ),
            }
          : {}),
      },
    ];
  });
  return items.sort((a, b) => b.priority - a.priority || Date.parse(a.talk.start) - Date.parse(b.talk.start));
}
