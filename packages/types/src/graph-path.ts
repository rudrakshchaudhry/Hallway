import { z } from "zod";
import { EdgeType } from "./edges.ts";
import { NodeLabel } from "./nodes.ts";

export const PathNode = z.object({ id: z.string(), label: NodeLabel, name: z.string() });
export const PathEdge = z.object({ id: z.string(), type: EdgeType, from: z.string(), to: z.string() });

/** The proof behind a recommendation: the walk through the graph, in order. */
export const GraphPath = z.object({
  nodes: z.array(PathNode).min(1),
  edges: z.array(PathEdge),
  /** Human-readable hops, one per edge, e.g. "hallway-api depends on zod". */
  hops: z.array(z.string()),
}).superRefine((path, ctx) => {
  if (path.hops.length !== path.edges.length) {
    ctx.addIssue({ code: "custom", message: "hops must have one entry per edge", path: ["hops"] });
  }
  if (path.nodes.length !== path.edges.length + 1) {
    ctx.addIssue({ code: "custom", message: "a walk has exactly one more node than edges", path: ["nodes"] });
    return;
  }
  // Edge i joins node i and node i+1, in either direction (walks follow edges backwards too).
  path.edges.forEach((e, i) => {
    const a = path.nodes[i]?.id;
    const b = path.nodes[i + 1]?.id;
    if (!((e.from === a && e.to === b) || (e.from === b && e.to === a))) {
      ctx.addIssue({ code: "custom", message: `edge ${e.id} does not join path nodes ${i} and ${i + 1}`, path: ["edges", i] });
    }
  });
});

export type PathNode = z.infer<typeof PathNode>;
export type PathEdge = z.infer<typeof PathEdge>;
export type GraphPath = z.infer<typeof GraphPath>;
