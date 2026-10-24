import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Edge, Node, NodeLabel, edgeId, mergeSnapshots, validateSnapshot, type GraphSnapshot } from "@hallway/types";
import type { FalkorDB } from "falkordb";
import { mergeInto } from "./write.ts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
export const CLEAN_DIR = path.join(ROOT, "data/clean");
export const LIVE_DIR = path.join(ROOT, "data/live");
export const FIXTURE_SNAPSHOT = path.join(ROOT, "data/fixtures/graph.json");

function readSnapshot(file: string) {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch (err) {
    throw new Error(`${path.relative(ROOT, file)}: ${(err as Error).message}`, { cause: err });
  }
}

/**
 * Every data/clean/*.json (one per ingest source) plus data/live/*.json (live-ingested
 * conferences) merged into one graph; the hand-written fixtures stand in for data/clean
 * until it has files.
 */
export function loadSnapshot(files?: string[]) {
  const list = (dir: string) =>
    existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "budget.json").sort().map((f) => path.join(dir, f)) : [];
  const clean = list(CLEAN_DIR);
  const sources = files ?? [...(clean.length ? clean : [FIXTURE_SNAPSHOT]), ...list(LIVE_DIR)];
  return { files: sources, snapshot: validateSnapshot(mergeSnapshots(sources.map(readSnapshot))) };
}

async function deleteIfExists(db: FalkorDB, name: string) {
  try {
    await db.selectGraph(name).delete();
  } catch (err) {
    if (!/empty key/i.test((err as Error).message)) throw err;
  }
}

type RawNode = { labels: string[]; properties: Record<string, unknown> };

const asNode = (raw: RawNode) => Node.safeParse({ label: raw.labels[0], ...raw.properties });

/**
 * The user's runtime subgraph (PLAN.md 6.4): every isUser Person, every edge out of them,
 * the nodes those edges reach, and Meeting-[:WITH]->Person edges. Nodes that fail the
 * contract are skipped with a warning rather than blocking the reseed.
 */
async function readUserSubgraph(db: FalkorDB, name: string) {
  if (!(await db.list()).includes(name)) return { nodes: [] as Node[], edges: [] as Edge[] };
  const graph = db.selectGraph(name);
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  // Returns the node's id even when the live copy no longer fits the contract, so edges to
  // nodes the new snapshot still has (e.g. a planned Talk) survive; such nodes aren't re-written.
  const keep = (raw: RawNode | null) => {
    if (!raw || typeof raw.properties.id !== "string") return undefined;
    const parsed = asNode(raw);
    if (parsed.success) nodes.set(parsed.data.id, parsed.data);
    else console.warn(`seed: not re-writing runtime node ${raw.properties.id}: ${parsed.error.issues[0]?.message}`);
    return raw.properties.id;
  };
  const addEdge = (type: string, from: string | undefined, to: string | undefined, props: Record<string, unknown>) => {
    if (!from || !to) return;
    const { id: _id, ...rest } = props;
    const parsed = Edge.safeParse({ type, from, to, props: Object.keys(rest).length ? rest : undefined });
    if (parsed.success) edges.push(parsed.data);
    else console.warn(`seed: skipping runtime edge ${from}|${type}|${to}: ${parsed.error.issues[0]?.message}`);
  };

  const users = await graph.roQuery<{ u: RawNode }>("MATCH (u:Person {isUser: true}) RETURN u");
  for (const row of users.data ?? []) keep(row.u);
  const out = await graph.roQuery<{ u: RawNode; type: string; props: Record<string, unknown>; n: RawNode }>(
    "MATCH (u:Person {isUser: true})-[r]->(n) RETURN u, type(r) AS type, properties(r) AS props, n",
  );
  for (const row of out.data ?? []) addEdge(row.type, keep(row.u), keep(row.n), row.props);
  const withs = await graph.roQuery<{ m: RawNode; props: Record<string, unknown>; p: RawNode }>(
    "MATCH (:Person {isUser: true})-[:ORGANIZES]->(m:Meeting)-[w:WITH]->(p:Person) RETURN m, properties(w) AS props, p",
  );
  for (const row of withs.data ?? []) addEdge("WITH", keep(row.m), keep(row.p), row.props);
  // Edges into users written by others (meetings recorded from the other side, swipes by other users).
  const incoming = await graph.roQuery<{ n: RawNode; type: string; props: Record<string, unknown>; u: RawNode }>(
    "MATCH (n:Person)-[r:MET|SWIPED]->(u:Person {isUser: true}) RETURN n, type(r) AS type, properties(r) AS props, u",
  );
  for (const row of incoming.data ?? []) addEdge(row.type, keep(row.n), keep(row.u), row.props);
  // Second hop for repos the user added: their dependencies.
  const deps = await graph.roQuery<{ r: RawNode; props: Record<string, unknown>; p: RawNode }>(
    "MATCH (:Person {isUser: true})-[:OWNS]->(r:Repo)-[d:DEPENDS_ON]->(p:Package) RETURN r, properties(d) AS props, p",
  );
  for (const row of deps.data ?? []) addEdge("DEPENDS_ON", keep(row.r), keep(row.p), row.props);
  return { nodes: [...nodes.values()], edges };
}

