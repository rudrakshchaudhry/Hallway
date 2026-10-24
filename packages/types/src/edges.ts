import { z } from "zod";
import type { NodeLabel } from "./nodes.ts";

export const EdgeType = z.enum([
  "WORKS_AT",
  "OWNS",
  "DEPENDS_ON",
  "MAINTAINS",
  "SPEAKS_AT",
  "GAVE",
  "SIMILAR_TO",
  "ATTENDING",
  "ABOUT",
  "INTERESTED_IN",
  "HIRING_FOR",
  "SKILLED_IN",
  "MET",
  "PLANS",
]);
export type EdgeType = z.infer<typeof EdgeType>;

/** Which labels each relationship may connect (PLAN.md section 6). */
export const EDGE_RULES: Record<EdgeType, { from: NodeLabel[]; to: NodeLabel[] }> = {
  WORKS_AT: { from: ["Person"], to: ["Company"] },
  OWNS: { from: ["Person"], to: ["Repo"] },
  DEPENDS_ON: { from: ["Repo"], to: ["Package"] },
  MAINTAINS: { from: ["Person"], to: ["Package"] },
  SPEAKS_AT: { from: ["Person"], to: ["Talk"] },
  GAVE: { from: ["Person"], to: ["PastTalk"] },
  SIMILAR_TO: { from: ["Talk"], to: ["PastTalk"] },
  ATTENDING: { from: ["Person"], to: ["SideEvent"] },
  ABOUT: { from: ["Talk"], to: ["Topic"] },
  INTERESTED_IN: { from: ["Person"], to: ["Topic"] },
  HIRING_FOR: { from: ["Company"], to: ["Skill"] },
  SKILLED_IN: { from: ["Person"], to: ["Skill"] },
  MET: { from: ["Person"], to: ["Person"] },
  PLANS: { from: ["Person"], to: ["Talk", "SideEvent"] },
};

export const SimilarToProps = z.object({ score: z.number().min(0).max(1) });
export const MetProps = z.object({ at: z.number().int(), via: z.string() });

export const Edge = z.object({
  type: EdgeType,
  from: z.string(),
  to: z.string(),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type Edge = z.infer<typeof Edge>;

/** Deterministic edge id, stable across reseeds. */
export function edgeId(edge: Pick<Edge, "from" | "type" | "to">): string {
  return `${edge.from}|${edge.type}|${edge.to}`;
}
