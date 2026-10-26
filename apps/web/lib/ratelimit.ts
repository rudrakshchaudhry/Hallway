// In-memory per-key token bucket for credit-spending routes (docs/ARCHITECTURE.md#security).
const buckets = new Map<string, { tokens: number; at: number }>();

export function allow(key: string, perMinute: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: perMinute, at: now };
  bucket.tokens = Math.min(perMinute, bucket.tokens + ((now - bucket.at) / 60_000) * perMinute);
  bucket.at = now;
  const ok = bucket.tokens >= 1;
  if (ok) bucket.tokens -= 1;
  buckets.set(key, bucket);
  return ok;
}

export function clientKey(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
