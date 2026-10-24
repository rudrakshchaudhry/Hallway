import { GoalId, edgeId, type Conference, type Edge, type GraphSnapshot, type Node, type ProfileDraft } from "@hallway/types";

const GOAL_NAMES: Record<GoalId, string> = {
  networking: "Networking",
  learn: "Learn a topic",
  job: "Find a job",
  hire: "Hire",
  collaborate: "Find collaborators",
  fundraise: "Fundraise",
};

export const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._+#/-]+/g, "-")
    .replace(/\|/g, "-")
    .replace(/^-+|-+$/g, "") || "x";

/** Handle-safe slug: no "/" either, so person ids work in URLs. */
export const handleSlug = (s: string) => slug(s).replace(/\//g, "-");

/** Every label the profile writes except the user's own Person: existing nodes are shared, never overwritten. */
export const SHARED_PROFILE_LABELS = new Set<Node["label"]>(["Conference", "Goal", "Topic", "Skill", "Company", "Repo", "Package"]);

export type ProfileInput = {
  handle: string;
  draft: ProfileDraft;
  goals: GoalId[];
  conference: Conference;
  /** Topics already in the graph, so "AI" maps to the conference's topic:ai. */
  existingTopics: { id: string; name: string }[];
  now: number;
};

/**
 * The onboarded user's profile as a snapshot for upsertSnapshot (PLAN.md 6.2 #7). Pure, so
 * it is tested without the database. Includes every endpoint node, as upserts require.
 */
export function buildProfileSnapshot({ handle, draft, goals, conference, existingTopics, now }: ProfileInput): GraphSnapshot {
  const me = `person:${handle}`;
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const add = (node: Node) => nodes.set(node.id, node);
  const link = (type: Edge["type"], to: string, props?: Edge["props"]) => edges.push({ type, from: me, to, ...(props ? { props } : {}) });

  add({
    label: "Person",
    id: me,
    handle,
    name: draft.name ?? handle,
    optedIn: true,
    isUser: true,
    ...(draft.role ? { role: draft.role } : {}),
    ...(draft.headline ? { headline: draft.headline } : {}),
    ...(draft.about ? { about: draft.about } : {}),
    ...(draft.linkedin ? { linkedin: draft.linkedin } : {}),
    ...(draft.github ? { github: draft.github } : {}),
  });

  add(conference);
  link("TARGETS", conference.id, { at: now });

  for (const goal of goals) {
    add({ label: "Goal", id: `goal:${goal}`, name: GOAL_NAMES[goal], goal });
    link("HAS_GOAL", `goal:${goal}`);
  }

  const topicIds = new Map(existingTopics.map((t) => [t.name.toLowerCase(), t.id]));
  for (const name of new Set(draft.topics)) {
    const id = topicIds.get(name.toLowerCase()) ?? `topic:${slug(name)}`;
    add({ label: "Topic", id, name });
    link("INTERESTED_IN", id);
  }
  for (const name of new Set(draft.skills)) {
    add({ label: "Skill", id: `skill:${slug(name)}`, name });
    link("SKILLED_IN", `skill:${slug(name)}`);
  }
  for (const company of draft.companies) {
    const id = `company:${slug(company.name)}`;
    add({ label: "Company", id, name: company.name });
    link(company.current ? "WORKS_AT" : "WORKED_AT", id);
  }

  // npm names keep their scope ("@types/node"), matching ingested Package ids.
  const pkgId = (name: string) => `pkg:npm/${name.toLowerCase()}`;
  for (const name of new Set(draft.packages)) {
    if (!name.includes("|")) add({ label: "Package", id: pkgId(name), name, ecosystem: "npm" });
  }
  for (const fullName of new Set(draft.repos)) {
    const id = `repo:${slug(fullName)}`;
    add({ label: "Repo", id, fullName, stars: 0 });
    link("OWNS", id);
    // Only the dependencies we actually read for this repo, never a cross product.
    for (const name of draft.repoPackages?.[fullName] ?? []) {
      if (name.includes("|")) continue;
      add({ label: "Package", id: pkgId(name), name, ecosystem: "npm" });
      edges.push({ type: "DEPENDS_ON", from: id, to: pkgId(name) });
    }
  }

  const unique = new Map(edges.map((e) => [edgeId(e), e]));
  return { nodes: [...nodes.values()], edges: [...unique.values()] };
}
