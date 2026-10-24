import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NodeLabel, edgeId, mergeSnapshots, validateSnapshot, type GraphSnapshot } from "@hallway/types";
import type { FalkorDB } from "falkordb";

const ROOT = path.resolve(import.meta.dirname, "../../..");
export const CLEAN_DIR = path.join(ROOT, "data/clean");
export const FIXTURE_SNAPSHOT = path.join(ROOT, "data/fixtures/graph.json");

function readSnapshot(file: string) {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch (err) {
    throw new Error(`${path.relative(ROOT, file)}: ${(err as Error).message}`, { cause: err });
  }
}

/**
 * Every data/clean/*.json (one per ingest source) merged into one graph, or the
 * hand-written fixtures when data/clean has none yet.
 */
export function loadSnapshot(files?: string[]) {
  const clean = existsSync(CLEAN_DIR)
    ? readdirSync(CLEAN_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(CLEAN_DIR, f))
    : [];
  const sources = files ?? (clean.length ? clean : [FIXTURE_SNAPSHOT]);
  return { files: sources, snapshot: validateSnapshot(mergeSnapshots(sources.map(readSnapshot))) };
}

async function deleteIfExists(db: FalkorDB, name: string) {
  try {
    await db.selectGraph(name).delete();
  } catch (err) {
    if (!/empty key/i.test((err as Error).message)) throw err;
  }
}

/** MET edges written by the running app since the last seed; a reseed must keep them. */
async function readRuntimeMeetings(db: FalkorDB, name: string) {
  if (!(await db.list()).includes(name)) return [];
  const res = await db.selectGraph(name).roQuery<{ from: string; to: string; at: number; via: string; id: string }>(
    "MATCH (a:Person)-[m:MET]->(b:Person) RETURN a.id AS from, b.id AS to, m.at AS at, m.via AS via, m.id AS id",
  );
  return res.data ?? [];
}

/**
 * Builds the graph in `<name>_next`, carries over MET edges recorded at runtime, then
 * swaps it in with an atomic RENAME, so the live graph is never missing or half-loaded.
 * Labels and relationship types can't be Cypher parameters, so they are interpolated only
 * after validation against the zod enums; every value is a parameter.
 */
export async function seedGraph(db: FalkorDB, name: string, input: GraphSnapshot) {
  const snapshot = validateSnapshot(input);
  const staging = `${name}_next`;
  await deleteIfExists(db, staging);
  const graph = db.selectGraph(staging);
  const labelOf = new Map(snapshot.nodes.map((n) => [n.id, n.label]));

  for (const label of NodeLabel.options) {
    const rows = snapshot.nodes.filter((n) => n.label === label).map(({ label: _label, ...props }) => props);
    if (!rows.length) continue;
    await graph.query(`UNWIND $rows AS row CREATE (n:${label}) SET n = row`, { params: { rows } });
    await graph.createNodeRangeIndex(label, "id");
  }
  if (snapshot.nodes.some((n) => n.label === "Person")) await graph.createNodeRangeIndex("Person", "handle");

  type EdgeRow = { from: string; to: string; props: Record<string, string | number | boolean> };
  const groups = new Map<string, EdgeRow[]>();
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

  const inSnapshot = new Set(snapshot.edges.filter((e) => e.type === "MET").map(edgeId));
  const meetings = (await readRuntimeMeetings(db, name))
    .map((m) => ({ ...m, id: m.id ?? edgeId({ from: m.from, type: "MET", to: m.to }) }))
    .filter((m) => !inSnapshot.has(m.id));
  if (meetings.length) {
    await graph.query(
      `UNWIND $rows AS row
       MATCH (a:Person {id: row.from}), (b:Person {id: row.to})
       MERGE (a)-[m:MET]->(b)
       ON CREATE SET m.at = row.at, m.via = row.via, m.id = row.id`,
      { params: { rows: meetings } },
    );
  }

  await (await db.connection).rename(staging, name);
  return { nodes: snapshot.nodes.length, edges: snapshot.edges.length, keptMeetings: meetings.length };
}
