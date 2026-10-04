/**
 * Merge every board source into one list keyed by (ats, board), and score how many
 * independent source families agree on each board. No network.
 *
 *   pnpm exec tsx scripts/catalog/merge.ts   -> scripts/catalog/out/merged.json
 *
 * Licences: only "publishable" sources may put a board into our list. Restricted sources
 * (share-alike / non-commercial) only add agreement votes to boards that are already in it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectCompany } from "../../packages/core/src/index";

const here = dirname(fileURLToPath(import.meta.url));
const raw = (...p: string[]) => join(here, "raw", ...p);

type Ats = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday";
const TRACKED = new Set<string>(["greenhouse", "lever", "ashby", "smartrecruiters", "workday"]);

/** Sources that copy from the same place count as one family when we count agreement. */
const SOURCES = {
  ourcrawl: { family: "commoncrawl", publishable: true },
  latmay: { family: "latmay", publishable: true },
  kalil: { family: "kalil", publishable: true },
  conors: { family: "openjobsdata", publishable: true },
  cryptojobs: { family: "cryptojobs", publishable: true },
  feashliaa: { family: "commoncrawl", publishable: false },
  // Votes carried inside upstreamit's slug store (CC BY-SA): cross-check only.
  "up:commoncrawl": { family: "commoncrawl", publishable: false },
  "up:feashliaa": { family: "commoncrawl", publishable: false },
  "up:hf-latmay": { family: "latmay", publishable: false },
  "up:kalil": { family: "kalil", publishable: false },
  "up:openjobsdata": { family: "openjobsdata", publishable: false },
  "up:cryptojobs": { family: "cryptojobs", publishable: false },
  "up:jobseek": { family: "jobseek", publishable: false },
  "up:openroles": { family: "openroles", publishable: false },
  "up:outscal": { family: "outscal", publishable: false },
  "up:wayback": { family: "wayback", publishable: false },
} as const;
type SourceId = keyof typeof SOURCES;

type Board = {
  key: string;
  ats: Ats;
  slug: string;
  region?: string;
  shard?: string;
  site?: string;
  name?: string;
  sources: Set<SourceId>;
};

const boards = new Map<string, Board>();
const keyOf = (ats: string, slug: string, shard?: string, site?: string) =>
  (ats === "workday" ? `workday:${slug}|${shard}|${site}` : `${ats}:${slug}`).toLowerCase();

function add(src: SourceId, b: { ats: string; slug: string; region?: string; shard?: string; site?: string; name?: string }) {
  if (!TRACKED.has(b.ats) || !b.slug) return;
  if (b.ats === "workday" && (!b.shard || !b.site)) return;
  const key = keyOf(b.ats, b.slug, b.shard, b.site);
  const prev = boards.get(key);
  if (prev) {
    prev.sources.add(src);
    if (!prev.name && b.name) prev.name = b.name;
    if (!prev.region && b.region) prev.region = b.region;
    return;
  }
  boards.set(key, { key, ats: b.ats as Ats, slug: b.slug, region: b.region, shard: b.shard, site: b.site, name: b.name, sources: new Set([src]) });
}

function fromUrl(src: SourceId, url: string, name?: string) {
  const d = detectCompany(url.trim());
  if (d) add(src, { ...d, name });
}

function csvRows(path: string): string[][] {
  // Small, simple CSVs (quoted fields possible in names).
  return readFileSync(path, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (ch === '"') q = !q;
        else if (ch === "," && !q) {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out;
    });
}

const counts: Record<string, number> = {};
const count = (src: string, n: number) => (counts[src] = (counts[src] ?? 0) + n);

// --- publishable sources ---
if (existsSync(raw("commoncrawl", "boards.json"))) {
  const cc = JSON.parse(readFileSync(raw("commoncrawl", "boards.json"), "utf8")) as { boards: { ats: string; slug: string; region?: string; shard?: string; site?: string }[] };
  for (const b of cc.boards) add("ourcrawl", b);
  count("ourcrawl", cc.boards.length);
} else console.error("! commoncrawl/boards.json missing (run commoncrawl.ts first)");

