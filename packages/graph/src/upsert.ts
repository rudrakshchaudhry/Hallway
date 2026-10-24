import { NodeLabel, validateSnapshot, type GraphSnapshot, type Node } from "@hallway/types";
import type { FalkorDB } from "falkordb";
import { mergeInto } from "./write.ts";

/**
 * Adds or updates a snapshot in the live graph without wiping it (live ingest, profile
 * saves). Every edge endpoint must be in the snapshot itself, e.g. a live conference's
 * snapshot includes its Conference node. Only the fields the input supplies are written:
 * schema defaults never overwrite stored values.
 */
export async function upsertSnapshot(
  db: FalkorDB,
  name: string,
  input: GraphSnapshot,
  { createOnly = new Set<Node["label"]>() }: { createOnly?: ReadonlySet<Node["label"]> } = {},
) {
  const snapshot = validateSnapshot(input);
  const graph = db.selectGraph(name);

  // An id already used by a node with another label would otherwise become a second node.
  if ((await db.list()).includes(name)) {
    const ids = snapshot.nodes.map((n) => ({ id: n.id, label: n.label }));
    const existing = await graph.roQuery<{ id: string; label: string }>(
      "UNWIND $ids AS want MATCH (n {id: want.id}) WHERE NOT want.label IN labels(n) RETURN n.id AS id, labels(n)[0] AS label",
      { params: { ids } },
    );
    const conflict = existing.data?.[0];
    if (conflict) throw new Error(`upsert: ${conflict.id} already exists as a ${conflict.label}`);
  }

  // Write the raw input objects (validated above) so omitted fields stay as stored.
  const raw = (input.nodes as Node[]).map((n) => ({ ...n }));
  const labelOf = new Map(snapshot.nodes.map((n) => [n.id, n.label]));
  await mergeInto(graph, raw, snapshot.edges, labelOf, createOnly);
  for (const label of new Set(snapshot.nodes.map((n) => n.label))) {
    await graph.createNodeRangeIndex(NodeLabel.parse(label), "id").catch(() => {}); // already indexed
  }
  return { nodes: snapshot.nodes.length, edges: snapshot.edges.length };
}
