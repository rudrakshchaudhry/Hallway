import { budget, PRICE } from './budget.ts';

const API = 'https://api.brightdata.com';
const UNLOCKER_TIMEOUT_MS = 30_000;
const SCRAPE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;
const POLL_DEADLINE_MS = 5 * 60_000;

/** Calls made by this process, for run reports. */
export const usage = { unlockerRequests: 0, scraperRecordsReserved: 0, scraperRecordsReturned: 0 };

function apiKey(): string {
  const key = process.env.BRIGHTDATA_API_KEY;
  if (!key) throw new Error('BRIGHTDATA_API_KEY is not set');
  return key;
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UnlockerExpect {
  /** CSS selector the Unlocker waits for (forces a rendered fetch). */
  element?: string;
  /** Text the Unlocker waits for; also checked in the returned body. */
  text?: string;
}

export interface UnlockerOptions {
  /** Sent as `x-unblock-expect`: the Unlocker renders until it appears. A miss is retried once. */
  expect?: UnlockerExpect;
  /** Per-attempt timeout. Defaults to 30 s; rendered (`expect`) fetches may need longer. */
  timeoutMs?: number;
}

export interface UnlockerResult {
  status: number;
  body: string;
}

/** Fetches `url` through the Web Unlocker zone. Reserves budget per attempt; one retry. */
export async function unlocker(url: string, opts: UnlockerOptions = {}): Promise<UnlockerResult> {
  const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE;
  if (!zone) throw new Error('BRIGHTDATA_UNLOCKER_ZONE is not set');
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await budget.reserve(PRICE.unlockerRequest, `unlocker ${url}`);
    usage.unlockerRequests++;
    try {
      const res = await fetch(`${API}/request`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          zone,
          url,
          format: 'raw',
          ...(opts.expect ? { headers: { 'x-unblock-expect': JSON.stringify(opts.expect) } } : {}),
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? UNLOCKER_TIMEOUT_MS),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`unlocker ${res.status}: ${body.slice(0, 200)}`);
      if (!body) {
        // Bright Data reports refusals in x-brd-* / x-luminati-* response headers.
        const why = [...res.headers]
          .filter(([k]) => /^x-(brd|luminati)/i.test(k))
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
        throw new Error(`unlocker: empty body for ${url}${why ? ` (${why})` : ''}`);
      }
      if (opts.expect?.text && !body.includes(opts.expect.text)) {
        throw new Error(`unlocker: expected text "${opts.expect.text}" not found in ${url}`);
      }
      return { status: res.status, body };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export interface ScrapeOptions {
  /** Max records per input; budget is reserved for inputs × limitPerInput up front. */
  limitPerInput: number;
  /** Discovery mode, e.g. "keyword". Omit to collect by URL. */
  discoverBy?: string;
}

function parseRecords(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // NDJSON
    return trimmed
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as unknown);
  }
}

async function pollSnapshot(snapshotId: string): Promise<unknown[]> {
  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(`${API}/datasets/v3/progress/${snapshotId}`, { headers: headers() });
    const progress = (await res.json()) as { status?: string };
    if (progress.status === 'failed') throw new Error(`snapshot ${snapshotId} failed`);
    if (progress.status === 'ready') {
      const snap = await fetch(`${API}/datasets/v3/snapshot/${snapshotId}?format=json`, {
        headers: headers(),
      });
      if (!snap.ok) throw new Error(`snapshot ${snap.status}: ${(await snap.text()).slice(0, 200)}`);
      return parseRecords(await snap.text());
    }
  }
  throw new Error(`snapshot ${snapshotId} not ready after ${POLL_DEADLINE_MS / 1000}s`);
}

/**
 * Synchronous Web Scraper API call. Falls back to polling when the API answers 202 with a
 * snapshot_id. Returns at most inputs × limitPerInput records.
 */
export async function scrape(
  datasetId: string,
  inputs: Record<string, unknown>[],
  opts: ScrapeOptions,
): Promise<unknown[]> {
  const maxRecords = inputs.length * opts.limitPerInput;
  await budget.reserve(maxRecords * PRICE.scraperRecord, `scrape ${datasetId} ×${maxRecords}`);
  usage.scraperRecordsReserved += maxRecords;

  const params = new URLSearchParams({
    dataset_id: datasetId,
    format: 'json',
    include_errors: 'true',
    limit_per_input: String(opts.limitPerInput),
  });
  if (opts.discoverBy) {
    params.set('type', 'discover_new');
    params.set('discover_by', opts.discoverBy);
  }
  const res = await fetch(`${API}/datasets/v3/scrape?${params}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ input: inputs }),
    signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`scrape ${res.status}: ${text.slice(0, 300)}`);

  let records: unknown[];
  const first = parseRecords(text)[0] as { snapshot_id?: string } | undefined;
  if (res.status === 202 || (first?.snapshot_id && Object.keys(first).length <= 2)) {
    if (!first?.snapshot_id) throw new Error(`scrape 202 without snapshot_id`);
    records = await pollSnapshot(first.snapshot_id);
  } else {
    records = parseRecords(text);
  }
  records = records.slice(0, maxRecords);
  usage.scraperRecordsReturned += records.length;
  return records;
}
