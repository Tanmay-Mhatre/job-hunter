import { firstPathSegment, type DetectedCompany } from "./types";

/**
 * Careers URLs of ATSs we recognise but don't fetch yet. Detecting them lets setup say
 * "supported soon" and save a config line that starts working once the connector ships.
 */
export function detectKnownAts(url: URL): DetectedCompany | null {
  const host = url.hostname.toLowerCase();
  const sub = host.split(".")[0] ?? "";
  const seg = firstPathSegment(url);

  // {tenant}.wd{N}.myworkdayjobs.com/[en-US/]{site}
  const wd = host.match(/^([^.]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (wd) {
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    // The jobs API: /wday/cxs/{tenant}/{site}/jobs
    if (parts[0] === "wday" && parts[1] === "cxs") return parts[3] ? { ats: "workday", slug: wd[1]!, shard: wd[2]!, site: parts[3] } : null;
    const site = parts.find((p) => !/^[a-z]{2}(-[A-Z]{2})?$/.test(p)) ?? undefined;
    return { ats: "workday", slug: wd[1]!, shard: wd[2]!, site };
  }
  if (host === "apply.workable.com" && seg && seg !== "api") return { ats: "workable", slug: seg };
  if (host.endsWith(".workable.com") && sub && !["www", "apply", "jobs"].includes(sub)) return { ats: "workable", slug: sub };
  if (host.endsWith(".recruitee.com") && sub && sub !== "www") return { ats: "recruitee", slug: sub };
  if (/\.jobs\.personio\.(de|com)$/.test(host)) return { ats: "personio", slug: sub };
  if (host.endsWith(".bamboohr.com") && sub && sub !== "www") return { ats: "bamboohr", slug: sub };
  if (host.endsWith(".breezy.hr") && sub && sub !== "app") return { ats: "breezy", slug: sub };

  // Found by the careers-page resolver (scripts/catalog/resolve.ts); recognised, not fetched yet.
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  // SAP SuccessFactors: career{N}.successfactors.com/career?company=acme (also .eu / sapsf.com hosts)
  if (/(^|\.)successfactors\.(com|eu)$|(^|\.)sapsf\.(com|eu)$/.test(host)) {
    const company = url.searchParams.get("company");
    return company ? { ats: "successfactors", slug: company } : null;
  }
  if (host.endsWith(".teamtailor.com") && sub && !["www", "app", "career", "api"].includes(sub)) return { ats: "teamtailor", slug: sub };
  // Comeet: comeet.com/jobs/{company}/{uid}. Keyed by the company uid; the name goes in `site`.
  if (/(^|\.)comeet\.(com|co)$/.test(host) && parts[0] === "jobs" && parts[1] && parts[2]) return { ats: "comeet", slug: parts[2], site: parts[1] };
  // Oracle Recruiting Cloud: {pod}.fa.{dc}.oraclecloud.com/hcmUI/CandidateExperience/{lang}/sites/{site}
  const oracle = host.match(/^([^.]+)\.fa\.([^.]+)\.oraclecloud\.com$/);
  if (oracle && /candidateexperience/i.test(url.pathname)) {
    const i = parts.findIndex((p) => p.toLowerCase() === "sites");
    return { ats: "oracle", slug: oracle[1]!, shard: oracle[2]!, site: i >= 0 ? parts[i + 1] : undefined };
  }
  if (host.endsWith(".icims.com") && sub && sub !== "www") return { ats: "icims", slug: sub.replace(/^careers-/, "") };
  if (host.endsWith(".taleo.net") && sub && sub !== "www") return { ats: "taleo", slug: sub };
  if (host === "jobs.jobvite.com" && seg) return { ats: "jobvite", slug: seg };
  if (host.endsWith(".pinpointhq.com") && sub && !["www", "app", "api"].includes(sub)) return { ats: "pinpoint", slug: sub };
  if (host === "ats.rippling.com" && seg) return { ats: "rippling", slug: seg };
  if (host.endsWith(".applytojob.com") && sub && sub !== "www") return { ats: "jazzhr", slug: sub };
  if (/\.zohorecruit\.(com|eu|in|com\.au)$/.test(host) && sub && sub !== "www") return { ats: "zoho", slug: sub };
  if (host.endsWith(".careers.hibob.com") && sub) return { ats: "hibob", slug: sub };
  if (host.endsWith(".freshteam.com") && sub && sub !== "www") return { ats: "freshteam", slug: sub };
  return null;
}
