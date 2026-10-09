import type { NormalizedJob, Workplace } from "../schema";
import { htmlToText, inferWorkplace } from "../text";
import { detectAs, isoDate, joinParts } from "./parse";
import { jobId, salaryPeriod, type Connector } from "./types";

/** {company}.pinpointhq.com/postings.json: the careers site's public feed, descriptions included. */
export type PinpointPosting = {
  id: string;
  title: string;
  url: string;
  description?: string;
  key_responsibilities?: string;
  skills_knowledge_expertise?: string;
  benefits?: string;
  workplace_type?: string;
  compensation_visible?: boolean;
  compensation_minimum?: number | null;
  compensation_maximum?: number | null;
  compensation_currency?: string | null;
  compensation_frequency?: string | null;
  published_at?: string;
  job?: { department?: { name?: string } | null };
  location?: { city?: string; name?: string; province?: string } | null;
};

const WORKPLACE: Record<string, Workplace> = { remote: "remote", hybrid: "hybrid", onsite: "onsite" };

export const pinpoint: Connector<PinpointPosting> = {
  ats: "pinpoint",
  detect: detectAs("pinpoint"),

  async fetch(ref, { http }) {
    const data = await http.getJson<{ data?: PinpointPosting[] }>(`https://${ref.slug}.pinpointhq.com/postings.json`);
    if (!Array.isArray(data.data)) throw new Error("unexpected Pinpoint response: no data array");
    return data.data;
  },

  normalize(raw, ref): NormalizedJob {
    const l = raw.location ?? {};
    const workplace = WORKPLACE[raw.workplace_type ?? ""];
    // location.name is the location's label, usually the country or region.
    const location = joinParts(l.city, l.name, workplace === "remote" ? "Remote" : undefined);
    const paid = raw.compensation_visible && (raw.compensation_minimum || raw.compensation_maximum);
    return {
      id: jobId("pinpoint", ref.slug, raw.id),
      ats: "pinpoint",
      company: ref.name,
      title: raw.title.trim(),
      location,
      workplace: workplace ?? inferWorkplace(location),
      department: raw.job?.department?.name,
      salary: paid
        ? { min: raw.compensation_minimum ?? undefined, max: raw.compensation_maximum ?? undefined, currency: raw.compensation_currency ?? undefined, period: salaryPeriod(raw.compensation_frequency) }
        : undefined,
      postedAt: isoDate(raw.published_at),
      url: raw.url,
      description: [raw.description, raw.key_responsibilities, raw.skills_knowledge_expertise, raw.benefits].map(htmlToText).filter(Boolean).join("\n\n"),
    };
  },
};
