import { edgeId, type Conference, type DeckCard, type Person, type SideEvent, type Tag, type Talk, type Whereabouts } from "@hallway/types";
import type { Graph } from "falkordb";
import { loadMe, toNode, walk, type Me, type RawNode } from "./shared.ts";

// Signal weights for the deck (docs/ARCHITECTURE.md#queries, #swipe-learning).
const WEIGHT: Record<Tag, number> = {
  "shared-stack": 3,
  "in-your-sessions": 2.5,
  "ex-colleague": 2,
  "same-topic": 1.5,
  hiring: 1.5,
  speaker: 0.5,
  host: 0.5,
};

type Signal = { tag: Tag; via: { id: string; name: string; label: "Package" | "Topic" | "Company" | "Talk" | "Skill" | "Repo" }; extra?: { id: string; name: string } };
type Candidate = { person: Person; signals: Signal[]; features: Set<string> };

const AT_CONF = `((p)-[:SPEAKS_AT]->(:Talk)-[:PART_OF]->(:Conference {id: $conf}) OR (p)-[:HOSTS]->(:SideEvent)-[:NEAR]->(:Conference {id: $conf}))`;
const NOT_DONE = `p.id <> $me AND NOT (:Person {id: $me})-[:SWIPED]->(p) AND NOT (:Person {id: $me})-[:MET]->(p)`;

async function rows<T>(graph: Graph, cypher: string, params: Record<string, string>) {
  return (await graph.roQuery<T>(cypher, { params })).data ?? [];
}

