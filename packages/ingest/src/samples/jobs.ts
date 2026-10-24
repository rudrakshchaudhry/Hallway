// LinkedIn jobs (discover by keyword). Sample: 3 GitHub SF jobs. --full: up to 10 sponsor companies
// that appear as speakers' companies in sponsor sessions, 10 jobs each.
// Usage: pnpm sample:jobs [--full]
import { scrape, usage } from '../brightdata.ts';
import { writeRaw } from '../paths.ts';
import { sponsorCompanies } from './speaker-input.ts';

const dataset = process.env.BRIGHTDATA_DATASET_LINKEDIN_JOBS;
if (!dataset) throw new Error('BRIGHTDATA_DATASET_LINKEDIN_JOBS is not set');

const full = process.argv.includes('--full');
const inputs = full
  ? (await sponsorCompanies())
      .slice(0, 10)
      .map((company) => ({ keyword: 'software engineer', company, location: 'United States', country: 'US' }))
  : [{ keyword: 'software engineer', company: 'GitHub', location: 'San Francisco', country: 'US' }];
if (inputs.length === 0) throw new Error('jobs: no sponsor companies in the latest sessions raw file');

const records = await scrape(dataset, inputs, { limitPerInput: full ? 10 : 3, discoverBy: 'keyword' });
const file = await writeRaw('jobs', { inputs, fetchedAt: new Date().toISOString(), records });
console.log(`${file}: ${records.length} records for ${inputs.length} companies (reserved ${usage.scraperRecordsReserved})`);
const byCompany = new Map<string, number>();
for (const r of records as Record<string, unknown>[]) {
  const c = String(r.company_name ?? r.error ?? '?');
  byCompany.set(c, (byCompany.get(c) ?? 0) + 1);
}
console.log([...byCompany].map(([c, n]) => `${c}:${n}`).join(', '));
