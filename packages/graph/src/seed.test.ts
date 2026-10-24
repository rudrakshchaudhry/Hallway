import type { Graph } from "falkordb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, getGraph } from "./client.ts";
import { FIXTURE_SNAPSHOT, loadSnapshot, seedGraph } from "./seed.ts";

// Needs FalkorDB running: docker compose up -d
let graph: Graph;

beforeAll(async () => {
  try {
    graph = await getGraph("hallway_test");
  } catch (err) {
    throw new Error(`FalkorDB not reachable (run docker compose up -d): ${(err as Error).message}`, { cause: err });
  }
  await seedGraph(graph, loadSnapshot(FIXTURE_SNAPSHOT).snapshot);
});

afterAll(async () => {
  await graph?.delete().catch(() => {});
  await close();
});

describe("seedGraph", () => {
  it("loads every node and edge from the fixtures", async () => {
    const { snapshot } = loadSnapshot(FIXTURE_SNAPSHOT);
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
    await seedGraph(graph, loadSnapshot(FIXTURE_SNAPSHOT).snapshot);
    const nodes = await graph.query<{ c: number }>("MATCH (n) RETURN count(n) AS c");
    expect(nodes.data?.[0]?.c).toBe(30);
  });
});
