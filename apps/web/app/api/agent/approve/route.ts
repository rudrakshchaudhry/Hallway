import { ApprovalDecision } from "@hallway/types";
import { agentApprove } from "@/lib/agent/trueforge";
import { getMe } from "@/lib/identity";
import { ndjson } from "@/lib/ndjson";
import { allow, clientKey } from "@/lib/ratelimit";
import { agentChatId } from "@/lib/agent/chat-id";

/** Allow or deny a pending agent action; the agent then continues. */
export async function POST(req: Request) {
  const body = ApprovalDecision.omit({ turnId: true }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });
  if (!allow(`agent:${clientKey(req)}`, 15)) return Response.json({ error: "Slow down a little." }, { status: 429 });
  const [chatId, me] = await Promise.all([agentChatId(), getMe()]);
  return ndjson(
    (emit) => agentApprove(chatId, me, body.data, emit),
    () => "Couldn't finish that action. Try again from the tabs.",
  );
}
