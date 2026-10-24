import { validateSnapshot } from "@hallway/types";
import type { Graph } from "falkordb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCalendar } from "./calendar.ts";
import { close, getDb } from "./client.ts";
import { getConference, listConferences } from "./conferences.ts";
import { addPlan } from "./plans.ts";
import { SHARED_PROFILE_LABELS, buildProfileSnapshot } from "./profile.ts";
import { FIXTURE_SNAPSHOT, loadSnapshot, seedGraph } from "./seed.ts";
import { upsertSnapshot } from "./upsert.ts";

const NAME = `hallway_shell_test_${process.pid}`;
let graph: Graph;

beforeAll(async () => {
  await seedGraph(await getDb(), NAME, loadSnapshot([FIXTURE_SNAPSHOT]).snapshot);
  graph = (await getDb()).selectGraph(NAME);
});
afterAll(async () => {
  await graph?.delete().catch(() => {});
  await close();
});

describe("listConferences", () => {
  it("returns conferences with counts, newest first", async () => {
    const list = await listConferences(graph);
    expect(list.map((c) => c.conference.id)).toEqual(["conf:universe-2026", "conf:universe-2025"]);
    expect(list[0]?.counts).toEqual({ talks: 4, speakers: 3, events: 2 });
  });
});

describe("addPlan", () => {
  it("adds a talk once and reports unknown targets", async () => {
    expect(await addPlan(graph, "person:demo", "talk:graph-search", 5)).toBe(true);
    expect(await addPlan(graph, "person:demo", "talk:graph-search", 6)).toBe(true);
    expect(await addPlan(graph, "person:demo", "talk:nope")).toBe(false);
    expect(await addPlan(graph, "person:ghost", "talk:keynote")).toBe(false);
    const ids = (await getCalendar(graph, "person:demo")).map((i) => i.id);
    expect(ids.filter((id) => id === "talk:graph-search")).toHaveLength(1);
  });
});

describe("buildProfileSnapshot", () => {
  it("builds a valid snapshot that upserts into the graph", async () => {
    const conference = (await getConference(graph, "conf:universe-2026"))!;
    const snapshot = buildProfileSnapshot({
      handle: "octo",
      draft: {
        name: "Octo Cat",
        skills: ["Go", "TypeScript"],
        topics: ["ai", "Rust"],
        companies: [{ name: "Acme Cloud", current: true }, { name: "OldCo", current: false }],
        repos: ["octo/api", "octo/site"],
        packages: ["zod", "@types/node"],
        repoPackages: { "octo/api": ["zod"] },
        sources: ["github"],
      },
      goals: ["networking", "job"],
      conference,
      existingTopics: [{ id: "topic:ai", name: "AI" }],
      now: 1,
    });
    expect(() => validateSnapshot(snapshot)).not.toThrow();
    expect(snapshot.edges.filter((e) => e.type === "DEPENDS_ON")).toEqual([{ type: "DEPENDS_ON", from: "repo:octo/api", to: "pkg:npm/zod" }]);
    expect(snapshot.nodes.some((n) => n.id === "pkg:npm/@types/node")).toBe(true);
    await upsertSnapshot(await getDb(), NAME, snapshot, { createOnly: SHARED_PROFILE_LABELS });
    const topic = await graph.query<{ name: string }>("MATCH (t:Topic {id: 'topic:ai'}) RETURN t.name AS name");
    expect(topic.data?.[0]?.name).toBe("AI"); // shared node not renamed to the draft's "ai"
    const res = await graph.query<{ topics: string[]; works: string; maintainer: string }>(
      `MATCH (u:Person {id: 'person:octo', isUser: true})-[:INTERESTED_IN]->(t:Topic)
       WITH u, collect(t.id) AS topics
       MATCH (u)-[:WORKS_AT]->(c:Company)
       MATCH (u)-[:OWNS]->(:Repo)-[:DEPENDS_ON]->(:Package)<-[:MAINTAINS]-(m:Person)
       RETURN topics, c.name AS works, m.name AS maintainer`,
    );
    expect(res.data?.[0]?.topics.sort()).toEqual(["topic:ai", "topic:rust"]);
    expect(res.data?.[0]).toMatchObject({ works: "Acme Cloud", maintainer: "Priya Raman" });
  });
});
