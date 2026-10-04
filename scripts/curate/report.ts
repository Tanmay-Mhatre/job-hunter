/**
 * Turn scripts/curate/out/curated.json into a review document grouped by tier:
 *   pnpm exec tsx scripts/curate/report.ts  -> scripts/curate/out/curated.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
type Row = {
  name: string;
  website?: string;
  segment?: string;
  region?: string;
  note?: string;
  source: string;
  status: string;
  identity?: string;
  ats?: string;
  slug?: string;
  careers_url?: string;
  open_jobs: number;
  gcc_jobs: number;
  pm_jobs: number;
  gcc_pm_jobs: number;
  gcc_pm_titles: string[];
};

const data = JSON.parse(readFileSync(join(here, "out", "curated.json"), "utf8")) as { generated_at: string; companies: Row[] };
const rows = data.companies;
const live = rows.filter((r) => r.status === "live");
const tiers: [string, string, Row[]][] = [
  ["A", "Hiring product people in the GCC right now", live.filter((r) => r.gcc_pm_jobs > 0)],
  ["B", "Hiring in the GCC (no product role open today)", live.filter((r) => r.gcc_pm_jobs === 0 && r.gcc_jobs > 0)],
  ["C", "Trackable, hiring product roles elsewhere (remote or relocation)", live.filter((r) => r.gcc_jobs === 0 && r.pm_jobs > 0)],
  ["D", "Trackable, no product or GCC roles today (worth watching)", live.filter((r) => r.gcc_jobs === 0 && r.pm_jobs === 0)],
];
const notTrackable = rows.filter((r) => r.status !== "live");

const md: string[] = [
  "# Curated companies: first draft for review",
  "",
  `Generated ${data.generated_at.slice(0, 16).replace("T", " ")} UTC from ${rows.length} companies (hand-picked candidates + crypto-jobs-fyi, Apache-2.0). Every trackable board was checked live: it has open jobs and, for guessed links, the board name or job descriptions match the company.`,
  "",
  "**How to review:** strike out companies you'd never join, and add any that are missing. GCC = UAE, Saudi Arabia, Qatar, Bahrain, Kuwait, Oman (plus “GCC / MENA / Middle East” in the location). PM = product management titles.",
  "",
  "| Tier | Meaning | Companies |",
  "|---|---|---|",
  ...tiers.map(([t, label, list]) => `| ${t} | ${label} | ${list.length} |`),
  `| — | Not trackable yet (custom site, unsupported ATS, or not found) | ${notTrackable.length} |`,
  "",
];

const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "/");
for (const [t, label, list] of tiers) {
  md.push(`## Tier ${t}: ${label} (${list.length})`, "");
  if (!list.length) {
    md.push("_None._", "");
    continue;
  }
  md.push("| Company | Segment | ATS | Open | GCC | PM | GCC PM | Careers |", "|---|---|---|---|---|---|---|---|");
  for (const r of list) {
    const flag = r.identity && /unverified|not confirmed/.test(r.identity) ? " ⚠️" : "";
    const note = r.note ? ` _(${r.note})_` : "";
    md.push(
      `| **${cell(r.name)}**${note}${flag} | ${cell(r.segment)} | ${r.ats} | ${r.open_jobs} | ${r.gcc_jobs} | ${r.pm_jobs} | ${r.gcc_pm_jobs} | [link](${r.careers_url}) |`,
    );
  }
  md.push("");
  if (t === "A") {
    md.push("<details><summary>Product roles open in the GCC</summary>", "");
    for (const r of list) md.push(`- **${r.name}**: ${r.gcc_pm_titles.join(" · ")}`);
    md.push("", "</details>", "");
  }
}

md.push(`## Not trackable yet (${notTrackable.length})`, "", "Listed with their website or careers link. These need a connector we don't have yet (Workday, Oracle, iCIMS, Teamtailor…) or a custom careers site.", "");
md.push("| Company | Segment | Why | Link |", "|---|---|---|---|");
for (const r of [...notTrackable].sort((a, b) => String(a.segment).localeCompare(String(b.segment)) || a.name.localeCompare(b.name))) {
  md.push(`| ${cell(r.name)}${r.note ? ` _(${r.note})_` : ""} | ${cell(r.segment)} | ${cell(r.status)} | ${r.careers_url ? `[link](${r.careers_url})` : ""} |`);
}
md.push("", "⚠️ = the board was found by guessing its link and the company name couldn't be confirmed from it; double-check before keeping.", "");

writeFileSync(join(here, "out", "curated.md"), md.join("\n"));
console.log(
  tiers.map(([t, , l]) => `${t}:${l.length}`).join(" "),
  `not-trackable:${notTrackable.length}`,
  `unverified:${live.filter((r) => r.identity && /unverified|not confirmed/.test(r.identity)).length}`,
);
