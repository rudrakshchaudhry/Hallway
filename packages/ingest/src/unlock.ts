import { PRICE, budget } from "./budget.ts";
import fs from "node:fs";
import path from "node:path";

function loadRootEnv() {
  for (const file of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const key = trimmed.slice(0, eq);
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1);
    }
    return;
  }
}

loadRootEnv();

/**
 * Fetches one public page through Bright Data Web Unlocker.
 * Official conference pages and public event pages use this.
 * Guest lists are not requested.
 */
export class UnlockError extends Error {
  readonly code: "missing_key" | "timeout" | "unlock_failed" | "empty_page" | "rejected_key" | "bad_zone";

  constructor(code: UnlockError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export async function unlockPage(url: string): Promise<string> {
  const key = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE;
  if (!key || !zone) {
    throw new UnlockError("missing_key", "Scraping is not set up yet. Add the Bright Data API key and unlocker zone.");
  }
  // Every Bright Data call goes through the persisted budget guard (PLAN.md 7.4).
  try {
    await budget.reserve(PRICE.unlockerRequest, `suggest ${url}`);
  } catch (err) {
    throw new UnlockError("timeout", `Scraping budget reached: ${(err as Error).message}`);
  }
  try {
    const response = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ zone, url, format: "raw" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      console.error(`Bright Data unlock ${response.status}: ${detail}`);
      const code = response.status === 401 || response.status === 403 ? "rejected_key" : /zone/i.test(detail) ? "bad_zone" : "unlock_failed";
      throw new UnlockError(code, "The conference site could not be opened.");
    }
    const html = await response.text();
    if (html.trim().length < 40) {
      throw new UnlockError("empty_page", "The conference page came back empty.");
    }
    return html;
  } catch (error) {
    if (error instanceof UnlockError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new UnlockError("timeout", "The conference site took too long to answer.");
    }
    throw new UnlockError("unlock_failed", "The conference site could not be opened.");
  }
}
