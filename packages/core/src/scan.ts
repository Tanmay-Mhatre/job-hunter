import { companyKey } from "./connectors";
import { mergeHistory, type MergeResult } from "./diff";
import { findCandidates, keptChecked, pickChecks, readIndex, readLedger, recordChecks, toIndexJobs, writeDiscover, writeLedger } from "./discover";
import type { HttpClient } from "./http";
import { runRadar, type RunResult } from "./run";
import type { CompanyHealth, CompanyRef, Config, RunSummary } from "./schema";
import { readJobs, saveRun } from "./store";

export type ScanOptions = {
  dataDir: string;
  /** Only these companies (name or slug); skips discovery. */
  only?: string[];
  /** Run and report, save nothing. */
  dryRun?: boolean;
  http?: HttpClient;
  now?: Date;
  /** Names of every company this scan will fetch (yours first), and which of them are extra checks. */
  onStart?: (names: string[], checks: readonly CompanyRef[]) => void;
  onCompanyDone?: (h: CompanyHealth) => void;
};

export type ScanResult = {
  result: RunResult;
  merged: MergeResult;
  summary?: RunSummary;
  /** Companies you haven't added that were checked live. */
  checks: CompanyRef[];
  /** Jobs written to discover.json (index jobs), or undefined when there's no index. */
  indexJobs?: number;
};

/**
 * A full scan: your companies, plus up to `discovery.check_per_scan` other companies with jobs that
 * pass your gates in the shared index; merge into history; write the dashboard files and the index
 * jobs (data/discover.json). Without a downloaded index it's a plain scan of your companies.
 */
export async function scan(config: Config, opts: ScanOptions): Promise<ScanResult> {
  const now = opts.now ?? new Date();
  const previous = readJobs(opts.dataDir);
  const tracked = new Set(config.companies.map(companyKey));
  const muted = new Set(config.companies_muted);
  const discover = !opts.only?.length;
  const index = discover ? readIndex(opts.dataDir) : undefined;
  let ledger = readLedger(opts.dataDir);

  const candidates = index ? findCandidates(config.profile, index, now) : [];
  const checks = pickChecks(candidates, { tracked, muted, ledger, limit: index ? config.discovery.check_per_scan : 0, now });

  const only = opts.only?.map((s) => s.toLowerCase());
  const yours = config.companies.filter((c) => c.enabled && (!only?.length || only.includes(c.name.toLowerCase()) || only.includes(c.slug.toLowerCase())));
  opts.onStart?.([...yours.map((c) => c.name), ...checks.map((c) => c.name)], checks);

  const result = await runRadar(config, { http: opts.http, now, only: opts.only, previous, checks, onCompanyDone: opts.onCompanyDone });

  ledger = recordChecks(ledger, checks, result.health, now);
  // Checked companies keep their jobs between checks, unless you've added (or muted) them since.
  const kept = keptChecked(ledger, now).filter((c) => !tracked.has(companyKey(c)) && !muted.has(companyKey(c)));
  const merged = mergeHistory(previous, result, [...config.companies, ...kept]);
  if (opts.dryRun) return { result, merged, checks };

  const summary = saveRun(opts.dataDir, config, result, merged);
  writeLedger(opts.dataDir, ledger);
  let indexJobs: number | undefined;
  if (index) {
    const live = new Set([...tracked, ...kept.map(companyKey)]);
    const jobs = toIndexJobs(candidates, { live, muted, indexGeneratedAt: index.generated_at });
    writeDiscover(opts.dataDir, { version: 1, generatedAt: result.finishedAt, indexGeneratedAt: index.generated_at, jobs });
    indexJobs = jobs.length;
  }
  return { result, merged, summary, checks, indexJobs };
}
