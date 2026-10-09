import type { HttpClient } from "../http";
import type { AtsType, CompanyRef, NormalizedJob } from "../schema";

export type Ctx = {
  http: HttpClient;
  now: Date;
};

/** What detect() can read off a careers URL. */
export type DetectedCompany = Pick<CompanyRef, "ats" | "slug" | "region" | "shard" | "site">;

/** One per ATS. Keep fetch() to the fewest requests possible: one per company where the feed allows it. */
export interface Connector<Raw = unknown> {
  ats: AtsType;
  /** Careers URL -> company reference, or null if the URL isn't this ATS. No network. */
  detect(url: URL): DetectedCompany | null;
  /** All currently published jobs for the company. Throws on failure. */
  fetch(ref: CompanyRef, ctx: Ctx): Promise<Raw[]>;
  normalize(raw: Raw, ref: CompanyRef): NormalizedJob;
  /**
   * For ATSs whose list has no descriptions: fetch one job's description. The run calls this
   * only for jobs that already pass the title/location gates, so keyword scoring stays cheap.
   */
  describe?(raw: Raw, ref: CompanyRef, ctx: Ctx): Promise<string | JobDetail>;
  /**
   * True when the list's location is only a placeholder ("3 Locations"): the run then asks
   * describe() for the real one before the location gate, for jobs whose title already matches.
   */
  vagueLocation?(raw: Raw): boolean;
}

/** What a job's own page adds to its list entry. */
export type JobDetail = Partial<Pick<NormalizedJob, "description" | "location" | "country" | "workplace" | "postedAt">>;

export function jobId(ats: AtsType, slug: string, atsJobId: string | number): string {
  return `${ats}:${slug.toLowerCase()}:${atsJobId}`;
}

/** First path segment of a URL, decoded; "" if none. */
export function firstPathSegment(url: URL): string {
  const seg = url.pathname.split("/").filter(Boolean)[0] ?? "";
  return decodeURIComponent(seg);
}

/** "1 YEAR", "per-year-salary", "yearly" -> "year". */
export function salaryPeriod(raw: string | null | undefined): string | undefined {
  const m = raw?.toLowerCase().match(/year|month|week|day|hour/);
  return m?.[0];
}
