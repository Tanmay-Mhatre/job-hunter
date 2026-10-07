/**
 * Our own independent board list: ask the Common Crawl URL index which job-board URLs it saw,
 * and reduce them to (ats, slug). No page content is downloaded, only index lines.
 *
 * Incremental: crawls already read are listed in boards.json and skipped, so the first run reads
 * the last CRAWLS_TO_USE crawls (slow, once) and each weekly run reads only crawls published since.
 *
 * --per-run caps how many new crawls one run reads (the weekly rebuild uses 3, so the first
 * full backlog spreads over a few weeks).
 *
 *   pnpm catalog:crawl [--crawls 24] [--per-run 3]   -> scripts/catalog/raw/commoncrawl/boards.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpClient } from "../../packages/core/src/index";
import { BoardSet, type SeenBoard } from "./lib/url-boards";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "raw", "commoncrawl", "boards.json");
const http = new HttpClient({ retries: 4, hostDelayMs: 1500, timeoutMs: 120_000, backoffMs: 10_000 });
const INDEX = "https://index.commoncrawl.org";
const crawlsArg = process.argv.indexOf("--crawls");
/** About two years of crawls: boards seen once in that window may still be live. */
const CRAWLS_TO_USE = crawlsArg > 0 ? Number(process.argv[crawlsArg + 1]) : 24;
const perRunArg = process.argv.indexOf("--per-run");
const PER_RUN = perRunArg > 0 ? Number(process.argv[perRunArg + 1]) : Infinity;

/** URL patterns per host, including the boards' public APIs; workday tenants are subdomains so they use a domain match. */
const QUERIES: { url: string; matchType?: "domain" }[] = [
  { url: "boards.greenhouse.io/*" },
  { url: "job-boards.greenhouse.io/*" },
  { url: "job-boards.eu.greenhouse.io/*" },
  { url: "boards-api.greenhouse.io/v1/boards/*" },
  { url: "jobs.lever.co/*" },
  { url: "jobs.eu.lever.co/*" },
  { url: "api.lever.co/v0/postings/*" },
  { url: "jobs.ashbyhq.com/*" },
  { url: "api.ashbyhq.com/posting-api/job-board/*" },
  { url: "jobs.smartrecruiters.com/*" },
  { url: "careers.smartrecruiters.com/*" },
  { url: "api.smartrecruiters.com/v1/companies/*" },
  { url: "myworkdayjobs.com", matchType: "domain" },
];

type Saved = { generated_at: string; crawls: string[]; index_lines: number; boards: (SeenBoard & { crawls?: string[] })[] };

async function main() {
  const prev: Saved | undefined = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : undefined;
  // Older files listed crawls per board as `crawls`.
  const boards = new BoardSet((prev?.boards ?? []).map(({ crawls, seen, ...b }) => ({ ...b, seen: seen ?? crawls ?? [] })));
  const done = new Set(prev?.crawls ?? []);
  const recent = (await http.getJson<{ id: string }[]>(`${INDEX}/collinfo.json`)).slice(0, CRAWLS_TO_USE).map((c) => c.id);
  // Newest first, so a capped run always picks up the latest crawl.
  const todo = recent.filter((c) => !done.has(c)).slice(0, PER_RUN);
  console.error(`Crawls: ${recent.length} recent, reading ${todo.length} this run${todo.length ? `: ${todo.join(", ")}` : ""}`);
  let lines = prev?.index_lines ?? 0;

  const save = () => {
    mkdirSync(dirname(OUT), { recursive: true });
    const saved: Saved = { generated_at: new Date().toISOString(), crawls: [...done].sort().reverse(), index_lines: lines, boards: boards.list() };
    writeFileSync(OUT, JSON.stringify(saved));
  };

  for (const crawl of todo) {
    let complete = true;
    for (const q of QUERIES) {
      const base = `${INDEX}/${crawl}-index?url=${encodeURIComponent(q.url)}${q.matchType ? `&matchType=${q.matchType}` : ""}&fl=url&filter=!status:404&output=json`;
      let pages = 1;
      try {
        pages = (await http.getJson<{ pages: number }>(`${base}&showNumPages=true`)).pages;
      } catch (err) {
        console.error(`  ${crawl} ${q.url}: page count failed (${(err as Error).message}); skipping`);
        complete = false;
        continue;
      }
      for (let page = 0; page < pages; page++) {
        let text = "";
        try {
          text = await http.getText(`${base}&page=${page}`);
        } catch (err) {
          console.error(`  ${crawl} ${q.url} page ${page}: ${(err as Error).message}`);
          complete = false;
          continue;
        }
        // output=json gives one {"url": …} object per line.
        for (const raw of text.split("\n")) {
          if (!raw.trim()) continue;
          try {
            boards.add((JSON.parse(raw) as { url: string }).url, crawl);
            lines++;
          } catch {
            // not a JSON line
          }
        }
        console.error(`  ${crawl} ${q.url} page ${page + 1}/${pages}: ${boards.size} boards so far`);
      }
    }
    // A crawl with failed pages is read again next run (boards already found are kept).
    if (complete) done.add(crawl);
    save();
  }
  save();
  console.error(`Done: ${lines} index lines -> ${boards.size} boards`, boards.byAts());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
