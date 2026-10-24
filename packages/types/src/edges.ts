import { z } from "zod";
import type { NodeLabel } from "./nodes.ts";

export const EdgeType = z.enum([
  "PART_OF",
  "NEAR",
  "SPEAKS_AT",
  "GAVE",
  "SIMILAR_TO",
  "HOSTS",
  "ATTENDING",
  "WORKS_AT",
  "WORKED_AT",
  "OWNS",
  "DEPENDS_ON",
  "MAINTAINS",
  "SKILLED_IN",
  "HIRING_FOR",
  "ABOUT",
  "INTERESTED_IN",
  "HAS_GOAL",
  "TARGETS",
  "PLANS",
  "SWIPED",
  "PREFERS",
  "ORGANIZES",
  "WITH",
  "MET",
  "HAS_BLOCK",
]);
export type EdgeType = z.infer<typeof EdgeType>;

/** Which labels each relationship may connect (PLAN.md section 6). */
export const EDGE_RULES: Record<EdgeType, { from: NodeLabel[]; to: NodeLabel[] }> = {
  PART_OF: { from: ["Talk"], to: ["Conference"] },
  NEAR: { from: ["SideEvent"], to: ["Conference"] },
  SPEAKS_AT: { from: ["Person"], to: ["Talk"] },
  GAVE: { from: ["Person"], to: ["PastTalk"] },
  SIMILAR_TO: { from: ["Talk"], to: ["PastTalk"] },
  HOSTS: { from: ["Person", "Company"], to: ["SideEvent"] },
  ATTENDING: { from: ["Person"], to: ["SideEvent", "Conference"] },
  WORKS_AT: { from: ["Person"], to: ["Company"] },
  WORKED_AT: { from: ["Person"], to: ["Company"] },
  OWNS: { from: ["Person", "Company"], to: ["Repo"] },
  DEPENDS_ON: { from: ["Repo"], to: ["Package"] },
  MAINTAINS: { from: ["Person"], to: ["Package"] },
  SKILLED_IN: { from: ["Person"], to: ["Skill"] },
  HIRING_FOR: { from: ["Company"], to: ["Skill"] },
  ABOUT: { from: ["Talk"], to: ["Topic"] },
  INTERESTED_IN: { from: ["Person"], to: ["Topic"] },
  HAS_GOAL: { from: ["Person"], to: ["Goal"] },
  TARGETS: { from: ["Person"], to: ["Conference"] },
  PLANS: { from: ["Person"], to: ["Talk", "SideEvent"] },
  SWIPED: { from: ["Person"], to: ["Person"] },
  PREFERS: { from: ["Person"], to: ["Topic", "Skill", "Company", "Goal"] },
  ORGANIZES: { from: ["Person"], to: ["Meeting"] },
  WITH: { from: ["Meeting"], to: ["Person"] },
  MET: { from: ["Person"], to: ["Person"] },
  HAS_BLOCK: { from: ["Person"], to: ["CalendarBlock"] },
};

const at = z.number().int();

/** Edge types whose props are required; checked by validateSnapshot. */
export const EDGE_PROPS: Partial<Record<EdgeType, z.ZodType>> = {
  SIMILAR_TO: z.object({ score: z.number().min(0).max(1) }),
  MET: z.object({ at, via: z.string() }),
  TARGETS: z.object({ at }),
  PLANS: z.object({ at }),
  SWIPED: z.object({ dir: z.enum(["right", "left"]), at }),
  PREFERS: z.object({ weight: z.number().min(-1).max(2) }),
};

// Prop keys end up in the falkordb client's CYPHER parameter prefix unescaped, so keep them plain.
const propKey = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "edge prop keys must be identifiers");

export const Edge = z.object({
  type: EdgeType,
  from: z.string(),
  to: z.string(),
  props: z.record(propKey, z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type Edge = z.infer<typeof Edge>;

/**
 * Deterministic edge id, stable across reseeds. Runtime writers must set the same `id`
 * property so paths keep working.
 */
export function edgeId(edge: Pick<Edge, "from" | "type" | "to">): string {
  return `${edge.from}|${edge.type}|${edge.to}`;
}
