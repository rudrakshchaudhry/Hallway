import { z } from "zod";
import { EDGE_RULES, Edge } from "./edges.ts";
import { Node } from "./nodes.ts";

/** The on-disk graph format shared by data/fixtures and data/clean, loaded by `pnpm seed`. */
export const GraphSnapshot = z.object({
  nodes: z.array(Node),
  edges: z.array(Edge),
});
export type GraphSnapshot = z.infer<typeof GraphSnapshot>;

/** Parses a snapshot and checks referential integrity. Throws with every problem listed. */
export function validateSnapshot(input: unknown): GraphSnapshot {
  const snapshot = GraphSnapshot.parse(input);
  const problems: string[] = [];
  const labels = new Map<string, Node["label"]>();

  for (const node of snapshot.nodes) {
    if (labels.has(node.id)) problems.push(`duplicate node id ${node.id}`);
    labels.set(node.id, node.label);
  }

  const seen = new Set<string>();
  for (const edge of snapshot.edges) {
    const key = `${edge.from}|${edge.type}|${edge.to}`;
    if (seen.has(key)) problems.push(`duplicate edge ${key}`);
    seen.add(key);

    const from = labels.get(edge.from);
    const to = labels.get(edge.to);
    if (!from) problems.push(`${key}: unknown from node`);
    if (!to) problems.push(`${key}: unknown to node`);
    const rule = EDGE_RULES[edge.type];
    if (from && !rule.from.includes(from)) problems.push(`${key}: ${edge.type} cannot start at ${from}`);
    if (to && !rule.to.includes(to)) problems.push(`${key}: ${edge.type} cannot end at ${to}`);
  }

  if (problems.length) throw new Error(`Invalid graph snapshot:\n  ${problems.join("\n  ")}`);
  return snapshot;
}
