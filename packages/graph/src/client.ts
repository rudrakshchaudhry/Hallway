import { FalkorDB, type Graph } from "falkordb";

let db: Promise<FalkorDB> | undefined;

export function getDb(): Promise<FalkorDB> {
  db ??= FalkorDB.connect({ url: process.env.FALKORDB_URL ?? "redis://localhost:6379" });
  return db;
}

export const graphName = () => process.env.GRAPH_NAME ?? "hallway";

/** The app graph. GRAPH_NAME lets tests use their own graph. */
export async function getGraph(name = graphName()): Promise<Graph> {
  return (await getDb()).selectGraph(name);
}

export async function close(): Promise<void> {
  if (!db) return;
  const pending = db;
  db = undefined;
  await (await pending).close();
}
