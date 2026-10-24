const MODEL = 'text-embedding-3-small';
const BATCH = 100;

/** OpenAI embeddings for each text, in order. Reads OPENAI_API_KEY from the environment. */
export async function embed(texts: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: texts.slice(i, i + BATCH).map((t) => t.slice(0, 8000) || ' ') }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    out.push(...body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return out;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
