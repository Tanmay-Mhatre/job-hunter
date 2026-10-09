import type { NormalizedJob } from "../schema";
import { htmlToText, inferWorkplace } from "../text";
import { detectAs, xmlBlocks, xmlOne } from "./parse";
import { jobId, type Connector } from "./types";

/** One <Job> of SAP SuccessFactors' public listing feed (career?…&resultType=XML), descriptions included. */
export type SuccessFactorsJob = {
  reqId: string;
  title: string;
  description: string;
  /** The company's own filters ("Location", "Country", "Department"…), label -> value. */
  filters: Record<string, string>;
};

export function parseSuccessFactors(xml: string): SuccessFactorsJob[] {
  return xmlBlocks(xml, "Job").map((j) => {
    const filters: Record<string, string> = {};
    for (const m of j.matchAll(/<(filter\d+)>([\s\S]*?)<\/\1>/g)) {
      const label = xmlOne(m[2]!, "label");
      const value = xmlOne(m[2]!, "value");
      if (label && value) filters[label] = value;
    }
    return { reqId: xmlOne(j, "ReqId"), title: xmlOne(j, "JobTitle"), description: xmlOne(j, "Job-Description"), filters };
  });
}

const pick = (f: Record<string, string>, re: RegExp) => Object.entries(f).find(([k]) => re.test(k))?.[1];

/** career{N}.successfactors.com / .eu: the data centre host, kept in `shard` (else read off the careers link). */
function host(ref: { shard?: string; careers_url?: string }): string {
  if (ref.shard) return ref.shard;
  try {
    const h = ref.careers_url ? new URL(ref.careers_url).hostname : "";
    if (/successfactors\.(com|eu)$|sapsf\.(com|eu)$/.test(h)) return h;
  } catch {
    // not a URL
  }
  return "career4.successfactors.com";
}

export const successfactors: Connector<SuccessFactorsJob> = {
  ats: "successfactors",
  detect: detectAs("successfactors"),

  async fetch(ref, { http }) {
    const xml = await http.getText(`https://${host(ref)}/career?company=${encodeURIComponent(ref.slug)}&career_ns=job_listing_summary&resultType=XML`);
    if (!/<Job-Listing/.test(xml)) throw new Error("unexpected SuccessFactors response: not a job listing feed");
    return parseSuccessFactors(xml);
  },

  normalize(raw, ref): NormalizedJob {
    const f = raw.filters;
    const location = [pick(f, /location|city|site|office/i), pick(f, /country/i)].filter(Boolean).join(", ");
    return {
      id: jobId("successfactors", ref.slug, raw.reqId),
      ats: "successfactors",
      company: ref.name,
      title: raw.title.trim(),
      location,
      country: pick(f, /country/i),
      workplace: inferWorkplace(`${location} ${pick(f, /remote|workplace/i) ?? ""}`),
      department: pick(f, /department|function|area|category/i),
      url: `https://${host(ref)}/career?company=${encodeURIComponent(ref.slug)}&career_ns=job_listing&career_job_req_id=${raw.reqId}`,
      description: htmlToText(raw.description),
    };
  },
};
