// YouTube past talks for the first N catalog speakers: keyword "<full name> <company>", limit 2,
// kept only when the title or channel contains the full name; at most 1 per speaker.
// Usage: pnpm sample:past-talks [--max N]   (default 3; full run uses --max 30)
import { scrape, usage } from '../brightdata.ts';
import { writeRaw } from '../paths.ts';
import { catalogSpeakers, maxArg } from './speaker-input.ts';

const dataset = process.env.BRIGHTDATA_DATASET_YOUTUBE_VIDEOS;
if (!dataset) throw new Error('BRIGHTDATA_DATASET_YOUTUBE_VIDEOS is not set');

const NO_COMPANY = new Set(['independent', 'self-employed', 'freelance']);
const speakers = (await catalogSpeakers()).slice(0, maxArg(3));
const keywordFor = (s: { name: string; company?: string }) =>
  s.company && !NO_COMPANY.has(s.company.toLowerCase()) ? `${s.name} ${s.company}` : s.name;

if (speakers.length === 0) {
  console.log('skip: no catalog speakers (sessions sample is empty)');
} else {
  const inputs = speakers.map((s) => ({ keyword: keywordFor(s) }));
  const records = (await scrape(dataset, inputs, { limitPerInput: 2, discoverBy: 'keyword' })) as Record<
    string,
    unknown
  >[];

  const text = (r: Record<string, unknown>) =>
    [r.title, r.youtuber, r.handle_name].map((v) => String(v ?? '')).join(' ').toLowerCase();
  const keywordOf = (r: Record<string, unknown>) =>
    String((r.discovery_input as { keyword?: string } | undefined)?.keyword ?? r.input_keyword ?? '');

  const matches = speakers.flatMap((s) => {
    const kw = keywordFor(s);
    const hit = records.find(
      (r) => !r.error && text(r).includes(s.name.toLowerCase()) && (keywordOf(r) === '' || keywordOf(r) === kw),
    );
    return hit ? [{ speaker: s.name, company: s.company ?? null, keyword: kw, video: hit }] : [];
  });

  const file = await writeRaw('past-talks', {
    inputs,
    fetchedAt: new Date().toISOString(),
    recordsReturned: records.length,
    matches,
  });
  console.log(`${file}: ${records.length} records, ${matches.length} name-matched (reserved ${usage.scraperRecordsReserved})`);
  for (const m of matches) console.log(`- ${m.speaker}: ${String(m.video.title)} | ${String(m.video.youtuber ?? '')}`);
}
