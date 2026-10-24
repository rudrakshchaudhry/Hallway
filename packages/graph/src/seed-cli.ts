import path from "node:path";
import { close, getGraph } from "./client.ts";
import { loadSnapshot, seedGraph } from "./seed.ts";

const { file, snapshot } = loadSnapshot();
const graph = await getGraph();
const started = performance.now();
try {
  const counts = await seedGraph(graph, snapshot);
  const ms = Math.round(performance.now() - started);
  console.log(`Seeded ${counts.nodes} nodes, ${counts.edges} edges from ${path.relative(process.cwd(), file)} in ${ms}ms`);
} finally {
  await close();
}
