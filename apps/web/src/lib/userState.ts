import { useCallback, useEffect, useMemo, useState } from "react";
import type { Job } from "./data";
import type { Prefs } from "./prefs";
import { load, save } from "./storage";

export const PIPELINE = ["saved", "applied", "interviewing", "offer", "rejected"] as const;
export type PipelineStatus = (typeof PIPELINE)[number];
export type Status = PipelineStatus | "dismissed";

export const STATUS_LABEL: Record<Status, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  dismissed: "Not interested",
};

/** Your own tracking for one job. Lives in this browser (export/import to move it). */
export type Entry = {
  status?: Status;
  note?: string;
  updatedAt: string;
  /** Copy of the job's basics, so the pipeline survives the job leaving jobs.json. */
  snapshot: { title: string; company: string; url: string; location: string; score: number };
};

export type UserState = Record<string, Entry>;

/** The job fields tracking needs; a full Job or a stored snapshot both fit. */
export type JobLike = Pick<Job, "id" | "title" | "company" | "url" | "location" | "score">;

const KEY = "jobhunter.state.v1";
const VISIT_KEY = "jobhunter.visits";
const NEW_SESSION_GAP_MS = 30 * 60 * 1000;

export function useUserState() {
  const [state, setState] = useState<UserState>(() => load<UserState>(KEY, {}));

  useEffect(() => save(KEY, state), [state]);

  // Keep tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setState(load<UserState>(KEY, {}));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((job: JobLike, patch: Partial<Pick<Entry, "status" | "note">>) => {
    setState((s) => {
      const prev = s[job.id];
      const next: Entry = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString(),
        snapshot: { title: job.title, company: job.company, url: job.url, location: job.location, score: job.score },
      };
      if (!next.status && !next.note) {
        const { [job.id]: _, ...rest } = s;
        return rest;
      }
      return { ...s, [job.id]: next };
    });
  }, []);

  /** Set a status, or clear it if it's already set (toggle). */
  const toggleStatus = useCallback(
    (job: JobLike, status: Status) => update(job, { status: state[job.id]?.status === status ? undefined : status }),
    [state, update],
  );

  const replaceAll = useCallback((next: UserState) => setState(next), []);

  return { state, update, toggleStatus, replaceAll };
}

/**
 * "New since your last visit": the cutoff is the previous visit. A visit ends after 30 minutes
 * without opening the dashboard, so reloading doesn't wipe the "new" markers.
 */
export function useVisitCutoff() {
  const [cutoff, setCutoff] = useState<string | null>(() => {
    const now = Date.now();
    const v = load<{ last?: number; prev?: number }>(VISIT_KEY, {});
    const prev = v.last && now - v.last > NEW_SESSION_GAP_MS ? v.last : v.prev;
    save(VISIT_KEY, { last: now, prev });
    return prev ? new Date(prev).toISOString() : null;
  });

  const markAllSeen = useCallback(() => {
    const now = Date.now();
    save(VISIT_KEY, { last: now, prev: now });
    setCutoff(new Date(now).toISOString());
  }, []);

  return useMemo(() => ({ cutoff, markAllSeen }), [cutoff, markAllSeen]);
}

export function exportState(state: UserState, prefs?: Prefs): void {
  const blob = new Blob([JSON.stringify({ app: "job-hunter", version: 1, exportedAt: new Date().toISOString(), state, prefs }, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `job-hunter-tracking-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readStateFile(file: File): Promise<{ state: UserState; prefs?: Partial<Prefs> }> {
  const parsed = JSON.parse(await file.text()) as { app?: string; state?: UserState; prefs?: Partial<Prefs> };
  if (parsed.app !== "job-hunter" || !parsed.state || typeof parsed.state !== "object") {
    throw new Error("That file isn't a Job Hunter export.");
  }
  return { state: parsed.state, prefs: parsed.prefs };
}
