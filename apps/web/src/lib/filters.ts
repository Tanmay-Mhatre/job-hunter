import { INDUSTRY_BY_ID } from "@jobhunter/core/catalog/industries";
import { citiesIn, placeOwner } from "@jobhunter/core/catalog/places";
import { SENIORITY_LEVELS, type Seniority } from "@jobhunter/core/catalog/seniority";
import type { Job, Profile } from "./data";
import { ageDays, postedOrSeen } from "./format";
import type { Status, UserState } from "./userState";

export type Workplace = Job["workplace"];
export type Sort = "best" | "newest" | "salary" | "company";
/** Which tracked jobs to show: everything, or one tracking state. */
export type StatusView = "" | "new" | "saved" | "applied";

export type Filters = {
  q: string;
  /** Posted (or first seen) within this many days; 0 = any time. */
  posted: 0 | 1 | 3 | 7 | 30;
  /** Country display names; "Remote" means remote jobs. */
  countries: string[];
  /** Cities, as "City, Country". */
  locations: string[];
  workplace: Workplace[];
  seniority: Seniority[];
  industries: string[];
  companies: string[];
  topics: string[];
  ats: string[];
  match: "all" | "good" | "strong";
  salaryOnly: boolean;
  status: StatusView;
  showFailed: boolean;
  showClosed: boolean;
  showHidden: boolean;
  /** Only jobs at your companies ("My companies"). */
  mine: boolean;
  /** Include directory jobs posted more than INDEX_MAX_AGE_DAYS ago (often filled already). */
  olderIndex: boolean;
};

/** Directory jobs older than this are hidden unless asked for: the index is a week old at most, and old postings are often filled. */
export const INDEX_MAX_AGE_DAYS = 30;

export const DEFAULT_FILTERS: Filters = {
  q: "",
  posted: 0,
  countries: [],
  locations: [],
  workplace: [],
  seniority: [],
  industries: [],
  companies: [],
  topics: [],
  ats: [],
  match: "all",
  salaryOnly: false,
  status: "",
  showFailed: false,
  showClosed: false,
  showHidden: false,
  mine: false,
  olderIndex: false,
};

/** Facets with option counts. */
export type FacetKey = "posted" | "countries" | "locations" | "workplace" | "seniority" | "industries" | "companies" | "topics" | "ats" | "match";

export type Ctx = {
  user: UserState;
  /** Strong-match score (the profile's min_score). */
  min: number;
  /** Industry ids per company name. */
  industriesOf: (company: string) => string[];
  hiddenCompanies: ReadonlySet<string>;
  /** Is this job at one of your companies? (They're always listed first.) */
  isYours?: (j: Job) => boolean;
  /** The user's own countries, cities and industries (from their profile): listed first in the menus. */
  mine?: { countries: ReadonlySet<string>; locations: ReadonlySet<string>; industries: ReadonlySet<string> };
  now?: number;
};

export const REMOTE = "Remote";
const APPLIED_STAGES: Status[] = ["applied", "interviewing", "offer", "rejected"];

/** The New view: open jobs a scan found for the first time in the last 24 hours. */
export const NEW_VIEW_HOURS = 24;
/** The "New" tag on a job stays this long after a scan first found it. */
export const NEW_TAG_HOURS = 48;
const foundWithin = (j: Job, hours: number, now = Date.now()) => !j.estimated && j.status === "open" && now - Date.parse(j.firstSeen) <= hours * 3_600_000;
/** Found by a scan in the last 24 hours (the New view). Directory jobs never are: nobody has checked them yet. */
export const isNewJob = (j: Job, ctx: Pick<Ctx, "now">) => foundWithin(j, NEW_VIEW_HOURS, ctx.now);
/** Shows the "New" tag: found by a scan in the last 2 days. */
export const hasNewTag = (j: Job, ctx: Pick<Ctx, "now">) => foundWithin(j, NEW_TAG_HOURS, ctx.now);
/** Remote jobs, and jobs that matched one of your remote regions ("EMEA"), count as "Remote". */
const isRemoteLike = (j: Job) => j.workplace === "remote" || j.why.location === 15 || /\bremote\b/i.test(j.location);
const countriesOf = (j: Job) => (isRemoteLike(j) ? [...j.countries, REMOTE] : j.countries);

