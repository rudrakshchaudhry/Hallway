import { edgeId, type Conference, type InvitePublicView, type InviteSuggestion, type Meeting, type MeetingPublic, type Person, type RequestSent } from "@hallway/types";
import type { Graph } from "falkordb";
import { conferenceDays, freeSlots, getCalendar } from "../calendar.ts";
import { toNode, type RawNode } from "./shared.ts";

const publicMeeting = ({ tokenHash: _t, ...m }: Meeting): MeetingPublic => m;

/** Invite sheet prefill (docs/ARCHITECTURE.md#invites): 3 free 30-minute slots, a place, and a note. */
export async function suggestInvite(graph: Graph, me: string, personId: string, conference: Conference, now = Date.now()): Promise<InviteSuggestion | null> {
  const res = await graph.roQuery<{ p: RawNode; talks: { start: string; end: string; room: string | null }[] }>(
    `MATCH (p:Person {id: $pid})
     OPTIONAL MATCH (p)-[:SPEAKS_AT]->(t:Talk)
     RETURN p, collect({start: t.start, end: t.end, room: t.room}) AS talks`,
    { params: { pid: personId } },
  );
  const person = toNode(res.data?.[0]?.p, "Person");
  if (!person) return null;
  const theirTalks = (res.data?.[0]?.talks ?? []).filter((t) => t.start);
  const busy = [...(await getCalendar(graph, me)), ...theirTalks.map((t) => ({ start: t.start, end: t.end }))];
  const slots = freeSlots(conferenceDays(conference), busy, { minutes: 30, limit: 3, notBefore: now });
  const room = theirTalks.find((t) => t.room)?.room;
  return {
    slots,
    place: room ? `Outside ${room}` : `${conference.venue ?? conference.name} lobby`,
    note: `Hi ${person.name.split(" ")[0]}, I'd love to grab 30 minutes at ${conference.name} to chat.`,
  };
}

/** Creates a pending Meeting with up to 3 offered slots. The caller hashes the token. */
export async function createMeeting(
  graph: Graph,
  me: string,
  input: { personId: string; slots: { start: string; end: string }[]; place: string; note: string; tokenHash: string; id: string; tz?: string },
  now = Date.now(),
): Promise<MeetingPublic | null> {
  const meeting: Meeting = {
    label: "Meeting",
    id: input.id,
    tokenHash: input.tokenHash,
    proposed: input.slots.map((s) => s.start),
    durationMinutes: Math.round((Date.parse(input.slots[0]!.end) - Date.parse(input.slots[0]!.start)) / 60_000) || 30,
    place: input.place,
    note: input.note,
    ...(input.tz ? { tz: input.tz } : {}),
    status: "pending",
    createdAt: now,
  };
  const { label: _l, ...props } = meeting;
  const res = await graph.query<{ n: number }>(
    `MATCH (u:Person {id: $me}), (p:Person {id: $pid})
     CREATE (m:Meeting) SET m = $props
     CREATE (u)-[:ORGANIZES {id: $org}]->(m)
     CREATE (m)-[:WITH {id: $with}]->(p)
     RETURN count(m) AS n`,
    {
      params: {
        me,
        pid: input.personId,
        props: props as never,
        org: edgeId({ from: me, type: "ORGANIZES", to: meeting.id }),
        with: edgeId({ from: meeting.id, type: "WITH", to: input.personId }),
      },
    },
  );
  return (res.data?.[0]?.n ?? 0) > 0 ? publicMeeting(meeting) : null;
}

type MeetingRow = { m: RawNode; requester: RawNode; other: RawNode };

async function meetingBy(graph: Graph, where: string, params: Record<string, string>) {
  const res = await graph.roQuery<MeetingRow>(
    `MATCH (requester:Person)-[:ORGANIZES]->(m:Meeting)-[:WITH]->(other:Person) WHERE ${where} RETURN m, requester, other`,
    { params },
  );
  const row = res.data?.[0];
  const meeting = toNode(row?.m, "Meeting");
  const requester = toNode(row?.requester, "Person");
  const other = toNode(row?.other, "Person");
  return meeting && requester && other ? { meeting, requester, other } : null;
}

const slotsOf = (m: Meeting) => m.proposed.map((start) => ({ start, end: new Date(Date.parse(start) + m.durationMinutes * 60_000).toISOString() }));

