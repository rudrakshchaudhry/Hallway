// Sample: 3 LinkedIn jobs (discover by keyword) for one sponsor.
// Usage: pnpm sample:jobs
import { scrape, usage } from '../brightdata.ts';
import { writeRaw } from '../paths.ts';

const dataset = process.env.BRIGHTDATA_DATASET_LINKEDIN_JOBS;
if (!dataset) throw new Error('BRIGHTDATA_DATASET_LINKEDIN_JOBS is not set');

const inputs = [
  { keyword: 'software engineer', company: 'GitHub', location: 'San Francisco', country: 'US' },
];
const records = await scrape(dataset, inputs, { limitPerInput: 3, discoverBy: 'keyword' });

const file = await writeRaw('jobs', { inputs, fetchedAt: new Date().toISOString(), records });
console.log(`${file}: ${records.length} records (reserved ${usage.scraperRecordsReserved})`);
for (const r of records as Record<string, unknown>[]) {
  console.log(`- ${String(r.job_title ?? r.title ?? r.error ?? '?')} @ ${String(r.company_name ?? '?')} (${String(r.job_location ?? '')})`);
}
