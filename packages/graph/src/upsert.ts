import { NodeLabel, validateSnapshot, type GraphSnapshot } from "@hallway/types";
import type { FalkorDB } from "falkordb";
import { mergeInto } from "./write.ts";

/**
 * Adds or updates a snapshot in the live graph without wiping it (live ingest, profile
 * saves). Every edge endpoint must be in the snapshot itself, e.g. a live conference's
 * snapshot includes its Conference node.
 */
export async function upsertSnapshot(db: FalkorDB, name: string, input: GraphSnapshot) {
  const snapshot = validateSnapshot(input);
  const graph = db.selectGraph(name);
  const labelOf = new Map(snapshot.nodes.map((n) => [n.id, n.label]));
  await mergeInto(graph, snapshot.nodes, snapshot.edges, labelOf);
  for (const label of new Set(snapshot.nodes.map((n) => n.label))) {
    await graph.createNodeRangeIndex(NodeLabel.parse(label), "id").catch(() => {}); // already indexed
  }
  return { nodes: snapshot.nodes.length, edges: snapshot.edges.length };
}
