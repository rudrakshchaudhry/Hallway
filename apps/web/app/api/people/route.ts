import { deckFor, swipeCount } from "@hallway/graph/queries/people";
import { PeopleResponse, Tag } from "@hallway/types";
import { context, noConference } from "@/lib/context";

export async function GET(req: Request) {
  const tag = Tag.safeParse(new URL(req.url).searchParams.get("tag"));
  const { graph, me, conference } = await context();
  if (!conference) return noConference();
  const [cards, swipes] = await Promise.all([deckFor(graph, me, conference, tag.success ? tag.data : undefined), swipeCount(graph, me)]);
  return Response.json(PeopleResponse.parse({ cards, swipes }));
}
