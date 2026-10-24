import { exploreFor } from "@hallway/graph/queries/explore";
import { ExploreResponse } from "@hallway/types";
import { context, noConference } from "@/lib/context";

export async function GET() {
  const { graph, me, conference } = await context();
  if (!conference) return noConference();
  return Response.json(ExploreResponse.parse({ items: await exploreFor(graph, me, conference) }));
}
