/**
 * Publish the catalogue into the app's data folder:
 *   data/catalog/directory.json  slim list of every live/dormant company (search & browse)
 *   data/catalog/index.json      open-job rows per indexed company (suggestions)
 *
 *   pnpm exec tsx scripts/catalog/publish.ts [--data <dir>]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IndexedCompany, IndexRow } from "../../packages/core/src/index";

const here = dirname(fileURLToPath(import.meta.url));
const dataArg = process.argv.indexOf("--data");
const DATA = resolve(dataArg > 0 ? process.argv[dataArg + 1]! : join(here, "..", "..", "data"));
const OUT = join(DATA, "catalog");

type Dir = {
  key: string;
  name: string;
  name_source: string;
  ats: string;
  slug: string;
  region?: string;
  shard?: string;
  site?: string;
  careers_url: string;
  tier: "curated" | "dump";
  agreeing_sources: number;
  status: string;
  open_jobs: number | null;
};

const dir = (JSON.parse(readFileSync(join(here, "out", "directory.json"), "utf8")) as { companies: Dir[] }).companies;
const byKey = new Map(dir.map((d) => [d.key, d]));

// Latest successful index line per company wins.
const index = new Map<string, { fetched_at: string; open_jobs: number; rows: IndexRow[] }>();
for (const f of readdirSync(join(here, "out")).filter((n) => /^index-.+\.jsonl$/.test(n))) {
  for (const line of readFileSync(join(here, "out", f), "utf8").split("\n")) {
    if (!line) continue;
    const r = JSON.parse(line) as { key: string; fetched_at: string; open_jobs?: number; rows?: IndexRow[]; error?: string };
    if (r.error || !r.rows) continue;
    const prev = index.get(r.key);
    if (!prev || prev.fetched_at < r.fetched_at) index.set(r.key, { fetched_at: r.fetched_at, open_jobs: r.open_jobs ?? r.rows.length, rows: r.rows });
  }
}

const indexed: IndexedCompany[] = [];
for (const [key, v] of index) {
  const d = byKey.get(key);
  if (!d) continue;
  indexed.push({ key, name: d.name, ats: d.ats, slug: d.slug, careers_url: d.careers_url, open_jobs: v.open_jobs, rows: v.rows, tier: d.tier });
}

const slim = dir.map((d) => ({
  key: d.key,
  name: d.name,
  ats: d.ats,
  slug: d.slug,
  ...(d.region ? { region: d.region } : {}),
  ...(d.shard ? { shard: d.shard, site: d.site } : {}),
  careers_url: d.careers_url,
  tier: d.tier,
  status: d.status,
  open_jobs: index.get(d.key)?.open_jobs ?? d.open_jobs,
  indexed: index.has(d.key),
}));

mkdirSync(OUT, { recursive: true });
const generated_at = new Date().toISOString();
writeFileSync(join(OUT, "directory.json"), JSON.stringify({ generated_at, count: slim.length, companies: slim }));
writeFileSync(join(OUT, "index.json"), JSON.stringify({ generated_at, count: indexed.length, companies: indexed }));
console.log(`Published to ${OUT}: directory ${slim.length} companies, index ${indexed.length} companies (${indexed.reduce((s, c) => s + c.rows.length, 0)} job rows).`);
