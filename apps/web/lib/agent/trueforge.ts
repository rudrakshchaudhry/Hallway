import { getGraph, nodeTitle } from "@hallway/graph";
import { targetConference } from "@hallway/graph/queries/shared";
import type { ChatEvent } from "@hallway/types";
import { TrueForge } from "@truefoundry/trueforge-sdk";
import { identityValue } from "../identity";

// Hallway agent on TrueForge (PLAN.md 5.1–5.2): an OpenAI model with Hallway's MCP tools;
// writes (calendar adds, invites) need the user's approval in the chat.

const MCP_NAME = "hallway";
const APPROVAL_TOOLS = ["add_to_calendar", "create_invite"];
const TOOL_LABEL: Record<string, string> = {
  suggest_people: "Finding people to meet",
  plan_sessions: "Ranking sessions",
  suggest_explore: "Looking at side events",
  check_calendar: "Checking your calendar",
  list_conferences: "Listing conferences",
  add_to_calendar: "Adding to your calendar",
  create_invite: "Creating an invite",
};

type Emit = (event: ChatEvent) => void;
type ToolCallInfo = { name: string; args: Record<string, unknown>; raw: string };
type Session = { sessionId: string; lastTurnId: string | null; calls: Map<string, ToolCallInfo>; byIndex: Map<string, string>; seen: Set<string>; usedAt: number };

// Next bundles each route separately, so module-level state isn't shared between /api/agent and
// /api/agent/approve. Keep it on globalThis, which is one per server process.
const store = globalThis as typeof globalThis & { __hallwayAgentV2?: { sessions: Map<string, Promise<Session>>; registered: Promise<void> | null } };
store.__hallwayAgentV2 ??= { sessions: new Map(), registered: null };
const state = store.__hallwayAgentV2;
const sessions = state.sessions;

function client() {
  return new TrueForge({ baseUrl: process.env.TRUEFORGE_URL ?? "http://localhost:8790" });
}

/** Registers Hallway's MCP server in TrueForge once per process (create, or update if it exists). */
function ensureMcpRegistered(): Promise<void> {
  state.registered ??= (async () => {
    const token = process.env.MCP_HALLWAY_TOKEN;
    if (!token) throw new Error("MCP_HALLWAY_TOKEN is not set");
    const manifest = {
      type: "remote" as const,
      name: MCP_NAME,
      description: "Hallway conference tools: people to meet, sessions, side events, calendar, invites",
      url: `http://localhost:${process.env.PORT ?? 3000}/api/mcp`,
      auth: { type: "header" as const, headers: { "x-hallway-token": token } },
    };
    const tf = client();
    const list = (await tf.settings.mcpServers.list()) as unknown as { data?: { manifest?: { name?: string } }[] };
    const exists = (list.data ?? []).some((s) => s.manifest?.name === MCP_NAME);
    if (exists) await tf.settings.mcpServers.createOrUpdate({ manifest } as never);
    else await tf.settings.mcpServers.create({ manifest } as never);
  })().catch((err) => {
    state.registered = null;
    throw err;
  });
  return state.registered;
}

const IDLE_MS = 24 * 60 * 60_000;
const MAX_SESSIONS = 500;

/** One TrueForge session per chat cookie *and* user; concurrent requests share the same creation. */
function sessionFor(chatId: string, me: string): Promise<Session> {
  const key = `${chatId}|${me}`;
  const now = Date.now();
  // Drop idle sessions, and the oldest if there are too many.
  for (const [k, p] of sessions) {
    void p.then((s) => {
      if (now - s.usedAt > IDLE_MS) sessions.delete(k);
    }, () => sessions.delete(k));
  }
  while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
  let pending = sessions.get(key);
  if (!pending) {
    pending = createSession(me).catch((err) => {
      sessions.delete(key);
      throw err;
    });
    sessions.set(key, pending);
  }
  return pending.then((s) => {
    s.usedAt = Date.now();
    return s;
  });
}

async function createSession(me: string): Promise<Session> {
  await ensureMcpRegistered();
  const graph = await getGraph();
  const conference = await targetConference(graph, me);
  const name = (await graph.roQuery<{ name: string }>("MATCH (p:Person {id: $id}) RETURN p.name AS name", { params: { id: me } })).data?.[0]?.name ?? "the user";
  const instructions = [
    `You are Hallway, a conference planning assistant for ${name} (person id: ${me}).`,
    conference ? `They are attending ${conference.name} (${conference.city ?? ""}, ${conference.venue ?? ""}); times are in ${conference.tz}.` : "",
    `Always pass me="${identityValue(me)}" (the session key) to tools; never pass anything else as me. Use the tools for every fact about people, sessions, events and the calendar; never invent any.`,
    "Keep answers short and scannable: a one-line answer, then up to 5 bullets with names, times and why.",
    "Don't ask clarifying questions: pick the best match from tool results (use plan_sessions with a query to find a talk's id) and act.",
    "Calendar adds and invites are approved by the user in the app; just call the tool.",
  ]
    .filter(Boolean)
    .join("\n");
  const created = (await client().sessions.create({
    agent: { spec: { model: { name: "openai/gpt-5-2" }, instructions, mcpServers: [{ name: MCP_NAME, preload: true, requireApprovalForTools: APPROVAL_TOOLS }] } },
  } as never)) as unknown as { data?: { id: string }; id?: string };
  return { sessionId: created.data?.id ?? created.id!, lastTurnId: null, calls: new Map(), byIndex: new Map(), seen: new Set(), usedAt: Date.now() };
}

