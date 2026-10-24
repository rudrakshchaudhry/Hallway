import { describe, expect, it } from "vitest";
import { GraphPath } from "./graph-path.ts";

const node = (id: string) => ({ id, label: "Person" as const, name: id });
const edge = (from: string, to: string) => ({ id: `${from}|MET|${to}`, type: "MET" as const, from, to });

describe("GraphPath", () => {
  it("accepts an ordered walk, including edges followed backwards", () => {
    const path = { nodes: [node("person:a"), node("person:b"), node("person:c")], edges: [edge("person:a", "person:b"), edge("person:c", "person:b")], hops: ["a met b", "c met b"] };
    expect(GraphPath.safeParse(path).success).toBe(true);
  });

  it("rejects edges that skip around the walk", () => {
    const path = { nodes: [node("person:a"), node("person:b"), node("person:c")], edges: [edge("person:a", "person:b"), edge("person:a", "person:c")], hops: ["x", "y"] };
    expect(GraphPath.safeParse(path).success).toBe(false);
  });

  it("rejects a hop count that does not match the edges", () => {
    const path = { nodes: [node("person:a"), node("person:b")], edges: [edge("person:a", "person:b")], hops: [] };
    expect(GraphPath.safeParse(path).success).toBe(false);
  });
});
