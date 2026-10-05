import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { companyKey } from "./connectors";
import { toDashboardJob } from "./dashboard";
import type { MergeResult } from "./diff";
import type { RunResult } from "./run";
import type { Config, DashboardJob, DashboardJobsFile, DataMeta, Job, JobsFile, RunSummary } from "./schema";

/** How many run summaries meta.json keeps (the dashboard's health history). */
export const KEEP_RUNS = 30;

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Every job seen so far, with descriptions (history.json; before it existed, jobs.json held the same). */
export function readJobs(dir: string): Job[] {
  const history = readJson<JobsFile>(join(dir, "history.json"));
  if (history) return history.jobs;
  const legacy = readJson<JobsFile | DashboardJobsFile>(join(dir, "jobs.json"));
  return legacy?.version === 1 ? legacy.jobs : [];
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

/** Industry ids per company from the published directory (data/catalog/directory.json), if built. */
function directoryIndustries(dir: string): Map<string, string[]> {
  const directory = readJson<{ companies: { key: string; tags?: string[] }[] }>(join(dir, "catalog", "directory.json"));
  return new Map((directory?.companies ?? []).filter((c) => c.tags?.length).map((c) => [c.key, c.tags!]));
}

/**
 * Write the run's files:
 *   history.json       every job, with descriptions for those that pass the gates (merge reads this)
 *   jobs.json          dashboard: jobs that pass your gates, no descriptions
 *   jobs-other.json    dashboard: the rest, loaded only on demand
 *   descriptions.json  dashboard: id -> description, loaded when a job is opened
 *   meta.json, runs/<time>.json
 */
export function saveRun(dir: string, config: Config, run: RunResult, merged: MergeResult): RunSummary {
  mkdirSync(join(dir, "runs"), { recursive: true });
  const summary = summarize(run, merged);
  const generatedAt = run.finishedAt;

  const jobs = merged.jobs.map((j) => (j.why.gate ? { ...j, description: undefined } : j));
  const history: JobsFile = { version: 1, generatedAt, jobs };
  writeFileSync(join(dir, "history.json"), JSON.stringify(history));

  const dashboard = jobs.map(toDashboardJob);
  const file = (list: DashboardJob[]): DashboardJobsFile => ({ version: 2, generatedAt, jobs: list });
  writeFileSync(join(dir, "jobs.json"), JSON.stringify(file(dashboard.filter((j) => !j.why.gate))));
  writeFileSync(join(dir, "jobs-other.json"), JSON.stringify(file(dashboard.filter((j) => j.why.gate))));
  writeFileSync(join(dir, "descriptions.json"), JSON.stringify(Object.fromEntries(jobs.filter((j) => j.description).map((j) => [j.id, j.description]))));

  const industries = directoryIndustries(dir);
  const prevRuns = readMeta(dir)?.runs ?? [];
  const meta: DataMeta = {
    version: 1,
    generatedAt,
    profile: config.profile,
    companies: config.companies.map(({ name, ats, slug, shard, site, enabled, careers_url }) => {
      const tags = industries.get(companyKey({ ats, slug, shard, site }));
      return { name, ats, slug, enabled, careers_url, ...(tags ? { industries: tags } : {}) };
    }),
    runs: [summary, ...prevRuns].slice(0, KEEP_RUNS),
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  const stamp = run.startedAt.replace(/:/g, "-").replace(/\.\d+Z$/, "Z");
  writeFileSync(join(dir, "runs", `${stamp}.json`), JSON.stringify(summary, null, 2));
  return summary;
}
