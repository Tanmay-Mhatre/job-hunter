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
  for (const c of Object.values(connectors)) {
    const found = c?.detect(url);
    if (found) return { name: guessName(found.slug), ...found, supported: true };
  }
  const known = detectKnownAts(url);
  return known ? { name: guessName(known.slug), ...known, supported: false } : null;
}

export function guessName(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

export type { Connector, Ctx, DetectedCompany } from "./types";
