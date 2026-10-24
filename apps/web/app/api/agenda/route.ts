import { agendaFor } from "@hallway/graph/queries/agenda";
import { AgendaResponse } from "@hallway/types";
import { context, noConference } from "@/lib/context";

export async function GET() {
  const { graph, me, conference } = await context();
  if (!conference) return noConference();
  return Response.json(AgendaResponse.parse({ conference, items: await agendaFor(graph, me, conference) }));
}
