import { respondInvite, viewInvite } from "@hallway/graph/queries/invites";
import { getGraph } from "@hallway/graph";
import { InvitePublicView, InviteRespondRequest, InviteRespondResponse } from "@hallway/types";
import { gcalUrl, hashToken } from "@/lib/invites";

type Params = { params: Promise<{ token: string }> };

/** Public invite view: no sign-in needed; the token is the only credential. */
export async function GET(_req: Request, { params }: Params) {
  const view = await viewInvite(await getGraph(), hashToken((await params).token));
  if (!view) return Response.json({ error: "invite not found" }, { status: 404 });
  return Response.json(InvitePublicView.parse(view));
}

export async function POST(req: Request, { params }: Params) {
  const body = InviteRespondRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });
  const result = await respondInvite(await getGraph(), hashToken((await params).token), body.data.decision, body.data.slot);
  if ("error" in result) {
    const status = result.error === "not-found" ? 404 : result.error === "answered" ? 409 : 400;
    return Response.json({ error: result.error }, { status });
  }
  const { meeting, requester } = result;
  return Response.json(
    InviteRespondResponse.parse({
      status: meeting.status,
      ...(meeting.status === "accepted" && meeting.start && meeting.end
        ? { gcalUrl: gcalUrl({ title: `Meet ${requester.name}`, start: meeting.start, end: meeting.end, place: meeting.place, details: meeting.note }) }
        : {}),
    }),
  );
}