function argsOf(call: ToolCallInfo): Record<string, unknown> {
  if (Object.keys(call.args).length) return call.args;
  try {
    return JSON.parse(call.raw || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Exactly what will happen, in words, for the approval sheet. */
async function preview(call: ToolCallInfo | undefined): Promise<string> {
  if (!call) return "Run a Hallway action";
  const args = argsOf(call);
  const graph = await getGraph();
  if (call.name === "add_to_calendar") {
    const title = (await nodeTitle(graph, String(args.targetId ?? ""))) ?? String(args.targetId ?? "this item");
    return `Add "${title}" to your Hallway calendar.`;
  }
  if (call.name === "create_invite") {
    const who = (await nodeTitle(graph, String(args.personId ?? ""))) ?? String(args.personId ?? "this person");
    return `Create a meeting request to ${who} (3 free 30-minute slots) and get a link to share${args.note ? `, with the note: "${String(args.note)}"` : ""}. Nothing is sent until you share it.`;
  }
  return `${call.name} ${JSON.stringify(args)}`;
}

/** Maps TrueForge turn events to ChatEvents (skipping any already shown). */
async function relay(session: Session, events: AsyncIterable<Record<string, unknown>>, emit: Emit) {
  for await (const raw of events) {
    // Deltas of one message share an id, so only whole events are de-duplicated (subscribe can replay).
    const eventId = raw.type === "model.message.delta" ? undefined : (raw.id as string | undefined);
    if (eventId && session.seen.has(eventId)) continue;
    if (eventId) session.seen.add(eventId);
    const type = raw.type as string;
    if (type === "turn.created") session.lastTurnId = (raw.turnId as string) ?? session.lastTurnId;
    else if (type === "model.message.delta") {
      if (typeof raw.content === "string" && raw.content) emit({ type: "text", delta: raw.content });
      // Tool calls stream in fragments: the first fragment carries the id and the tool name.
      for (const d of (raw.toolCalls as { id?: string; index: number; function?: { name?: string; arguments?: string } }[] | undefined) ?? []) {
        const key = `${raw.id as string}:${d.index}`;
        const name = d.function?.name;
        if (d.id && name && !session.calls.has(d.id)) {
          session.calls.set(d.id, { name, args: {}, raw: "" });
          session.byIndex.set(key, d.id);
          emit({ type: "step", id: d.id, tool: name, status: "running", summary: `${TOOL_LABEL[name] ?? name}…` });
        }
        const id = d.id ?? session.byIndex.get(key);
        const call = id ? session.calls.get(id) : undefined;
        if (call && d.function?.arguments) call.raw += d.function.arguments;
      }
    }
    else if (type === "model.message") {
      for (const call of (raw.toolCalls as { id: string; function?: { name?: string; arguments?: string } }[] | undefined) ?? []) {
        const name = call.function?.name ?? "tool";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function?.arguments ?? "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const seen = session.calls.has(call.id);
        session.calls.set(call.id, { name, args, raw: call.function?.arguments ?? "" });
        if (!seen) emit({ type: "step", id: call.id, tool: name, status: "running", summary: `${TOOL_LABEL[name] ?? name}…` });
      }
    } else if (type === "tool.response") {
      const call = session.calls.get(raw.toolCallId as string);
      emit({ type: "step", id: raw.toolCallId as string, tool: call?.name ?? "tool", status: "done", summary: TOOL_LABEL[call?.name ?? ""] ?? "Done" });
    } else if (type === "tool.approval_required") {
      for (const ref of (raw.toolCalls as { id: string }[] | undefined) ?? []) {
        const call = session.calls.get(ref.id);
        emit({ type: "approval_required", threadId: raw.threadId as string, toolCallId: ref.id, tool: call?.name ?? "tool", preview: await preview(call) });
      }
    }
  }
}

/** After a TrueForge restart the cached session/registration are gone: forget them and retry once. */
async function withRecovery(chatId: string, me: string, run: (s: Session) => Promise<void>) {
  try {
    await run(await sessionFor(chatId, me));
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404 && status !== 400 && status !== 422) throw err;
    sessions.delete(`${chatId}|${me}`);
    state.registered = null;
    await run(await sessionFor(chatId, me));
  }
}

/** One user message to the agent: a new turn continuing the conversation. */
export async function agentTurn(chatId: string, me: string, message: string, emit: Emit) {
  await withRecovery(chatId, me, (session) => turn(session, message, emit));
}

async function turn(session: Session, message: string, emit: Emit) {
  const events = await client().sessions.createTurnStream(session.sessionId, {
    input: [{ type: "user.message", content: message }],
    ...(session.lastTurnId ? { previousTurnId: session.lastTurnId } : {}),
  } as never);
  await relay(session, events as unknown as AsyncIterable<Record<string, unknown>>, emit);
}

/** The user's answer to an approval request; the agent continues the same conversation. */
export async function agentApprove(chatId: string, me: string, decisions: { threadId: string; toolCallId: string; decision: "allow" | "deny"; reason?: string }[], emit: Emit) {
  const session = await sessionFor(chatId, me);
  if (!session.lastTurnId) throw new Error("no paused turn to approve");
  // Every pending approval of the paused turn is answered in one input.
  const input = decisions.map((d) => ({
    type: "user.tool_approval",
    threadId: d.threadId,
    toolCallId: d.toolCallId,
    approval: d.decision === "allow" ? { status: "allow" } : { status: "deny", reason: d.reason ?? "The user declined." },
  }));
  // A turn waiting for approval ends as done with a required action; the decision starts a new
  // turn continuing it (verified against TrueForge 0.180).
  const events = await client().sessions.createTurnStream(session.sessionId, {
    previousTurnId: session.lastTurnId,
    input,
  } as never);
  await relay(session, events as unknown as AsyncIterable<Record<string, unknown>>, emit);
}
