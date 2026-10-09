import { allPlaceNames, countriesIn, expandPlaces, LOCATION_SEGMENTS, placeOwner, placeOwnerName, spellOutPlaces, SUBDIVISIONS } from "./catalog/places";
import type { NormalizedJob, Profile, ScoreBreakdown } from "./schema";
import { matchesAny, matchesTerm, matchesTitle, termRegex, titleForms } from "./text";

export const POINTS = {
  titleMatch: 20,
  seniority: 10,
  locationCity: 20,
  locationRemote: 15,
  keywordCap: 40,
  /** Matched topic weight that fills the topic bar (about three core topics at weight 4). */
  keywordTarget: 12,
  /** Most topic points a job's title alone can give: half the bar, so a description can still prove more. */
  titleKeywordCap: 20,
  fresh3d: 10,
  fresh7d: 6,
  older: 2,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

type Scorable = Pick<NormalizedJob, "title" | "location" | "workplace" | "description" | "postedAt">;

/** Most points title + location + freshness can give (30 + 20 + 10). */
const NON_KEYWORD_MAX = POINTS.titleMatch + POINTS.seniority + POINTS.locationCity + POINTS.fresh3d;

/**
 * Transparent keyword scoring, 0..100. No AI.
 *
 *   title      20, +10 with a seniority term
 *   location   20 one of your places, 15 remote in your regions
 *   topics     up to 40: the share of your topic weight a job mentions, where min(total weight, 12)
 *              fills the bar (so three core topics are enough; a short list isn't penalised).
 *              A topic in the title counts on its own too: up to 20, your top topic filling it, so
 *              jobs with no description ("Payments PM") aren't 0 on topics. The title is part of
 *              every job, so this never puts a job without a description ahead of the same job with one.
 *   freshness  10 within 3 days, 6 within 7, else 2
 * With no topics at all, title + location + freshness (max 60) is scaled to 0..100 (`why.scale`),
 * so a strong match means the right title, in your place, posted recently.
 *
 * Gates: the title must match an include term and no exclude term, and the location must be one
 * the user picked (see locationFit). Failing a gate scores 0.
 *
 * @param seenAt used for freshness when the ATS gives no posting date (first time we saw the job).
 */
export function scoreJob(job: Scorable, profile: Profile, now: Date, seenAt: Date = now): { score: number; why: ScoreBreakdown } {
  const title = job.title;
  const forms = titleForms(title);
  const location = gateLocation(job);
  const titleOk = titlePasses(title, profile, forms);
  const titlePts = titleOk ? POINTS.titleMatch + (matchesTitle(title, profile.seniority_boost, forms) ? POINTS.seniority : 0) : 0;
  const fit = workplaceFit(job, profile) ?? locationFit(location, profile);
  const locationPts = fit.points;

  const description = job.description ?? "";
  const inTitle = new Set(Object.keys(profile.keywords).filter((k) => matchesTitle(title, [k], forms)));
  const matched = Object.entries(profile.keywords)
    .filter(([k]) => inTitle.has(k) || matchesTerm(description, k))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const weights = Object.values(profile.keywords);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const matchedWeight = matched.reduce((sum, [, w]) => sum + w, 0);
  const titleWeight = matched.reduce((sum, [k, w]) => sum + (inTitle.has(k) ? w : 0), 0);
  const keywordPoints =
    totalWeight > 0
      ? Math.max(
          Math.round(POINTS.keywordCap * Math.min(1, matchedWeight / Math.min(totalWeight, POINTS.keywordTarget))),
          Math.round(POINTS.titleKeywordCap * Math.min(1, titleWeight / Math.max(...weights))),
        )
      : 0;

  const posted = job.postedAt ? new Date(job.postedAt) : seenAt;
  const ageDays = Number.isNaN(posted.getTime()) ? Infinity : (now.getTime() - posted.getTime()) / DAY_MS;
  const freshness = ageDays <= 3 ? POINTS.fresh3d : ageDays <= 7 ? POINTS.fresh7d : POINTS.older;

  const why: ScoreBreakdown = {
    title: titlePts,
    location: locationPts,
    keywords: matched.map(([k]) => k),
    keywordPoints,
    freshness,
    ...(totalWeight > 0 ? {} : { scale: 100 / NON_KEYWORD_MAX }),
  };
  if (!titleOk) return { score: 0, why: { ...why, gate: "title" } };
  if (locationPts === 0) return { score: 0, why: { ...why, gate: "location", ...(fit.note ? { locationNote: fit.note } : {}) } };
  const raw = titlePts + locationPts + keywordPoints + freshness;
  return { score: Math.min(100, Math.round(raw * (why.scale ?? 1))), why };
}

/** An on-site or hybrid job when the user only takes the other kind: fails the location gate. */
function workplaceFit(job: Pick<NormalizedJob, "workplace">, profile: Profile): { points: 0; note: string } | undefined {
  const allowed = profile.locations.workplace ?? [];
  if (!allowed.length || (job.workplace !== "onsite" && job.workplace !== "hybrid") || allowed.includes(job.workplace)) return undefined;
  return { points: 0, note: job.workplace === "hybrid" ? "Hybrid role: you asked for on-site only." : "On-site role: you asked for hybrid only." };
}

/** A remote job counts as "remote" even when its location text doesn't say so. */
function gateLocation(job: Pick<NormalizedJob, "location" | "workplace">): string {
  return job.workplace === "remote" && !matchesTerm(job.location, "remote") ? `${job.location} remote` : job.location;
}

/** Include and exclude terms are read the same way (matchesTitle): "Sr. PMM" is still "product marketing". */
function titlePasses(title: string, profile: Profile, forms = titleForms(title)): boolean {
  return matchesTitle(title, profile.titles.include, forms) && !matchesTitle(title, profile.titles.exclude, forms);
}

/** Remote wording that names no place: stripped before checking what else a remote job names. */
const REMOTE_WORDS =
  /\b(fully|100%|100 %|remote|remotely|first|friendly|work from home|work-from-home|wfh|home[- ]based|from home|anywhere|any ?time ?zone|timezone|time zone|flexible|distributed|telecommute|virtual|or|and|only|within|based|in|position|role|team|location|locations|opportunity)\b/gi;
const GENERIC_REMOTE = ["remote", "anywhere", "worldwide", "global"];

type LocationRules = {
  include: string[];
  /** States and provinces of the countries the user picked ("california", "ontario"). */
  subdivisions: string[];
  /** Their codes after a comma or bracket, upper case only: "Santa Monica, CA". */
  codes: RegExp | null;
  /** remote_ok terms that name a region or place (everything except plain "remote"). */
  regions: string[];
  /** remote_ok terms written with "remote" ("remote - us", "US remote"): the place, for remote jobs only. */
  remoteRegions: string[];
  /** The user takes remote jobs that name no place at all. */
  bareRemote: boolean;
  exclude: string[];
  /** Longer place names that contain one of the user's terms but are somewhere else. */
  mask: RegExp | null;
};
/** "remote - us", "US remote", "Remote (USA)" -> "us" / "usa"; undefined when the term isn't remote plus a place. */
function remotePlace(term: string): string | undefined {
  if (!matchesTerm(term, "remote")) return undefined;
  const place = term.toLowerCase().replace(/\bremote\b/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return place || undefined;
}

const rulesCache = new WeakMap<Profile["locations"], LocationRules>();

function rulesFor(profile: Profile): LocationRules {
  const loc = profile.locations;
  let rules = rulesCache.get(loc);
  if (!rules) {
    // Every name of each place ("sf" is "san francisco"), and "remote (usa)" read as "usa" for remote jobs.
    const include = expandPlaces(loc.include);
    const plainOk = loc.remote_ok.filter((t) => t.toLowerCase() !== "remote" && !remotePlace(t));
    const regions = expandPlaces(plainOk);
    const remoteRegions = expandPlaces(loc.remote_ok.map(remotePlace).filter((t): t is string => !!t));
    const exclude = expandPlaces(loc.remote_exclude.map((t) => remotePlace(t) ?? t));
    const mine = [...include, ...regions, ...remoteRegions, ...exclude];
    const owners = new Map(mine.map((t) => [t, placeOwner(t)]));
    // "New South Wales" hides "wales", "North America" hides "america", unless the user picked them
    // or they belong to the same place ("united arab emirates" never hides "emirates").
    const hide = allPlaceNames().filter(
      (p) => p.includes(" ") && !mine.includes(p) && mine.some((t) => t !== p && matchesTerm(p, t) && (!owners.get(t) || owners.get(t) !== placeOwner(p))),
    );
    // Countries the user picked (by any of their names or cities).
    const countries = new Set(include.map((t) => placeOwner(t)).filter((o): o is string => !!o?.startsWith("country:")).map((o) => o.slice(8)));
    const subs = [...countries].map((c) => SUBDIVISIONS[c]).filter((x) => !!x);
    const codes = subs.flatMap((x) => x!.codes);
    rules = {
      include,
      subdivisions: subs.flatMap((x) => x!.names),
      codes: codes.length ? new RegExp(`(?:,\\s*|\\()(?:${codes.join("|")})(?![\\p{L}])`, "u") : null,
      regions,
      remoteRegions,
      bareRemote: loc.remote_ok.some((t) => GENERIC_REMOTE.includes(t.toLowerCase())),
      exclude,
      mask: hide.length ? new RegExp(hide.map((p) => `(?:${termRegex(p).source})`).join("|"), "giu") : null,
    };
    rulesCache.set(loc, rules);
  }
  return rules;
}

/**
 * Does the location name one of the user's places? Checked per segment ("Dubai; London"), and a
 * picked city only counts when that segment doesn't put it in another country: "Cambridge, MA USA"
 * isn't the UK's Cambridge, "London, Ontario" isn't the UK's London.
 */
function inYourPlaces(text: string, r: LocationRules): boolean {
  if (!(matchesAny(text, r.include) || matchesAny(text, r.subdivisions) || r.codes?.test(text))) return false;
  for (const segment of text.split(LOCATION_SEGMENTS)) {
    if (matchesAny(segment, r.subdivisions) || r.codes?.test(segment)) return true;
    const hits = r.include.filter((t) => matchesTerm(segment, t));
    if (!hits.length) continue;
    const named = countriesIn(segment).map((c) => c.toLowerCase());
    if (!named.length) return true;
    if (hits.some((t) => { const owner = placeOwner(t); return !owner?.startsWith("country:") || named.includes(owner.slice(8)); })) return true;
  }
  return false;
}

/**
 * Is this a place the user picked?
 *   +20  it names one of their places (the longest place name wins: "New South Wales" isn't "wales")
 *   +15  it names a remote region they picked (EMEA, GCC, worldwide…), unless it names an excluded one
 *   +15  it's remote and names no place at all ("Remote", "Fully remote")
 *    0   anything else, with a note when it's remote but tied to somewhere else ("Remote - India")
 */
export function locationFit(location: string, profile: Profile): { points: number; note?: string } {
  const r = rulesFor(profile);
  // "U.S." -> "US", "D.C." -> "DC", so abbreviations match like the plain words.
  const plain = location.replace(/\bU\.S\.A\.?/g, "USA").replace(/\bU\.S\.?/g, "US").replace(/\bD\.C\.?/g, "DC");
  const spelled = spellOutPlaces(plain);
  const text = r.mask ? spelled.replace(r.mask, " ") : spelled;
  if (inYourPlaces(text, r)) return { points: POINTS.locationCity };
  const excluded = matchesAny(text, r.exclude);
  const remote = matchesTerm(location, "remote");
  if (!excluded && (matchesAny(text, r.regions) || (remote && matchesAny(text, r.remoteRegions)))) return { points: POINTS.locationRemote };
  if (!remote) return { points: 0 };
  // What's left once remote wording and punctuation are gone is a place: the job is remote there only.
  const rest = plain.replace(REMOTE_WORDS, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!rest && r.bareRemote && !excluded) return { points: POINTS.locationRemote };
  if (!rest) return { points: 0 };
  const known = allPlaceNames().find((p) => matchesTerm(rest, p));
  const where = known && placeOwnerName(known);
  return { points: 0, note: where ? `Remote, but only in ${where}: not one of your places.` : `Remote, but limited to "${rest.slice(0, 40)}": not one of your places.` };
}

/** Which gate a job fails (title is checked first), or undefined if it passes both. No scoring. */
export function gateOf(job: Pick<NormalizedJob, "title" | "location" | "workplace">, profile: Profile): "title" | "location" | undefined {
  if (!titlePasses(job.title, profile)) return "title";
  if (workplaceFit(job, profile)) return "location";
  return locationFit(gateLocation(job), profile).points ? undefined : "location";
}

/** Title-and-location gate only; cheap check before expensive detail calls. */
export function passesGates(job: Pick<NormalizedJob, "title" | "location" | "workplace">, profile: Profile): boolean {
  return gateOf(job, profile) === undefined;
}
