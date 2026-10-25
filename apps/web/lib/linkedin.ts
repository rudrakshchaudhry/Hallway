import { scrape } from "@hallway/ingest";
import type { ProfileDraft } from "@hallway/types";
import { cached } from "./cache";
import { extractProfile } from "./llm";

type LinkedInRecord = {
  name?: string;
  position?: string | null;
  about?: string | null;
  city?: string | null;
  current_company?: { name?: string } | null;
  current_company_name?: string | null;
  experience?: { company?: string; title?: string }[] | null;
  education?: { title?: string }[] | null;
  error?: string;
};

export const LINKEDIN_URL = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?$/;

/**
 * Public LinkedIn profile via the Bright Data profiles dataset (budget-guarded, about $0.0015),
 * then the same LLM extraction as "tell me about yourself" for skills and topics.
 */
export async function fetchLinkedInProfile(url: string, onStep: (summary: string) => void): Promise<ProfileDraft | null> {
  return cached("linkedin", url, async () => {
    const dataset = process.env.BRIGHTDATA_DATASET_LINKEDIN_PROFILES;
    if (!dataset) return null;
    // Bright Data can queue a profile; don't hold the chat open for its full polling window.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("LinkedIn scrape timed out")), 150_000));
    const [record] = (await Promise.race([scrape(dataset, [{ url }], { limitPerInput: 1 }), timeout])) as LinkedInRecord[];
    if (!record?.name || record.error) return null;
    onStep(`Found ${record.name}${record.position ? `, ${record.position}` : ""}`);
    const current = record.current_company?.name ?? record.current_company_name ?? undefined;
    const companies = [
      ...(current ? [{ name: current, current: true }] : []),
      ...(record.experience ?? [])
        .filter((e) => e.company && e.company !== current)
        .slice(0, 5)
        .map((e) => ({ name: e.company!, current: false })),
    ];
    const text = [record.position, record.about, (record.experience ?? []).map((e) => `${e.title ?? ""} at ${e.company ?? ""}`).join("; ")]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000); // keep the extraction request small and reliable
    const extracted = text.length > 20 ? await extractProfile(text).catch(() => null) : null;
    return {
      name: record.name,
      ...(record.position ? { headline: record.position, role: record.position } : {}),
      ...(record.about ? { about: record.about.slice(0, 500) } : {}),
      linkedin: url.replace(/\/$/, ""),
      skills: extracted?.skills ?? [],
      topics: extracted?.topics ?? [],
      companies,
      repos: [],
      packages: [],
      sources: ["linkedin"],
    };
  });
}
