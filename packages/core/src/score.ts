import type { NormalizedJob, Profile, ScoreBreakdown } from "./schema";
import { matchesTerm } from "./text";

export const POINTS = {
  titleMatch: 20,
  seniority: 10,
  locationCity: 20,
  locationRemote: 15,
  keywordCap: 40,
  fresh3d: 10,
  fresh7d: 6,
  older: 2,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

type Scorable = Pick<NormalizedJob, "title" | "location" | "workplace" | "description" | "postedAt">;

/**
 * Transparent keyword scoring, 0..100. No AI.
 *
 * Gates: the title must match an include term and no exclude term, and the location must match
 * locations.include, or locations.remote_ok without hitting remote_exclude. Failing a gate scores 0.
 *
 * @param seenAt used for freshness when the ATS gives no posting date (first time we saw the job).
 */
export function scoreJob(job: Scorable, profile: Profile, now: Date, seenAt: Date = now): { score: number; why: ScoreBreakdown } {
  const title = job.title;
  const location = job.workplace === "remote" && !matchesTerm(job.location, "remote") ? `${job.location} remote` : job.location;

  const titleOk =
    profile.titles.include.some((t) => matchesTerm(title, t)) && !profile.titles.exclude.some((t) => matchesTerm(title, t));
  const titlePts = titleOk
    ? POINTS.titleMatch + (profile.seniority_boost.some((t) => matchesTerm(title, t)) ? POINTS.seniority : 0)
    : 0;

  let locationPts = 0;
  if (profile.locations.include.some((t) => matchesTerm(location, t))) {
    locationPts = POINTS.locationCity;
  } else if (
    profile.locations.remote_ok.some((t) => matchesTerm(location, t)) &&
    !profile.locations.remote_exclude.some((t) => matchesTerm(location, t))
  ) {
    locationPts = POINTS.locationRemote;
  }

  const haystack = `${title}\n${job.description ?? ""}`;
  const matched = Object.entries(profile.keywords)
    .filter(([k]) => matchesTerm(haystack, k))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const keywordPoints = Math.min(
    POINTS.keywordCap,
    matched.reduce((sum, [, w]) => sum + w, 0),
  );

  const posted = job.postedAt ? new Date(job.postedAt) : seenAt;
  const ageDays = Number.isNaN(posted.getTime()) ? Infinity : (now.getTime() - posted.getTime()) / DAY_MS;
  const freshness = ageDays <= 3 ? POINTS.fresh3d : ageDays <= 7 ? POINTS.fresh7d : POINTS.older;

  const why: ScoreBreakdown = {
    title: titlePts,
    location: locationPts,
    keywords: matched.map(([k]) => k),
    keywordPoints,
    freshness,
  };
  if (!titleOk) return { score: 0, why: { ...why, gate: "title" } };
  if (locationPts === 0) return { score: 0, why: { ...why, gate: "location" } };
  return { score: titlePts + locationPts + keywordPoints + freshness, why };
}

/** Title-and-location gate only; cheap check before expensive detail calls. */
export function passesGates(job: Pick<NormalizedJob, "title" | "location" | "workplace">, profile: Profile): boolean {
  return scoreJob({ ...job, description: "", postedAt: undefined }, profile, new Date()).why.gate === undefined;
}
