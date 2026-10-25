import { ChatEvent } from "@hallway/types";

/** A streaming NDJSON response of ChatEvents (never SSE: the quick tunnel blocks it). */
export function ndjson(run: (emit: (event: ChatEvent) => void) => Promise<void>, onError: (err: unknown) => string): Response {
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      // client went away; the run finishes on its own and further emits are dropped
    },
    async start(controller) {
      const encoder = new TextEncoder();
      let open = true;
      // If the client disconnects, enqueue throws: stop emitting instead of crashing the stream.
      const emit = (event: ChatEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(ChatEvent.parse(event))}\n`));
        } catch {
          open = false;
        }
      };
      try {
        await run(emit);
        emit({ type: "done", cached: false });
      } catch (err) {
        console.error(err);
        emit({ type: "error", message: onError(err) });
      }
      try {
        controller.close();
      } catch {
        // already closed by the client
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
