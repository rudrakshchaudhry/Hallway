import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NodeLabel, edgeId, validateSnapshot, type GraphSnapshot } from "@hallway/types";
import type { Graph } from "falkordb";

const ROOT = path.resolve(import.meta.dirname, "../../..");
export const CLEAN_SNAPSHOT = path.join(ROOT, "data/clean/graph.json");
export const FIXTURE_SNAPSHOT = path.join(ROOT, "data/fixtures/graph.json");

/** data/clean when Session 2 has committed it, else the hand-written fixtures. */
export function loadSnapshot(file = existsSync(CLEAN_SNAPSHOT) ? CLEAN_SNAPSHOT : FIXTURE_SNAPSHOT) {
  return { file, snapshot: validateSnapshot(JSON.parse(readFileSync(file, "utf8"))) };
}

/**
 * Wipes the graph and loads the snapshot. Labels and relationship types can't be
 * Cypher parameters, so they are interpolated only after validation against the zod enums;
 * every value goes in as a parameter.
 */
export async function seedGraph(graph: Graph, snapshot: GraphSnapshot) {
  await graph.delete().catch(() => {}); // the graph may not exist yet
  const labelOf = new Map(snapshot.nodes.map((n) => [n.id, n.label]));

  for (const label of NodeLabel.options) {
    const rows = snapshot.nodes.filter((n) => n.label === label).map(({ label: _label, ...props }) => props);
    if (!rows.length) continue;
    await graph.query(`UNWIND $rows AS row CREATE (n:${label}) SET n = row`, { params: { rows } });
    await graph.createNodeRangeIndex(label, "id");
  }

  const groups = new Map<string, { from: string; to: string; props: Record<string, string | number | boolean> }[]>();
  for (const edge of snapshot.edges) {
    const key = `${labelOf.get(edge.from)}|${edge.type}|${labelOf.get(edge.to)}`;
    const rows = groups.get(key) ?? [];
    rows.push({ from: edge.from, to: edge.to, props: { ...edge.props, id: edgeId(edge) } });
    groups.set(key, rows);
  }
  for (const [key, rows] of groups) {
    const [from, type, to] = key.split("|");
    await graph.query(
      `UNWIND $rows AS row
       MATCH (a:${from} {id: row.from}), (b:${to} {id: row.to})
       CREATE (a)-[r:${type}]->(b) SET r = row.props`,
      { params: { rows } },
    );
  }

  return { nodes: snapshot.nodes.length, edges: snapshot.edges.length };
}
