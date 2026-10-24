import { randomBytes } from "node:crypto";
import { buildProfileSnapshot, getConference, getDb, getGraph, graphName, slug, upsertSnapshot } from "@hallway/graph";
import type { SaveProfileRequest } from "@hallway/types";
import { demoPersonId, setMe } from "@/lib/identity";

/** Handle for a new user: GitHub login, LinkedIn slug, or a random one. */
function handleFor(draft: SaveProfileRequest["draft"]): string {
  if (draft.github) return slug(draft.github);
  const linkedin = draft.linkedin?.match(/linkedin\.com\/in\/([^/?#]+)/)?.[1];
  if (linkedin) return slug(linkedin);
  return `u-${randomBytes(4).toString("hex")}`;
}

/** Writes the profile to the graph and sets the identity cookie. Shared by /api/profile and /api/chat. */
export async function saveProfile(req: SaveProfileRequest): Promise<{ personId: string; handle: string } | { error: string }> {
  if (req.draft.sources.includes("demo")) {
    const personId = demoPersonId();
    await setMe(personId);
    return { personId, handle: personId.slice("person:".length) };
  }
  const graph = await getGraph();
  const conference = await getConference(graph, req.conferenceId);
  if (!conference) return { error: "unknown conference" };
  const topics = await graph.roQuery<{ id: string; name: string }>("MATCH (t:Topic) RETURN t.id AS id, t.name AS name");
  const handle = handleFor(req.draft);
  const snapshot = buildProfileSnapshot({
    handle,
    draft: req.draft,
    goals: req.goals,
    conference,
    existingTopics: topics.data ?? [],
    now: Date.now(),
  });
  await upsertSnapshot(await getDb(), graphName(), snapshot);
  const personId = `person:${handle}`;
  await setMe(personId);
  return { personId, handle };
}
