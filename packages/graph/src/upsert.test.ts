import { afterAll, describe, expect, it } from "vitest";
import { close, getDb } from "./client.ts";
import { upsertSnapshot } from "./upsert.ts";

const NAME = `hallway_upsert_test_${process.pid}`;

afterAll(async () => {
  await (await getDb()).selectGraph(NAME).delete().catch(() => {});
  await close();
});

const conf = {
  label: "Conference", id: "conf:live-test", name: "Live Test Conf", start: "2026-11-01T09:00:00-07:00",
  end: "2026-11-01T18:00:00-07:00", source: "live", status: "ready",
} as const;
const talk = { label: "Talk", id: "talk:live-1", title: "First", start: "2026-11-01T10:00:00-07:00", end: "2026-11-01T10:45:00-07:00" } as const;

describe("upsertSnapshot", () => {
  it("adds nodes and edges, and is idempotent", async () => {
    const snapshot = { nodes: [conf, talk], edges: [{ type: "PART_OF", from: "talk:live-1", to: "conf:live-test" }] } as never;
    await upsertSnapshot(await getDb(), NAME, snapshot);
    await upsertSnapshot(await getDb(), NAME, snapshot);
    const graph = (await getDb()).selectGraph(NAME);
    const res = await graph.query<{ n: number; e: number }>(
      "MATCH (n) WITH count(n) AS n MATCH ()-[r]->() RETURN n, count(r) AS e",
    );
    expect(res.data?.[0]).toEqual({ n: 2, e: 1 });
  });

  it("updates properties of existing nodes", async () => {
    await upsertSnapshot(await getDb(), NAME, { nodes: [conf, { ...talk, title: "Renamed" }], edges: [] } as never);
    const res = await (await getDb()).selectGraph(NAME).query<{ t: string }>("MATCH (t:Talk {id: 'talk:live-1'}) RETURN t.title AS t");
    expect(res.data?.[0]?.t).toBe("Renamed");
  });
});
