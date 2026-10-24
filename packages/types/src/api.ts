import { z } from "zod";
import { GraphPath } from "./graph-path.ts";
import { Company, PastTalk, Person, SideEvent, Talk } from "./nodes.ts";

const isoDate = z.iso.datetime({ offset: true });

export const HealthResponse = z.object({ ok: z.literal(true), time: isoDate });

/** Where to find someone: a talk they give or an event they attend. */
export const Whereabouts = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("talk"), talk: Talk }),
  z.object({ kind: z.literal("event"), event: SideEvent }),
]);

export const PersonCard = z.object({
  person: Person,
  reason: z.string(),
  sharedPackages: z.array(z.string()),
  icebreaker: z.string().optional(),
  findThem: z.array(Whereabouts),
  path: GraphPath,
});

export const Verdict = z.enum(["live-only", "rerun", "clash"]);

export const SessionVerdict = z.object({
  talk: Talk,
  verdict: Verdict,
  pastTalk: PastTalk.optional(),
  similarity: z.number().min(0).max(1).optional(),
  path: GraphPath.optional(),
});

export const BoothFit = z.object({
  company: Company,
  booth: z.string(),
  reasons: z.array(z.string()),
  score: z.number(),
  path: GraphPath,
});

const cardBase = {
  id: z.string(),
  rank: z.number(),
  startsAt: isoDate.optional(),
  /** One-line verdict, e.g. "Meet Priya". */
  title: z.string(),
  /** One-line why. */
  reason: z.string(),
  /** Primary button label, e.g. "Where is she?". */
  action: z.string(),
  path: GraphPath.optional(),
};

/** One ranked card in the Today feed. */
export const FeedCard = z.discriminatedUnion("kind", [
  z.object({ ...cardBase, kind: z.literal("person"), person: PersonCard }),
  z.object({ ...cardBase, kind: z.literal("session"), session: SessionVerdict }),
  z.object({ ...cardBase, kind: z.literal("booth"), booth: BoothFit }),
  z.object({ ...cardBase, kind: z.literal("event"), event: SideEvent }),
]);

export const FollowUp = z.object({
  person: Person,
  metAt: z.number().int(),
  draft: z.object({ subject: z.string(), body: z.string() }).optional(),
  status: z.enum(["pending", "approved", "sent", "skipped"]),
});

/** One NDJSON line streamed by POST /api/ask. */
export const AskEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("step"),
    id: z.string(),
    tool: z.string(),
    status: z.enum(["running", "done", "error"]),
    summary: z.string(),
  }),
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({ type: z.literal("path"), path: GraphPath }),
  z.object({
    type: z.literal("approval_required"),
    threadId: z.string(),
    toolCallId: z.string(),
    tool: z.string(),
    /** Exactly what will leave the app, shown in the approval sheet. */
    preview: z.string(),
  }),
  z.object({ type: z.literal("done"), turnId: z.string(), cached: z.boolean().default(false) }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type HealthResponse = z.infer<typeof HealthResponse>;
export type Whereabouts = z.infer<typeof Whereabouts>;
export type PersonCard = z.infer<typeof PersonCard>;
export type Verdict = z.infer<typeof Verdict>;
export type SessionVerdict = z.infer<typeof SessionVerdict>;
export type BoothFit = z.infer<typeof BoothFit>;
export type FeedCard = z.infer<typeof FeedCard>;
export type FollowUp = z.infer<typeof FollowUp>;
export type AskEvent = z.infer<typeof AskEvent>;
