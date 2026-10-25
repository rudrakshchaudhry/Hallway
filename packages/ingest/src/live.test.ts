import { mergeSnapshots, validateSnapshot } from "@hallway/types";
import { describe, expect, it } from "vitest";
import { snapshotFromTalks } from "./live.ts";

const conf = { label: "Conference" as const, id: "conf:demo-conf-2026", name: "Demo Conf", start: "2026-11-02T09:00:00-05:00", end: "2026-11-03T18:00:00-05:00", tz: "America/New_York", source: "live" as const, status: "ready" as const };

describe("snapshotFromTalks", () => {
  it("builds talks, speakers, companies and topics linked to the conference", () => {
    const part = snapshotFromTalks(
      [
        { title: "Graphs at scale", kind: "talk", start: "2026-11-02T10:00:00-05:00", end: "2026-11-02T10:30:00-05:00", room: "Hall A", topics: ["Graphs"], speakers: [{ name: "Ada Lovelace", title: "CTO", company: "Engines Inc" }] },
        { title: "Hands-on agents", kind: "workshop", start: "2026-11-02T13:00:00-05:00", speakers: [{ name: "Ada Lovelace" }] },
        { title: "No time", start: "TBD" },
      ],
      conf.id,
    );
    const snapshot = validateSnapshot(mergeSnapshots([{ nodes: [conf], edges: [] }, part]));
    const talks = snapshot.nodes.filter((n) => n.label === "Talk");
    expect(talks).toHaveLength(2);
    expect(talks.find((t) => t.label === "Talk" && t.kind === "workshop")).toMatchObject({ end: "2026-11-02T19:30:00.000Z" }); // 90-min default
    expect(snapshot.nodes.filter((n) => n.label === "Person")).toHaveLength(1);
    expect(snapshot.edges.filter((e) => e.type === "PART_OF")).toHaveLength(2);
    expect(snapshot.edges).toContainEqual(expect.objectContaining({ type: "WORKS_AT", from: "person:ada-lovelace", to: "company:engines-inc" }));
  });
});
