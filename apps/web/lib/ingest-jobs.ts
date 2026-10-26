import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb, graphName, listConferences, getGraph, pruneConferenceTalks, upsertSnapshot } from "@hallway/graph";
import { runLiveIngest } from "@hallway/ingest";
import type { IngestJobStatus } from "@hallway/types";
import { allow } from "./ratelimit";
import { repoRoot } from "./root";

// Live-ingest jobs (docs/ARCHITECTURE.md#live-ingest): in memory, one at a time. Kept on globalThis because Next
// bundles routes separately and the chat, the API and the agent tools all read the same jobs.
type Job = IngestJobStatus & { note: string };
const store = globalThis as typeof globalThis & { __hallwayIngest?: { jobs: Map<string, Job>; running: string | null } };
store.__hallwayIngest ??= { jobs: new Map(), running: null };
const state = store.__hallwayIngest;

export const getJob = (id: string) => state.jobs.get(id) ?? null;

/** Starts a live ingest, or returns the job already running for the same query. */
export async function startIngest(query: { name?: string; url?: string }): Promise<Job> {
  const label = (query.url ?? query.name ?? "").trim();
  const running = state.running ? state.jobs.get(state.running) : null;
  if (running && running.status === "running") {
    if (running.query === label) return running;
    throw new Error(`Another conference is being read right now (${running.query}). Try again in a minute.`);
  }
  // One global limit for every caller (chat, API, agent): live reads cost credits.
  if (!allow("ingest:global", 3)) throw new Error("Too many conference reads in the last minute. Try again shortly.");
  // Reserve the single slot before any await, so concurrent callers can't both start a job.
  const id = `job-${randomBytes(4).toString("hex")}`;
  const job: Job = { id, query: label, stage: "find", status: "running", counts: {}, errors: [], startedAt: Date.now(), note: "Starting…" };
  state.jobs.set(id, job);
  state.running = id;
  // Already ingested under this name? Then there's nothing to do. A failed lookup frees the slot.
  let known;
  try {
    known = (await listConferences(await getGraph())).find((c) => query.name && c.conference.name.toLowerCase().includes(query.name.toLowerCase()));
  } catch (err) {
    Object.assign(job, { status: "failed", note: "Couldn't check the conference list." });
    job.errors.push((err as Error).message);
    state.running = null;
    throw err;
  }
  if (known) {
    Object.assign(job, { stage: "done", status: "done", conferenceId: known.conference.id, note: `Already have ${known.conference.name}.` });
    state.running = null;
    return job;
  }
  void (async () => {
    try {
      const { conference, snapshot } = await runLiveIngest(query, (p) => {
        job.stage = p.stage;
        job.note = p.note;
        job.counts = { ...p.counts };
        if (p.error) job.errors.push(p.error);
      });
      // File first: a reseed reads data/live, so the conference survives one that starts mid-ingest.
      const dir = path.join(repoRoot(), "data/live");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${conference.id.slice("conf:".length)}.json`), JSON.stringify(snapshot));
      await upsertSnapshot(await getDb(), graphName(), snapshot);
      await pruneConferenceTalks(await getDb(), graphName(), conference.id, snapshot.nodes.filter((n) => n.label === "Talk").map((n) => n.id));
      Object.assign(job, { status: "done", stage: "done", conferenceId: conference.id });
    } catch (err) {
      console.error("live ingest failed", err);
      job.status = "failed";
      job.errors.push((err as Error).message);
      job.note = `Couldn't read that conference: ${(err as Error).message}`;
    } finally {
      state.running = null;
    }
  })();
  return job;
}

/** The public job shape (IngestJobStatus) without the internal note. */
export const publicJob = ({ note: _note, ...job }: Job): IngestJobStatus => job;
