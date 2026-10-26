import { getGraph, listConferences } from "@hallway/graph";
import { ConferencesResponse, IngestJobStatus, StartIngestRequest } from "@hallway/types";
import { publicJob, startIngest } from "@/lib/ingest-jobs";
import { allow, clientKey } from "@/lib/ratelimit";

export async function GET() {
  return Response.json(ConferencesResponse.parse({ conferences: await listConferences(await getGraph()) }));
}

/** Start a live ingest of a conference by name or official URL (docs/ARCHITECTURE.md#live-ingest). */
export async function POST(req: Request) {
  if (!allow(`ingest:${clientKey(req)}`, 3)) return Response.json({ error: "Too many requests" }, { status: 429 });
  const body = StartIngestRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });
  if (body.data.url && !body.data.url.startsWith("https://")) return Response.json({ error: "use an https:// link" }, { status: 400 });
  try {
    return Response.json(IngestJobStatus.parse(publicJob(await startIngest(body.data))), { status: 202 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 409 });
  }
}
