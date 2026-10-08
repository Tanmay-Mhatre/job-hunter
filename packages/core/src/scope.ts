import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { companyKey, connectors } from "./connectors";
import { companyWords } from "./employers";
import type { CompanyHealth, CompanyRef, Config } from "./schema";
import type { DirectoryCompany } from "./suggest";

/**
 * What a scan fetches, besides your own companies (always all of them):
 *   mine: directory companies in your industries
 *   all:  every company in the directory we can read
 * The directory is only the list of companies and their boards; the jobs are always fetched live.
 */
export type ScanScope = "mine" | "all";
export const SCAN_SCOPES: readonly ScanScope[] = ["mine", "all"];

export type DirectoryEntry = DirectoryCompany & { indexed?: boolean; status?: string; origin?: "user" };

/** The local directory copy plus companies added by link (empty when not downloaded yet). */
export function readDirectory(dataDir: string): DirectoryEntry[] {
  const read = (name: string): DirectoryEntry[] => {
    const file = join(dataDir, "catalog", name);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { companies: DirectoryEntry[] }).companies : [];
  };
  const dir = read("directory.json");
  const known = new Set(dir.map((c) => c.key));
  return [...dir, ...read("additions.json").filter((c) => !known.has(c.key)).map((c) => ({ ...c, origin: "user" as const }))];
}

const nameKey = (name: string) => companyWords(name).join(" ");
const readable = (c: { ats: string }) => !!connectors[c.ats as CompanyRef["ats"]];

/** A directory board as a company to fetch. */
export function refOfEntry(c: DirectoryEntry): CompanyRef {
  return {
    name: c.name,
    ats: c.ats as CompanyRef["ats"],
    slug: c.slug,
    ...(c.region ? { region: c.region as CompanyRef["region"] } : {}),
    ...(c.shard ? { shard: c.shard, site: c.site } : {}),
    ...(c.careers_url ? { careers_url: c.careers_url } : {}),
    enabled: true,
  };
}

/**
 * The directory companies a scan fetches beyond yours: live boards on hiring systems we can read,
 * not muted, not one of yours (by board or by name), one board per company (the one with most jobs).
 */
export function scopeCompanies(config: Config, directory: readonly DirectoryEntry[], scope: ScanScope): CompanyRef[] {
  const yours = new Set(config.companies.map(companyKey));
  const yourNames = new Set(config.companies.map((c) => nameKey(c.name)));
  const muted = new Set(config.companies_muted);
  const wanted = new Set(config.profile.industries);
  const best = new Map<string, DirectoryEntry>();
  for (const c of directory) {
    if (c.status !== "live" || !readable(c) || muted.has(c.key) || yours.has(c.key)) continue;
    if (scope === "mine" && !c.tags?.some((t) => wanted.has(t))) continue;
    const name = nameKey(c.name) || c.key;
    if (yourNames.has(name)) continue;
    const prev = best.get(name);
    if (!prev || (c.open_jobs ?? 0) > (prev.open_jobs ?? 0)) best.set(name, c);
  }
  return [...best.values()].sort((a, b) => (b.open_jobs ?? 0) - (a.open_jobs ?? 0)).map(refOfEntry);
}

/** About how long a scan of these companies takes: hiring systems run in parallel, ~1.1 s per company each. */
export function estimateSeconds(companies: readonly Pick<CompanyRef, "ats" | "region">[]): number {
  const lanes = new Map<string, number>();
  for (const c of companies) lanes.set(`${c.ats}:${c.region ?? ""}`, (lanes.get(`${c.ats}:${c.region ?? ""}`) ?? 0) + 1);
  return Math.ceil(Math.max(0, ...lanes.values()) * 1.1);
}

export type BoardMove = { name: string; from: CompanyRef; to: CompanyRef };

/**
 * Your companies whose board is gone (404 this scan) but which the directory knows on another live
 * board we can read: the company moved hiring system or renamed its board.
 */
export function findMoves(config: Config, directory: readonly DirectoryEntry[], health: readonly CompanyHealth[]): BoardMove[] {
  const gone = new Set(health.filter((h) => !h.ok && /\(404\)/.test(h.error ?? "")).map((h) => `${h.ats}:${h.slug}`.toLowerCase()));
  const yours = new Set(config.companies.map(companyKey));
  const moves: BoardMove[] = [];
  for (const c of config.companies) {
    if (!gone.has(`${c.ats}:${c.slug}`.toLowerCase())) continue;
    const name = nameKey(c.name);
    const to = directory
      .filter((d) => nameKey(d.name) === name && d.status === "live" && readable(d) && !yours.has(d.key))
      .sort((a, b) => (b.open_jobs ?? 0) - (a.open_jobs ?? 0))[0];
    if (to) moves.push({ name: c.name, from: c, to: { ...refOfEntry(to), name: c.name } });
  }
  return moves;
}
