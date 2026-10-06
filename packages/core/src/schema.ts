import { z } from "zod";

export const ATS_TYPES = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workday",
  "workable",
  "recruitee",
  "personio",
  "bamboohr",
  "breezy",
  // Recognised only (no connector yet): found by the careers-page resolver, saved as "coming soon".
  "successfactors",
  "teamtailor",
  "comeet",
  "oracle",
  "icims",
  "taleo",
  "jobvite",
  "pinpoint",
  "rippling",
  "jazzhr",
  "zoho",
  "hibob",
  "freshteam",
] as const;
export type AtsType = (typeof ATS_TYPES)[number];

export type Workplace = "onsite" | "hybrid" | "remote" | "unknown";

export type Salary = { min?: number; max?: number; currency?: string; period?: string };

/** Why a job got its score. Every number is the points awarded for that part. */
export type ScoreBreakdown = {
  title: number;
  location: number;
  keywords: string[];
  keywordPoints: number;
  freshness: number;
  /** Set when the job failed a gate and was scored 0. */
  gate?: "title" | "location";
  /** Why the location didn't fit, when it's worth saying (e.g. "Remote, but only in India…"). */
  locationNote?: string;
};

/** The one shape every connector produces. */
export type Job = {
  /** "{ats}:{slug}:{atsJobId}", stable across runs. */
  id: string;
  ats: AtsType;
  company: string;
  title: string;
  location: string;
  country?: string;
  workplace: Workplace;
  department?: string;
  salary?: Salary;
  /** From the ATS when available (ISO 8601). */
  postedAt?: string;
  /** Apply / job page on the company's own careers site. */
  url: string;
  /** Plain text, used for scoring. */
  description?: string;
  firstSeen: string;
  lastSeen: string;
  /** closed = missing from 2 successful runs of its company in a row (see diff.ts). */
  status: "open" | "closed";
  /** Successful runs of this company in a row that didn't list the job. */
  missedRuns?: number;
  closedAt?: string;
  score: number;
  why: ScoreBreakdown;
};

/** What a connector's normalize() returns; Job Hunter fills in the rest. */
export type NormalizedJob = Omit<Job, "firstSeen" | "lastSeen" | "status" | "missedRuns" | "closedAt" | "score" | "why">;

// ---------- run output (data/ files, read by the dashboard) ----------

export type CompanyHealth = {
  company: string;
  ats: AtsType;
  slug: string;
  ok: boolean;
  jobsFound: number;
  /** Jobs that passed the title and location gates. */
  matches: number;
  durationMs: number;
  error?: string;
  /** Recognised ATS whose connector isn't built yet; not a failure of the company. */
  unsupported?: boolean;
};

export type RunSummary = {
  startedAt: string;
  finishedAt: string;
  /** Run limited to some companies with --only. */
  partial: boolean;
  jobsFound: number;
  matches: number;
  /** Matches seen for the first time in this run. */
  newMatches: number;
  closed: number;
  health: CompanyHealth[];
};

/** data/jobs.json */
/** data/history.json: every job ever seen, as merge needs it (internal). */
export type JobsFile = { version: 1; generatedAt: string; jobs: Job[] };

/** A job as the dashboard gets it: no description (that's in descriptions.json), plus derived fields. */
export type DashboardJob = Omit<Job, "description" | "missedRuns"> & {
  /** Countries the location names ("United Arab Emirates"); empty when it names none. */
  countries: string[];
  /** Cities the location names, as "City, Country" ("Dubai, United Arab Emirates"). */
  cities: string[];
  seniority: "leadership" | "principal" | "senior" | "mid" | "entry";
  /** Same company + same title: postings of one role in several places share it. */
  group: string;
  /** A description is stored (descriptions.json). */
  hasDescription: boolean;
};

/** data/jobs.json (jobs that pass your filters) and data/jobs-other.json (the rest). */
export type DashboardJobsFile = { version: 2; generatedAt: string; jobs: DashboardJob[] };

/** data/meta.json */
export type DataMeta = {
  version: 1;
  generatedAt: string;
  profile: Profile;
  companies: { name: string; ats: AtsType; slug: string; enabled: boolean; careers_url?: string; /** Industry ids from the company directory. */ industries?: string[] }[];
  /** Newest first, capped. */
  runs: RunSummary[];
};

// ---------- config ----------

const term = z.string().trim().min(1);
const terms = z.array(term);

export const CompanySchema = z
  .object({
    name: z.string().trim().min(1),
    ats: z.enum(ATS_TYPES),
    /** Board token / site / company id, as it appears in the careers URL. Workday: the tenant. */
    slug: term,
    /** Lever and Greenhouse host region. */
    region: z.enum(["global", "eu"]).optional(),
    /** Workday only, e.g. "wd3". */
    shard: z.string().regex(/^wd\d+$/, 'shard looks like "wd1", "wd3", "wd5"...').optional(),
    /** Workday only, the career site name, e.g. "External". */
    site: term.optional(),
    /** Optional link to the public careers page, for your reference. */
    careers_url: z.url().optional(),
    enabled: z.boolean().default(true),
  })
  .superRefine((c, ctx) => {
    if (c.ats === "workday" && (!c.shard || !c.site)) {
      ctx.addIssue({
        code: "custom",
        message: `${c.name}: workday companies need "shard" (e.g. wd3) and "site" (e.g. External) from the careers URL`,
      });
    }
  });
export type CompanyRef = z.infer<typeof CompanySchema>;

export const ProfileSchema = z.object({
  name: z.string().default("My profile"),
  titles: z.object({
    include: terms.min(1, "add at least one title to titles.include"),
    exclude: terms.default([]),
  }),
  seniority_boost: terms.default([]),
  locations: z.object({
    include: terms.default([]),
    remote_ok: terms.default([]),
    /** Remote regions you can't work from, e.g. "us", "canada". Blocks a remote match, never a city match. */
    remote_exclude: terms.default([]),
  }),
  /** Industry ids you want to work in (see catalog/industries.ts); used to suggest companies. */
  industries: z.array(z.string().trim().toLowerCase().min(1)).default([]),
  /** keyword -> weight 1..5, matched as whole words in title + description. */
  keywords: z.record(term, z.number().int().min(1).max(5)).default({}),
  min_score: z.number().int().min(0).max(100).default(70),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ConfigSchema = z
  .object({
    profile: ProfileSchema,
    /** Empty is allowed: setup saves your profile first, companies are added afterwards. */
    companies: z.array(CompanySchema).default([]),
    alerts: z
      .object({
        telegram: z.boolean().default(false),
        email: z.boolean().default(false),
        only_new: z.boolean().default(true),
      })
      .prefault({}),
    /** The shared company directory: keep the local copy fresh, and share companies you add. */
    directory: z
      .object({
        auto_update: z.boolean().default(true),
        share_additions: z.boolean().default(true),
      })
      .prefault({}),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    cfg.companies.forEach((c, i) => {
      const key = `${c.ats}:${c.slug.toLowerCase()}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", path: ["companies", i], message: `duplicate company ${key}` });
      }
      seen.add(key);
    });
  });
export type Config = z.infer<typeof ConfigSchema>;