/** What the invitee sees: who, why, and the offered slots. Nothing else about the requester. */
export async function viewInvite(graph: Graph, tokenHash: string): Promise<InvitePublicView | null> {
  const found = await meetingBy(graph, "m.tokenHash = $h", { h: tokenHash });
  if (!found) return null;
  const { meeting, requester } = found;
  const tzRes = await graph.roQuery<{ tz: string | null }>(
    "MATCH (:Person {id: $id})-[t:TARGETS]->(c:Conference) RETURN c.tz AS tz ORDER BY t.at DESC LIMIT 1",
    { params: { id: requester.id } },
  );
  return {
    tz: meeting.tz ?? tzRes.data?.[0]?.tz ?? "America/Los_Angeles",
    requester: { name: requester.name, ...(requester.headline ? { headline: requester.headline } : {}), ...(requester.avatar ? { avatar: requester.avatar } : {}) },
    reason: meeting.note || `${requester.name} would like to meet`,
    slots: slotsOf(meeting),
    ...(meeting.start && meeting.end ? { picked: { start: meeting.start, end: meeting.end } } : {}),
    place: meeting.place,
    note: meeting.note,
    status: meeting.status,
  };
}

/** Accept (with one of the offered slots) or decline. Only a pending invite can be answered. */
export async function respondInvite(graph: Graph, tokenHash: string, decision: "accept" | "decline", slot?: { start: string; end: string }, now = Date.now()) {
  const found = await meetingBy(graph, "m.tokenHash = $h", { h: tokenHash });
  if (!found) return { error: "not-found" as const };
  if (found.meeting.status !== "pending") return { error: "answered" as const, meeting: found.meeting };
  if (decision === "accept" && (!slot || !found.meeting.proposed.includes(slot.start))) return { error: "bad-slot" as const };
  // The end always comes from the meeting's duration, never from the client.
  if (slot) slot = { start: slot.start, end: new Date(Date.parse(slot.start) + found.meeting.durationMinutes * 60_000).toISOString() };
  await graph.query(
    decision === "accept"
      ? "MATCH (m:Meeting {id: $id}) SET m.status = 'accepted', m.start = $start, m.end = $end, m.respondedAt = $now"
      : "MATCH (m:Meeting {id: $id}) SET m.status = 'declined', m.respondedAt = $now",
    { params: { id: found.meeting.id, start: slot?.start ?? "", end: slot?.end ?? "", now } },
  );
  return { meeting: { ...found.meeting, status: decision === "accept" ? "accepted" : "declined", ...(slot ?? {}) } as Meeting, requester: found.requester };
}

/** Manual fallback (cut item 7): the requester marks a pending meeting accepted at its first slot. */
export async function markAccepted(graph: Graph, me: string, meetingId: string, now = Date.now()) {
  const found = await meetingBy(graph, "m.id = $id AND requester.id = $me", { id: meetingId, me });
  if (!found || found.meeting.status !== "pending") return null;
  const slot = slotsOf(found.meeting)[0]!;
  await graph.query("MATCH (m:Meeting {id: $id}) SET m.status = 'accepted', m.start = $start, m.end = $end, m.respondedAt = $now", {
    params: { id: meetingId, start: slot.start, end: slot.end, now },
  });
  return publicMeeting({ ...found.meeting, status: "accepted", start: slot.start, end: slot.end });
}

/** After the meeting: MET edge and status "met". */
export async function markMet(graph: Graph, me: string, meetingId: string, now = Date.now()) {
  const found = await meetingBy(graph, "m.id = $id AND (requester.id = $me OR other.id = $me)", { id: meetingId, me });
  if (!found || found.meeting.status !== "accepted") return null;
  const otherId = found.requester.id === me ? found.other.id : found.requester.id;
  await graph.query(
    `MATCH (m:Meeting {id: $id}), (u:Person {id: $me}), (o:Person {id: $oid})
     SET m.status = 'met'
     MERGE (u)-[r:MET]->(o) ON CREATE SET r.at = $now, r.via = 'meeting', r.id = $rid`,
    { params: { id: meetingId, me, oid: otherId, now, rid: edgeId({ from: me, type: "MET", to: otherId }) } },
  );
  return publicMeeting({ ...found.meeting, status: "met" });
}

/** Requests sent (docs/ARCHITECTURE.md#queries), newest first. */
export async function requestsSent(graph: Graph, me: string): Promise<RequestSent[]> {
  const res = await graph.roQuery<{ m: RawNode; p: RawNode }>(
    "MATCH (:Person {id: $me})-[:ORGANIZES]->(m:Meeting)-[:WITH]->(p:Person) RETURN m, p ORDER BY m.createdAt DESC",
    { params: { me } },
  );
  return (res.data ?? []).flatMap((r) => {
    const meeting = toNode(r.m, "Meeting");
    const person = toNode(r.p, "Person") as Person | null;
    return meeting && person ? [{ meeting: publicMeeting(meeting), person }] : [];
  });
}
