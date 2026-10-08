import { COUNTRIES } from "@jobhunter/core/catalog/places";
import { allTitles } from "@jobhunter/core/catalog/roles";
import { employersFromResume } from "@jobhunter/core/employers";
import { detectFromResume, type AiProfile } from "@jobhunter/core/resume-parse";
import { CV_DICTIONARY } from "../setup/presets";
import { inferFamily, type Draft } from "./setup";

export type Suggestions = {
  titles: string[];
  seniority: string[];
  exclude: string[];
  places: string[];
  remote: boolean;
  remoteRegions: string[];
  keywords: [string, number][];
  /** Industry ids. */
  industries: string[];
  /** Companies worked at, newest first. */
  pastEmployers: string[];
  /** Where they came from, for the UI label. */
  source: "ai" | "resume" | null;
};

export const NO_SUGGESTIONS: Suggestions = {
  titles: [],
  seniority: [],
  exclude: [],
  places: [],
  remote: false,
  remoteRegions: [],
  keywords: [],
  industries: [],
  pastEmployers: [],
  source: null,
};

const TITLES = allTitles().map((t) => t.title);
const uniq = (xs: string[]) => [...new Set(xs)];

/** The AI profile block wins where present; offline detection on the resume text fills the gaps. */
export function buildSuggestions(resumeText: string, ai?: AiProfile): Suggestions {
  if (!resumeText.trim() && !ai) return NO_SUGGESTIONS;
  const found = detectFromResume(resumeText, { titles: TITLES, countries: COUNTRIES, keywords: CV_DICTIONARY });
  const keywords = new Map<string, number>(found.keywords);
  for (const [k, w] of Object.entries(ai?.keywords ?? {})) keywords.set(k, w);
  return {
    titles: uniq([...(ai?.target_titles ?? []), ...(ai?.target_titles.length ? [] : found.titles)]),
    seniority: ai?.seniority ?? [],
    exclude: ai?.exclude_titles ?? [],
    // With an AI profile, places are where they want to work; offline we only know where they've worked.
    places: ai?.locations.length ? ai.locations : found.places.slice(0, 10),
    remote: ai?.open_to_remote ?? false,
    remoteRegions: ai?.remote_regions ?? [],
    keywords: [...keywords].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    industries: ai?.industries.length ? ai.industries : found.industries,
    pastEmployers: ai?.past_employers?.length ? ai.past_employers : employersFromResume(resumeText),
    source: ai ? "ai" : "resume",
  };
}

/** Fill only what's still empty; never overwrite choices the user already made. */
export function prefillDraft(d: Draft, s: Suggestions): Partial<Draft> {
  const patch: Partial<Draft> = {};
  if (!d.include.length && s.titles.length) {
    patch.include = s.titles.slice(0, 10);
    patch.family = d.family ?? inferFamily(patch.include);
  }
  if (!d.seniority.length && s.seniority.length) patch.seniority = s.seniority;
  if (!d.exclude.length && s.exclude.length) patch.exclude = s.exclude;
  // Past job locations aren't necessarily targets: only prefill places the AI was asked for explicitly.
  if (!d.places.length && s.places.length && s.source === "ai") patch.places = s.places;
  if (!d.remote && !d.remoteOk.length && s.remote && s.remoteRegions.length) {
    patch.remote = true;
    patch.remoteOk = s.remoteRegions;
    patch.remoteExclude = d.remoteExclude.length ? d.remoteExclude : ["us", "usa", "united states", "canada"];
  }
  if (!Object.keys(d.keywords).length && s.keywords.length) patch.keywords = Object.fromEntries(s.keywords.slice(0, 25));
  if (!d.industries.length && s.industries.length) patch.industries = s.industries.slice(0, 4);
  if (!d.pastEmployers.length && s.pastEmployers.length) patch.pastEmployers = s.pastEmployers.slice(0, 10);
  return patch;
}
