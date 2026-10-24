import { z } from "zod";
import { GoalId, Intent, ProfileDraft } from "@hallway/types";
import { cached } from "./cache";

const MODEL = "gpt-5-mini";

async function json(system: string, user: string): Promise<unknown> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(body.choices[0]?.message.content ?? "{}");
}

// The fixed classification prompt (PLAN.md 2.1). Never rewritten per user; only its JSON is stored.
const INTENT_PROMPT = `You classify one conference visit. Return JSON only, no explanation.
Return {"goals": [...], "topics": [...], "summary": "..."}.
"goals" uses only these ids: ${GoalId.options.join(", ")}.
"topics" uses only names from the provided topic list, exactly as written. Never invent topics, sessions, people or companies.
"summary" is one short line like "Networking + Learn · AI, Developer tools".`;

export async function parseIntent(text: string, conference: string, topics: string[]) {
  return cached("intent", { text, conference, topics }, async () => {
    const raw = await json(INTENT_PROMPT, `Conference: ${conference}\nTopics that exist: ${topics.join(", ")}\n\nThe user wrote:\n"""\n${text}\n"""`);
    const allowed = new Set(topics);
    const loose = z.object({ goals: z.array(z.string()), topics: z.array(z.string()), summary: z.string() }).parse(raw);
    const goals = loose.goals.filter((g) => GoalId.safeParse(g).success);
    return Intent.parse({
      goals: goals.length ? goals : ["networking"],
      topics: loose.topics.filter((t) => allowed.has(t)),
      summary: loose.summary,
    });
  });
}

const EXTRACT_PROMPT = `Extract a professional profile from the user's own description. Return JSON only:
{"name": string|null, "headline": string|null, "role": string|null, "about": string|null,
 "skills": string[], "topics": string[], "companies": [{"name": string, "current": boolean}]}.
Use only facts the text states. Keep skills and topics short (1–3 words each), at most 8 each.`;

export async function extractProfile(text: string) {
  return cached("profile-text", text, async () => {
    const raw = (await json(EXTRACT_PROMPT, text)) as Record<string, unknown>;
    const clean = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null));
    return ProfileDraft.parse({ companies: [], skills: [], topics: [], repos: [], packages: [], ...clean, sources: ["text"] });
  });
}
