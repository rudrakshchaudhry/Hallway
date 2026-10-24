import { randomBytes } from "node:crypto";
import { ChatEvent, ChatRequest } from "@hallway/types";
import { cookies } from "next/headers";
import { chatTurn } from "@/lib/onboarding";
import { allow, clientKey } from "@/lib/ratelimit";

const CHAT_COOKIE = "hallway_chat";

/** Onboarding chat: one user turn in, NDJSON ChatEvents out (never SSE; the tunnel blocks it). */
export async function POST(req: Request) {
  const body = ChatRequest.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });

  const jar = await cookies();
  let sessionId = jar.get(CHAT_COOKIE)?.value;
  if (!sessionId) {
    sessionId = randomBytes(16).toString("hex");
    jar.set(CHAT_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  }
  const limited = !allow(`chat:${clientKey(req)}`, 20);
  const id = sessionId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (event: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(ChatEvent.parse(event))}\n`));
      try {
        if (limited) emit({ type: "error", message: "Slow down a little; try again in a few seconds." });
        else await chatTurn(id, body.data, emit);
        emit({ type: "done", cached: process.env.DEMO_CACHE === "1" });
      } catch (err) {
        console.error("chat turn failed", err);
        emit({ type: "error", message: "Something went wrong. Tap restart to try again." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
