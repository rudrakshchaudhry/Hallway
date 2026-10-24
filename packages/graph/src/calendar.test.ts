import type { Graph } from "falkordb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conferenceDays, findClashes, freeSlots, getCalendar } from "./calendar.ts";
import { close, getDb } from "./client.ts";
import { FIXTURE_SNAPSHOT, loadSnapshot, seedGraph } from "./seed.ts";

const NAME = `hallway_calendar_test_${process.pid}`;
let graph: Graph;

beforeAll(async () => {
  await seedGraph(await getDb(), NAME, loadSnapshot([FIXTURE_SNAPSHOT]).snapshot);
  graph = (await getDb()).selectGraph(NAME);
});
afterAll(async () => {
  await graph?.delete().catch(() => {});
  await close();
});

describe("getCalendar", () => {
  it("returns busy blocks, planned talks and events by start, without pending meetings", async () => {
    const items = await getCalendar(graph, "person:demo");
    expect(items.map((i) => i.id)).toEqual(["block:demo-standup", "talk:typesafe-apis", "event:git-together"]);
    expect(items[0]).toMatchObject({ kind: "busy", title: "Team standup" });
    expect(items[1]).toMatchObject({ kind: "talk", location: "Cowell Theater" });
  });

  it("includes a meeting once it is accepted", async () => {
    await graph.query(
      "MATCH (m:Meeting {id: 'meeting:fixture-marco'}) SET m.status = 'accepted', m.start = m.proposed[0], m.end = '2026-10-28T17:00:00-07:00'",
    );
    const items = await getCalendar(graph, "person:demo");
    expect(items.find((i) => i.kind === "meeting")).toMatchObject({ title: "Meet Marco Vitale", personId: "person:marco" });
  });
});

describe("findClashes", () => {
  it("flags a talk that overlaps a planned one", async () => {
    const calendar = await getCalendar(graph, "person:demo");
    const clashes = findClashes(calendar, { id: "talk:graph-search", start: "2026-10-28T14:00:00-07:00", end: "2026-10-28T14:45:00-07:00" });
    expect(clashes).toEqual([{ itemId: "talk:graph-search", withId: "talk:typesafe-apis", withTitle: "Type-safe APIs end to end", overlapMinutes: 45 }]);
  });

  it("returns nothing for a free time", () => {
    expect(findClashes([], { id: "x", start: "2026-10-28T10:00:00Z", end: "2026-10-28T11:00:00Z" })).toEqual([]);
  });
});

describe("conferenceDays", () => {
  it("uses the venue's offset per day, across a DST change", () => {
    const days = conferenceDays({ start: "2026-10-31T16:00:00Z", end: "2026-11-02T01:00:00Z", tz: "America/Los_Angeles" });
    expect(days.map((d) => d.start)).toEqual(["2026-10-31T09:00:00-07:00", "2026-11-01T09:00:00-08:00"]);
  });
});

describe("freeSlots", () => {
  it("skips busy blocks inside conference hours", () => {
    const days = conferenceDays({ start: "2026-10-28T09:00:00-07:00", end: "2026-10-29T18:00:00-07:00", tz: "America/Los_Angeles" });
    expect(days).toHaveLength(2);
    const slots = freeSlots(days, [{ start: "2026-10-28T09:00:00-07:00", end: "2026-10-28T10:10:00-07:00" }], { limit: 2 });
    expect(slots[0]).toEqual({ start: "2026-10-28T17:15:00.000Z", end: "2026-10-28T17:45:00.000Z" }); // 10:15 PDT
    expect(slots).toHaveLength(2);
  });
});
