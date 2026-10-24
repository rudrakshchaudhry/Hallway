import { suggestInvite } from "@hallway/graph/queries/invites";
import { InviteSuggestion } from "@hallway/types";
import { context, noConference } from "@/lib/context";

export async function GET(req: Request) {
  const personId = new URL(req.url).searchParams.get("personId");
  if (!personId) return Response.json({ error: "personId is required" }, { status: 400 });
  const { graph, me, conference } = await context();
  if (!conference) return noConference();
  const suggestion = await suggestInvite(graph, me, personId, conference);
  if (!suggestion) return Response.json({ error: "unknown person" }, { status: 404 });
  return Response.json(InviteSuggestion.parse(suggestion));
}
