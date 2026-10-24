import { ProfileDraft } from "@hallway/types";
import { cached } from "./cache";

type Repo = { full_name: string; language: string | null; topics?: string[]; fork: boolean; stargazers_count: number };

async function gh<T>(path: string): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok ? ((await res.json()) as T) : null;
}

/** Public GitHub profile: repos, languages as skills, repo topics, and npm deps of the top repos. */
export async function fetchGitHubProfile(username: string, onStep: (summary: string) => void) {
  return cached("github", username, async () => {
    const user = await gh<{ login: string; name: string | null; bio: string | null; company: string | null }>(`/users/${encodeURIComponent(username)}`);
    if (!user) return null;
    const repos = ((await gh<Repo[]>(`/users/${user.login}/repos?sort=pushed&per_page=30`)) ?? []).filter((r) => !r.fork);
    const languages = [...new Set(repos.map((r) => r.language).filter((l): l is string => !!l))];
    onStep(`Found ${repos.length} repos${languages.length ? `, top: ${languages.slice(0, 3).join(", ")}` : ""}`);

    const packages = new Set<string>();
    const repoPackages: Record<string, string[]> = {};
    const jsRepos = repos.filter((r) => r.language === "TypeScript" || r.language === "JavaScript").slice(0, 5);
    for (const repo of jsRepos) {
      const file = await gh<{ content: string }>(`/repos/${repo.full_name}/contents/package.json`);
      if (!file) continue;
      try {
        const pkg = JSON.parse(Buffer.from(file.content, "base64").toString("utf8")) as Record<string, Record<string, string>>;
        const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 40);
        repoPackages[repo.full_name] = deps;
        deps.forEach((d) => packages.add(d));
      } catch {
        // unreadable package.json; skip
      }
    }
    if (packages.size) onStep(`Read dependencies: ${packages.size} packages`);

    return ProfileDraft.parse({
      name: user.name ?? user.login,
      ...(user.bio ? { headline: user.bio } : {}),
      github: user.login,
      skills: languages.slice(0, 8),
      topics: [...new Set(repos.flatMap((r) => r.topics ?? []))].slice(0, 8),
      companies: user.company ? [{ name: user.company.replace(/^@/, ""), current: true }] : [],
      repos: repos.slice(0, 15).map((r) => r.full_name),
      packages: [...packages],
      repoPackages,
      sources: ["github"],
    });
  });
}
