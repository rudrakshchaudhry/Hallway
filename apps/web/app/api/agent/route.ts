import { ChatRequest } from "@hallway/types";
import { agentChatId } from "@/lib/agent/chat-id";
import { agentTurn } from "@/lib/agent/trueforge";
import { getMe } from "@/lib/identity";
import { ndjson } from "@/lib/ndjson";
import { allow, clientKey } from "@/lib/ratelimit";

/** The Hallway agent (TrueForge) behind the chat button. NDJSON ChatEvents out. */
export async function POST(req: Request) {
  const body = ChatRequest.safeParse(await req.json().catch(() => ({})));
  if (!body.success || !body.data.message.trim()) return Response.json({ error: "message is required" }, { status: 400 });
  if (!allow(`agent:${clientKey(req)}`, 15)) return Response.json({ error: "Slow down a little." }, { status: 429 });
  const [chatId, me] = await Promise.all([agentChatId(), getMe()]);
  return ndjson(
    (emit) => agentTurn(chatId, me, body.data.message.trim(), emit),
    () => "The assistant isn't reachable right now. The tabs still work: try People or Agenda.",
  );
}
