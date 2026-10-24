import { markAccepted } from "@hallway/graph/queries/invites";
import { MeetingActionResponse } from "@hallway/types";
import { context } from "@/lib/context";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { graph, me } = await context();
  const meeting = await markAccepted(graph, me, (await params).id);
  if (!meeting) return Response.json({ error: "meeting not found" }, { status: 404 });
  return Response.json(MeetingActionResponse.parse({ meeting }));
}
