import { pastGraph } from "@hallway/graph/queries/feed";
import { PastGraphResponse } from "@hallway/types";
import { context } from "@/lib/context";

export async function GET() {
  const { graph, me } = await context();
  return Response.json(PastGraphResponse.parse(await pastGraph(graph, me)));
}
