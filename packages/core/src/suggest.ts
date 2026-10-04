import { COUNTRIES, countryTerms } from "./catalog/places";
import type { Profile } from "./schema";
import { scoreJob } from "./score";
import { matchesTerm } from "./text";

/** [title, location, workplace, ageDays, count] — one merged row per (title, location). */
export type IndexRow = [string, string, string, number | null, number];

export type IndexedCompany = {
  key: string;
  name: string;
  ats: string;
  slug: string;
  careers_url: string;
  open_jobs: number;
  rows: IndexRow[];
  /** Topic word -> share of the company's jobs mentioning it (only when descriptions were indexed). */
  terms?: Record<string, number>;
  tier?: "curated" | "dump";
};

export type CompanySuggestion = {
  key: string;
  name: string;
  ats: string;
  slug: string;
  careers_url: string;
  open_jobs: number;
  tier?: string;
  score: number;
  /** Open jobs that pass the user's title and location filters. */
  matches: number;
  /** Matches posted in the last 7 days. */
  new_matches: number;
  /** Right title, nearby place (same region) or remote: worth watching. */
  near_misses: number;
  /** Up to 3 "Title (Location)" examples of matching jobs (or near misses). */
  examples: string[];
  topics: string[];
  reasons: string[];
};

const GCC = ["united arab emirates", "saudi arabia", "qatar", "bahrain", "kuwait", "oman"];
const gccTerms = GCC.flatMap((n) => countryTerms(COUNTRIES.find((c) => c.name === n)!, true)).filter((t) => t !== "emirates");
const BIG_COMPANY_JOBS = 300;

/** If the user targets a GCC place, other GCC places count as "near". Otherwise only remote does. */
function nearRegionTerms(profile: Profile): string[] {
  const targetsGcc = profile.locations.include.some((p) => gccTerms.includes(p));
  return targetsGcc ? gccTerms : [];
}

/**
 * Rank companies for a user, no AI: mainly by how many of their open jobs pass the user's own
 * gates now (log-scaled so huge employers don't win on volume), then match quality, topic
 * overlap and near misses. Missing components are dropped and the rest rescaled to 0–100.
 */
export function suggestCompanies(
  profile: Profile,
  companies: readonly IndexedCompany[],
  opts: { exclude?: ReadonlySet<string>; limit?: number; now?: Date } = {},
): { hiringNow: CompanySuggestion[]; worthWatching: CompanySuggestion[]; scanned: number } {
  const now = opts.now ?? new Date();
  const near = nearRegionTerms(profile);
  const topWeights = Object.values(profile.keywords)
    .sort((a, b) => b - a)
    .slice(0, 5)
    .reduce((s, w) => s + w, 0);

  const out: CompanySuggestion[] = [];
  for (const c of companies) {
    if (opts.exclude?.has(c.key)) continue;
    let matches = 0;
    let fresh = 0;
    let nearMisses = 0;
    const scores: number[] = [];
    const examples: string[] = [];
    const nearExamples: string[] = [];
    for (const [title, location, workplace, age, count] of c.rows) {
      const postedAt = age === null ? undefined : new Date(now.getTime() - age * 86_400_000).toISOString();
      const r = scoreJob({ title, location, workplace: workplace as never, description: "", postedAt }, profile, now);
      if (!r.why.gate) {
        matches += count;
        if (age !== null && age <= 7) fresh += count;
        scores.push(r.score);
        if (examples.length < 3) examples.push(location ? `${title} (${location})` : title);
      } else if (r.why.gate === "location" && (workplace === "remote" || near.some((t) => matchesTerm(location, t)))) {
        nearMisses += count;
        if (nearExamples.length < 3) nearExamples.push(location ? `${title} (${location})` : title);
      }
    }

    const topics = Object.entries(profile.keywords)
      .filter(([k]) => (c.terms?.[k] ?? 0) > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
    const topicWeight = topics.reduce((s, k) => s + (profile.keywords[k] ?? 0), 0);

    // Components and their maximum points; topics only count when this company has topic data.
    const parts: [number, number][] = [
      [50 * Math.min(1, Math.log2(1 + matches) / Math.log2(6)), 50],
      [0.2 * (scores.sort((a, b) => b - a).slice(0, 3).reduce((s, x) => s + x, 0) / Math.max(1, Math.min(3, scores.length))), 20],
      [10 * Math.min(1, nearMisses / 3), 10],
    ];
    if (c.terms && topWeights > 0) parts.push([20 * Math.min(1, topicWeight / topWeights), 20]);
    const got = parts.reduce((s, [p]) => s + p, 0);
    const max = parts.reduce((s, [, m]) => s + m, 0);
    const score = Math.round((got / max) * 100);
    if (!matches && !nearMisses && !topics.length) continue;

    const reasons: string[] = [];
    if (matches) reasons.push(`${matches} open role${matches === 1 ? "" : "s"} match you`);
    if (fresh) reasons.push(`${fresh} new this week`);
    if (!matches && nearMisses) reasons.push(`${nearMisses} similar role${nearMisses === 1 ? "" : "s"} nearby or remote`);
    if (topics.length) reasons.push(`Your topics: ${topics.slice(0, 3).join(", ")}`);

    out.push({
      key: c.key,
      name: c.name,
      ats: c.ats,
      slug: c.slug,
      careers_url: c.careers_url,
      open_jobs: c.open_jobs,
      tier: c.tier,
      score,
      matches,
      new_matches: fresh,
      near_misses: nearMisses,
      examples: matches ? examples : nearExamples,
      topics,
      reasons,
    });
  }

  const limit = opts.limit ?? 30;
  const hiring = rerankForDiversity(out.filter((s) => s.matches > 0).sort(bySuggestion)).slice(0, limit);
  const watching = out
    .filter((s) => s.matches === 0)
    .sort(bySuggestion)
    .slice(0, Math.ceil(limit / 2));
  return { hiringNow: hiring, worthWatching: watching, scanned: companies.length };
}

function bySuggestion(a: CompanySuggestion, b: CompanySuggestion): number {
  // Hand-reviewed companies win ties; then the bigger matching count.
  return b.score - a.score || Number(b.tier === "curated") - Number(a.tier === "curated") || b.matches - a.matches || a.name.localeCompare(b.name);
}

/** At most 3 very large employers in any 12 consecutive results, so the list isn't all giants. */
function rerankForDiversity(list: CompanySuggestion[]): CompanySuggestion[] {
  const out: CompanySuggestion[] = [];
  const deferred: CompanySuggestion[] = [];
  for (const s of list) {
    const window = out.slice(-11);
    if (s.open_jobs > BIG_COMPANY_JOBS && window.filter((x) => x.open_jobs > BIG_COMPANY_JOBS).length >= 3) deferred.push(s);
    else out.push(s);
  }
  return [...out, ...deferred];
}
