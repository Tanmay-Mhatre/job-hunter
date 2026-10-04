import type { Country } from "./catalog/places";
import { termRegex } from "./text";

/** The structured block the master-resume prompt asks the AI to append. */
export type AiProfile = {
  target_titles: string[];
  seniority: string[];
  exclude_titles: string[];
  locations: string[];
  open_to_remote: boolean;
  remote_regions: string[];
  keywords: Record<string, number>;
};

export type ParsedAnswer = {
  /** The master resume as Markdown, without the profile block or chat filler. */
  resume: string;
  profile?: AiProfile;
  warnings: string[];
};

const PROFILE_KEY = "jobhunter_profile";

const strList = (v: unknown, max = 40): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string").map((s) => s.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))].slice(0, max)
    : [];

function normalizeProfile(raw: unknown): AiProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const keywords: Record<string, number> = {};
  if (o.keywords && typeof o.keywords === "object" && !Array.isArray(o.keywords)) {
    for (const [k, w] of Object.entries(o.keywords as Record<string, unknown>)) {
      const term = k.trim().toLowerCase().replace(/\s+/g, " ");
      const n = typeof w === "number" ? w : Number(w);
      if (term && Number.isFinite(n)) keywords[term] = Math.min(5, Math.max(1, Math.round(n)));
    }
  } else if (Array.isArray(o.keywords)) {
    for (const k of strList(o.keywords)) keywords[k] = 3;
  }
  const profile: AiProfile = {
    target_titles: strList(o.target_titles),
    seniority: strList(o.seniority, 12),
    exclude_titles: strList(o.exclude_titles),
    locations: strList(o.locations),
    open_to_remote: o.open_to_remote === true || o.open_to_remote === "true",
    remote_regions: strList(o.remote_regions, 12),
    keywords,
  };
  const empty =
    !profile.target_titles.length && !profile.locations.length && !Object.keys(profile.keywords).length && !profile.seniority.length;
  return empty ? undefined : profile;
}

/** Find the JSON object that holds jobhunter_profile: a ```json fence first, then any balanced {...}. */
function findProfileJson(text: string): { start: number; end: number; value: unknown } | undefined {
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/gi;
  for (let m; (m = fence.exec(text)); ) {
    if (!m[1]!.includes(PROFILE_KEY)) continue;
    try {
      return { start: m.index, end: m.index + m[0].length, value: JSON.parse(m[1]!) };
    } catch {
      // fall through to the brace scan
    }
  }
  const at = text.indexOf(PROFILE_KEY);
  if (at < 0) return undefined;
  const open = text.lastIndexOf("{", at);
  if (open < 0) return undefined;
  let depth = 0;
  let inStr = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return { start: open, end: i + 1, value: JSON.parse(text.slice(open, i + 1)) };
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Split what the user pasted back from Claude / ChatGPT into the master resume and the profile
 * block. Tolerates chat filler ("Here's your master resume:"), Markdown fences and a missing block.
 */
export function parseAiAnswer(text: string): ParsedAnswer {
  const warnings: string[] = [];
  let body = text.replace(/\r\n/g, "\n");
  let profile: AiProfile | undefined;

  const found = findProfileJson(body);
  if (found) {
    const v = found.value as Record<string, unknown>;
    profile = normalizeProfile(v[PROFILE_KEY] ?? v);
    if (!profile) warnings.push("The profile block was empty, so we'll suggest details from the resume text instead.");
    // Everything after the block is chat filler ("Let me know if…").
    body = body.slice(0, found.start);
  } else if (body.includes(PROFILE_KEY)) {
    warnings.push("Couldn't read the profile block (the JSON looks broken). We'll suggest details from the resume text instead.");
  }

  // Unwrap a whole-answer ```markdown fence.
  const wrapped = body.match(/```(?:markdown|md)?\s*\n([\s\S]*?)```/i);
  if (wrapped && wrapped[1]!.trim().length > body.trim().length * 0.6) body = wrapped[1]!;

  // Drop chat filler before the first heading, if the resume has headings.
  const lines = body.split("\n");
  const firstHeading = lines.findIndex((l) => /^#{1,3}\s+\S/.test(l));
  if (firstHeading > 0 && lines.slice(0, firstHeading).join(" ").trim().length < 300) body = lines.slice(firstHeading).join("\n");

  const resume = body
    .replace(/\n?-{3,}\s*$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (resume.length < 200) warnings.push("The resume looks very short. Check you pasted the whole answer.");
  return { resume, profile, warnings };
}

const globalCache = new Map<string, RegExp>();
function countMatches(text: string, term: string): number {
  let re = globalCache.get(term);
  if (!re) {
    re = new RegExp(termRegex(term).source, "giu");
    globalCache.set(term, re);
  }
  re.lastIndex = 0;
  return (text.match(re) ?? []).length;
}

export type Detected = {
  titles: string[];
  places: string[];
  keywords: [string, number][];
};

/** Offline suggestions from plain resume text, using the catalogues (no AI). */
export function detectFromResume(
  text: string,
  catalogs: { titles: readonly string[]; countries: readonly Country[]; keywords: Readonly<Record<string, number>> },
  limits = { titles: 8, places: 8, keywords: 25 },
): Detected {
  if (text.trim().length < 40) return { titles: [], places: [], keywords: [] };

  const lower = text.toLowerCase();
  // Plain substring check first: cheap, and rules out almost every term.
  const mentioned = (term: string) => lower.includes(term.split(/[s-]+/)[0]!);
  const titleHits = catalogs.titles
    .filter(mentioned)
    .map((t) => [t, countMatches(text, t)] as const)
    .filter(([, n]) => n > 0)
    // More mentions first; longer (more specific) titles win ties.
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([t]) => t);
  const titles = titleHits.slice(0, limits.titles);

  // A country counts once, under its full name, whichever alias the resume uses ("UAE" -> "united arab emirates").
  const placeCounts = new Map<string, number>();
  for (const country of catalogs.countries) {
    const names = [country.name, ...country.aliases];
    if (names.every((n) => !lower.includes(n))) {
      if (country.cities.every((c) => !lower.includes(c))) continue;
    }
    const n = names.reduce((sum, t) => sum + countMatches(text, t), 0);
    if (n) placeCounts.set(country.name, n);
    for (const city of country.cities) {
      const m = countMatches(text, city);
      if (m) placeCounts.set(city, (placeCounts.get(city) ?? 0) + m);
    }
  }
  const places = [...placeCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([p]) => p)
    .slice(0, limits.places);

  const keywords = Object.entries(catalogs.keywords)
    .filter(([k]) => mentioned(k) && countMatches(text, k) > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limits.keywords);

  return { titles, places, keywords };
}
