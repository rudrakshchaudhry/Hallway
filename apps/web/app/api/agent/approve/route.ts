import { ApprovalDecision } from "@hallway/types";
import { z } from "zod";
import { agentApprove } from "@/lib/agent/trueforge";
import { getCookieIdentity } from "@/lib/identity";
import { ndjson } from "@/lib/ndjson";
import { allow, clientKey } from "@/lib/ratelimit";
import { agentChatId } from "@/lib/agent/chat-id";

/** Allow or deny a pending agent action; the agent then continues. */
export async function POST(req: Request) {
  const body = z.object({ decisions: z.array(ApprovalDecision.omit({ turnId: true })).min(1).max(10) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });
  if (!allow(`agent:${clientKey(req)}`, 15)) return Response.json({ error: "Slow down a little." }, { status: 429 });
  const me = await getCookieIdentity();
  if (!me) return Response.json({ error: "Sign in (finish onboarding) to use the assistant." }, { status: 401 });
  const chatId = await agentChatId();
  return ndjson(
    (emit) => agentApprove(chatId, me, body.data.decisions, emit),
    () => "Couldn't finish that action. Try again from the tabs.",
  );
}
