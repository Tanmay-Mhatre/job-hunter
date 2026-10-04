import type { Job } from "./schema";

export type NoMatchDiagnosis = {
  /** Open jobs looked at. */
  scanned: number;
  matched: number;
  /** Title didn't match your roles. */
  titleMiss: number;
  /** Title matched, but the location didn't. */
  locationMiss: number;
  /** Right title, wrong place: the most common locations, to suggest adding. */
  nearMissLocations: { location: string; count: number }[];
  /** Right place, wrong title: sample titles, to suggest widening your roles. */
  nearMissTitles: string[];
};

/** Why a scan found few or no matches, in numbers the dashboard can explain. Pure. */
export function diagnoseNoMatches(jobs: readonly Job[], limit = 5): NoMatchDiagnosis {
  const open = jobs.filter((j) => j.status === "open");
  const titleMiss = open.filter((j) => j.why.gate === "title");
  const locationMiss = open.filter((j) => j.why.gate === "location");

  const byLocation = new Map<string, number>();
  for (const j of locationMiss) {
    const loc = (j.location || "Not listed").trim();
    byLocation.set(loc, (byLocation.get(loc) ?? 0) + 1);
  }
  const nearMissLocations = [...byLocation]
    .map(([location, count]) => ({ location, count }))
    .sort((a, b) => b.count - a.count || a.location.localeCompare(b.location))
    .slice(0, limit);

  // Title misses that would have passed the location gate (location points were awarded).
  const seen = new Set<string>();
  const nearMissTitles: string[] = [];
  for (const j of titleMiss) {
    if (j.why.location === 0 || seen.has(j.title.toLowerCase())) continue;
    seen.add(j.title.toLowerCase());
    nearMissTitles.push(j.title);
    if (nearMissTitles.length >= limit) break;
  }

  return {
    scanned: open.length,
    matched: open.filter((j) => !j.why.gate).length,
    titleMiss: titleMiss.length,
    locationMiss: locationMiss.length,
    nearMissLocations,
    nearMissTitles,
  };
}
