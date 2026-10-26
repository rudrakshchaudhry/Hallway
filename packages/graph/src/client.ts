import { FalkorDB, type Graph } from "falkordb";

let db: Promise<FalkorDB> | undefined;

export function getDb(): Promise<FalkorDB> {
  if (!db) {
    const pending = FalkorDB.connect({ url: process.env.FALKORDB_URL ?? "redis://localhost:6379" });
    db = pending;
    pending.then(
      (client) => {
        // A lost connection (e.g. FalkorDB restarted) drops this client, so the next call reconnects
        // instead of reusing a dead socket. The listener also keeps the error from crashing the process.
        client.on("error", (err: Error) => {
          console.error("FalkorDB connection error", err.message);
          if (db !== pending) return;
          db = undefined;
          void client.close().catch(() => {});
        });
      },
      // A failed connect must not poison every later call.
      () => {
        if (db === pending) db = undefined;
      },
    );
  }
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
