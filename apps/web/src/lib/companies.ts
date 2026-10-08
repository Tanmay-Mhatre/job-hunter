import { careersUrl, companyKey } from "@jobhunter/core/detect";
import { rowId, type CompanyRow, type Draft } from "./setup";

/** Hiring systems we can scan today. The rest are recognised and kept as "coming soon". */
export const SUPPORTED = new Set(["greenhouse", "lever", "ashby", "smartrecruiters"]);

export const ATS_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workday: "Workday",
  workable: "Workable",
  recruitee: "Recruitee",
  personio: "Personio",
  bamboohr: "BambooHR",
  breezy: "Breezy HR",
  successfactors: "SAP SuccessFactors",
  teamtailor: "Teamtailor",
  comeet: "Comeet",
  oracle: "Oracle Recruiting",
  icims: "iCIMS",
  taleo: "Taleo",
  jobvite: "Jobvite",
  pinpoint: "Pinpoint",
  rippling: "Rippling",
  jazzhr: "JazzHR",
  zoho: "Zoho Recruit",
  hibob: "HiBob",
  freshteam: "Freshteam",
};

/** Directory key for a watched company or a directory entry: "ats:slug" (Workday adds shard and site). */
export const keyOf = (c: { ats?: string; slug?: string; shard?: string; site?: string }) => companyKey({ ats: c.ats ?? "", slug: c.slug ?? "", shard: c.shard, site: c.site });

/** A job's company key: index jobs carry it; scanned job ids start with "ats:slug:". */
export const jobCompanyKey = (j: { id: string; companyKey?: string }) => j.companyKey ?? j.id.split(":").slice(0, 2).join(":").toLowerCase();

/** What the watchlist needs to know about a company, from any source (suggestion, directory, link). */
export type CompanyRef = { name: string; ats: string; slug: string; region?: string; shard?: string; site?: string; careers_url: string };

/**
 * The company behind a job, to add or mute it from the Radar. A directory job links to the careers
 * page already; a scanned one gets the board's address. (Workday jobs aren't scanned yet, so no shard/site.)
 */
export function refOfJob(j: { id: string; ats: string; company: string; url: string; companyKey?: string; estimated?: boolean }): CompanyRef {
  const key = jobCompanyKey(j);
  const slug = key.slice(key.indexOf(":") + 1);
  return { name: j.company, ats: j.ats, slug, careers_url: j.estimated ? j.url : careersUrl({ ats: j.ats as never, slug }) || j.url };
}

/** A directory entry as far as grouping needs it. */
type Board = { key: string; name: string; ats: string; status: string; open_jobs: number | null };

/** One company in search results: its best board first, then its other live boards. */
export type BoardGroup<T extends Board> = { lead: T; others: T[] };

/** "Gusto, Inc." and "gusto" are one company; "Binance.US" is not "Binance". */
const companyName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[,.]?\s+(inc|llc|ltd|limited|gmbh|corp|corporation|co)\.?$/, "")
    .replace(/[^\p{L}\p{N}]/gu, "");

const boardRank = (b: Board) => [b.status === "live" ? 2 : b.status === "dormant" ? 1 : 0, SUPPORTED.has(b.ats) ? 1 : 0, b.open_jobs ?? 0];
const better = (a: Board, b: Board) => {
  const [x, y] = [boardRank(a), boardRank(b)];
  return y[0]! - x[0]! || y[1]! - x[1]! || y[2]! - x[2]!;
};

/**
 * Many companies have boards on several hiring systems (Binance on Lever, Greenhouse, Ashby and
 * SmartRecruiters), often old ones left behind. Group boards by company name, keep the input order of
 * each group's first board, lead with the best (live, scannable, most jobs) and drop dead boards when a
 * live one exists. Boards in `keep` (ones you watch) are never dropped.
 */
export function groupBoards<T extends Board>(boards: readonly T[], keep: ReadonlySet<string> = new Set()): BoardGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const b of boards) {
    const k = companyName(b.name) || b.key;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  return [...groups.values()].map((list) => {
    const live = list.some((b) => b.status === "live");
    const [lead, ...others] = list.filter((b) => !live || b.status === "live" || keep.has(b.key)).sort(better);
    return { lead: lead!, others };
  });
}

export function toRow(c: CompanyRef): CompanyRow {
  return {
    id: rowId(),
    input: c.careers_url,
    state: SUPPORTED.has(c.ats) ? "saved" : "soon",
    name: c.name,
    ats: c.ats as CompanyRow["ats"],
    slug: c.slug,
    region: c.region as CompanyRow["region"],
    shard: c.shard,
    site: c.site,
  };
}

/** Add companies not in the draft yet (adding one also unhides it): the draft patch, and the keys actually added. */
export function addCompanies(draft: Pick<Draft, "companies" | "muted">, list: readonly CompanyRef[]): { patch: Partial<Draft> | null; keys: string[] } {
  const seen = new Set(draft.companies.map(keyOf));
  const rows = list.filter((c) => {
    const k = keyOf(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!rows.length) return { patch: null, keys: [] };
  const keys = new Set(rows.map(keyOf));
  return { patch: { companies: [...draft.companies, ...rows.map(toRow)], muted: draft.muted.filter((k) => !keys.has(k)) }, keys: [...keys] };
}