/** Ranked swipe-deck cards for the user at a conference, optionally filtered by tag. */
export async function deckFor(graph: Graph, me: string, conference: Conference, tag?: Tag): Promise<DeckCard[]> {
  const user = await loadMe(graph, me);
  const params = { me, conf: conference.id };
  const candidates = new Map<string, Candidate>();
  const add = (raw: RawNode, signal: Signal, features: string[]) => {
    const person = toNode(raw, "Person");
    if (!person) return;
    const c = candidates.get(person.id) ?? { person, signals: [], features: new Set<string>() };
    if (!c.signals.some((s) => s.tag === signal.tag)) c.signals.push(signal);
    features.forEach((f) => c.features.add(f));
    candidates.set(person.id, c);
  };

  for (const r of await rows<{ p: RawNode; repo: string; pkg: string; pkgName: string }>(graph,
    `MATCH (:Person {id: $me})-[:OWNS]->(r:Repo)-[:DEPENDS_ON]->(k:Package)<-[:MAINTAINS]-(p:Person)
     WHERE ${NOT_DONE} AND ${AT_CONF} RETURN p, r.fullName AS repo, k.id AS pkg, k.name AS pkgName LIMIT 100`, params)) {
    add(r.p, { tag: "shared-stack", via: { id: r.pkg, name: r.pkgName, label: "Package" }, extra: { id: "", name: r.repo } }, []);
  }
  for (const r of await rows<{ p: RawNode; topic: string; topicName: string; talk: string; title: string }>(graph,
    `MATCH (:Person {id: $me})-[:INTERESTED_IN]->(t:Topic)<-[:ABOUT]-(k:Talk)<-[:SPEAKS_AT]-(p:Person)
     WHERE ${NOT_DONE} AND (k)-[:PART_OF]->(:Conference {id: $conf})
     RETURN p, t.id AS topic, t.name AS topicName, k.id AS talk, k.title AS title LIMIT 300`, params)) {
    add(r.p, { tag: "same-topic", via: { id: r.topic, name: r.topicName, label: "Topic" }, extra: { id: r.talk, name: r.title } }, [r.topic]);
  }
  for (const r of await rows<{ p: RawNode; company: string; companyName: string }>(graph,
    `MATCH (:Person {id: $me})-[:WORKED_AT|WORKS_AT]->(c:Company)<-[:WORKS_AT|WORKED_AT]-(p:Person)
     WHERE ${NOT_DONE} AND ${AT_CONF} RETURN p, c.id AS company, c.name AS companyName LIMIT 100`, params)) {
    add(r.p, { tag: "ex-colleague", via: { id: r.company, name: r.companyName, label: "Company" } }, [r.company]);
  }
  for (const r of await rows<{ p: RawNode; talk: string; title: string }>(graph,
    `MATCH (:Person {id: $me})-[:PLANS]->(k:Talk)<-[:SPEAKS_AT]-(p:Person)
     WHERE ${NOT_DONE} AND (k)-[:PART_OF]->(:Conference {id: $conf}) RETURN p, k.id AS talk, k.title AS title LIMIT 100`, params)) {
    add(r.p, { tag: "in-your-sessions", via: { id: r.talk, name: r.title, label: "Talk" } }, []);
  }
  for (const r of await rows<{ p: RawNode; company: string; companyName: string; skill: string; skillName: string }>(graph,
    `MATCH (:Person {id: $me})-[:SKILLED_IN]->(s:Skill)<-[:HIRING_FOR]-(c:Company)<-[:WORKS_AT]-(p:Person)
     WHERE ${NOT_DONE} AND ${AT_CONF} RETURN p, c.id AS company, c.name AS companyName, s.id AS skill, s.name AS skillName LIMIT 100`, params)) {
    add(r.p, { tag: "hiring", via: { id: r.company, name: r.companyName, label: "Company" }, extra: { id: r.skill, name: r.skillName } }, [r.company, r.skill]);
  }

  const ids = [...candidates.keys()];
  const where = await rows<{ id: string; talks: RawNode[]; events: RawNode[]; company: string | null }>(graph,
    `UNWIND $ids AS pid MATCH (p:Person {id: pid})
     OPTIONAL MATCH (p)-[:SPEAKS_AT]->(k:Talk)-[:PART_OF]->(:Conference {id: $conf})
     OPTIONAL MATCH (p)-[:HOSTS]->(e:SideEvent)-[:NEAR]->(:Conference {id: $conf})
     OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
     RETURN pid AS id, collect(DISTINCT k) AS talks, collect(DISTINCT e) AS events, head(collect(c.id)) AS company`,
    { ...params, ids } as never);
  const whereBy = new Map(where.map((w) => [w.id, w]));

  const cards = [...candidates.values()].map((c) => {
    const w = whereBy.get(c.person.id);
    if (w?.company) c.features.add(w.company);
    const talks = (w?.talks ?? []).map((t) => toNode(t, "Talk")).filter((t): t is Talk => !!t);
    const events = (w?.events ?? []).map((e) => toNode(e, "SideEvent")).filter((e): e is SideEvent => !!e);
    const tags = c.signals.map((s) => s.tag);
    if (talks.length && !tags.includes("speaker")) tags.push("speaker");
    if (events.length && !tags.includes("host")) tags.push("host");
    const prefBoost = [...c.features].reduce((sum, f) => sum + (user.prefs.get(f) ?? 0), 0);
    const score = tags.reduce((sum, t) => sum + WEIGHT[t], 0) * (1 + prefBoost);
    const whereabouts: Whereabouts[] = [
      ...talks.map((talk) => ({ kind: "talk" as const, talk })),
      ...events.map((event) => ({ kind: "event" as const, event })),
    ];
    const strongest = [...c.signals].sort((a, b) => WEIGHT[b.tag] - WEIGHT[a.tag])[0]!;
    return { person: c.person, tags, score: Math.round(score * 100) / 100, reason: reasonFor(strongest, c.person), whereabouts, path: pathFor(user, c.person, strongest) };
  });

  return cards
    .filter((card) => !tag || card.tags.includes(tag))
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
}

function first(name: string) {
  return name.split(" ")[0] ?? name;
}

function reasonFor(s: Signal, p: Person): string {
  switch (s.tag) {
    case "shared-stack":
      return `Maintains ${s.via.name}, which your ${s.extra?.name ?? "repo"} depends on`;
    case "same-topic":
      return `Speaking on ${s.via.name}: "${s.extra?.name}"`;
    case "ex-colleague":
      return `${first(p.name)} is at ${s.via.name}, where you've worked`;
    case "in-your-sessions":
      return `Speaking at "${s.via.name}", which is on your calendar`;
    case "hiring":
      return `${s.via.name} is hiring for ${s.extra?.name}`;
    default:
      return "At the conference";
  }
}

