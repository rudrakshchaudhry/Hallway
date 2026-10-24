import { addPlan, findClashes, getCalendar, getGraph, removePlan } from "@hallway/graph";
import { AddToCalendarRequest, AddToCalendarResponse } from "@hallway/types";
import { getMe } from "@/lib/identity";

/** Add a talk or side event to the user's calendar; returns the item and anything it clashes with. */
export async function POST(req: Request) {
  const body = AddToCalendarRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });

  const me = await getMe();
  const graph = await getGraph();
  if (!(await addPlan(graph, me, body.data.targetId))) {
    return Response.json({ error: "unknown talk or event" }, { status: 404 });
  }
  const calendar = await getCalendar(graph, me);
  const item = calendar.find((i) => i.id === body.data.targetId);
  if (!item) return Response.json({ error: "added item missing from calendar" }, { status: 500 });
  return Response.json(AddToCalendarResponse.parse({ item, clashes: findClashes(calendar, item) }));
}

/** Remove a talk or side event from the user's calendar. */
export async function DELETE(req: Request) {
  const body = AddToCalendarRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });
  const removed = await removePlan(await getGraph(), await getMe(), body.data.targetId);
  return Response.json({ ok: true, removed });
}
