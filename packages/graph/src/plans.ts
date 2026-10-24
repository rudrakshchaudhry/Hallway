import { edgeId } from "@hallway/types";
import type { Graph } from "falkordb";

/** Adds a talk or side event to the user's calendar (PLANS edge). Idempotent; false if the target or user is unknown. */
export async function addPlan(graph: Graph, me: string, targetId: string, now = Date.now()): Promise<boolean> {
  const found = await graph.roQuery<{ label: string }>(
    "MATCH (x {id: $id}) WHERE x:Talk OR x:SideEvent RETURN labels(x)[0] AS label",
    { params: { id: targetId } },
  );
  const label = found.data?.[0]?.label;
  if (label !== "Talk" && label !== "SideEvent") return false;
  const res = await graph.query<{ n: number }>(
    `MATCH (u:Person {id: $me}), (x:${label} {id: $id})
     MERGE (u)-[p:PLANS]->(x)
     ON CREATE SET p.at = $now, p.id = $edgeId
     RETURN count(p) AS n`,
    { params: { me, id: targetId, now, edgeId: edgeId({ from: me, type: "PLANS", to: targetId }) } },
  );
  return (res.data?.[0]?.n ?? 0) > 0;
}
