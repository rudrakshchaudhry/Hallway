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
});

export type PathNode = z.infer<typeof PathNode>;
export type PathEdge = z.infer<typeof PathEdge>;
export type GraphPath = z.infer<typeof GraphPath>;