function pathFor(me: Me, p: Person, s: Signal) {
  const you = { id: me.id, label: "Person" as const, name: me.name };
  const them = { id: p.id, label: "Person" as const, name: p.name };
  switch (s.tag) {
    case "same-topic":
      return walk([you, { id: s.via.id, label: "Topic", name: s.via.name }, { id: s.extra!.id, label: "Talk", name: s.extra!.name }, them],
        ["INTERESTED_IN", "ABOUT", "SPEAKS_AT"], [true, false, false],
        [`You're into ${s.via.name}`, `"${s.extra!.name}" is about it`, `${p.name} is speaking`]);
    case "ex-colleague":
      return walk([you, { id: s.via.id, label: "Company", name: s.via.name }, them], ["WORKED_AT", "WORKS_AT"], [true, false],
        [`You worked at ${s.via.name}`, `${p.name} works there`]);
    case "in-your-sessions":
      return walk([you, { id: s.via.id, label: "Talk", name: s.via.name }, them], ["PLANS", "SPEAKS_AT"], [true, false],
        [`"${s.via.name}" is on your calendar`, `${p.name} is speaking`]);
    case "hiring":
      return walk([you, { id: s.extra!.id, label: "Skill", name: s.extra!.name }, { id: s.via.id, label: "Company", name: s.via.name }, them],
        ["SKILLED_IN", "HIRING_FOR", "WORKS_AT"], [true, false, false],
        [`You know ${s.extra!.name}`, `${s.via.name} is hiring for it`, `${p.name} works there`]);
    case "shared-stack":
    default:
      return walk([you, { id: s.via.id, label: "Package", name: s.via.name }, them], ["OWNS", "MAINTAINS"], [true, false],
        [`Your repos use ${s.via.name}`, `${p.name} maintains it`]);
  }
}

/** Swipe (docs/ARCHITECTURE.md#swipe-learning): records SWIPED and nudges PREFERS weights on the person's features. */
export async function swipe(graph: Graph, me: string, personId: string, dir: "right" | "left", now = Date.now()): Promise<string[]> {
  await graph.query(
    `MATCH (u:Person {id: $me}), (p:Person {id: $pid})
     MERGE (u)-[s:SWIPED]->(p) SET s.dir = $dir, s.at = $now, s.id = $sid`,
    { params: { me, pid: personId, dir, now, sid: edgeId({ from: me, type: "SWIPED", to: personId }) } },
  );
  const features = await rows<{ id: string; label: string }>(graph,
    `MATCH (p:Person {id: $pid})
     OPTIONAL MATCH (p)-[:SPEAKS_AT]->(:Talk)-[:ABOUT]->(t:Topic)
     OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
     WITH collect(DISTINCT t) + collect(DISTINCT c) AS fs
     UNWIND fs AS f RETURN f.id AS id, labels(f)[0] AS label`, { pid: personId });
  const delta = dir === "right" ? 0.2 : -0.1;
  for (const f of features) {
    if (f.label !== "Topic" && f.label !== "Company") continue;
    await graph.query(
      `MATCH (u:Person {id: $me}), (f:${f.label} {id: $fid})
       MERGE (u)-[p:PREFERS]->(f)
       ON CREATE SET p.weight = 0, p.id = $pid
       SET p.weight = CASE WHEN p.weight + $delta > 2 THEN 2 WHEN p.weight + $delta < -1 THEN -1 ELSE p.weight + $delta END`,
      { params: { me, fid: f.id, delta, pid: edgeId({ from: me, type: "PREFERS", to: f.id }) } },
    );
  }
  return features.map((f) => f.id);
}

export async function swipeCount(graph: Graph, me: string): Promise<number> {
  const r = await rows<{ n: number }>(graph, "MATCH (:Person {id: $me})-[s:SWIPED]->() RETURN count(s) AS n", { me });
  return r[0]?.n ?? 0;
}
