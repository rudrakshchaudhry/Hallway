// LinkedIn profiles for catalog speakers, only where the catalog gives a LinkedIn URL.
// Usage: pnpm sample:speakers [--max N]   (default 3; full run uses --max 150)
import { scrape, usage } from '../brightdata.ts';
import { writeRaw } from '../paths.ts';
import { catalogSpeakers, maxArg } from './speaker-input.ts';

const dataset = process.env.BRIGHTDATA_DATASET_LINKEDIN_PROFILES;
if (!dataset) throw new Error('BRIGHTDATA_DATASET_LINKEDIN_PROFILES is not set');

const speakers = (await catalogSpeakers()).filter((s) => s.linkedin).slice(0, maxArg(3));
const inputs = speakers.map((s) => ({ url: s.linkedin as string }));
if (inputs.length === 0) {
  console.log('skip: no catalog speakers with a LinkedIn URL');
} else {
  const records = await scrape(dataset, inputs, { limitPerInput: 1 });
  const file = await writeRaw('speakers', { inputs, fetchedAt: new Date().toISOString(), records });
  const errors = (records as Record<string, unknown>[]).filter((r) => r.error).length;
  console.log(`${file}: ${records.length} records, ${errors} errors (reserved ${usage.scraperRecordsReserved})`);
}
