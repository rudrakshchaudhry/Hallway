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
  const ids = new Set(path.nodes.map((n) => n.id));
  path.edges.forEach((e, i) => {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      ctx.addIssue({ code: "custom", message: `edge ${e.id} references a node not in the path`, path: ["edges", i] });
    }
  });
});

export type PathNode = z.infer<typeof PathNode>;
export type PathEdge = z.infer<typeof PathEdge>;
export type GraphPath = z.infer<typeof GraphPath>;
