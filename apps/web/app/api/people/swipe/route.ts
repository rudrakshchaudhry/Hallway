import { swipe } from "@hallway/graph/queries/people";
import { SwipeRequest, SwipeResponse } from "@hallway/types";
import { context } from "@/lib/context";

export async function POST(req: Request) {
  const body = SwipeRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });
  const { graph, me } = await context();
  const updatedPreferences = await swipe(graph, me, body.data.personId, body.data.dir);
  return Response.json(SwipeResponse.parse({ ok: true, updatedPreferences }));
}
