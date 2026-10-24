import { z } from "zod";
import { EdgeType } from "./edges.ts";
import { GraphPath } from "./graph-path.ts";
import { Conference, GoalId, Meeting, MeetingStatus, NodeLabel, PastTalk, Person, SideEvent, Talk } from "./nodes.ts";

const isoDate = z.iso.datetime({ offset: true });

export const HealthResponse = z.object({ ok: z.literal(true), time: isoDate });

// ---------- Calendar and clashes (shared by Feed, Agenda, Explore, invites) ----------

export const CalendarItem = z.object({
  /** The Talk, SideEvent or Meeting node id. */
  id: z.string(),
  kind: z.enum(["talk", "event", "meeting"]),
  title: z.string(),
  start: isoDate,
  end: isoDate,
  location: z.string().optional(),
  /** Meetings only. */
  status: MeetingStatus.optional(),
  /** Meetings only: the other person. */
  personId: z.string().optional(),
});

export const Clash = z.object({
  itemId: z.string(),
  withId: z.string(),
  withTitle: z.string(),
  overlapMinutes: z.number().int().positive(),
});

export const AddToCalendarRequest = z.object({ targetId: z.string() });
export const AddToCalendarResponse = z.object({ item: CalendarItem, clashes: z.array(Clash) });

// ---------- People deck (Track B) ----------

export const Tag = z.enum(["shared-stack", "same-topic", "speaker", "hiring", "ex-colleague", "in-your-sessions", "host"]);

/** Where to find someone: a talk they give or an event they host or attend. */
export const Whereabouts = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("talk"), talk: Talk }),
  z.object({ kind: z.literal("event"), event: SideEvent }),
]);

export const DeckCard = z.object({
  person: Person,
  tags: z.array(Tag).min(1),
  score: z.number(),
  /** One-line why, e.g. "Maintains zod, which 2 of your repos use". */
  reason: z.string(),
  whereabouts: z.array(Whereabouts),
  path: GraphPath,
});

export const PeopleResponse = z.object({ cards: z.array(DeckCard), swipes: z.number().int() });
export const SwipeRequest = z.object({ personId: z.string(), dir: z.enum(["right", "left"]) });
export const SwipeResponse = z.object({ ok: z.literal(true), updatedPreferences: z.array(z.string()) });

// ---------- Meetings and invites (Track B; shown in Track A's feed) ----------

export const MeetingPublic = Meeting.omit({ tokenHash: true });

export const RequestSent = z.object({ meeting: MeetingPublic, person: Person });

export const InviteCreateRequest = z.object({
  personId: z.string(),
  start: isoDate,
  end: isoDate,
  place: z.string().min(1),
  note: z.string().max(500).default(""),
});

export const InviteCreateResponse = z.object({
  meeting: MeetingPublic,
  /** PUBLIC_URL/invite/<token>; the token is only ever returned here. */
  url: z.url(),
  shareText: z.string(),
  gcalUrl: z.url(),
});

export const InvitePublicView = z.object({
  requester: z.object({ name: z.string(), headline: z.string().optional(), avatar: z.url().optional() }),
  reason: z.string(),
  start: isoDate,
  end: isoDate,
  place: z.string(),
  note: z.string(),
  status: MeetingStatus,
});

export const InviteRespondRequest = z.object({ decision: z.enum(["accept", "decline"]) });
export const InviteRespondResponse = z.object({ status: MeetingStatus, gcalUrl: z.url().optional(), icsUrl: z.string().optional() });

export const MeetingActionResponse = z.object({ meeting: MeetingPublic });

// ---------- Agenda (Track A) ----------

export const AgendaItem = z.object({
  talk: Talk,
  speakers: z.array(Person),
  priority: z.number(),
  reasons: z.array(z.string()),
  rerun: z.object({ pastTalk: PastTalk, similarity: z.number().min(0).max(1) }).optional(),
  planned: z.boolean(),
  clashes: z.array(Clash),
  path: GraphPath.optional(),
});

