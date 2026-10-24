import { z } from "zod";
import { EDGE_PROPS, EDGE_RULES, Edge } from "./edges.ts";
import { Node } from "./nodes.ts";

/** The on-disk graph format shared by data/fixtures and data/clean, loaded by `pnpm seed`. */
export const GraphSnapshot = z.object({
  nodes: z.array(Node),
  edges: z.array(Edge),
});
export type GraphSnapshot = z.infer<typeof GraphSnapshot>;

const RawNode = z.looseObject({ id: z.string(), label: z.string() });
const RawEdge = z.looseObject({ type: z.string(), from: z.string(), to: z.string(), props: z.record(z.string(), z.unknown()).optional() });
const RawSnapshot = z.object({ nodes: z.array(RawNode), edges: z.array(RawEdge) });
type RawNode = z.infer<typeof RawNode>;
type RawEdge = z.infer<typeof RawEdge>;

/**
 * Combines snapshots (one per ingest source). Nodes with the same id are merged, later
 * properties winning; their labels must match. Duplicate edges collapse into one.
 */
export function mergeSnapshots(inputs: unknown[]): unknown {
  // Merge raw objects, before schema defaults fill in omitted fields, so a source that
  // omits e.g. `stars` can't overwrite a value another source supplied.
  const nodes = new Map<string, RawNode>();
  const edges = new Map<string, RawEdge>();
  for (const part of inputs.map((input) => RawSnapshot.parse(input))) {
    for (const node of part.nodes) {
      const prev = nodes.get(node.id);
      if (prev && prev.label !== node.label) {
        throw new Error(`node ${node.id} is a ${prev.label} in one snapshot and a ${node.label} in another`);
      }
      nodes.set(node.id, { ...prev, ...node });
    }
    for (const edge of part.edges) {
      const key = `${edge.from}|${edge.type}|${edge.to}`;
      edges.set(key, { ...edges.get(key), ...edge, props: { ...edges.get(key)?.props, ...edge.props } });
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** Parses a snapshot and checks referential integrity. Throws with every problem listed. */
export function validateSnapshot(input: unknown): GraphSnapshot {
  const snapshot = GraphSnapshot.parse(input);
  const problems: string[] = [];
  const labels = new Map<string, Node["label"]>();
  const handles = new Set<string>();

  for (const node of snapshot.nodes) {
    if (labels.has(node.id)) problems.push(`duplicate node id ${node.id}`);
    labels.set(node.id, node.label);
    if (node.label === "Person") {
      if (handles.has(node.handle)) problems.push(`duplicate person handle ${node.handle}`);
      handles.add(node.handle);
    }
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
    const props = EDGE_PROPS[edge.type];
    if (props && !props.safeParse(edge.props ?? {}).success) problems.push(`${key}: missing or invalid props`);
  }

  if (problems.length) throw new Error(`Invalid graph snapshot:\n  ${problems.join("\n  ")}`);
  return snapshot;
}
