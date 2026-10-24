// Discovery helper: fetch one URL through the Unlocker and save the raw body.
// Usage: tsx --env-file-if-exists=../../.env src/samples/probe.ts <label> <url> [expectElement]
import { unlocker, usage } from '../brightdata.ts';
import { writeRaw } from '../paths.ts';

const [label, url, element] = process.argv.slice(2);
if (!label || !url) throw new Error('usage: probe.ts <label> <url> [expectElement]');
const res = await unlocker(url, element ? { expect: { element }, timeoutMs: 90_000 } : {});
const file = await writeRaw(`probe-${label}`, { url, status: res.status, body: res.body });
console.log(`${file} (${res.body.length} chars, unlocker requests: ${usage.unlockerRequests})`);
