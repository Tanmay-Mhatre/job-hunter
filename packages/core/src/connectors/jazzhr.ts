import type { NormalizedJob } from "../schema";
import { htmlToText, inferWorkplace } from "../text";
import { detectAs, inlineText, isoDate, jobPostingLd } from "./parse";
import { jobId, type Connector } from "./types";

/** A job from a JazzHR careers page ({company}.applytojob.com/apply), read from the page itself. */
export type JazzJob = { id: string; title: string; url: string; location: string; department?: string };

export function parseJazzPage(html: string, slug: string): JazzJob[] {
  const out = new Map<string, JazzJob>();
  for (const item of html.split(/<li class=["']list-group-item["']/).slice(1)) {
    const a = item.match(/<a href="(https?:\/\/[^"]+\/apply\/([A-Za-z0-9]+)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a || out.has(a[2]!)) continue;
    const field = (icon: string) => inlineText(item.match(new RegExp(`<i class=['"]fa fa-${icon}['"]></i>([\\s\\S]*?)</li>`))?.[1]);
    out.set(a[2]!, { id: a[2]!, title: inlineText(a[3]), url: a[1]!, location: field("map-marker"), department: field("sitemap") || undefined });
  }
  // Guard against links to other boards on the same page.
  return [...out.values()].filter((j) => j.url.includes(`${slug}.applytojob.com`));
}

export const jazzhr: Connector<JazzJob> = {
  ats: "jazzhr",
  detect: detectAs("jazzhr"),

  async fetch(ref, { http }) {
    const html = await http.getText(`https://${ref.slug}.applytojob.com/apply`);
    if (!/applytojob|resumator/i.test(html)) throw new Error("unexpected JazzHR response: not a careers page");
    return parseJazzPage(html, ref.slug);
  },

  normalize(raw, ref): NormalizedJob {
    return {
      id: jobId("jazzhr", ref.slug, raw.id),
      ats: "jazzhr",
      company: ref.name,
      title: raw.title,
      location: raw.location,
      workplace: inferWorkplace(raw.location),
      department: raw.department,
      url: raw.url,
      description: "",
    };
  },

  async describe(raw, _ref, { http }) {
    const html = await http.getText(raw.url);
    const ld = jobPostingLd(html);
    const body = ld?.description ?? html.match(/id="job-description"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)?.[1];
    return { description: htmlToText(body), postedAt: isoDate(ld?.datePosted) };
  },
};
