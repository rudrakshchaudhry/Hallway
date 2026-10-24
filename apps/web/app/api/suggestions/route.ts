import { suggestEvents } from "@hallway/ingest";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown; intent?: unknown } | null;
  if (!body || typeof body.url !== "string" || typeof body.intent !== "string") {
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
