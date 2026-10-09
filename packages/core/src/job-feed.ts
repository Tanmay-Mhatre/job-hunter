import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { envSetting } from "./env";
import { gateOf } from "./score";
import type { Profile, Workplace } from "./schema";

/**
 * The shared job feed: every live directory board's open jobs, fetched once a day for everyone
 * (scripts/catalog/jobs.ts, the "Jobs · daily feed" workflow) and published as one gzipped shard per
 * hiring system. A scan uses it only to choose which directory companies to fetch live: a company
 * whose jobs yesterday had nothing for you is skipped, one that had is fetched live, so every job
 * shown is still checked live. Nothing about the user is sent anywhere; filtering happens here.
 */
export const DEFAULT_JOB_FEED_URL = "https://github.com/Tanmay-Mhatre/job-hunter-directory/releases/download/jobs";
export const jobFeedUrl = () => (envSetting("JOBS_URL") ?? DEFAULT_JOB_FEED_URL).replace(/\/$/, "");

/** Format version: clients ignore a feed whose schema they don't know. */
export const JOB_FEED_SCHEMA = 1;
/** A company's feed entry older than this doesn't count: the scan fetches it live. */
export const FEED_MAX_AGE_DAYS = 3;

/** [ats job id, title, location, workplace, posted date (YYYY-MM-DD) or null] */
export type FeedRow = [string, string, string, Workplace, string | null];

export type JobFeedShard = {
  schema: number;
  ats: string;
  generated_at: string;
  /** By jobCompanyKey() ("greenhouse:acme", "workday:tenant|site"). */
  companies: Record<string, { fetched_at: string; jobs: FeedRow[] }>;
};

export type JobFeedManifest = {
  schema: number;
  generated_at: string;
  shards: Record<string, { file: string; sha256: string; bytes: number; companies: number; jobs: number }>;
};

const feedDir = (dataDir: string) => join(dataDir, "catalog", "jobs");
const readJson = <T>(path: string): T | undefined => {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined;
  } catch {
    return undefined;
  }
};

export type JobFeedStatus = { generated_at?: string; ageDays: number; companies: number };

export function jobFeedStatus(dataDir: string, now = Date.now()): JobFeedStatus {
  const m = readJson<JobFeedManifest>(join(feedDir(dataDir), "manifest.json"));
  const companies = Object.values(m?.shards ?? {}).reduce((n, s) => n + s.companies, 0);
  return { generated_at: m?.generated_at, ageDays: m ? (now - Date.parse(m.generated_at)) / 86_400_000 : Infinity, companies };
}

export type FeedSyncResult = { updated: boolean; message: string; ageDays: number };

/**
 * Download the shards that changed since the local copy (checked against the manifest's SHA-256).
 * Never throws: without the feed, scans fetch every company live as before.
 */
export async function syncJobFeed(dataDir: string, opts: { fetchImpl?: typeof fetch; now?: number } = {}): Promise<FeedSyncResult> {
  const get = opts.fetchImpl ?? fetch;
  const dir = feedDir(dataDir);
  const stale = () => jobFeedStatus(dataDir, opts.now).ageDays;
  try {
    const res = await get(`${jobFeedUrl()}/jobs-manifest.json`, { headers: { accept: "application/json" }, redirect: "follow" });
    if (!res.ok) return { updated: false, ageDays: stale(), message: `Job feed unavailable (HTTP ${res.status}); scanning every company live.` };
    const manifest = (await res.json()) as JobFeedManifest;
    if (manifest.schema !== JOB_FEED_SCHEMA) return { updated: false, ageDays: stale(), message: "The job feed has a newer format than this app; update the app to use it." };
    const local = readJson<JobFeedManifest>(join(dir, "manifest.json"));
    mkdirSync(dir, { recursive: true });
    let fetched = 0;
    for (const [ats, shard] of Object.entries(manifest.shards)) {
      if (local?.shards[ats]?.sha256 === shard.sha256 && existsSync(join(dir, `${ats}.json`))) continue;
      const r = await get(`${jobFeedUrl()}/${shard.file}`, { redirect: "follow" });
      if (!r.ok) return { updated: fetched > 0, ageDays: stale(), message: `Job feed download of ${shard.file} failed (HTTP ${r.status}).` };
      const gz = Buffer.from(await r.arrayBuffer());
      if (createHash("sha256").update(gz).digest("hex") !== shard.sha256) return { updated: fetched > 0, ageDays: stale(), message: `${shard.file} didn't match its checksum; kept the old copy.` };
      writeFileSync(join(dir, `${ats}.json.tmp`), gunzipSync(gz));
      renameSync(join(dir, `${ats}.json.tmp`), join(dir, `${ats}.json`));
      fetched++;
    }
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    const age = stale();
    const when = age < 1 ? "today" : `${Math.round(age)} day(s) old`;
    return { updated: fetched > 0, ageDays: age, message: fetched ? `Job feed updated (${when}).` : `Job feed is up to date (${when}).` };
  } catch (err) {
    return { updated: false, ageDays: stale(), message: `Couldn't reach the job feed (${(err as Error).message}); scanning every company live.` };
  }
}

/** "3 Locations": the list doesn't say where, so only the title can rule the job out. */
const VAGUE_LOCATION = /^\s*(\d+\s+locations?|multiple locations?|various)?\s*$/i;

export type FeedMatches = {
  /** Companies with a fresh feed entry: their jobs are known as of the feed. */
  covered: Set<string>;
  /** Covered companies with at least one job that passes your title and location filters. */
  matching: Set<string>;
};

/** Which directory companies the feed can rule out for this profile. Empty sets without a feed. */
export function feedMatches(dataDir: string, profile: Profile, now = Date.now(), maxAgeDays = FEED_MAX_AGE_DAYS): FeedMatches {
  const covered = new Set<string>();
  const matching = new Set<string>();
  const manifest = readJson<JobFeedManifest>(join(feedDir(dataDir), "manifest.json"));
  if (manifest?.schema !== JOB_FEED_SCHEMA) return { covered, matching };
  const cutoff = now - maxAgeDays * 86_400_000;
  for (const ats of Object.keys(manifest.shards)) {
    const shard = readJson<JobFeedShard>(join(feedDir(dataDir), `${ats}.json`));
    if (shard?.schema !== JOB_FEED_SCHEMA) continue;
    for (const [key, entry] of Object.entries(shard.companies)) {
      if (Date.parse(entry.fetched_at) < cutoff) continue;
      covered.add(key);
      const hit = entry.jobs.some(([, title, location, workplace]) => {
        const gate = gateOf({ title, location, workplace }, profile);
        return gate === undefined || (gate === "location" && VAGUE_LOCATION.test(location));
      });
      if (hit) matching.add(key);
    }
  }
  return { covered, matching };
}
