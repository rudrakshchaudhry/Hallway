import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateSnapshot } from "./snapshot.ts";

const fixture = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../../data/fixtures/graph.json"), "utf8"),
);

describe("validateSnapshot", () => {
  it("accepts the fixture graph", () => {
    const snapshot = validateSnapshot(fixture);
    expect(snapshot.nodes).toHaveLength(30);
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
});
