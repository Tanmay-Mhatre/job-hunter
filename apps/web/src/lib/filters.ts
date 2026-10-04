import type { Job } from "./data";
import { ageDays, postedOrSeen } from "./format";
import type { UserState } from "./userState";

export type Filters = {
  q: string;
  minScore: number;
  company: string;
  workplace: "" | Job["workplace"];
  ats: string;
  postedWithin: 0 | 3 | 7 | 30;
  showGated: boolean;
  showClosed: boolean;
  showDismissed: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  q: "",
  minScore: 0,
  company: "",
  workplace: "",
  ats: "",
  postedWithin: 0,
  showGated: false,
  showClosed: false,
  showDismissed: false,
};

export function isDefault(f: Filters): boolean {
  return (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).every((k) => f[k] === DEFAULT_FILTERS[k]);
}

export function applyFilters(jobs: Job[], f: Filters, user: UserState): Job[] {
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return jobs.filter((j) => {
    if (!f.showGated && j.why.gate) return false;
    if (!f.showClosed && j.status === "closed") return false;
    if (!f.showDismissed && user[j.id]?.status === "dismissed") return false;
    if (j.score < f.minScore) return false;
    if (f.company && j.company !== f.company) return false;
    if (f.workplace && j.workplace !== f.workplace) return false;
    if (f.ats && j.ats !== f.ats) return false;
    if (f.postedWithin && ageDays(postedOrSeen(j)) > f.postedWithin) return false;
    if (terms.length) {
      const hay = `${j.title} ${j.company} ${j.location} ${j.department ?? ""} ${j.why.keywords.join(" ")}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}
