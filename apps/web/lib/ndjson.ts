import { ChatEvent } from "@hallway/types";

/** A streaming NDJSON response of ChatEvents (never SSE: the quick tunnel blocks it). */
export function ndjson(run: (emit: (event: ChatEvent) => void) => Promise<void>, onError: (err: unknown) => string): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (event: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(ChatEvent.parse(event))}\n`));
      try {
        await run(emit);
        emit({ type: "done", cached: false });
      } catch (err) {
        console.error(err);
        emit({ type: "error", message: onError(err) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
