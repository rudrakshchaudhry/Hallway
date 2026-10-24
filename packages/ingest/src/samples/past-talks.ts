// Sample: 1 YouTube video per sample speaker, discovered by keyword "<name> talk".
// Usage: pnpm sample:past-talks
import { scrape, usage } from '../brightdata.ts';
import { writeRaw } from '../paths.ts';
import { sampleSpeakers } from './speaker-input.ts';

const dataset = process.env.BRIGHTDATA_DATASET_YOUTUBE_VIDEOS;
if (!dataset) throw new Error('BRIGHTDATA_DATASET_YOUTUBE_VIDEOS is not set');

const speakers = await sampleSpeakers();
if (speakers.length === 0) {
  console.log('skip: no sample speakers (sessions sample is empty)');
} else {
  const inputs = speakers.map((s) => ({ keyword: `${s.name} talk` }));
  const records = await scrape(dataset, inputs, { limitPerInput: 1, discoverBy: 'keyword' });
  const file = await writeRaw('past-talks', { inputs, fetchedAt: new Date().toISOString(), records });
  console.log(`${file}: ${records.length} records (reserved ${usage.scraperRecordsReserved})`);
}
