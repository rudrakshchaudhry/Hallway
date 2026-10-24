import type { Graph } from "falkordb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, getDb } from "./client.ts";
import { FIXTURE_SNAPSHOT, loadSnapshot, seedGraph } from "./seed.ts";

// Needs FalkorDB running: docker compose up -d. Per-run name so parallel worktrees don't collide.
const NAME = `hallway_test_${process.pid}`;
const { snapshot } = loadSnapshot([FIXTURE_SNAPSHOT]);
let graph: Graph;

beforeAll(async () => {
  try {
    graph = (await getDb()).selectGraph(NAME);
  } catch (err) {
    throw new Error(`FalkorDB not reachable (run docker compose up -d): ${(err as Error).message}`, { cause: err });
  }
  await seedGraph(await getDb(), NAME, snapshot);
});

afterAll(async () => {
  await graph?.delete().catch(() => {});
  await close();
});

describe("seedGraph", () => {
  it("loads every node and edge from the fixtures", async () => {
    const nodes = await graph.query<{ c: number }>("MATCH (n) RETURN count(n) AS c");
    const edges = await graph.query<{ c: number }>("MATCH ()-[r]->() RETURN count(r) AS c");
    expect(nodes.data?.[0]?.c).toBe(snapshot.nodes.length);
    expect(edges.data?.[0]?.c).toBe(snapshot.edges.length);
  });

  it("keeps stable ids on nodes and edges", async () => {
    const res = await graph.query<{ id: string }>(
      "MATCH (:Person {id: $from})-[r:MAINTAINS]->(:Package {id: $to}) RETURN r.id AS id",
      { params: { from: "person:priya", to: "pkg:npm/zod" } },
    );
    expect(res.data?.[0]?.id).toBe("person:priya|MAINTAINS|pkg:npm/zod");
  });

  it("supports the who-to-meet walk, excluding people already met", async () => {
    const res = await graph.query<{ handle: string }>(
      `MATCH (me:Person {handle: $me})-[:OWNS]->(:Repo)-[:DEPENDS_ON]->(:Package)<-[:MAINTAINS]-(p:Person)
       WHERE p <> me AND NOT (me)-[:MET]->(p)
       RETURN DISTINCT p.handle AS handle ORDER BY handle`,
      { params: { me: "demo" } },
    );
    expect(res.data?.map((r) => r.handle)).toEqual(["marco-v", "priya-r"]);
  });

  it("reseeding replaces the graph instead of duplicating it", async () => {
    await seedGraph(await getDb(), NAME, snapshot);
    const nodes = await graph.query<{ c: number }>("MATCH (n) RETURN count(n) AS c");
    expect(nodes.data?.[0]?.c).toBe(snapshot.nodes.length);
  });

  it("keeps meetings recorded at runtime across a reseed", async () => {
    await graph.query(
      `MATCH (a:Person {handle: $me}), (b:Person {handle: $them})
       MERGE (a)-[m:MET]->(b) ON CREATE SET m.at = timestamp(), m.via = 'button', m.id = a.id + '|MET|' + b.id`,
      { params: { me: "demo", them: "priya-r" } },
    );
    const counts = await seedGraph(await getDb(), NAME, snapshot);
    expect(counts.keptMeetings).toBeGreaterThanOrEqual(1);
    const res = await graph.query<{ via: string }>(
      "MATCH (:Person {handle: 'demo'})-[m:MET]->(:Person {handle: 'priya-r'}) RETURN m.via AS via",
    );
    expect(res.data?.[0]?.via).toBe("button");
  });
});
