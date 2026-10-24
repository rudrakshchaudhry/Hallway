import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeSnapshots, validateSnapshot } from "./snapshot.ts";

const fixture = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../../data/fixtures/graph.json"), "utf8"),
);

describe("validateSnapshot", () => {
  it("accepts the fixture graph", () => {
    const snapshot = validateSnapshot(fixture);
    expect(snapshot.nodes.length).toBeGreaterThan(30);
    expect(snapshot.edges.length).toBeGreaterThan(30);
  });

  it("rejects an edge to a missing node", () => {
    const broken = { ...fixture, edges: [...fixture.edges, { type: "OWNS", from: "person:demo", to: "repo:nope" }] };
    expect(() => validateSnapshot(broken)).toThrow(/unknown to node/);
  });

  it("rejects an edge between the wrong labels", () => {
    const broken = { ...fixture, edges: [...fixture.edges, { type: "OWNS", from: "person:demo", to: "pkg:npm/zod" }] };
    expect(() => validateSnapshot(broken)).toThrow(/OWNS cannot end at Package/);
  });

  it("rejects duplicate node ids", () => {
    const broken = { ...fixture, nodes: [...fixture.nodes, fixture.nodes[0]] };
    expect(() => validateSnapshot(broken)).toThrow(/duplicate node id person:demo/);
  });

  it("requires a score on SIMILAR_TO edges", () => {
    const broken = { ...fixture, edges: [...fixture.edges, { type: "SIMILAR_TO", from: "talk:agents-in-ci", to: "pasttalk:jo-2024" }] };
    expect(() => validateSnapshot(broken)).toThrow(/missing or invalid props/);
  });

  it("rejects edge prop keys that are not identifiers", () => {
    const broken = { ...fixture, edges: [{ type: "OWNS", from: "person:demo", to: "repo:demo/notes-app", props: { "a-b": 1 } }] };
    expect(() => validateSnapshot(broken)).toThrow(/identifiers/);
  });
});

describe("mergeSnapshots", () => {
  it("merges the same node from two sources and collapses duplicate edges", () => {
    const a = { nodes: [{ label: "Person", id: "person:x", handle: "x", name: "X", optedIn: false }], edges: [] };
    const b = {
      nodes: [
        { label: "Person", id: "person:x", handle: "x", name: "X", role: "Speaker", optedIn: false },
        { label: "Topic", id: "topic:ai", name: "AI" },
      ],
      edges: [{ type: "INTERESTED_IN", from: "person:x", to: "topic:ai" }],
    };
    const merged = validateSnapshot(mergeSnapshots([a, b, b]));
    expect(merged.nodes).toHaveLength(2);
    expect(merged.nodes.find((n) => n.id === "person:x")).toMatchObject({ role: "Speaker" });
    expect(merged.edges).toHaveLength(1);
  });

  it("does not let defaults from a later source overwrite supplied values", () => {
    const a = { nodes: [{ label: "Repo", id: "repo:x/y", fullName: "x/y", stars: 99 }], edges: [] };
    const b = { nodes: [{ label: "Repo", id: "repo:x/y", fullName: "x/y" }], edges: [] };
    const merged = validateSnapshot(mergeSnapshots([a, b]));
    expect(merged.nodes[0]).toMatchObject({ stars: 99 });
  });
});