export const AgendaResponse = z.object({ conference: Conference, items: z.array(AgendaItem) });

// ---------- Explore (Track B) ----------

export const ExploreItem = z.object({
  event: SideEvent,
  hosts: z.array(Person),
  score: z.number(),
  reasons: z.array(z.string()),
  planned: z.boolean(),
  clashes: z.array(Clash),
  path: GraphPath.optional(),
});

export const ExploreResponse = z.object({ items: z.array(ExploreItem) });

// ---------- Feed (Track A) ----------

export const FeedCard = z.object({
  item: CalendarItem,
  /** The detailed description shown on the confirmed card. */
  detail: z.string(),
  path: GraphPath.optional(),
});

export const FeedSuggestion = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("person"), card: DeckCard }),
  z.object({ kind: z.literal("session"), item: AgendaItem }),
  z.object({ kind: z.literal("event"), item: ExploreItem }),
]);

export const FeedResponse = z.object({
  calendar: z.array(CalendarItem),
  clashes: z.array(Clash),
  confirmed: z.array(FeedCard),
  requests: z.array(RequestSent),
  suggestions: z.array(FeedSuggestion),
});

// ---------- Past graph and stage (Track A) ----------

export const PastGraphResponse = z.object({
  nodes: z.array(z.object({ id: z.string(), label: NodeLabel, name: z.string(), at: z.number().int().optional() })),
  edges: z.array(
    z.object({
      id: z.string(),
      type: EdgeType,
      from: z.string(),
      to: z.string(),
      props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    }),
  ),
});

export const StagePathResponse = z.object({ path: GraphPath.nullable(), at: z.number().int().nullable() });

// ---------- Conferences and live ingest (Main) ----------

export const IngestStage = z.enum(["find", "sessions", "speakers", "past-talks", "side-events", "done"]);

export const IngestJobStatus = z.object({
  id: z.string(),
  query: z.string(),
  conferenceId: z.string().optional(),
  stage: IngestStage,
  status: z.enum(["running", "done", "failed"]),
  counts: z.record(z.string(), z.number().int()),
  errors: z.array(z.string()),
  startedAt: z.number().int(),
});

export const StartIngestRequest = z
  .object({ name: z.string().min(2).optional(), url: z.url().optional() })
  .refine((v) => v.name || v.url, "give a conference name or URL");

export const ConferenceSummary = z.object({
  conference: Conference,
  counts: z.object({ talks: z.number().int(), speakers: z.number().int(), events: z.number().int() }),
});
export const ConferencesResponse = z.object({ conferences: z.array(ConferenceSummary) });

// ---------- Onboarding chat and profile (Main) ----------

export const ProfileSource = z.enum(["linkedin", "linkedin-pdf", "github", "text", "demo"]);

export const ProfileDraft = z.object({
  name: z.string().optional(),
  headline: z.string().optional(),
  role: z.string().optional(),
  about: z.string().optional(),
  linkedin: z.url().optional(),
  github: z.string().optional(),
  skills: z.array(z.string()),
  topics: z.array(z.string()),
  companies: z.array(z.object({ name: z.string(), current: z.boolean() })),
  repos: z.array(z.string()),
  packages: z.array(z.string()),
  sources: z.array(ProfileSource),
});

export const SaveProfileRequest = z.object({
  draft: ProfileDraft,
  goals: z.array(GoalId).min(1),
  conferenceId: z.string(),
});
export const SaveProfileResponse = z.object({ personId: z.string(), handle: z.string() });

export const Chip = z.object({ id: z.string(), label: z.string() });

export const ChatRequest = z.object({
  message: z.string().max(4000).default(""),
  /** Set when the user tapped a quick-reply chip. */
  chipIds: z.array(z.string()).optional(),
});

