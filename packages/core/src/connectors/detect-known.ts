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
    const site = parts.find((p) => !/^[a-z]{2}(-[A-Z]{2})?$/.test(p)) ?? undefined;
    return { ats: "workday", slug: wd[1]!, shard: wd[2]!, site };
  }
  if (host === "apply.workable.com" && seg && seg !== "api") return { ats: "workable", slug: seg };
  if (host.endsWith(".workable.com") && sub && !["www", "apply", "jobs"].includes(sub)) return { ats: "workable", slug: sub };
  if (host.endsWith(".recruitee.com") && sub && sub !== "www") return { ats: "recruitee", slug: sub };
  if (/\.jobs\.personio\.(de|com)$/.test(host)) return { ats: "personio", slug: sub };
  if (host.endsWith(".bamboohr.com") && sub && sub !== "www") return { ats: "bamboohr", slug: sub };
  if (host.endsWith(".breezy.hr") && sub && sub !== "app") return { ats: "breezy", slug: sub };
  return null;
}
