import { suggestEvents } from "@hallway/ingest";
import { allow, clientKey } from "@/lib/ratelimit";

export async function POST(request: Request) {
  if (!allow(`suggest:${clientKey(request)}`, 5)) {
    return Response.json({ ok: false, message: "Too many requests. Try again in a minute.", source: "none", suggestions: [] }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { url?: unknown; intent?: unknown } | null;
  if (!body || typeof body.url !== "string" || typeof body.intent !== "string" || !body.url.startsWith("https://")) {
    return Response.json({
      ok: false,
      message: "Enter a conference link and what you want from it.",
      source: "none",
      suggestions: [],
    });
  }
  try {
    const result = await suggestEvents({ url: body.url, intent: body.intent });
    return Response.json(result);
  } catch {
    return Response.json({
      ok: false,
      message: "Suggestions could not be loaded. Try again.",
      source: "none",
      suggestions: [],
    });
  }
}
