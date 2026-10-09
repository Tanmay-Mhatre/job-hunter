import type { NormalizedJob, Workplace } from "../schema";
import { htmlToText, inferWorkplace } from "../text";
import { detectAs, isoDate, joinParts, xmlBlocks, xmlOne } from "./parse";
import { jobId, type Connector } from "./types";

/** One <item> of {company}.teamtailor.com/jobs.rss, the careers site's public feed (descriptions included). */
export type TeamtailorItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
  remoteStatus: string;
  department: string;
  locations: { city: string; country: string; name: string }[];
};

export function parseTeamtailor(xml: string): TeamtailorItem[] {
  return xmlBlocks(xml, "item").map((i) => ({
    guid: xmlOne(i, "guid"),
    title: xmlOne(i, "title"),
    link: xmlOne(i, "link"),
    pubDate: xmlOne(i, "pubDate"),
    description: xmlOne(i, "description"),
    remoteStatus: xmlOne(i, "remoteStatus"),
    department: xmlOne(i, "tt:department"),
    locations: xmlBlocks(i, "tt:location").map((l) => ({ city: xmlOne(l, "tt:city"), country: xmlOne(l, "tt:country"), name: xmlOne(l, "tt:name") })),
  }));
}

/** remoteStatus: "none" (on-site), "hybrid", "temporary" or "fully" (remote). */
const WORKPLACE: Record<string, Workplace> = { none: "onsite", hybrid: "hybrid", fully: "remote", temporary: "remote" };

export const teamtailor: Connector<TeamtailorItem> = {
  ats: "teamtailor",
  detect: detectAs("teamtailor"),

  async fetch(ref, { http }) {
    const xml = await http.getText(`https://${ref.slug}.teamtailor.com/jobs.rss`);
    if (!/<rss[\s>]/.test(xml)) throw new Error("unexpected Teamtailor response: not an RSS feed");
    return parseTeamtailor(xml);
  },

  normalize(raw, ref): NormalizedJob {
    const workplace = WORKPLACE[raw.remoteStatus];
    const places = [...new Set(raw.locations.map((l) => joinParts(l.city || l.name, l.country)).filter(Boolean))].join("; ");
    const location = joinParts(places, workplace === "remote" ? "Remote" : undefined);
    return {
      id: jobId("teamtailor", ref.slug, raw.guid || raw.link),
      ats: "teamtailor",
      company: ref.name,
      title: raw.title.trim(),
      location,
      country: raw.locations[0]?.country || undefined,
      workplace: workplace ?? inferWorkplace(location),
      department: raw.department || undefined,
      postedAt: isoDate(raw.pubDate),
      url: raw.link,
      description: htmlToText(raw.description),
    };
  },
};
