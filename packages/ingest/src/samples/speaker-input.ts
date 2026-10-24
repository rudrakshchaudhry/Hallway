import { readLatestRaw } from '../paths.ts';

export interface CatalogSpeaker {
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

export interface RfSession {
  participants?: RfParticipant[];
  attributevalues?: { attribute?: string; value?: string }[];
}

export async function latestSessions(): Promise<RfSession[]> {
  return (await readLatestRaw<{ sessions?: RfSession[] }>('sessions'))?.sessions ?? [];
}

/** Distinct speakers in catalog order (first appearance). */
export async function catalogSpeakers(): Promise<CatalogSpeaker[]> {
  const seen = new Map<string, CatalogSpeaker>();
  for (const s of await latestSessions()) {
    for (const p of s.participants ?? []) {
      if (!p.fullName || seen.has(p.fullName)) continue;
      const linkedin = p.linkedIn?.startsWith('https://www.linkedin.com/') ? p.linkedIn : undefined;
      seen.set(p.fullName, { name: p.fullName, title: p.jobTitle, company: p.companyName, linkedin });
    }
  }
  return [...seen.values()];
}

/** Companies of speakers in sponsor sessions, by speaker count (ties keep catalog order). */
export async function sponsorCompanies(): Promise<string[]> {
  const counts = new Map<string, number>();
  for (const s of await latestSessions()) {
    if (!s.attributevalues?.some((a) => a.attribute === 'Sponsor Session?' && a.value === 'Yes')) continue;
    for (const p of s.participants ?? []) {
      if (p.companyName) counts.set(p.companyName, (counts.get(p.companyName) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/** `--max N` from argv, else the given default. */
export function maxArg(fallback: number): number {
  const i = process.argv.indexOf('--max');
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
