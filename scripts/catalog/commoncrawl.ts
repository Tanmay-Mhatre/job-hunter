/**
 * Our own independent board list: ask the Common Crawl URL index which job-board URLs it saw,
 * and reduce them to (ats, slug). No page content is downloaded, only index lines.
 *
 *   pnpm exec tsx scripts/catalog/commoncrawl.ts   -> scripts/catalog/raw/commoncrawl/boards.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectCompany, HttpClient } from "../../packages/core/src/index";

const here = dirname(fileURLToPath(import.meta.url));
const http = new HttpClient({ retries: 4, hostDelayMs: 1500, timeoutMs: 120_000, backoffMs: 10_000 });
const INDEX = "https://index.commoncrawl.org";
const CRAWLS_TO_USE = 2;

/** URL patterns per host; workday tenants are subdomains so they use a domain match. */
const QUERIES: { url: string; matchType?: "domain" }[] = [
  { url: "boards.greenhouse.io/*" },
  { url: "job-boards.greenhouse.io/*" },
  { url: "job-boards.eu.greenhouse.io/*" },
  { url: "jobs.lever.co/*" },
  { url: "jobs.eu.lever.co/*" },
  { url: "jobs.ashbyhq.com/*" },
  { url: "jobs.smartrecruiters.com/*" },
  { url: "careers.smartrecruiters.com/*" },
  { url: "myworkdayjobs.com", matchType: "domain" },
];

const IGNORE = new Set(["embed", "v1", "api", "jobs", "favicon.ico", "robots.txt", "sitemap.xml", "assets", "static", "_next", "search", "oauth", "login", "privacy", "terms"]);

async function main() {
  const crawls = (await http.getJson<{ id: string }[]>(`${INDEX}/collinfo.json`)).slice(0, CRAWLS_TO_USE).map((c) => c.id);
  console.error(`Crawls: ${crawls.join(", ")}`);
  const boards = new Map<string, { ats: string; slug: string; region?: string; shard?: string; site?: string; crawls: Set<string> }>();
  let lines = 0;

  for (const crawl of crawls) {
    for (const q of QUERIES) {
      const base = `${INDEX}/${crawl}-index?url=${encodeURIComponent(q.url)}${q.matchType ? `&matchType=${q.matchType}` : ""}&fl=url&filter=!status:404&output=json`;
      let pages = 1;
      try {
        pages = (await http.getJson<{ pages: number }>(`${base}&showNumPages=true`)).pages;
      } catch (err) {
        console.error(`  ${crawl} ${q.url}: page count failed (${(err as Error).message}); skipping`);
        continue;
      }
      for (let page = 0; page < pages; page++) {
        let text = "";
        try {
          text = await http.getText(`${base}&page=${page}`);
        } catch (err) {
          console.error(`  ${crawl} ${q.url} page ${page}: ${(err as Error).message}`);
          continue;
        }
        // output=json gives one {"url": …} object per line.
        for (const raw of text.split("\n")) {
          if (!raw.trim()) continue;
          let u: string;
          try {
            u = (JSON.parse(raw) as { url: string }).url;
          } catch {
            continue;
          }
          lines++;
          const d = detectCompany(u);
          if (!d || IGNORE.has(d.slug.toLowerCase()) || d.slug.length > 80) continue;
          if (d.ats === "workday" && !d.site) continue;
          const key = d.ats === "workday" ? `workday:${d.slug}|${d.shard}|${d.site}`.toLowerCase() : `${d.ats}:${d.slug}`.toLowerCase();
          const b = boards.get(key) ?? { ats: d.ats, slug: d.slug, region: d.region, shard: d.shard, site: d.site, crawls: new Set<string>() };
          b.crawls.add(crawl);
          boards.set(key, b);
        }
        console.error(`  ${crawl} ${q.url} page ${page + 1}/${pages}: ${boards.size} boards so far`);
      }
    }
  }

  const out = join(here, "raw", "commoncrawl");
  mkdirSync(out, { recursive: true });
  const list = [...boards.values()].map((b) => ({ ...b, crawls: [...b.crawls] }));
  writeFileSync(join(out, "boards.json"), JSON.stringify({ generated_at: new Date().toISOString(), crawls, index_lines: lines, boards: list }));
  const byAts: Record<string, number> = {};
  for (const b of list) byAts[b.ats] = (byAts[b.ats] ?? 0) + 1;
  console.error(`Done: ${lines} index lines -> ${list.length} boards`, byAts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