/** One NDJSON line streamed by POST /api/chat. */
export const ChatEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({ type: z.literal("chips"), chips: z.array(Chip), multi: z.boolean() }),
  z.object({ type: z.literal("input"), accept: z.enum(["text", "url", "pdf"]), placeholder: z.string() }),
  z.object({ type: z.literal("profile_draft"), draft: ProfileDraft }),
  z.object({ type: z.literal("ingest_progress"), job: IngestJobStatus }),
  z.object({ type: z.literal("step"), id: z.string(), tool: z.string(), status: z.enum(["running", "done", "error"]), summary: z.string() }),
  z.object({ type: z.literal("path"), path: GraphPath }),
  z.object({
    type: z.literal("approval_required"),
    threadId: z.string(),
    toolCallId: z.string(),
    tool: z.string(),
    /** Exactly what will happen, shown in the approval sheet. */
    preview: z.string(),
  }),
  z.object({ type: z.literal("redirect"), to: z.string() }),
  z.object({ type: z.literal("done"), cached: z.boolean().default(false) }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export const ApprovalDecision = z.object({
  turnId: z.string(),
  threadId: z.string(),
  toolCallId: z.string(),
  decision: z.enum(["allow", "deny"]),
  reason: z.string().optional(),
});

export type HealthResponse = z.infer<typeof HealthResponse>;
export type CalendarItem = z.infer<typeof CalendarItem>;
export type Clash = z.infer<typeof Clash>;
export type AddToCalendarRequest = z.infer<typeof AddToCalendarRequest>;
export type AddToCalendarResponse = z.infer<typeof AddToCalendarResponse>;
export type Tag = z.infer<typeof Tag>;
export type Whereabouts = z.infer<typeof Whereabouts>;
export type DeckCard = z.infer<typeof DeckCard>;
export type PeopleResponse = z.infer<typeof PeopleResponse>;
export type SwipeRequest = z.infer<typeof SwipeRequest>;
export type SwipeResponse = z.infer<typeof SwipeResponse>;
export type MeetingPublic = z.infer<typeof MeetingPublic>;
export type RequestSent = z.infer<typeof RequestSent>;
export type InviteCreateRequest = z.infer<typeof InviteCreateRequest>;
export type InviteCreateResponse = z.infer<typeof InviteCreateResponse>;
export type InvitePublicView = z.infer<typeof InvitePublicView>;
export type InviteRespondRequest = z.infer<typeof InviteRespondRequest>;
export type InviteRespondResponse = z.infer<typeof InviteRespondResponse>;
export type MeetingActionResponse = z.infer<typeof MeetingActionResponse>;
export type AgendaItem = z.infer<typeof AgendaItem>;
export type AgendaResponse = z.infer<typeof AgendaResponse>;
export type ExploreItem = z.infer<typeof ExploreItem>;
export type ExploreResponse = z.infer<typeof ExploreResponse>;
export type FeedCard = z.infer<typeof FeedCard>;
export type FeedSuggestion = z.infer<typeof FeedSuggestion>;
export type FeedResponse = z.infer<typeof FeedResponse>;
export type PastGraphResponse = z.infer<typeof PastGraphResponse>;
export type StagePathResponse = z.infer<typeof StagePathResponse>;
export type IngestStage = z.infer<typeof IngestStage>;
export type IngestJobStatus = z.infer<typeof IngestJobStatus>;
export type StartIngestRequest = z.infer<typeof StartIngestRequest>;
export type ConferenceSummary = z.infer<typeof ConferenceSummary>;
export type ConferencesResponse = z.infer<typeof ConferencesResponse>;
export type ProfileSource = z.infer<typeof ProfileSource>;
export type ProfileDraft = z.infer<typeof ProfileDraft>;
export type SaveProfileRequest = z.infer<typeof SaveProfileRequest>;
export type SaveProfileResponse = z.infer<typeof SaveProfileResponse>;
export type Chip = z.infer<typeof Chip>;
export type ChatRequest = z.infer<typeof ChatRequest>;
export type ChatEvent = z.infer<typeof ChatEvent>;
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;
