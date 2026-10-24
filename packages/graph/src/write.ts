import { NodeLabel, edgeId, type Edge, type Node } from "@hallway/types";
import type { Graph } from "falkordb";

type Props = Record<string, string | number | boolean>;

/**
 * MERGEs nodes by id and edges by (from, type, to), updating properties. Labels and
 * relationship types are interpolated only from the zod enums; values are parameters.
 * Every edge endpoint must be in `labelOf` so the MATCH can use the per-label id index.
 */
export async function mergeInto(
  graph: Graph,
  nodes: Node[],
  edges: Edge[],
  labelOf: Map<string, Node["label"]>,
  /** Labels whose existing nodes are left untouched (only created when missing). */
  createOnly: ReadonlySet<Node["label"]> = new Set(),
) {
  for (const label of NodeLabel.options) {
    const rows = nodes
      .filter((n) => n.label === label)
      .map(({ label: _label, ...props }) => {
        // zod fills isUser/optedIn with false; never let a default demote an onboarded user.
        const row: Record<string, string | number | boolean | string[]> = { ...props };
        if (row.isUser === false) delete row.isUser;
        if (row.optedIn === false) delete row.optedIn;
        return row;
      });
    if (!rows.length) continue;
    const set = createOnly.has(label) ? "ON CREATE SET n += row" : "SET n += row";
    await graph.query(`UNWIND $rows AS row MERGE (n:${label} {id: row.id}) ${set}`, { params: { rows } });
  }

  const groups = new Map<string, { from: string; to: string; props: Props }[]>();
  for (const edge of edges) {
    const from = labelOf.get(edge.from);
    const to = labelOf.get(edge.to);
    if (!from || !to) throw new Error(`edge ${edgeId(edge)} has an endpoint with no known label`);
    const key = `${from}|${edge.type}|${to}`;
    const rows = groups.get(key) ?? [];
    rows.push({ from: edge.from, to: edge.to, props: { ...edge.props, id: edgeId(edge) } });
    groups.set(key, rows);
  }
  for (const [key, rows] of groups) {
    const [from, type, to] = key.split("|");
    await graph.query(
      `UNWIND $rows AS row
       MATCH (a:${from} {id: row.from}), (b:${to} {id: row.to})
       MERGE (a)-[r:${type}]->(b) SET r += row.props`,
      { params: { rows } },
    );
  }
}