{
  const rows = csvRows(raw("latmay", "ats_career_page_urls.csv"));
  for (const [url] of rows) if (url) fromUrl("latmay", url);
  count("latmay", rows.length);
}
for (const f of ["greenhouse", "lever", "ashby", "smartrecruiters", "workday"]) {
  const p = raw("kalil0321", `${f}.csv`);
  if (!existsSync(p)) continue;
  const rows = csvRows(p);
  for (const [name, , url] of rows) if (url) fromUrl("kalil", url, name);
  count("kalil", rows.length);
}
{
  const rows = JSON.parse(readFileSync(raw("conorscode", "companies.json"), "utf8")) as { name: string; platform: string; slug?: string; workday?: { tenant: string; site: string; shard: string } }[];
  for (const r of rows) {
    if (r.platform === "workday" && r.workday) add("conors", { ats: "workday", slug: r.workday.tenant, shard: r.workday.shard, site: r.workday.site, name: r.name });
    else if (r.slug) add("conors", { ats: r.platform, slug: r.slug, name: r.name });
  }
  count("conors", rows.length);
}
{
  const rows = (JSON.parse(readFileSync(join(here, "..", "curate", "sources", "crypto-jobs-fyi.companies.json"), "utf8")) as { companies: { name: string; jobs_url: string }[] }).companies;
  for (const r of rows) fromUrl("cryptojobs", r.jobs_url, r.name);
  count("cryptojobs", rows.length);
}

// --- restricted sources: votes only, never new boards ---
const publishableKeys = new Set([...boards.values()].filter((b) => [...b.sources].some((s) => SOURCES[s].publishable)).map((b) => b.key));
function vote(src: SourceId, ats: string, slug: string, shard?: string, site?: string) {
  const key = keyOf(ats, slug, shard, site);
  if (publishableKeys.has(key)) boards.get(key)!.sources.add(src);
}
for (const f of ["greenhouse", "lever", "ashby"]) {
  const list = JSON.parse(readFileSync(raw("feashliaa", `${f}_companies.json`), "utf8")) as string[];
  for (const slug of list) vote("feashliaa", f, slug);
  count("feashliaa", list.length);
}
{
  const list = JSON.parse(readFileSync(raw("feashliaa", "workday_companies.json"), "utf8")) as string[];
  for (const s of list) {
    const [tenant, shard, site] = s.split("|");
    if (tenant && shard && site) vote("feashliaa", "workday", tenant, shard, site);
  }
  count("feashliaa", list.length);
}
for (const f of ["greenhouse", "lever", "ashby", "workday"]) {
  const j = JSON.parse(readFileSync(raw("upstreamit", `${f}.json`), "utf8")) as { slugs: Record<string, { sources: string[] }> };
  for (const [slug, v] of Object.entries(j.slugs)) {
    for (const s of v.sources) {
      const id = `up:${s}` as SourceId;
      if (!(id in SOURCES)) continue;
      if (f === "workday") {
        const [tenant, shard, site] = slug.split("|");
        if (tenant && shard && site) vote(id, "workday", tenant, shard, site);
      } else vote(id, f, slug);
    }
  }
  count("upstreamit", Object.keys(j.slugs).length);
}

// --- score ---
const out = [...boards.values()]
  .filter((b) => publishableKeys.has(b.key))
  .map((b) => {
    const families = [...new Set([...b.sources].map((s) => SOURCES[s].family))].sort();
    return {
      key: b.key,
      ats: b.ats,
      slug: b.slug,
      ...(b.region ? { region: b.region } : {}),
      ...(b.shard ? { shard: b.shard, site: b.site } : {}),
      ...(b.name ? { name: b.name } : {}),
      sources: [...b.sources].sort(),
      families,
      confidence: families.length >= 2 ? ("high" as const) : ("single" as const),
    };
  })
  .sort((a, b) => b.families.length - a.families.length || a.key.localeCompare(b.key));

const stats: Record<string, Record<string, number>> = {};
for (const b of out) {
  stats[b.ats] ??= { total: 0, high: 0, single: 0 };
  stats[b.ats]!.total++;
  stats[b.ats]![b.confidence]++;
}
mkdirSync(join(here, "out"), { recursive: true });
writeFileSync(join(here, "out", "merged.json"), JSON.stringify({ generated_at: new Date().toISOString(), input_rows: counts, stats, boards: out }));
console.log("input rows:", counts);
console.log("merged boards (publishable):", out.length);
console.table(stats);
const fam: Record<number, number> = {};
for (const b of out) fam[b.families.length] = (fam[b.families.length] ?? 0) + 1;
console.log("boards by number of agreeing source families:", fam);
