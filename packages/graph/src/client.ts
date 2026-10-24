import { FalkorDB, type Graph } from "falkordb";

let db: Promise<FalkorDB> | undefined;

function connect(): Promise<FalkorDB> {
  db ??= FalkorDB.connect({ url: process.env.FALKORDB_URL ?? "redis://localhost:6379" });
  return db;
}

/** The app graph. GRAPH_NAME lets tests use their own graph. */
export async function getGraph(name = process.env.GRAPH_NAME ?? "hallway"): Promise<Graph> {
  return (await connect()).selectGraph(name);
}

export async function close(): Promise<void> {
  if (!db) return;
  const pending = db;
  db = undefined;
  await (await pending).close();
}
