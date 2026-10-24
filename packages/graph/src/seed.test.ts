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

  it("keeps the user's runtime subgraph across a reseed", async () => {
    // What the app writes at runtime: a swipe, a new interest node, and a meeting with its WITH edge.
    await graph.query(
      `MATCH (u:Person {id: 'person:demo'}), (p:Person {id: 'person:jo'})
       MERGE (u)-[s:SWIPED]->(p) SET s.dir = 'left', s.at = 1, s.id = 'person:demo|SWIPED|person:jo'
       MERGE (t:Topic {id: 'topic:rust'}) SET t.name = 'Rust'
       MERGE (u)-[i:INTERESTED_IN]->(t) SET i.id = 'person:demo|INTERESTED_IN|topic:rust'
       CREATE (m:Meeting {id: 'meeting:runtime', tokenHash: 'h', proposed: ['2026-10-28T11:00:00-07:00'], start: '2026-10-28T11:00:00-07:00',
                          end: '2026-10-28T11:30:00-07:00', place: 'Lobby', note: '', status: 'accepted', createdAt: 1})
       CREATE (u)-[:ORGANIZES {id: 'person:demo|ORGANIZES|meeting:runtime'}]->(m)
       CREATE (m)-[:WITH {id: 'meeting:runtime|WITH|person:jo'}]->(p)`,
    );
    const counts = await seedGraph(await getDb(), NAME, snapshot);
    expect(counts.keptRuntimeEdges).toBe(4);
    const res = await graph.query<{ swipe: string; topic: string; withName: string }>(
      `MATCH (u:Person {id: 'person:demo'})-[s:SWIPED]->(:Person {id: 'person:jo'}),
             (u)-[:INTERESTED_IN]->(t:Topic {id: 'topic:rust'}),
             (u)-[:ORGANIZES]->(:Meeting {id: 'meeting:runtime'})-[:WITH]->(p:Person)
       RETURN s.dir AS swipe, t.name AS topic, p.name AS withName`,
    );
    expect(res.data?.[0]).toEqual({ swipe: "left", topic: "Rust", withName: "Jo Tanaka" });
  });
});
