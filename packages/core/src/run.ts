import { getConnector } from "./connectors";
import { HttpClient, HttpError } from "./http";
import type { CompanyHealth, Config, Job } from "./schema";
import { scoreJob } from "./score";

export type RunResult = {
  startedAt: string;
  finishedAt: string;
  /** Jobs listed in this run only (history is merged separately, see diff.ts). */
  jobs: Job[];
  health: CompanyHealth[];
  partial: boolean;
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
  onCompanyDone?: (h: CompanyHealth) => void;
};

/**
 * One pass over every enabled company, one company at a time.
 * A failing company never stops the run; it is recorded in health instead.
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

  const jobs: Job[] = [];
  const health: CompanyHealth[] = [];

  for (const company of companies) {
    const started = Date.now();
    const h: CompanyHealth = { company: company.name, ats: company.ats, slug: company.slug, ok: false, jobsFound: 0, matches: 0, durationMs: 0 };
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
        jobs.push({ ...base, firstSeen, lastSeen: nowIso, status: "open", score, why });
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
    health.push(h);
    opts.onCompanyDone?.(h);
  }

  jobs.sort(byScore);
  return { startedAt: nowIso, finishedAt: new Date().toISOString(), jobs, health, partial: companies.length < config.companies.filter((c) => c.enabled).length };
}

export function byScore(a: Job, b: Job): number {
  return b.score - a.score || (b.postedAt ?? b.firstSeen).localeCompare(a.postedAt ?? a.firstSeen);
}