/** Does the job pass every filter, except the one named by `skip` (for that facet's counts)? */
function passes(j: Job, f: Filters, ctx: Ctx, terms: string[], skip?: FacetKey): boolean {
  const entry = ctx.user[j.id];
  if (!f.showFailed && j.why.gate) return false;
  if (!f.showClosed && j.status === "closed") return false;
  if (!f.showHidden && (entry?.status === "dismissed" || ctx.hiddenCompanies.has(j.company))) return false;
  if (f.mine && !ctx.isYours?.(j)) return false;
  if (!f.olderIndex && j.estimated && ageDays(postedOrSeen(j), ctx.now) > INDEX_MAX_AGE_DAYS) return false;
  if (f.status === "new" && !isNewJob(j, ctx)) return false;
  if (f.status === "saved" && entry?.status !== "saved") return false;
  if (f.status === "applied" && !(entry?.status && APPLIED_STAGES.includes(entry.status))) return false;
  if (f.salaryOnly && !j.salary) return false;
  if (skip !== "match" && f.match !== "all" && j.score < (f.match === "strong" ? ctx.min : Math.max(0, ctx.min - 20))) return false;
  if (skip !== "posted" && f.posted && ageDays(postedOrSeen(j), ctx.now) > f.posted) return false;
  if (skip !== "countries" && f.countries.length && !countriesOf(j).some((c) => f.countries.includes(c))) return false;
  if (skip !== "locations" && f.locations.length && !j.cities.some((c) => f.locations.includes(c))) return false;
  if (skip !== "workplace" && f.workplace.length && !f.workplace.includes(j.workplace)) return false;
  if (skip !== "seniority" && f.seniority.length && !f.seniority.includes(j.seniority)) return false;
  if (skip !== "industries" && f.industries.length && !ctx.industriesOf(j.company).some((i) => f.industries.includes(i))) return false;
  if (skip !== "companies" && f.companies.length && !f.companies.includes(j.company)) return false;
  if (skip !== "topics" && f.topics.length && !f.topics.some((t) => j.why.keywords.includes(t))) return false;
  if (skip !== "ats" && f.ats.length && !f.ats.includes(j.ats)) return false;
  if (terms.length) {
    const hay = `${j.title} ${j.company} ${j.location} ${j.department ?? ""} ${j.why.keywords.join(" ")}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  return true;
}

const termsOf = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

export function applyFilters(jobs: Job[], f: Filters, ctx: Ctx): Job[] {
  const terms = termsOf(f.q);
  return jobs.filter((j) => passes(j, f, ctx, terms));
}

export type FacetOption = {
  value: string;
  label: string;
  count: number;
  /** "yours": from your profile; "other": only mentioned by jobs (shown under its own heading). */
  group?: "yours" | "other";
};

const POSTED_OPTIONS: { value: Filters["posted"]; label: string }[] = [
  { value: 1, label: "Past 24 hours" },
  { value: 3, label: "Past 3 days" },
  { value: 7, label: "Past week" },
  { value: 30, label: "Past month" },
];
const WORKPLACE_LABEL: Record<Workplace, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", unknown: "Not stated" };
const SENIORITY_LABEL = Object.fromEntries(SENIORITY_LEVELS.map((s) => [s.id, s.label])) as Record<Seniority, string>;

/**
 * Options and counts for every facet. Each facet's counts apply all the *other* active filters,
 * so you can see what picking an option would give (the usual faceted-search rule).
 */
export function facetCounts(jobs: Job[], f: Filters, ctx: Ctx): Record<FacetKey, FacetOption[]> {
  const terms = termsOf(f.q);
  const tally = (key: FacetKey, valuesOf: (j: Job) => readonly string[]) => {
    const counts = new Map<string, number>();
    for (const j of jobs) {
      if (!passes(j, f, ctx, terms, key)) continue;
      for (const v of new Set(valuesOf(j))) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return counts;
  };
  const sorted = (counts: Map<string, number>, label: (v: string) => string = (v) => v, selected: string[] = [], mine?: ReadonlySet<string>) => {
    // Selected options stay listed even at 0, so they can be unticked; your own ones too.
    for (const s of [...selected, ...(mine ?? [])]) if (!counts.has(s)) counts.set(s, 0);
    return [...counts]
      .map(([value, count]): FacetOption => ({ value, label: label(value), count, ...(mine ? { group: mine.has(value) ? "yours" : "other" } : {}) }))
      .sort((a, b) => Number(b.group === "yours") - Number(a.group === "yours") || b.count - a.count || a.label.localeCompare(b.label));
  };

  const postedPool = jobs.filter((j) => passes(j, f, ctx, terms, "posted"));
  const matchPool = jobs.filter((j) => passes(j, f, ctx, terms, "match"));
  return {
    posted: POSTED_OPTIONS.map((o) => ({ value: String(o.value), label: o.label, count: postedPool.filter((j) => ageDays(postedOrSeen(j), ctx.now) <= o.value).length })),
    countries: sorted(tally("countries", countriesOf), (v) => (v === REMOTE ? "Remote & your regions" : v), f.countries, ctx.mine?.countries),
    // "Dubai, United Arab Emirates" reads as "Dubai · United Arab Emirates" in the menu.
    locations: sorted(tally("locations", (j) => j.cities), (v) => v.replace(/, ([^,]+)$/, " · $1"), f.locations, ctx.mine?.locations),
    workplace: (["remote", "hybrid", "onsite", "unknown"] as Workplace[]).map((w) => ({ value: w, label: WORKPLACE_LABEL[w], count: tally("workplace", (j) => [j.workplace]).get(w) ?? 0 })),
    seniority: SENIORITY_LEVELS.map((s) => ({ value: s.id, label: s.label, count: tally("seniority", (j) => [j.seniority]).get(s.id) ?? 0 })),
    industries: sorted(tally("industries", (j) => ctx.industriesOf(j.company)), (id) => INDUSTRY_BY_ID.get(id)?.label ?? id, f.industries, ctx.mine?.industries),
    companies: sorted(tally("companies", (j) => [j.company]), undefined, f.companies),
    topics: sorted(tally("topics", (j) => j.why.keywords), undefined, f.topics),
    ats: sorted(tally("ats", (j) => [j.ats]), undefined, f.ats),
    match: [
      { value: "strong", label: `Strong (${ctx.min}+)`, count: matchPool.filter((j) => j.score >= ctx.min).length },
      { value: "good", label: `Good (${Math.max(0, ctx.min - 20)}+)`, count: matchPool.filter((j) => j.score >= Math.max(0, ctx.min - 20)).length },
    ],
  };
}

const salaryOf = (j: Job) => j.salary?.max ?? j.salary?.min ?? -1;

/** Sort the list; with `isYours`, jobs at your companies come first whatever the order. */
export function sortJobs(jobs: Job[], sort: Sort, isYours?: (j: Job) => boolean): Job[] {
  const by: Record<Sort, (a: Job, b: Job) => number> = {
    best: (a, b) => b.score - a.score || postedOrSeen(b).localeCompare(postedOrSeen(a)),
    newest: (a, b) => postedOrSeen(b).localeCompare(postedOrSeen(a)) || b.score - a.score,
    // Only compares like with like loosely: listed salaries first, highest first.
    salary: (a, b) => salaryOf(b) - salaryOf(a) || b.score - a.score,
    company: (a, b) => a.company.localeCompare(b.company) || b.score - a.score,
  };
  const order = by[sort];
  return [...jobs].sort(isYours ? (a, b) => Number(isYours(b)) - Number(isYours(a)) || order(a, b) : order);
}

/** One role posted in several places: the best posting leads, the others ride along. */
export type JobGroup = { key: string; lead: Job; jobs: Job[] };

export function groupJobs(sorted: Job[]): JobGroup[] {
  const groups = new Map<string, JobGroup>();
  for (const j of sorted) {
    const g = groups.get(j.group);
    if (g) g.jobs.push(j);
    else groups.set(j.group, { key: j.group, lead: j, jobs: [j] });
  }
  return [...groups.values()];
}

/**
 * The active filters as removable chips. With `base` (your profile's filters), only what differs
 * from it is listed: your own places and industries are shown in the profile bar instead.
 */
export function activeChips(f: Filters, ctx: Pick<Ctx, "min">, base?: Filters): { key: string; label: string; remove: Partial<Filters> }[] {
  const all = chipsOf(f, ctx);
  if (!base) return all;
  const inBase = new Set(chipsOf(base, ctx).map((c) => c.key));
  return all.filter((c) => !inBase.has(c.key));
}

function chipsOf(f: Filters, ctx: Pick<Ctx, "min">): { key: string; label: string; remove: Partial<Filters> }[] {
  const chips: { key: string; label: string; remove: Partial<Filters> }[] = [];
  const list = <K extends "countries" | "locations" | "workplace" | "seniority" | "industries" | "companies" | "topics" | "ats">(k: K, label: (v: string) => string) => {
    for (const v of f[k] as string[]) chips.push({ key: `${k}:${v}`, label: label(v), remove: { [k]: (f[k] as string[]).filter((x) => x !== v) } as Partial<Filters> });
  };
  if (f.q.trim()) chips.push({ key: "q", label: `“${f.q.trim()}”`, remove: { q: "" } });
  if (f.status) chips.push({ key: "status", label: { new: "New since last visit", saved: "Saved", applied: "Applied" }[f.status], remove: { status: "" } });
  if (f.posted) chips.push({ key: "posted", label: POSTED_OPTIONS.find((o) => o.value === f.posted)!.label, remove: { posted: 0 } });
  list("countries", (v) => (v === REMOTE ? "Remote & your regions" : v));
  list("locations", (v) => v.replace(/, [^,]+$/, ""));
  list("workplace", (v) => WORKPLACE_LABEL[v as Workplace] ?? v);
  list("seniority", (v) => SENIORITY_LABEL[v as Seniority] ?? v);
  list("industries", (v) => INDUSTRY_BY_ID.get(v)?.label ?? v);
  list("companies", (v) => v);
  list("topics", (v) => `Topic: ${v}`);
  list("ats", (v) => `Source: ${v}`);
  if (f.match !== "all") chips.push({ key: "match", label: f.match === "strong" ? `Strong matches (${ctx.min}+)` : `Good matches (${Math.max(0, ctx.min - 20)}+)`, remove: { match: "all" } });
  if (f.salaryOnly) chips.push({ key: "salary", label: "Salary listed", remove: { salaryOnly: false } });
  if (f.showFailed) chips.push({ key: "failed", label: "Including jobs that failed your filters", remove: { showFailed: false } });
  if (f.showClosed) chips.push({ key: "closed", label: "Including closed", remove: { showClosed: false } });
  if (f.showHidden) chips.push({ key: "hidden", label: "Including hidden", remove: { showHidden: false } });
  if (f.mine) chips.push({ key: "mine", label: "My companies", remove: { mine: false } });
  if (f.olderIndex) chips.push({ key: "olderIndex", label: `Including directory jobs older than ${INDEX_MAX_AGE_DAYS} days`, remove: { olderIndex: false } });
  return chips;
}

const pretty = (name: string) => name.replace(/(^|\s)\p{L}/gu, (ch) => ch.toUpperCase());

/** Your profile's places as the menus name them: countries ("United Kingdom") and cities ("Dubai, United Arab Emirates"). */
export function profilePlaces(profile: Profile): { countries: string[]; locations: string[]; remote: boolean } {
  const countries = new Set<string>();
  const locations = new Set<string>();
  for (const term of profile.locations.include) {
    const owner = placeOwner(term);
    if (owner?.startsWith("country:")) countries.add(pretty(owner.slice(8)));
    for (const city of citiesIn(term)) if (city.includes(",")) locations.add(city);
  }
  return { countries: [...countries], locations: [...locations], remote: profile.locations.remote_ok.length > 0 };
}

/**
 * The Radar's starting filters, from your profile: your countries (plus remote, if you take remote
 * roles). Jobs already had to pass your profile to get here; this makes it visible. Industries are not
 * a starting filter: we only know them for some companies, so it would hide most of the directory's jobs.
 */
export function profileFilters(profile: Profile): Filters {
  const places = profilePlaces(profile);
  return {
    ...DEFAULT_FILTERS,
    countries: places.countries.length || places.remote ? [...places.countries, ...(places.remote ? [REMOTE] : [])] : [],
  };
}

/** When nothing matches: which single filter, removed, brings back the most jobs. */
export function suggestRelax(jobs: Job[], f: Filters, ctx: Ctx, limit = 3): { label: string; remove: Partial<Filters>; count: number }[] {
  return chipsOf(f, ctx)
    .filter((c) => !["failed", "closed", "hidden"].includes(c.key))
    .map((c) => ({ label: c.label, remove: c.remove, count: applyFilters(jobs, { ...f, ...c.remove }, ctx).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export const sameFilters = (a: Filters, b: Filters) => JSON.stringify({ ...a, q: "" }) === JSON.stringify({ ...b, q: "" });

/** Filters + sort <-> URL hash query ("#radar?posted=7&countries=United+Arab+Emirates&sort=newest"). */
export function toQuery(f: Filters, sort: Sort): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f) as [keyof Filters, Filters[keyof Filters]][]) {
    const d = DEFAULT_FILTERS[k];
    if (JSON.stringify(v) === JSON.stringify(d)) continue;
    p.set(k, Array.isArray(v) ? v.join("|") : String(v));
  }
  if (sort !== "best") p.set("sort", sort);
  return p.toString();
}

export function fromQuery(query: string): { filters: Filters; sort: Sort } | null {
  if (!query) return null;
  const p = new URLSearchParams(query);
  const f: Filters = { ...DEFAULT_FILTERS };
  const rec = f as unknown as Record<string, unknown>;
  for (const [k, raw] of p) {
    if (k === "sort" || !(k in DEFAULT_FILTERS)) continue;
    const d = DEFAULT_FILTERS[k as keyof Filters];
    rec[k] = Array.isArray(d) ? raw.split("|").filter(Boolean) : typeof d === "number" ? Number(raw) || 0 : typeof d === "boolean" ? raw === "true" : raw;
  }
  const sort = (p.get("sort") ?? "best") as Sort;
  return { filters: f, sort: ["best", "newest", "salary", "company"].includes(sort) ? sort : "best" };
}
