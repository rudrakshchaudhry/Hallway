import { readLatestRaw } from '../paths.ts';

export interface SampleSpeaker {
  name: string;
  title?: string;
  company?: string;
  /** Only when the session page itself links it; never guessed. */
  linkedin?: string;
}

/** Up to 3 speakers from the latest sessions sample (empty when sessions were blocked). */
export async function sampleSpeakers(): Promise<SampleSpeaker[]> {
  const raw = await readLatestRaw<{ sessions?: { speakers?: SampleSpeaker[] }[] }>('sessions');
  const seen = new Map<string, SampleSpeaker>();
  for (const s of raw?.sessions ?? []) for (const p of s.speakers ?? []) seen.set(p.name, p);
  return [...seen.values()].slice(0, 3);
}
