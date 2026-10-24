import { getGraph } from "@hallway/graph";
import { targetConference } from "@hallway/graph/queries/shared";
import { getMe } from "./identity";

/** The graph, the current user and their target conference, shared by every tab route and page. */
export async function context() {
  const graph = await getGraph();
  const me = await getMe();
  const conference = await targetConference(graph, me);
  return { graph, me, conference };
}

export const noConference = () => Response.json({ error: "no conference yet; finish onboarding" }, { status: 404 });
