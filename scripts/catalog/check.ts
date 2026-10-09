/**
 * Live-check every merged board with the cheapest call each ATS offers. No AI, no descriptions.
 * Resumable: results are appended to out/checks.jsonl; boards already checked are skipped.
 *
 *   pnpm exec tsx scripts/catalog/check.ts
 *
 * Result per board: live (has jobs) · dormant (exists, 0 jobs) · dead (404/410/422) · error (retry later)
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpClient } from "../../packages/core/src/index";
import { checkBoard } from "./lib/live-check";

const here = dirname(fileURLToPath(import.meta.url));
/** `--ats greenhouse,lever` limits this process to those systems; each process writes its own file. */
const atsArg = process.argv.indexOf("--ats");
const ONLY = atsArg > 0 ? new Set(process.argv[atsArg + 1]!.split(",")) : null;
const OUT_DIR = join(here, "out");
const recheckArg = process.argv.indexOf("--recheck-days");
/** Results older than this are checked again (default: never, i.e. only unchecked boards). */
const RECHECK_CUTOFF = recheckArg > 0 ? Date.now() - Number(process.argv[recheckArg + 1]) * 86_400_000 : 0;
const OUT = join(OUT_DIR, ONLY ? `checks-${[...ONLY].sort().join("-")}.jsonl` : "checks.jsonl");
// Polite: each lane is sequential, with a small gap per host on top of request latency.
const http = new HttpClient({ retries: 2, hostDelayMs: 200, timeoutMs: 20_000, backoffMs: 3_000, userAgent: "RawJobs-catalog/0.1 (open-source job radar; low-rate board validation)" });

/**
 * Workers per hiring system. Spacing is per host (HttpClient), so extra workers on one host share
 * its gap (Greenhouse/Lever stay at most ~5 req/s), while Workday tenants are separate hosts.
 */
const WORKERS: Record<string, number> = { workday: 4, greenhouse: 2, lever: 2 };

type Board = { key: string; ats: string; slug: string; region?: string; shard?: string; site?: string; confidence: "high" | "single" };
type Result = { key: string; status: "live" | "dormant" | "dead" | "error"; jobs: number | null; name?: string; http?: number; error?: string; checked_at: string };

async function main() {
  const merged = JSON.parse(readFileSync(join(here, "out", "merged.json"), "utf8")) as { boards: Board[] };
  const done = new Set<string>();
  // Results from every process (checks.jsonl and checks-*.jsonl) count as done.
  for (const f of readdirSync(OUT_DIR).filter((n) => /^checks(-.+)?\.jsonl$/.test(n))) {
    for (const line of readFileSync(join(OUT_DIR, f), "utf8").split("\n")) {
      if (!line) continue;
      const r = JSON.parse(line) as Result;
      // Errors get another go; so does anything older than --recheck-days (monthly refresh).
      if (r.status !== "error" && Date.parse(r.checked_at) >= RECHECK_CUTOFF) done.add(r.key);
    }
  }
  const todo = merged.boards.filter((b) => !done.has(b.key) && (!ONLY || ONLY.has(b.ats)));
  console.error(`${merged.boards.length} boards, ${done.size} already checked, ${todo.length} to go`);

  const lanes = new Map<string, Board[]>();
  for (const b of todo.sort((a, c) => (a.confidence === c.confidence ? 0 : a.confidence === "high" ? -1 : 1))) {
    if (!lanes.has(b.ats)) lanes.set(b.ats, []);
    lanes.get(b.ats)!.push(b);
  }

  const tally: Record<string, number> = {};
  let n = 0;
  const started = Date.now();
  await Promise.all(
    [...lanes.entries()].flatMap(([ats, list]) =>
      Array.from({ length: WORKERS[ats] ?? 1 }, async () => {
      for (let b = list.shift(); b; b = list.shift()) {
        const r = await checkBoard(http, b);
        const row: Result = { key: b.key, ...r, checked_at: new Date().toISOString() };
        appendFileSync(OUT, `${JSON.stringify(row)}\n`);
        tally[r.status] = (tally[r.status] ?? 0) + 1;
        if (++n % 500 === 0) {
          const rate = n / ((Date.now() - started) / 1000);
          console.error(`  ${n}/${todo.length} (${rate.toFixed(1)}/s, ~${Math.round((todo.length - n) / rate / 60)} min left)`, JSON.stringify(tally));
        }
      }
    }),
    ),
  );
  console.error("Done.", tally);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
