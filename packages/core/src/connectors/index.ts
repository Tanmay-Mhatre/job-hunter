import type { AtsType, CompanyRef } from "../schema";
import { ashby } from "./ashby";
import { detectKnownAts } from "./detect-known";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { smartrecruiters } from "./smartrecruiters";
import type { Connector, DetectedCompany } from "./types";

/** Connectors shipped so far. The rest of ATS_TYPES arrive in phases 1 and 3. */
export const connectors: Partial<Record<AtsType, Connector<any>>> = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
};

export function getConnector(ats: AtsType): Connector<unknown> | undefined {
  return connectors[ats];
}

export type DetectResult = DetectedCompany & Pick<CompanyRef, "name"> & { /** false = recognised, connector not built yet */ supported: boolean };

/** Careers URL -> company line. Name is a guess from the slug; edit it. */
export function detectCompany(input: string): DetectResult | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  // Detection decodes URL parts; a malformed escape ("%E0%A4%A") just means "not a board".
  try {
    for (const c of Object.values(connectors)) {
      const found = c?.detect(url);
      if (found) return { name: guessName(found.slug), ...found, supported: true };
    }
  } catch {
    return null;
  }
  let known: DetectedCompany | null;
  try {
    known = detectKnownAts(url);
  } catch {
    return null;
  }
  return known ? { name: guessName(known.site && known.ats === "comeet" ? known.site : known.slug), ...known, supported: false } : null;
}

/**
 * Name from a board slug: "kraken.com" -> "Kraken", "acme-labs" -> "Acme Labs",
 * "AcmeLabs" -> "Acme Labs". Joined lowercase words ("dollartree") can't be split without a dictionary.
 */
export function guessName(slug: string): string {
  return slug
    .replace(/\.(com|io|ai|co|net|org|xyz|app|dev|tech)$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+\d+$/, "")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** The public careers page for a board (the same address the company directory uses), or "" when it can't be rebuilt from the slug. */
export function careersUrl(c: DetectedCompany): string {
  switch (c.ats) {
    case "greenhouse":
      return `https://job-boards${c.region === "eu" ? ".eu" : ""}.greenhouse.io/${c.slug}`;
    case "lever":
      return `https://jobs${c.region === "eu" ? ".eu" : ""}.lever.co/${c.slug}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${c.slug}`;
    case "smartrecruiters":
      return `https://careers.smartrecruiters.com/${c.slug}`;
    case "workday":
      return `https://${c.slug}.${c.shard}.myworkdayjobs.com/${c.site ?? ""}`;
    case "workable":
      return `https://apply.workable.com/${c.slug}`;
    case "teamtailor":
      return `https://${c.slug}.teamtailor.com/jobs`;
    case "comeet":
      return c.site ? `https://www.comeet.com/jobs/${c.site}/${c.slug}` : "";
    case "recruitee":
      return `https://${c.slug}.recruitee.com`;
    case "bamboohr":
      return `https://${c.slug}.bamboohr.com/careers`;
    case "breezy":
      return `https://${c.slug}.breezy.hr`;
    case "pinpoint":
      return `https://${c.slug}.pinpointhq.com`;
    case "jobvite":
      return `https://jobs.jobvite.com/${c.slug}`;
    case "rippling":
      return `https://ats.rippling.com/${c.slug}/jobs`;
    default:
      // Hosts we can't rebuild from the slug (SuccessFactors, Oracle, iCIMS…): keep the link we were given.
      return "";
  }
}

/** Company directory key: "ats:slug", or "workday:tenant|shard|site". Lowercase. */
export function companyKey(c: { ats: string; slug: string; shard?: string; site?: string }): string {
  return (c.ats === "workday" ? `workday:${c.slug}|${c.shard}|${c.site}` : `${c.ats}:${c.slug}`).toLowerCase();
}

export type { Connector, Ctx, DetectedCompany } from "./types";
