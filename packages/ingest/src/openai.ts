// Minimal OpenAI JSON helper for ingest-time extraction (gpt-5-mini, JSON response format).
export async function chatJson<T>(system: string, user: string, opts: { model?: string; timeoutMs?: number } = {}): Promise<T> {
  // One retry on network errors (not on HTTP errors).
  try {
    return await chatJsonOnce<T>(system, user, opts);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    return chatJsonOnce<T>(system, user, opts);
  }
}

async function chatJsonOnce<T>(system: string, user: string, { model = "gpt-5-mini", timeoutMs = 90_000 }: { model?: string; timeoutMs?: number }): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        // JSON mode requires the word "JSON" in the messages.
        { role: "system", content: `${system}\nRespond with a JSON object only.` },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(body.choices[0]?.message.content ?? "{}") as T;
}

/** HTML → readable text for the model: drops scripts, styles and tags, collapses whitespace. */
export function htmlToText(html: string, max = 60_000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, max);
}
