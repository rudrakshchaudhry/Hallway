import { randomBytes } from "node:crypto";
import { createMeeting } from "@hallway/graph/queries/invites";
import { InviteCreateRequest, InviteCreateResponse } from "@hallway/types";
import { context } from "@/lib/context";
import { gcalUrl, hashToken, newToken, publicOrigin } from "@/lib/invites";

/** Right swipe → pending meeting + invite link the user shares themselves (PLAN.md 2.3). */
export async function POST(req: Request) {
  const body = InviteCreateRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });
  const { graph, me } = await context();
  const token = newToken();
  const meeting = await createMeeting(graph, me, {
    ...body.data,
    tokenHash: hashToken(token),
    id: `meeting:${randomBytes(6).toString("hex")}`,
  });
  if (!meeting) return Response.json({ error: "unknown person" }, { status: 404 });
  const url = `${publicOrigin(req)}/invite/${token}`;
  const first = body.data.slots[0]!;
  return Response.json(
    InviteCreateResponse.parse({
      meeting,
      url,
      shareText: `${body.data.note}\n\nPick a time that works: ${url}`,
      gcalUrl: gcalUrl({ title: "Hallway meeting", start: first.start, end: first.end, place: body.data.place, details: body.data.note }),
    }),
  );
}
