// Sample: LinkedIn profiles for the 3 sample speakers, only where the session page gave a URL.
// Usage: pnpm sample:speakers
import { scrape, usage } from '../brightdata.ts';
import { writeRaw } from '../paths.ts';
import { sampleSpeakers } from './speaker-input.ts';

const dataset = process.env.BRIGHTDATA_DATASET_LINKEDIN_PROFILES;
if (!dataset) throw new Error('BRIGHTDATA_DATASET_LINKEDIN_PROFILES is not set');

const speakers = await sampleSpeakers();
const inputs = speakers.filter((s) => s.linkedin).map((s) => ({ url: s.linkedin as string }));
if (inputs.length === 0) {
  console.log(`skip: ${speakers.length} sample speakers, none with a LinkedIn URL on the session page`);
} else {
  const records = await scrape(dataset, inputs, { limitPerInput: 1 });
  const file = await writeRaw('speakers', { inputs, fetchedAt: new Date().toISOString(), records });
  console.log(`${file}: ${records.length} records (reserved ${usage.scraperRecordsReserved})`);
  for (const r of records as Record<string, unknown>[]) {
    console.log(`- ${String(r.name ?? r.error ?? '?')} | ${String(r.position ?? '')} | ${String((r.current_company as { name?: string } | undefined)?.name ?? '')}`);
  }
}
