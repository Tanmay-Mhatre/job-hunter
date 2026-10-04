import { byScore, type RunResult } from "./run";
import type { CompanyRef, Job } from "./schema";

/** A job missing from this many successful runs of its company in a row is closed. */
export const CLOSE_AFTER_MISSED_RUNS = 2;
/** Closed jobs are dropped this long after they were last seen. */
export const KEEP_CLOSED_DAYS = 60;

export type MergeResult = {
  jobs: Job[];
  /** Ids listed for the first time ever in this run. */
  newIds: Set<string>;
  /** Ids that closed in this run. */
  closedIds: Set<string>;
};

export const companyKey = (ats: string, slug: string) => `${ats}:${slug.toLowerCase()}`;
const keyOfJob = (j: Job) => j.id.split(":", 2).join(":");

/**
 * Merge this run into the stored history: new / still open / missing / closed.
 * Jobs of companies that failed or weren't run this time are left untouched, so a
 * broken feed never closes everything. Jobs of companies removed from the config are dropped.
 */
export function mergeHistory(
  previous: readonly Job[],
  run: RunResult,
  companies: readonly Pick<CompanyRef, "ats" | "slug">[],
  now = new Date(run.startedAt),
): MergeResult {
  const configured = new Set(companies.map((c) => companyKey(c.ats, c.slug)));
  const fetchedOk = new Set(run.health.filter((h) => h.ok).map((h) => companyKey(h.ats, h.slug)));
  const current = new Map(run.jobs.map((j) => [j.id, j]));
  const prevById = new Map(previous.map((j) => [j.id, j]));
  const cutoff = now.getTime() - KEEP_CLOSED_DAYS * 86_400_000;

  const newIds = new Set<string>();
  const closedIds = new Set<string>();
  const jobs: Job[] = [];

  for (const j of run.jobs) {
    if (!prevById.has(j.id)) newIds.add(j.id);
    jobs.push(j);
  }

  for (const p of previous) {
    if (current.has(p.id)) continue;
    const key = keyOfJob(p);
    if (!configured.has(key)) continue;
    if (!fetchedOk.has(key)) {
      if (p.status === "open" || Date.parse(p.lastSeen) >= cutoff) jobs.push(p);
      continue;
    }
    const missedRuns = (p.missedRuns ?? 0) + 1;
    if (p.status === "open" && missedRuns >= CLOSE_AFTER_MISSED_RUNS) {
      closedIds.add(p.id);
      jobs.push({ ...p, missedRuns, status: "closed", closedAt: run.startedAt });
    } else if (p.status === "open" || Date.parse(p.lastSeen) >= cutoff) {
      jobs.push({ ...p, missedRuns });
    }
  }

  jobs.sort(byScore);
  return { jobs, newIds, closedIds };
}
