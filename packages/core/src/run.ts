import { companyKey, getConnector } from "./connectors";
import { HttpClient, HttpError } from "./http";
import type { CompanyHealth, CompanyRef, Config, Job } from "./schema";
import { scoreJob } from "./score";

export type RunResult = {
  startedAt: string;
  finishedAt: string;
  /** Jobs listed in this run only (history is merged separately, see diff.ts). */
  jobs: Job[];
  health: CompanyHealth[];
  partial: boolean;
  /** Companies beyond yours checked live this run (see discover.ts). */
  checked: number;
};

/** Description fetches per company per run, for ATSs that need one request per job. */
const MAX_DESCRIBE_PER_COMPANY = 40;

export type RunOptions = {
  http?: HttpClient;
  now?: Date;
  /** Only run companies whose name or slug matches (case-insensitive). */
  only?: string[];
  /** Jobs from earlier runs; keeps firstSeen stable so freshness and "new" are right. */
  previous?: readonly Job[];
  /** Companies you haven't added, checked live too; only their jobs that pass your gates are kept. */
  checks?: readonly CompanyRef[];
  onCompanyDone?: (h: CompanyHealth) => void;
  /** Each company's health and the jobs kept from it, as soon as it's done (to save progress). */
  onCompanyResult?: (h: CompanyHealth, jobs: Job[]) => void;
  /** Keys ("ats:slug") of companies already fetched (a resumed scan): skipped. */
  skip?: ReadonlySet<string>;
  /** Stop starting new companies once this returns true (companies in flight finish). */
  stopped?: () => boolean;
};

/**
 * Companies are fetched one at a time per hiring system, and the hiring systems in parallel: each
 * site still gets at most one request per second (HttpClient's per-host spacing), but a scan of
 * many companies isn't held up by the slowest site.
 */
const laneOf = (c: CompanyRef) => `${c.ats}:${c.region ?? ""}:${c.ats === "workday" ? c.shard : ""}`;

/**
 * One pass over every enabled company (then any extra `checks`). A failing company never stops the
 * run; it is recorded in health instead. Health comes back in input order.
 */
export async function runRadar(config: Config, opts: RunOptions = {}): Promise<RunResult> {
  const http = opts.http ?? new HttpClient();
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const only = opts.only?.map((s) => s.toLowerCase());
  const companies = config.companies.filter(
    (c) => c.enabled && (!only?.length || only.includes(c.name.toLowerCase()) || only.includes(c.slug.toLowerCase())),
  );
  const previous = new Map((opts.previous ?? []).map((j) => [j.id, j]));
  const checks = opts.checks ?? [];

  const jobs: Job[] = [];
  const order = new Map<string, number>();
  const health: CompanyHealth[] = [];
  const todo = [...companies.map((c) => [c, false] as const), ...checks.map((c) => [c, true] as const)].filter(([c]) => !opts.skip?.has(companyKey(c)));
  todo.forEach(([c], i) => order.set(`${c.ats}:${c.slug}`, i));

  const fetchOne = async (company: CompanyRef, extra: boolean) => {
    const started = Date.now();
    const h: CompanyHealth = { company: company.name, ats: company.ats, slug: company.slug, ok: false, jobsFound: 0, matches: 0, durationMs: 0 };
    const kept: Job[] = [];
    const connector = getConnector(company.ats);
    try {
      if (!connector) {
        h.unsupported = true;
        throw new Error(`${company.ats} support is coming soon`);
      }
      const raws = await connector.fetch(company, { http, now });
      let described = 0;
      for (const raw of raws) {
        const base = connector.normalize(raw, company);
        const prev = previous.get(base.id);
        const firstSeen = prev?.firstSeen ?? nowIso;
        let { score, why } = scoreJob(base, config.profile, now, new Date(firstSeen));
        // Lists without descriptions: reuse the stored one, else fetch it for jobs that pass the gates.
        if (!why.gate && !base.description && connector.describe) {
          if (prev?.description) base.description = prev.description;
          else if (described < MAX_DESCRIBE_PER_COMPANY) {
            described++;
            base.description = await connector.describe(raw, company, { http, now }).catch(() => "");
          }
          ({ score, why } = scoreJob(base, config.profile, now, new Date(firstSeen)));
        }
        // Your companies keep every job (the Radar can show the rest); extra checks only matches.
        if (!extra || !why.gate) kept.push({ ...base, firstSeen, lastSeen: nowIso, status: "open", score, why });
        if (!why.gate) h.matches++;
      }
      h.jobsFound = raws.length;
      h.ok = true;
    } catch (err) {
      h.error =
        err instanceof HttpError && err.status === 404
          ? `board not found (404): check the slug "${company.slug}" against the careers URL`
          : (err as Error).message;
    }
    h.durationMs = Date.now() - started;
    jobs.push(...kept);
    health.push(h);
    opts.onCompanyDone?.(h);
    opts.onCompanyResult?.(h, kept);
  };

  // One lane per hiring system (yours first within each), all lanes at once.
  const lanes = new Map<string, (readonly [CompanyRef, boolean])[]>();
  for (const item of todo) lanes.set(laneOf(item[0]), [...(lanes.get(laneOf(item[0])) ?? []), item]);
  await Promise.all(
    [...lanes.values()].map(async (lane) => {
      for (const [company, extra] of lane) {
        if (opts.stopped?.()) return;
        await fetchOne(company, extra);
      }
    }),
  );
  health.sort((a, b) => (order.get(`${a.ats}:${a.slug}`) ?? 0) - (order.get(`${b.ats}:${b.slug}`) ?? 0));

  jobs.sort(byScore);
  return {
    startedAt: nowIso,
    finishedAt: new Date().toISOString(),
    jobs,
    health,
    partial: companies.length < config.companies.filter((c) => c.enabled).length || !!opts.stopped?.(),
    checked: checks.length,
  };
}

export function byScore(a: Job, b: Job): number {
  return b.score - a.score || (b.postedAt ?? b.firstSeen).localeCompare(a.postedAt ?? a.firstSeen);
}
