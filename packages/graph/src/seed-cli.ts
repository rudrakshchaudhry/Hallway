import path from "node:path";
import { close, getDb, graphName } from "./client.ts";
import { loadSnapshot, seedGraph } from "./seed.ts";

const { files, snapshot } = loadSnapshot();
const started = performance.now();
try {
  const counts = await seedGraph(await getDb(), graphName(), snapshot);
  const ms = Math.round(performance.now() - started);
  const from = files.map((f) => path.relative(process.cwd(), f)).join(", ");
  console.log(`Seeded ${counts.nodes} nodes, ${counts.edges} edges into "${graphName()}" from ${from} in ${ms}ms`);
} finally {
  await close();
}
