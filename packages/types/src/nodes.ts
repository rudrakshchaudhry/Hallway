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
  avatar: z.url().optional(),
  linkedin: z.url().optional(),
  github: z.string().optional(),
  optedIn: z.boolean().default(false),
});

export const Company = z.object({
  label: z.literal("Company"),
  id,
  name: z.string(),
  funding: z.string().optional(),
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

export const Talk = z.object({
  label: z.literal("Talk"),
  id,
  title: z.string(),
  abstract: z.string().default(""),
  start: isoDate,
  end: isoDate.optional(),
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
});

export const Skill = z.object({ label: z.literal("Skill"), id, name: z.string() });
export const Topic = z.object({ label: z.literal("Topic"), id, name: z.string() });

export const Node = z.discriminatedUnion("label", [
  Person,
  Company,
  Repo,
  Package,
  Talk,
  PastTalk,
  SideEvent,
  Skill,
  Topic,
]);

export const NodeLabel = z.enum([
  "Person",
  "Company",
  "Repo",
  "Package",
  "Talk",
  "PastTalk",
  "SideEvent",
  "Skill",
  "Topic",
]);

export type Person = z.infer<typeof Person>;
export type Company = z.infer<typeof Company>;
export type Repo = z.infer<typeof Repo>;
export type Package = z.infer<typeof Package>;
export type Talk = z.infer<typeof Talk>;
export type PastTalk = z.infer<typeof PastTalk>;
export type SideEvent = z.infer<typeof SideEvent>;
export type Skill = z.infer<typeof Skill>;
export type Topic = z.infer<typeof Topic>;
export type Node = z.infer<typeof Node>;
export type NodeLabel = z.infer<typeof NodeLabel>;

/** Short display name for any node, used in path hops and graph captions. */
export function nodeName(node: Node): string {
  switch (node.label) {
    case "Person":
      return node.name;
    case "Repo":
      return node.fullName;
    case "Talk":
    case "PastTalk":
      return node.title;
    default:
      return node.name;
  }
}
