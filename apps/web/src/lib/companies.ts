import { companyKey } from "@jobhunter/core/detect";
import { rowId, type CompanyRow } from "./setup";

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

/** What the watchlist needs to know about a company, from any source (suggestion, directory, link). */
export type CompanyRef = { name: string; ats: string; slug: string; region?: string; shard?: string; site?: string; careers_url: string };

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
