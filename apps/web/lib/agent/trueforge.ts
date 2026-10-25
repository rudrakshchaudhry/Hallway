import { getGraph } from "@hallway/graph";
import { targetConference } from "@hallway/graph/queries/shared";
import type { ChatEvent } from "@hallway/types";
import { TrueForge } from "@truefoundry/trueforge-sdk";

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
type ToolCallInfo = { name: string; args: Record<string, unknown> };
type Session = { sessionId: string; lastTurnId: string | null; calls: Map<string, ToolCallInfo> };

const sessions = new Map<string, Session>();
let registered: Promise<void> | null = null;

function client() {
  return new TrueForge({ baseUrl: process.env.TRUEFORGE_URL ?? "http://localhost:8790" });
}

/** Registers Hallway's MCP server in TrueForge once per process (create, or update if it exists). */
function ensureMcpRegistered(): Promise<void> {
  registered ??= (async () => {
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
    if (exists) await tf.settings.mcpServers.createOrUpdate({ manifest } as never).catch(() => {});
    else await tf.settings.mcpServers.create({ manifest } as never);
  })().catch((err) => {
    registered = null;
    throw err;
  });
  return registered;
}

async function sessionFor(chatId: string, me: string): Promise<Session> {
  const existing = sessions.get(chatId);
  if (existing) return existing;
  await ensureMcpRegistered();
  const graph = await getGraph();
  const conference = await targetConference(graph, me);
  const name = (await graph.roQuery<{ name: string }>("MATCH (p:Person {id: $id}) RETURN p.name AS name", { params: { id: me } })).data?.[0]?.name ?? "the user";
  const instructions = [
    `You are Hallway, a conference planning assistant for ${name} (person id: ${me}).`,
    conference ? `They are attending ${conference.name} (${conference.city ?? ""}, ${conference.venue ?? ""}); times are in ${conference.tz}.` : "",
    `Always pass me="${me}" to tools. Use the tools for every fact about people, sessions, events and the calendar; never invent any.`,
    "Keep answers short and scannable: a one-line answer, then up to 5 bullets with names, times and why.",
    "Before adding to the calendar or creating an invite, say what you'll do; the user approves it in the app.",
  ]
    .filter(Boolean)
    .join("\n");
  const created = (await client().sessions.create({
    agent: { spec: { model: { name: "openai/gpt-5-2" }, instructions, mcpServers: [{ name: MCP_NAME, requireApprovalForTools: APPROVAL_TOOLS }] } },
  } as never)) as unknown as { data?: { id: string }; id?: string };
  const session = { sessionId: created.data?.id ?? created.id!, lastTurnId: null, calls: new Map<string, ToolCallInfo>() };
  sessions.set(chatId, session);
  return session;
}

function preview(call: ToolCallInfo | undefined): string {
  if (!call) return "Run a Hallway action";
  if (call.name === "add_to_calendar") return `Add "${String(call.args.targetId ?? "")}" to your calendar`;
  if (call.name === "create_invite") return `Create a meeting request to ${String(call.args.personId ?? "")}${call.args.note ? ` with the note: "${String(call.args.note)}"` : ""}`;
  return `${call.name} ${JSON.stringify(call.args)}`;
}

/** Streams one agent turn as ChatEvents. */
async function stream(session: Session, input: unknown[], emit: Emit) {
  const events = await client().sessions.createTurnStream(session.sessionId, {
    input,
    ...(session.lastTurnId ? { previousTurnId: session.lastTurnId } : {}),
  } as never);
  for await (const raw of events as AsyncIterable<Record<string, unknown>>) {
    const type = raw.type as string;
    if (type === "turn.created") session.lastTurnId = (raw.turnId as string) ?? session.lastTurnId;
    else if (type === "model.message.delta" && typeof raw.content === "string" && raw.content) emit({ type: "text", delta: raw.content });
    else if (type === "model.message") {
      for (const call of (raw.toolCalls as { id: string; function?: { name?: string; arguments?: string } }[] | undefined) ?? []) {
        const name = call.function?.name ?? "tool";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function?.arguments ?? "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        session.calls.set(call.id, { name, args });
        emit({ type: "step", id: call.id, tool: name, status: "running", summary: `${TOOL_LABEL[name] ?? name}…` });
      }
    } else if (type === "tool.response") {
      const call = session.calls.get(raw.toolCallId as string);
      emit({ type: "step", id: raw.toolCallId as string, tool: call?.name ?? "tool", status: "done", summary: TOOL_LABEL[call?.name ?? ""] ?? "Done" });
    } else if (type === "tool.approval_required") {
      for (const ref of (raw.toolCalls as { id: string }[] | undefined) ?? []) {
        const call = session.calls.get(ref.id);
        emit({ type: "approval_required", threadId: raw.threadId as string, toolCallId: ref.id, tool: call?.name ?? "tool", preview: preview(call) });
      }
    }
  }
}

/** One user message to the agent. */
export async function agentTurn(chatId: string, me: string, message: string, emit: Emit) {
  const session = await sessionFor(chatId, me);
  await stream(session, [{ type: "user.message", content: message }], emit);
}

/** The user's answer to an approval request; the agent continues the same conversation. */
export async function agentApprove(chatId: string, me: string, decision: { threadId: string; toolCallId: string; decision: "allow" | "deny"; reason?: string }, emit: Emit) {
  const session = await sessionFor(chatId, me);
  const approval = decision.decision === "allow" ? { status: "allow" } : { status: "deny", reason: decision.reason ?? "The user declined." };
  await stream(session, [{ type: "user.tool_approval", threadId: decision.threadId, toolCallId: decision.toolCallId, approval }], emit);
}
