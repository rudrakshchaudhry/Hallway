import { Conference, Node, edgeId, type EdgeType, type GraphPath, type NodeLabel } from "@hallway/types";
import type { Graph } from "falkordb";

export type RawNode = { labels: string[]; properties: Record<string, unknown> };

/** Parses a FalkorDB node into the contract type, or null if it doesn't fit. */
export function toNode<T extends Node["label"]>(raw: RawNode | null | undefined, label: T): Extract<Node, { label: T }> | null {
  if (!raw) return null;
  const parsed = Node.safeParse({ label, ...raw.properties });
  return parsed.success && parsed.data.label === label ? (parsed.data as Extract<Node, { label: T }>) : null;
}

type Step = { id: string; label: NodeLabel; name: string };

/** Builds a GraphPath from an ordered walk; `types[i]` joins node i and i+1, `forward[i]` gives its direction. */
export function walk(nodes: Step[], types: EdgeType[], forward: boolean[], hops: string[]): GraphPath {
  return {
    nodes,
    edges: types.map((type, i) => {
      const a = nodes[i]!.id;
      const b = nodes[i + 1]!.id;
      const [from, to] = forward[i] ? [a, b] : [b, a];
      return { id: edgeId({ from, type, to }), type, from, to };
    }),
    hops,
  };
}

export type Me = { id: string; name: string; topics: Set<string>; skills: Set<string>; goals: Set<string>; prefs: Map<string, number> };

/** The user's interests, skills, goals and learned preferences. */
export async function loadMe(graph: Graph, me: string): Promise<Me> {
  const res = await graph.roQuery<{ name: string | null; topics: string[]; skills: string[]; goals: string[]; prefs: { id: string; w: number }[] }>(
    `MATCH (u:Person {id: $me})
     OPTIONAL MATCH (u)-[:INTERESTED_IN]->(t:Topic)
     OPTIONAL MATCH (u)-[:SKILLED_IN]->(s:Skill)
     OPTIONAL MATCH (u)-[:HAS_GOAL]->(g:Goal)
     OPTIONAL MATCH (u)-[p:PREFERS]->(x)
     RETURN u.name AS name, collect(DISTINCT t.id) AS topics, collect(DISTINCT s.id) AS skills,
            collect(DISTINCT g.goal) AS goals, collect(DISTINCT {id: x.id, w: p.weight}) AS prefs`,
    { params: { me } },
  );
  const row = res.data?.[0];
  return {
    id: me,
    name: row?.name ?? "You",
    topics: new Set(row?.topics ?? []),
    skills: new Set(row?.skills ?? []),
    goals: new Set(row?.goals ?? []),
    prefs: new Map((row?.prefs ?? []).filter((p) => p.id).map((p) => [p.id, p.w ?? 0])),
  };
}

/** The conference the user targets most recently, falling back to the newest one. */
export async function targetConference(graph: Graph, me: string): Promise<Conference | null> {
  const res = await graph.roQuery<{ c: RawNode }>(
    `OPTIONAL MATCH (:Person {id: $me})-[t:TARGETS]->(target:Conference)
     WITH target ORDER BY t.at DESC LIMIT 1
     OPTIONAL MATCH (any:Conference)
     WITH target, any ORDER BY any.start DESC
     RETURN coalesce(target, any) AS c LIMIT 1`,
    { params: { me } },
  );
  return toNode(res.data?.[0]?.c, "Conference");
}
