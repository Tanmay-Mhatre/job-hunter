import type { NormalizedJob } from "../schema";
import { htmlToText, inferWorkplace } from "../text";
import { detectAs, isoDate, jobPostingLd, joinParts } from "./parse";
import { jobId, type Connector } from "./types";

type BreezyPlace = { name?: string; city?: string; state?: { name?: string }; country?: { name?: string; id?: string }; is_remote?: boolean };

/** {company}.breezy.hr/json: the careers page's public feed (no descriptions). */
export type BreezyJob = {
  id: string;
  friendly_id?: string;
  name: string;
  url: string;
  published_date?: string;
  department?: string | null;
  location?: BreezyPlace;
  locations?: BreezyPlace[];
};

const place = (l: BreezyPlace) => joinParts(l.city, l.state?.name, l.country?.name) || l.name || "";

export const breezy: Connector<BreezyJob> = {
  ats: "breezy",
  detect: detectAs("breezy"),

  async fetch(ref, { http }) {
    const data = await http.getJson<BreezyJob[]>(`https://${ref.slug}.breezy.hr/json`);
    if (!Array.isArray(data)) throw new Error("unexpected Breezy response: not a list");
    return data;
  },

  normalize(raw, ref): NormalizedJob {
    const places = raw.locations?.length ? raw.locations : raw.location ? [raw.location] : [];
    const remote = places.some((l) => l.is_remote);
    const location = joinParts([...new Set(places.map(place).filter(Boolean))].join("; "), remote ? "Remote" : undefined);
    return {
      id: jobId("breezy", ref.slug, raw.id),
      ats: "breezy",
      company: ref.name,
      title: raw.name.trim(),
      location,
      country: places[0]?.country?.name,
      workplace: remote ? "remote" : inferWorkplace(location),
      department: raw.department ?? undefined,
      postedAt: isoDate(raw.published_date),
      url: raw.url,
      description: "",
    };
  },

  async describe(raw, _ref, { http }) {
    return htmlToText(jobPostingLd(await http.getText(raw.url))?.description);
  },
};
