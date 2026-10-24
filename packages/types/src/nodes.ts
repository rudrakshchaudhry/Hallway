import { z } from "zod";

// Every node carries a stable string id (e.g. "person:octocat", "pkg:npm/zod").
// FalkorDB's internal ids change on every reseed, so paths and the UI use these.
// "|" is reserved as the separator in edge ids.
const id = z.string().regex(/^[a-z]+:[^|]+$/, "id must look like '<kind>:<key>' with no '|'");
const isoDate = z.iso.datetime({ offset: true });

export const Person = z.object({
  label: z.literal("Person"),
  id,
  handle: z.string(),
  name: z.string(),
  role: z.string().optional(),
  headline: z.string().optional(),
  about: z.string().optional(),
  avatar: z.url().optional(),
  linkedin: z.url().optional(),
  github: z.string().optional(),
  optedIn: z.boolean().default(false),
  /** True for people who onboarded themselves; their subgraph survives reseeds. */
  isUser: z.boolean().default(false),
});

export const Conference = z.object({
  label: z.literal("Conference"),
  id,
  name: z.string(),
  start: isoDate,
  end: isoDate,
  city: z.string().optional(),
  venue: z.string().optional(),
  /** IANA time zone of the venue, e.g. "America/Los_Angeles"; conference hours use it. */
  tz: z.string().default("America/Los_Angeles"),
  url: z.url().optional(),
  source: z.enum(["snapshot", "live"]),
  status: z.enum(["ready", "ingesting", "failed"]).default("ready"),
});

export const Company = z.object({
  label: z.literal("Company"),
  id,
  name: z.string(),
  funding: z.string().optional(),
  /** Optional, unused by the v2 UI. */
  booth: z.string().optional(),
});

export const Repo = z.object({
  label: z.literal("Repo"),
  id,
  fullName: z.string(),
  stars: z.number().int().nonnegative().default(0),
});

export const Package = z.object({
  label: z.literal("Package"),
  id,
  name: z.string(),
  ecosystem: z.enum(["npm", "pypi", "go", "cargo", "maven", "rubygems", "other"]),
});

export const TalkKind = z.enum(["talk", "workshop", "keynote", "panel", "other"]);

export const Talk = z.object({
  label: z.literal("Talk"),
  id,
  title: z.string(),
  abstract: z.string().default(""),
  kind: TalkKind.default("talk"),
  start: isoDate,
  /** Normalisers fill a missing end with start + 45 min (90 for workshops). */
  end: isoDate,
  room: z.string().optional(),
});

export const PastTalk = z.object({
  label: z.literal("PastTalk"),
  id,
  title: z.string(),
  conf: z.string(),
  year: z.number().int(),
  url: z.url(),
});

export const SideEvent = z.object({
  label: z.literal("SideEvent"),
  id,
  name: z.string(),
  start: isoDate,
  end: isoDate.optional(),
  venue: z.string().optional(),
  url: z.url().optional(),
  source: z.string().optional(),
});

export const GoalId = z.enum(["networking", "learn", "job", "hire", "collaborate", "fundraise"]);

export const Skill = z.object({ label: z.literal("Skill"), id, name: z.string() });
export const Topic = z.object({ label: z.literal("Topic"), id, name: z.string() });
export const Goal = z.object({ label: z.literal("Goal"), id, name: z.string(), goal: GoalId });

export const MeetingStatus = z.enum(["pending", "accepted", "declined", "met"]);

export const Meeting = z.object({
  label: z.literal("Meeting"),
  id,
  /** sha256 of the invite token; the token itself is never stored. */
  tokenHash: z.string(),
  /** Up to 3 start times the requester offers; the invitee picks one when accepting. */
  proposed: z.array(isoDate).min(1).max(3),
  durationMinutes: z.number().int().positive().default(30),
  /** Set when accepted (the picked slot). */
  start: isoDate.optional(),
  end: isoDate.optional(),
  place: z.string(),
  note: z.string().default(""),
  status: MeetingStatus,
  createdAt: z.number().int(),
  respondedAt: z.number().int().optional(),
});

/** A busy block imported from the user's own calendar (Google Calendar secret iCal address). */
export const CalendarBlock = z.object({
  label: z.literal("CalendarBlock"),
  id,
  start: isoDate,
  end: isoDate,
  title: z.string().default("Busy"),
  source: z.enum(["gcal-ics"]),
});

export const Node = z.discriminatedUnion("label", [
  Person,
  Conference,
  Company,
  Repo,
  Package,
  Talk,
  PastTalk,
  SideEvent,
  Skill,
  Topic,
  Goal,
  Meeting,
  CalendarBlock,
]);

export const NodeLabel = z.enum([
  "Person",
  "Conference",
  "Company",
  "Repo",
  "Package",
  "Talk",
  "PastTalk",
  "SideEvent",
  "Skill",
  "Topic",
  "Goal",
  "Meeting",
  "CalendarBlock",
]);

export type Person = z.infer<typeof Person>;
export type Conference = z.infer<typeof Conference>;
export type Company = z.infer<typeof Company>;
export type Repo = z.infer<typeof Repo>;
export type Package = z.infer<typeof Package>;
export type TalkKind = z.infer<typeof TalkKind>;
export type Talk = z.infer<typeof Talk>;
export type PastTalk = z.infer<typeof PastTalk>;
export type SideEvent = z.infer<typeof SideEvent>;
export type GoalId = z.infer<typeof GoalId>;
export type Skill = z.infer<typeof Skill>;
export type Topic = z.infer<typeof Topic>;
export type Goal = z.infer<typeof Goal>;
export type MeetingStatus = z.infer<typeof MeetingStatus>;
export type Meeting = z.infer<typeof Meeting>;
export type CalendarBlock = z.infer<typeof CalendarBlock>;
export type Node = z.infer<typeof Node>;
export type NodeLabel = z.infer<typeof NodeLabel>;

/** Short display name for any node, used in path hops and graph captions. */
export function nodeName(node: Node): string {
  switch (node.label) {
    case "Repo":
      return node.fullName;
    case "Talk":
    case "PastTalk":
      return node.title;
    case "Meeting":
      return `Meeting at ${node.place}`;
    case "CalendarBlock":
      return node.title;
    default:
      return node.name;
  }
}
