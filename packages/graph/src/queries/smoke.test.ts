import { AgendaResponse, ExploreResponse, FeedResponse, PastGraphResponse, PeopleResponse } from "@hallway/types";
import type { Graph } from "falkordb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, getDb } from "../client.ts";
import { FIXTURE_SNAPSHOT, loadSnapshot, seedGraph } from "../seed.ts";
import { agendaFor } from "./agenda.ts";
import { exploreFor } from "./explore.ts";
import { feedFor, pastGraph } from "./feed.ts";
import { createMeeting, markMet, respondInvite, suggestInvite, viewInvite } from "./invites.ts";
import { deckFor, swipe } from "./people.ts";
import { targetConference } from "./shared.ts";

const NAME = `hallway_tabs_test_${process.pid}`;
let graph: Graph;

beforeAll(async () => {
  await seedGraph(await getDb(), NAME, loadSnapshot([FIXTURE_SNAPSHOT]).snapshot);
  graph = (await getDb()).selectGraph(NAME);
});
afterAll(async () => {
  await graph?.delete().catch(() => {});
  await close();
});

describe("tab queries on fixtures", () => {
  it("agenda ranks topic matches, flags the clash and the rerun", async () => {
    const conf = (await targetConference(graph, "person:demo"))!;
    expect(conf.id).toBe("conf:universe-2026");
    const items = await agendaFor(graph, "person:demo", conf);
    AgendaResponse.parse({ conference: conf, items });
    const search = items.find((i) => i.talk.id === "talk:graph-search")!;
    expect(search.clashes[0]?.withId).toBe("talk:typesafe-apis");
    expect(items.find((i) => i.talk.id === "talk:typesafe-apis")?.rerun?.similarity).toBeCloseTo(0.91);
  });

  it("deck excludes swiped and met people, tags signals, and learns from swipes", async () => {
    const conf = (await targetConference(graph, "person:demo"))!;
    const cards = await deckFor(graph, "person:demo", conf);
    PeopleResponse.parse({ cards, swipes: 0 });
    const ids = cards.map((c) => c.person.id);
    expect(ids).not.toContain("person:marco"); // swiped
    expect(ids).not.toContain("person:lena"); // met
    expect(cards.find((c) => c.person.id === "person:priya")?.tags).toEqual(expect.arrayContaining(["shared-stack", "in-your-sessions"]));
    expect(cards.find((c) => c.person.id === "person:jo")?.tags).toContain("ex-colleague");
    const updated = await swipe(graph, "person:demo", "person:sam", "right");
    expect(updated).toContain("topic:ai");
    expect((await deckFor(graph, "person:demo", conf)).map((c) => c.person.id)).not.toContain("person:sam");
  });

  it("invite: suggest, create, accept with a slot, appear in the feed calendar, then met", async () => {
    const conf = (await targetConference(graph, "person:demo"))!;
    const suggestion = (await suggestInvite(graph, "person:demo", "person:priya", conf, Date.parse("2026-10-24T12:00:00Z")))!;
    expect(suggestion.slots).toHaveLength(3);
    const meeting = (await createMeeting(graph, "person:demo", { personId: "person:priya", slots: suggestion.slots, place: suggestion.place, note: "hi", tokenHash: "hash1", id: "meeting:t1" }))!;
    expect(meeting.status).toBe("pending");
    expect((await viewInvite(graph, "hash1"))?.slots).toHaveLength(3);
    const accepted = await respondInvite(graph, "hash1", "accept", suggestion.slots[1]);
    expect("meeting" in accepted ? accepted.meeting?.status : null).toBe("accepted");
    expect(await respondInvite(graph, "hash1", "decline")).toMatchObject({ error: "answered" });
    const feed = await feedFor(graph, "person:demo", conf);
    FeedResponse.parse(feed);
    expect(feed.calendar.some((c) => c.id === "meeting:t1")).toBe(true);
    expect(feed.requests.map((r) => r.meeting.id)).toContain("meeting:t1");
    expect((await markMet(graph, "person:demo", "meeting:t1"))?.status).toBe("met");
  });

  it("explore and past graph validate", async () => {
    const conf = (await targetConference(graph, "person:demo"))!;
    ExploreResponse.parse({ items: await exploreFor(graph, "person:demo", conf) });
    const past = await pastGraph(graph, "person:demo");
    PastGraphResponse.parse(past);
    expect(past.nodes.length).toBeGreaterThan(5);
  });
});
