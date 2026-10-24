import { suggestEvents } from "./suggest.ts";

/**
 * Scrapes one official conference URL and prints sessions that match
 * the optional words after the URL. A saved copy is used when the live
 * fetch fails or the last copy is under 12 hours old.
 *
 * Usage: pnpm ingest <official-url> [what you want]
 */
const args = process.argv.slice(2).filter((arg) => arg !== "--force");
const url = args.find((arg) => arg.startsWith("http"));
const intent = args.filter((arg) => arg !== url).join(" ") || "session talk workshop";

if (!url) {
  console.error("Usage: pnpm ingest <official-url> [what you want]");
  process.exit(1);
}

const result = await suggestEvents({ url, intent });
console.log(result.message);
for (const item of result.suggestions) {
  console.log(`- ${item.title} (${item.reason})`);
}
if (!result.ok) process.exit(1);
