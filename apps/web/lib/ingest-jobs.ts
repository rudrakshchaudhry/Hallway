import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb, graphName, listConferences, getGraph, upsertSnapshot } from "@hallway/graph";
import { runLiveIngest } from "@hallway/ingest";
import type { IngestJobStatus } from "@hallway/types";
import { repoRoot } from "./root";

// Live-ingest jobs (PLAN.md 7.3): in memory, one at a time. Kept on globalThis because Next
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
  // Already ingested under this name? Then there's nothing to do.
  const known = (await listConferences(await getGraph())).find((c) => query.name && c.conference.name.toLowerCase().includes(query.name.toLowerCase()));
  const id = `job-${randomBytes(4).toString("hex")}`;
  const job: Job = { id, query: label, stage: "find", status: "running", counts: {}, errors: [], startedAt: Date.now(), note: "Starting…" };
  if (known) {
    Object.assign(job, { stage: "done", status: "done", conferenceId: known.conference.id, note: `Already have ${known.conference.name}.` });
    state.jobs.set(id, job);
    return job;
  }
  state.jobs.set(id, job);
  state.running = id;
  void (async () => {
    try {
      const { conference, snapshot } = await runLiveIngest(query, (p) => {
        job.stage = p.stage;
        job.note = p.note;
        job.counts = { ...p.counts };
        if (p.error) job.errors.push(p.error);
      });
      await upsertSnapshot(await getDb(), graphName(), snapshot);
      // Saved under data/live so a reseed keeps it (seed reads data/live).
      const dir = path.join(repoRoot(), "data/live");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${conference.id.slice("conf:".length)}.json`), JSON.stringify(snapshot));
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
