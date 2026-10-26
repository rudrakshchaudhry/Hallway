import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LIVE_DIR } from './paths.ts';

/** Bright Data pay-as-you-go pricing (docs/ARCHITECTURE.md#budget). */
export const PRICE = {
  unlockerRequest: 1.5 / 1000,
  scraperRecord: 1.5 / 1000,
} as const;

export interface BudgetEntry {
  at: string;
  label: string;
  usd: number;
}

export interface BudgetState {
  spentUsd: number;
  entries: BudgetEntry[];
}

export interface BudgetStatus {
  limitUsd: number;
  spentUsd: number;
  remainingUsd: number;
  calls: number;
}

export class BudgetExceededError extends Error {
  constructor(label: string, usd: number, status: BudgetStatus) {
    super(
      `Bright Data budget exceeded: ${label} needs $${usd.toFixed(4)}, ` +
        `$${status.remainingUsd.toFixed(4)} of $${status.limitUsd} left`,
    );
    this.name = 'BudgetExceededError';
  }
}

const FILE = join(LIVE_DIR, 'budget.json');

function limitUsd(): number {
  const raw = Number(process.env.BRIGHTDATA_BUDGET_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 40;
}

async function load(): Promise<BudgetState> {
  try {
    const parsed = JSON.parse(await readFile(FILE, 'utf8')) as Partial<BudgetState>;
    return { spentUsd: Number(parsed.spentUsd) || 0, entries: parsed.entries ?? [] };
  } catch {
    return { spentUsd: 0, entries: [] };
  }
}

async function save(state: BudgetState): Promise<void> {
  await mkdir(LIVE_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(state, null, 2));
}

function toStatus(state: BudgetState): BudgetStatus {
  const limit = limitUsd();
  return {
    limitUsd: limit,
    spentUsd: state.spentUsd,
    remainingUsd: Math.max(0, limit - state.spentUsd),
    calls: state.entries.length,
  };
}

// Serialise reservations within one process so concurrent calls can't both pass the check.
let chain: Promise<unknown> = Promise.resolve();

export const budget = {
  /** Reserves `usd` against the persisted counter. Throws BudgetExceededError past the limit. */
  reserve(usd: number, label: string): Promise<BudgetStatus> {
    const next = chain.then(async () => {
      const state = await load();
      const status = toStatus(state);
      if (state.spentUsd + usd > status.limitUsd) throw new BudgetExceededError(label, usd, status);
      state.spentUsd += usd;
      state.entries.push({ at: new Date().toISOString(), label, usd });
      await save(state);
      return toStatus(state);
    });
    chain = next.catch(() => undefined);
    return next;
  },

  async status(): Promise<BudgetStatus> {
    return toStatus(await load());
  },
};
