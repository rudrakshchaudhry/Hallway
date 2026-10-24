import { randomBytes } from "node:crypto";
import {
  SHARED_PROFILE_LABELS,
  buildProfileSnapshot,
  findPerson,
  getConference,
  getDb,
  getGraph,
  graphName,
  handleSlug,
  listTopics,
  upsertSnapshot,
} from "@hallway/graph";
import type { SaveProfileRequest } from "@hallway/types";
import { demoPersonId, getCookieIdentity, setMe } from "@/lib/identity";

/** Preferred handle: GitHub login, LinkedIn slug, or a random one. Never contains "/". */
function preferredHandle(draft: SaveProfileRequest["draft"]): string {
  const github = draft.github?.replace(/^https?:\/\/(www\.)?github\.com\//, "").split(/[/?#]/)[0];
  if (github) return handleSlug(github);
  const linkedin = draft.linkedin?.match(/linkedin\.com\/in\/([^/?#]+)/)?.[1];
  if (linkedin) return handleSlug(linkedin);
  return `u-${randomBytes(4).toString("hex")}`;
}

/**
 * Writes the profile to the graph and sets the identity cookie. Shared by /api/profile and
 * /api/chat. A handle already taken by someone else (a speaker, another user) gets a suffix:
 * nothing here is verified, so a profile can never take over an existing Person.
 */
export async function saveProfile(req: SaveProfileRequest): Promise<{ personId: string; handle: string } | { error: string }> {
  if (req.draft.sources.includes("demo")) {
    const personId = demoPersonId();
    await setMe(personId);
    return { personId, handle: personId.slice("person:".length) };
  }
  const graph = await getGraph();
  const conference = await getConference(graph, req.conferenceId);
  if (!conference) return { error: "unknown conference" };

  // A user re-saving (e.g. retrying a text profile) keeps their own Person.
  const current = await getCookieIdentity();
  const self = current ? await findPerson(graph, current) : null;
  let handle = self?.isUser && current ? current.slice("person:".length) : preferredHandle(req.draft);
  const taken = await findPerson(graph, `person:${handle}`, handle);
  if (taken && taken.id !== current) handle = `${handle}-${randomBytes(2).toString("hex")}`;
  const snapshot = buildProfileSnapshot({
    handle,
    draft: req.draft,
    goals: req.goals,
    conference,
    existingTopics: await listTopics(graph),
    now: Date.now(),
  });
  await upsertSnapshot(await getDb(), graphName(), snapshot, { createOnly: SHARED_PROFILE_LABELS });
  const personId = `person:${handle}`;
  await setMe(personId);
  return { personId, handle };
}
