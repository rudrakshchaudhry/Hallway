import { feedFor } from "@hallway/graph/queries/feed";
import { FeedResponse } from "@hallway/types";
import { context, noConference } from "@/lib/context";

export async function GET() {
  const { graph, me, conference } = await context();
  if (!conference) return noConference();
  return Response.json(FeedResponse.parse(await feedFor(graph, me, conference)));
}
