import { readLatestRaw } from '../paths.ts';

export interface SampleSpeaker {
  name: string;
  title?: string;
  company?: string;
  /** Only when the catalog itself gives it; never guessed. */
  linkedin?: string;
}

interface RfParticipant {
  fullName?: string;
  jobTitle?: string;
  companyName?: string;
  linkedIn?: string;
}

/** Up to 3 distinct speakers from the latest sessions sample, preferring ones with a LinkedIn URL. */
export async function sampleSpeakers(): Promise<SampleSpeaker[]> {
  const raw = await readLatestRaw<{ sessions?: { participants?: RfParticipant[] }[] }>('sessions');
  const seen = new Map<string, SampleSpeaker>();
  for (const s of raw?.sessions ?? []) {
    for (const p of s.participants ?? []) {
      if (!p.fullName || seen.has(p.fullName)) continue;
      const linkedin = p.linkedIn?.startsWith('https://www.linkedin.com/') ? p.linkedIn : undefined;
      seen.set(p.fullName, { name: p.fullName, title: p.jobTitle, company: p.companyName, linkedin });
    }
  }
  const all = [...seen.values()];
  return [...all.filter((s) => s.linkedin), ...all.filter((s) => !s.linkedin)].slice(0, 3);
}
