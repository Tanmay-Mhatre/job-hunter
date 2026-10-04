import { useCallback, useEffect, useState } from "react";
import type { DataMeta, Job, JobsFile } from "@jobhunter/core/schema";

export type { CompanyHealth, DataMeta, Job, Profile, RunSummary } from "@jobhunter/core/schema";

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

/** Loads jobs.json and meta.json written by `jobhunter run`. */
export function useData() {
  const [state, setState] = useState<DataState>({ kind: "loading" });

  const reload = useCallback(async () => {
    try {
      const [jobsFile, meta] = await Promise.all([getJson<JobsFile>("./jobs.json"), getJson<DataMeta>("./meta.json")]);
      if (!jobsFile || !meta) setState({ kind: "empty" });
      else setState({ kind: "ready", jobs: jobsFile.jobs, meta });
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}

export const canRunLocally = import.meta.env.DEV;
