import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MergeResult } from "./diff";
import type { RunResult } from "./run";
import type { Config, DataMeta, Job, JobsFile, RunSummary } from "./schema";

/** How many run summaries meta.json keeps (the dashboard's health history). */
export const KEEP_RUNS = 30;

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readJobs(dir: string): Job[] {
  return readJson<JobsFile>(join(dir, "jobs.json"))?.jobs ?? [];
}

export function readMeta(dir: string): DataMeta | undefined {
  return readJson<DataMeta>(join(dir, "meta.json"));
}

export function summarize(run: RunResult, merged: MergeResult): RunSummary {
  const current = run.jobs;
  return {
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    partial: run.partial,
    jobsFound: current.length,
    matches: current.filter((j) => !j.why.gate).length,
    newMatches: current.filter((j) => !j.why.gate && merged.newIds.has(j.id)).length,
    closed: merged.closedIds.size,
    health: run.health,
  };
}

/**
 * Write data/jobs.json, data/meta.json and data/runs/<time>.json.
 * Descriptions are kept only for jobs that pass the gates, to keep the files small.
 */
export function saveRun(dir: string, config: Config, run: RunResult, merged: MergeResult): RunSummary {
  mkdirSync(join(dir, "runs"), { recursive: true });
  const summary = summarize(run, merged);
  const generatedAt = run.finishedAt;

  const jobs = merged.jobs.map((j) => (j.why.gate ? { ...j, description: undefined } : j));
  const jobsFile: JobsFile = { version: 1, generatedAt, jobs };
  writeFileSync(join(dir, "jobs.json"), JSON.stringify(jobsFile));

  const prevRuns = readMeta(dir)?.runs ?? [];
  const meta: DataMeta = {
    version: 1,
    generatedAt,
    profile: config.profile,
    companies: config.companies.map(({ name, ats, slug, enabled, careers_url }) => ({ name, ats, slug, enabled, careers_url })),
    runs: [summary, ...prevRuns].slice(0, KEEP_RUNS),
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  const stamp = run.startedAt.replace(/:/g, "-").replace(/\.\d+Z$/, "Z");
  writeFileSync(join(dir, "runs", `${stamp}.json`), JSON.stringify(summary, null, 2));
  return summary;
}
