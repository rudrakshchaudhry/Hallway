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
  /** For "clash": the planned talk or event this one overlaps. */
  clashesWith: z.object({ id: z.string(), title: z.string(), start: isoDate }).optional(),
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
  /** Optional only for cards with no graph walk behind them (e.g. a plain side event). */
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

// Request and response envelopes for the API routes.

export const OnboardingRequest = z.object({
  handle: z.string().min(1).optional(),
  demo: z.boolean().default(false),
  topics: z.array(z.string()).max(5).default([]),
});

export const Profile = z.object({
  handle: z.string(),
  name: z.string().optional(),
  repos: z.array(z.string()),
  packages: z.array(z.string()),
  topics: z.array(z.string()),
});

export const FeedResponse = z.object({ cards: z.array(FeedCard), generatedAt: isoDate, cached: z.boolean() });
export const PeopleResponse = z.object({ people: z.array(PersonCard) });
export const ScheduleResponse = z.object({ sessions: z.array(SessionVerdict) });
export const BoothsResponse = z.object({ booths: z.array(BoothFit) });
export const FollowUpsResponse = z.object({ followUps: z.array(FollowUp) });
export const MetResponse = z.object({ followUp: FollowUp, path: GraphPath });

export const AskRequest = z.object({
  question: z.string().min(1).max(500),
  sessionId: z.string().optional(),
  previousTurnId: z.string().optional(),
});

export const ApprovalDecision = z.object({
  sessionId: z.string(),
  turnId: z.string(),
  threadId: z.string(),
  toolCallId: z.string(),
  decision: z.enum(["allow", "deny"]),
  reason: z.string().optional(),
});

export const RefreshEventsResponse = z.object({
  events: z.array(SideEvent),
  lastUpdated: isoDate,
  /** True when the live Bright Data call failed or timed out and the snapshot was returned. */
  cached: z.boolean(),
});

export type HealthResponse = z.infer<typeof HealthResponse>;
export type OnboardingRequest = z.infer<typeof OnboardingRequest>;
export type Profile = z.infer<typeof Profile>;
export type FeedResponse = z.infer<typeof FeedResponse>;
export type PeopleResponse = z.infer<typeof PeopleResponse>;
export type ScheduleResponse = z.infer<typeof ScheduleResponse>;
export type BoothsResponse = z.infer<typeof BoothsResponse>;
export type FollowUpsResponse = z.infer<typeof FollowUpsResponse>;
export type MetResponse = z.infer<typeof MetResponse>;
export type AskRequest = z.infer<typeof AskRequest>;
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;
export type RefreshEventsResponse = z.infer<typeof RefreshEventsResponse>;
export type Whereabouts = z.infer<typeof Whereabouts>;
export type PersonCard = z.infer<typeof PersonCard>;
export type Verdict = z.infer<typeof Verdict>;
export type SessionVerdict = z.infer<typeof SessionVerdict>;
export type BoothFit = z.infer<typeof BoothFit>;
export type FeedCard = z.infer<typeof FeedCard>;
export type FollowUp = z.infer<typeof FollowUp>;
export type AskEvent = z.infer<typeof AskEvent>;
