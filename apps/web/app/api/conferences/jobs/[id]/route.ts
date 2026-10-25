import { IngestJobStatus } from "@hallway/types";
import { getJob, publicJob } from "@/lib/ingest-jobs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return Response.json({ error: "job not found" }, { status: 404 });
  return Response.json(IngestJobStatus.parse(publicJob(job)));
}
