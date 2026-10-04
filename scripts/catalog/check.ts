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
import { HttpClient, HttpError } from "../../packages/core/src/index";

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
const http = new HttpClient({ retries: 2, hostDelayMs: 200, timeoutMs: 20_000, backoffMs: 3_000, userAgent: "JobHunter-catalog/0.1 (open-source job radar; low-rate board validation)" });

/**
 * Workers per hiring system. Spacing is per host (HttpClient), so extra workers on one host share
 * its gap (Greenhouse/Lever stay at most ~5 req/s), while Workday tenants are separate hosts.
 */
const WORKERS: Record<string, number> = { workday: 4, greenhouse: 2, lever: 2 };

type Board = { key: string; ats: string; slug: string; region?: string; shard?: string; site?: string; confidence: "high" | "single" };
type Result = { key: string; status: "live" | "dormant" | "dead" | "error"; jobs: number | null; name?: string; http?: number; error?: string; checked_at: string };

const enc = encodeURIComponent;

async function checkOne(b: Board): Promise<Omit<Result, "key" | "checked_at">> {
  try {
    switch (b.ats) {
      case "greenhouse": {
        const d = await http.getJson<{ jobs?: { company_name?: string }[] }>(`https://boards-api.greenhouse.io/v1/boards/${enc(b.slug)}/jobs`);
        const n = d.jobs?.length ?? 0;
        return { status: n ? "live" : "dormant", jobs: n, name: d.jobs?.[0]?.company_name };
      }
      case "lever": {
        const host = b.region === "eu" ? "https://api.eu.lever.co" : "https://api.lever.co";
        const d = await http.getJson<unknown>(`${host}/v0/postings/${enc(b.slug)}?mode=json&limit=1`);
        if (!Array.isArray(d)) return { status: "dead", jobs: null };
        return { status: d.length ? "live" : "dormant", jobs: null };
      }
      case "ashby": {
        const d = await http.getJson<{ jobs?: { isListed?: boolean }[] }>(`https://api.ashbyhq.com/posting-api/job-board/${enc(b.slug)}`);
        if (!Array.isArray(d.jobs)) return { status: "dead", jobs: null };
        const n = d.jobs.filter((j) => j.isListed !== false).length;
        return { status: n ? "live" : "dormant", jobs: n };
      }
      case "smartrecruiters": {
        const d = await http.getJson<{ totalFound: number; content: { company?: { name?: string } }[] }>(
          `https://api.smartrecruiters.com/v1/companies/${enc(b.slug)}/postings?limit=1`,
        );
        // Unknown ids answer 200 with totalFound 0: indistinguishable from dormant, so call it dead.
        return d.totalFound ? { status: "live", jobs: d.totalFound, name: d.content[0]?.company?.name } : { status: "dead", jobs: 0 };
      }
      case "workday": {
        const d = await http.postJson<{ total?: number }>(`https://${b.slug}.${b.shard}.myworkdayjobs.com/wday/cxs/${enc(b.slug)}/${enc(b.site!)}/jobs`, {
          appliedFacets: {},
          limit: 1,
          offset: 0,
          searchText: "",
        });
        const n = d.total ?? 0;
        return { status: n ? "live" : "dormant", jobs: n };
      }
    }
    return { status: "error", jobs: null, error: "unknown ats" };
  } catch (err) {
    if (err instanceof HttpError && err.status && [404, 410, 422].includes(err.status)) return { status: "dead", jobs: null, http: err.status };
    const e = err as HttpError;
    return { status: "error", jobs: null, http: e.status, error: e.message.slice(0, 120) };
  }
}

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
        const r = await checkOne(b);
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