/**
 * Builds the graph in `<name>_next`, carries over the user's runtime subgraph, then
 * swaps it in with an atomic RENAME, so the live graph is never missing or half-loaded.
 * Labels and relationship types can't be Cypher parameters, so they are interpolated only
 * after validation against the zod enums; every value is a parameter.
 */
export async function seedGraph(db: FalkorDB, name: string, input: GraphSnapshot) {
  const snapshot = validateSnapshot(input);
  const staging = `${name}_next`;
  await deleteIfExists(db, staging);
  const graph = db.selectGraph(staging);
  const snapshotLabels = new Map(snapshot.nodes.map((n) => [n.id, n.label]));

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
    const key = `${snapshotLabels.get(edge.from)}|${edge.type}|${snapshotLabels.get(edge.to)}`;
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

  // Snapshot nodes win, except users, meetings and calendar blocks, which only the app writes.
  // Profile nodes the user created (topics, skills, repos...) are kept when the snapshot lacks
  // them; conference data the snapshot dropped (talks, events, other people) is not revived.
  const runtime = await readUserSubgraph(db, name);
  const inSnapshot = new Set(snapshot.nodes.map((n) => n.id));
  const appOwned = (n: Node) => n.label === "Meeting" || n.label === "CalendarBlock" || (n.label === "Person" && n.isUser);
  const revivable = new Set<Node["label"]>(["Topic", "Skill", "Company", "Repo", "Package", "Goal"]);
  const runtimeNodes = runtime.nodes.filter((n) => appOwned(n) || (!inSnapshot.has(n.id) && revivable.has(n.label)));
  const present = new Set([...inSnapshot, ...runtimeNodes.map((n) => n.id)]);
  // Runtime edges the snapshot also has are re-applied so newer props (e.g. PREFERS weight) win.
  const knownEdges = new Set(snapshot.edges.map(edgeId));
  const runtimeEdges = runtime.edges.filter((e) => present.has(e.from) && present.has(e.to));
  const labelOf = new Map<string, Node["label"]>([...snapshot.nodes, ...runtimeNodes].map((n) => [n.id, n.label]));
  for (const label of new Set(runtimeNodes.map((n) => n.label))) {
    await graph.createNodeRangeIndex(label, "id").catch(() => {}); // may exist from the snapshot
  }
  await mergeInto(graph, runtimeNodes, runtimeEdges, labelOf);

  await (await db.connection).rename(staging, name);
  const kept = runtimeEdges.filter((e) => !knownEdges.has(edgeId(e))).length;
  return { nodes: snapshot.nodes.length, edges: snapshot.edges.length, keptRuntimeEdges: kept };
}
