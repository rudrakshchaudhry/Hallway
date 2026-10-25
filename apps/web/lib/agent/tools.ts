import { randomBytes } from "node:crypto";
import { addPlan, findClashes, findPerson, getCalendar, getGraph, listConferences } from "@hallway/graph";
import { agendaFor } from "@hallway/graph/queries/agenda";
import { exploreFor } from "@hallway/graph/queries/explore";
import { createMeeting, suggestInvite } from "@hallway/graph/queries/invites";
import { deckFor } from "@hallway/graph/queries/people";
import { targetConference } from "@hallway/graph/queries/shared";
import { Tag } from "@hallway/types";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { hashToken, newToken } from "../invites";

// Hallway tools for the TrueForge agent (PLAN.md 5.2). Every tool acts for `me`, which must be an
// onboarded user; answers are compact JSON so the model quotes real data instead of inventing it.

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true });

async function forUser(me: string) {
  const graph = await getGraph();
  const person = await findPerson(graph, me);
  if (!person?.isUser) return null;
  const conference = await targetConference(graph, me);
  return conference ? { graph, conference } : null;
}

const hhmm = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export function registerHallwayTools(server: McpServer, publicOrigin: string) {
  const me = z.string().describe("The user's person id from your instructions, e.g. person:demo");

  server.registerTool(
    "suggest_people",
    { description: "People the user should meet at their conference, ranked by graph signals, with the reason and where to find them.", inputSchema: { me, tag: Tag.optional() }, annotations: { readOnlyHint: true } },
    async (args) => {
      const ctx = await forUser(args.me);
      if (!ctx) return fail("unknown user or no conference");
      const cards = await deckFor(ctx.graph, args.me, ctx.conference, args.tag);
      return text(cards.slice(0, 8).map((c) => ({ personId: c.person.id, name: c.person.name, headline: c.person.headline, tags: c.tags, reason: c.reason, proof: c.path.hops, findThem: c.whereabouts.slice(0, 1).map((w) => (w.kind === "talk" ? `${w.talk.title} · ${hhmm(w.talk.start, ctx.conference.tz)}` : `${w.event.name} · ${hhmm(w.event.start, ctx.conference.tz)}`)) })));
    },
  );

  server.registerTool(
    "plan_sessions",
    { description: "Conference sessions ranked for the user, optionally filtered by a text query, with clash and rerun flags.", inputSchema: { me, query: z.string().optional(), day: z.string().optional().describe("YYYY-MM-DD in conference time") }, annotations: { readOnlyHint: true } },
    async (args) => {
      const ctx = await forUser(args.me);
      if (!ctx) return fail("unknown user or no conference");
      const q = args.query?.toLowerCase();
      const items = (await agendaFor(ctx.graph, args.me, ctx.conference))
        .filter((i) => !q || `${i.talk.title} ${i.talk.abstract} ${i.speakers.map((s) => s.name).join(" ")}`.toLowerCase().includes(q))
        .filter((i) => !args.day || new Intl.DateTimeFormat("en-CA", { timeZone: ctx.conference.tz }).format(new Date(i.talk.start)) === args.day);
      return text(items.slice(0, 10).map((i) => ({ talkId: i.talk.id, title: i.talk.title, kind: i.talk.kind, when: hhmm(i.talk.start, ctx.conference.tz), room: i.talk.room, speakers: i.speakers.map((s) => s.name), why: i.reasons, planned: i.planned, clashesWith: i.clashes.map((c) => c.withTitle), rerun: Boolean(i.rerun) })));
    },
  );

  server.registerTool(
    "suggest_explore",
    { description: "Side events (Luma etc.) around the conference, with hosts and clash flags.", inputSchema: { me }, annotations: { readOnlyHint: true } },
    async (args) => {
      const ctx = await forUser(args.me);
      if (!ctx) return fail("unknown user or no conference");
      const items = await exploreFor(ctx.graph, args.me, ctx.conference);
      return text(items.slice(0, 10).map((i) => ({ eventId: i.event.id, name: i.event.name, when: hhmm(i.event.start, ctx.conference.tz), venue: i.event.venue, hosts: i.hosts.map((h) => h.name), url: i.event.url, planned: i.planned, clashesWith: i.clashes.map((c) => c.withTitle) })));
    },
  );

  server.registerTool(
    "check_calendar",
    { description: "The user's calendar (planned sessions, side events, accepted meetings) and any clashes.", inputSchema: { me }, annotations: { readOnlyHint: true } },
    async (args) => {
      const ctx = await forUser(args.me);
      if (!ctx) return fail("unknown user or no conference");
      const calendar = await getCalendar(ctx.graph, args.me);
      const clashes = calendar.flatMap((item, i) => findClashes(calendar.slice(i + 1), item));
      return text({ items: calendar.map((c) => ({ id: c.id, kind: c.kind, title: c.title, when: hhmm(c.start, ctx.conference.tz), until: hhmm(c.end, ctx.conference.tz), where: c.location })), clashes });
    },
  );

  server.registerTool(
    "list_conferences",
    { description: "Conferences Hallway has data for, with session/speaker/event counts.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => text((await listConferences(await getGraph())).map((c) => ({ id: c.conference.id, name: c.conference.name, source: c.conference.source, ...c.counts }))),
  );

  server.registerTool(
    "add_to_calendar",
    { description: "Add a session (talkId) or side event (eventId) to the user's calendar. Requires the user's approval.", inputSchema: { me, targetId: z.string() }, annotations: { readOnlyHint: false, destructiveHint: false } },
    async (args) => {
      const ctx = await forUser(args.me);
      if (!ctx) return fail("unknown user or no conference");
      if (!(await addPlan(ctx.graph, args.me, args.targetId))) return fail("unknown session or event");
      const calendar = await getCalendar(ctx.graph, args.me);
      const item = calendar.find((c) => c.id === args.targetId);
      return text({ added: item?.title, when: item ? hhmm(item.start, ctx.conference.tz) : undefined, clashesWith: item ? findClashes(calendar, item).map((c) => c.withTitle) : [] });
    },
  );

  server.registerTool(
    "create_invite",
    { description: "Create a meeting request to someone (3 free 30-minute slots, a place and a note) and return the invite link the user shares. Requires the user's approval.", inputSchema: { me, personId: z.string(), note: z.string().max(400).optional() }, annotations: { readOnlyHint: false, destructiveHint: false } },
    async (args) => {
      const ctx = await forUser(args.me);
      if (!ctx) return fail("unknown user or no conference");
      const suggestion = await suggestInvite(ctx.graph, args.me, args.personId, ctx.conference);
      if (!suggestion?.slots.length) return fail("no free slots or unknown person");
      const token = newToken();
      const meeting = await createMeeting(ctx.graph, args.me, {
        personId: args.personId,
        slots: suggestion.slots,
        place: suggestion.place,
        note: args.note ?? suggestion.note,
        tokenHash: hashToken(token),
        id: `meeting:${randomBytes(6).toString("hex")}`,
        tz: ctx.conference.tz,
      });
      if (!meeting) return fail("could not create the meeting");
      return text({ status: "pending", inviteUrl: `${publicOrigin}/invite/${token}`, offered: suggestion.slots.map((s) => hhmm(s.start, ctx.conference.tz)), place: suggestion.place });
    },
  );
}
