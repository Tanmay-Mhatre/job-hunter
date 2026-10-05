import { citiesIn } from "@jobhunter/core/catalog/places";
import { toDashboardJob } from "@jobhunter/core/dashboard";
import type { DashboardJob, DashboardJobsFile, DataMeta, Job as FullJob, JobsFile } from "@jobhunter/core/schema";
import { useCallback, useEffect, useState } from "react";

export type { CompanyHealth, DataMeta, Profile, RunSummary } from "@jobhunter/core/schema";
/** A job as the dashboard has it (no description; see useDescription). */
export type Job = DashboardJob;

export type DataState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; jobs: Job[]; meta: DataMeta };

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(path, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  // Vite's dev server answers unknown paths with index.html; treat that as "not there yet".
  if (type.includes("text/html")) return null;
  return (await res.json()) as T;
}

/** Files written before the dashboard split held every job, with descriptions, in jobs.json. */
let legacy: { other: Job[]; descriptions: Record<string, string> } | null = null;

/** Fields added to the dashboard files later: filled in here for files written before them. */
const upgrade = (j: Job): Job => (j.cities ? j : { ...j, cities: citiesIn(j.location) });

function fromFile(file: DashboardJobsFile | JobsFile): Job[] {
  if (file.version === 2) return file.jobs.map(upgrade);
  const all = (file.jobs as FullJob[]).map((j) => ({ job: toDashboardJob(j), description: j.description }));
  legacy = {
    other: all.filter((x) => x.job.why.gate).map((x) => x.job),
    descriptions: Object.fromEntries(all.filter((x) => x.description).map((x) => [x.job.id, x.description!])),
  };
  return all.filter((x) => !x.job.why.gate).map((x) => x.job);
}

/** Loads jobs.json (jobs that pass your filters) and meta.json, written by `jobhunter run`. */
export function useData() {
  const [state, setState] = useState<DataState>({ kind: "loading" });

  const reload = useCallback(async () => {
    try {
      const [jobsFile, meta] = await Promise.all([getJson<DashboardJobsFile | JobsFile>("./jobs.json"), getJson<DataMeta>("./meta.json")]);
      otherJobs = undefined;
      descriptions = undefined;
      legacy = null;
      if (!jobsFile || !meta) setState({ kind: "empty" });
      else setState({ kind: "ready", jobs: fromFile(jobsFile), meta });
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}

let otherJobs: Promise<Job[]> | undefined;
/** Jobs that failed your filters (jobs-other.json), fetched the first time they're needed. */
export function loadOtherJobs(): Promise<Job[]> {
  otherJobs ??= legacy
    ? Promise.resolve(legacy.other)
    : getJson<DashboardJobsFile>("./jobs-other.json").then((f) => (f?.jobs ?? []).map(upgrade)).catch(() => []);
  return otherJobs;
}

/** The other jobs once `enabled` turns true (and from then on). */
export function useOtherJobs(enabled: boolean): Job[] | null {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  useEffect(() => {
    if (!enabled || jobs) return;
    let live = true;
    void loadOtherJobs().then((j) => live && setJobs(j));
    return () => {
      live = false;
    };
  }, [enabled, jobs]);
  return jobs;
}

let descriptions: Promise<Record<string, string>> | undefined;
function loadDescriptions(): Promise<Record<string, string>> {
  descriptions ??= legacy
    ? Promise.resolve(legacy.descriptions)
    : getJson<Record<string, string>>("./descriptions.json").then((d) => d ?? {}).catch(() => ({}));
  return descriptions;
}

/** A job's description (descriptions.json is fetched once, the first time a job is opened). undefined while loading. */
export function useDescription(job: Job | undefined): string | null | undefined {
  const [text, setText] = useState<{ id: string; value: string | null } | null>(null);
  useEffect(() => {
    if (!job) return;
    if (!job.hasDescription) return setText({ id: job.id, value: null });
    let live = true;
    void loadDescriptions().then((d) => live && setText({ id: job.id, value: d[job.id] ?? null }));
    return () => {
      live = false;
    };
  }, [job]);
  return text && job && text.id === job.id ? text.value : undefined;
}

export const canRunLocally = import.meta.env.DEV;
