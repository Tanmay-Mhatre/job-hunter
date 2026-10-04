/**
 * Build the curated company list: find each company's ATS board, validate it live
 * (jobs > 0 and the board really is that company), and count where it hires and how many
 * product roles it has in the GCC. No AI. Polite: per-host spacing via HttpClient.
 *
 *   pnpm exec tsx scripts/curate/probe.ts            -> scripts/curate/out/{curated.json,curated.md}
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COUNTRIES, countryTerms, detectCompany, HttpClient, HttpError, matchesTerm, ROLE_FAMILIES } from "../../packages/core/src/index";

const here = dirname(fileURLToPath(import.meta.url));
const http = new HttpClient({ retries: 1, hostDelayMs: 700, timeoutMs: 25_000 });

type Ats = "greenhouse" | "lever" | "ashby" | "smartrecruiters";
type Job = { title: string; location: string; text?: string };
type Found = { ats: Ats; slug: string; region?: "eu"; careers_url: string; jobs: Job[]; boardName?: string };

type Candidate = {
  name: string;
  website?: string;
  segment?: string;
  region?: string;
  slugs?: string[];
  smartrecruiters?: string[];
  note?: string;
  jobs_url?: string;
  /** "ats:slug" boards known to be a different company. */
  reject?: string[];
  /** Set after a person checked the board belongs to this company. */
  verified?: string;
  source: string;
};

const GCC_COUNTRIES = ["united arab emirates", "saudi arabia", "qatar", "bahrain", "kuwait", "oman"];
const GCC_TERMS = [...GCC_COUNTRIES.flatMap((n) => countryTerms(COUNTRIES.find((c) => c.name === n)!, true)), "gcc", "mena", "middle east"].filter(
  (t) => t !== "emirates" && t !== "victoria",
);
const PM_TERMS = [...ROLE_FAMILIES.find((f) => f.id === "product")!.titles.filter((t) => !t.includes("operations") && !t.includes("strategy"))];

const isGcc = (loc: string) => GCC_TERMS.some((t) => matchesTerm(loc, t));
const isPm = (title: string) => PM_TERMS.some((t) => matchesTerm(title, t)) && !/product (marketing|designer|design|support|specialist)/i.test(title);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------- light fetchers (no descriptions where avoidable) ----------

async function greenhouse(slug: string, eu = false): Promise<Found | null> {
  // EU boards are served by the same API; only their public links differ.
  const base = "https://boards-api.greenhouse.io";
  try {
    const board = await http.getJson<{ name?: string }>(`${base}/v1/boards/${encodeURIComponent(slug)}`);
    const data = await http.getJson<{ jobs: { title: string; location?: { name?: string } }[] }>(`${base}/v1/boards/${encodeURIComponent(slug)}/jobs`);
    return {
      ats: "greenhouse",
      slug,
      region: eu ? "eu" : undefined,
      careers_url: `https://job-boards${eu ? ".eu" : ""}.greenhouse.io/${slug}`,
      boardName: board.name,
      jobs: data.jobs.map((j) => ({ title: j.title, location: j.location?.name ?? "" })),
    };
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

async function lever(slug: string, eu = false): Promise<Found | null> {
  const host = eu ? "https://api.eu.lever.co" : "https://api.lever.co";
  try {
    const data = await http.getJson<unknown>(`${host}/v0/postings/${encodeURIComponent(slug)}?mode=json`);
    if (!Array.isArray(data)) return null;
    type P = { text: string; categories?: { location?: string; allLocations?: string[] }; descriptionPlain?: string; additionalPlain?: string };
    return {
      ats: "lever",
      slug,
      region: eu ? "eu" : undefined,
      careers_url: `https://jobs${eu ? ".eu" : ""}.lever.co/${slug}`,
      jobs: (data as P[]).map((p) => ({
        title: p.text,
        location: (p.categories?.allLocations?.length ? p.categories.allLocations.join("; ") : p.categories?.location) ?? "",
        text: `${p.descriptionPlain ?? ""} ${p.additionalPlain ?? ""}`.slice(0, 4000),
      })),
    };
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

async function ashby(slug: string): Promise<Found | null> {
  try {
    type A = { title: string; location?: string; secondaryLocations?: { location: string }[]; isListed?: boolean; descriptionPlain?: string };
    const data = await http.getJson<{ jobs?: A[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
    if (!Array.isArray(data.jobs)) return null;
    return {
      ats: "ashby",
      slug,
      careers_url: `https://jobs.ashbyhq.com/${slug}`,
      jobs: data.jobs
        .filter((j) => j.isListed !== false)
        .map((j) => ({
          title: j.title.trim(),
          location: [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean).join("; "),
          text: (j.descriptionPlain ?? "").slice(0, 4000),
        })),
    };
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

async function smartrecruiters(id: string): Promise<Found | null> {
  type S = { name: string; location?: { city?: string; country?: string; region?: string; remote?: boolean }; company?: { name?: string } };
  const jobs: Job[] = [];
  let boardName: string | undefined;
  for (let offset = 0; offset < 1000; offset += 100) {
    let page: { totalFound: number; content: S[] };
    try {
      page = await http.getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(id)}/postings?limit=100&offset=${offset}`);
    } catch (err) {
      if (err instanceof HttpError && (err.status === 404 || err.status === 400)) return null;
      throw err;
    }
    // A made-up id returns 200 with totalFound 0, so only a non-empty board counts.
    if (!page.totalFound) return null;
    boardName ??= page.content[0]?.company?.name;
    for (const p of page.content) {
      const l = p.location ?? {};
      const country = l.country ? COUNTRY_BY_CODE[l.country.toLowerCase()] ?? l.country : "";
      jobs.push({ title: p.name, location: [l.city, l.region, country, l.remote ? "remote" : ""].filter(Boolean).join(", ") });
    }
    if (offset + 100 >= page.totalFound) break;
  }
  return { ats: "smartrecruiters", slug: id, careers_url: `https://careers.smartrecruiters.com/${id}`, jobs, boardName };
}
const COUNTRY_BY_CODE: Record<string, string> = { ae: "United Arab Emirates", sa: "Saudi Arabia", qa: "Qatar", bh: "Bahrain", kw: "Kuwait", om: "Oman", eg: "Egypt", gb: "United Kingdom", us: "United States", de: "Germany", in: "India" };

// ---------- identity check for guessed slugs ----------

/** Does this board really belong to the candidate? Board name for GH/SR; description mentions for Lever/Ashby. */
function identity(c: Candidate, f: Found): "verified" | "unverified" {
  const name = norm(c.name.replace(/\(.*\)/, ""));
  const domain = norm((c.website ?? "").split(".")[0] ?? "");
  if (f.boardName) {
    const b = norm(f.boardName);
    return b.includes(name) || name.includes(b) || (domain && b.includes(domain)) ? "verified" : "unverified";
  }
  const texts = f.jobs.slice(0, 25).map((j) => (j.text ?? "").toLowerCase());
  const plainName = c.name.toLowerCase().replace(/\(.*\)/, "").trim();
  const hits = texts.filter((t) => t.includes(plainName) || (c.website && t.includes(c.website.toLowerCase()))).length;
  return hits >= Math.min(2, texts.length) ? "verified" : "unverified";
}

function slugGuesses(c: Candidate): string[] {
  const base = c.name.toLowerCase().replace(/\(.*\)/, "").trim();
  const domain = (c.website ?? "").split(".")[0] ?? "";
  return [...new Set([...(c.slugs ?? []), base.replace(/[^a-z0-9]/g, ""), base.replace(/[^a-z0-9]+/g, "-"), domain].filter(Boolean))];
}

async function probeCandidate(c: Candidate): Promise<{ found?: Found; status: string; identity?: string }> {
  // Known careers URL first.
  if (c.jobs_url) {
    const d = detectCompany(c.jobs_url);
    if (d?.supported) {
      const f = d.ats === "greenhouse" ? await greenhouse(d.slug, d.region === "eu") : d.ats === "lever" ? await lever(d.slug, d.region === "eu") : d.ats === "ashby" ? await ashby(d.slug) : null;
      if (f && f.jobs.length) return { found: f, status: "live", identity: "from source" };
      return { status: f ? "empty board" : "board not found" };
    }
    if (d?.ats === "smartrecruiters") {
      const f = await smartrecruiters(d.slug);
      return f ? { found: f, status: "live", identity: "from source" } : { status: "empty board" };
    }
    return { status: d ? `${d.ats} (not supported yet)` : "custom careers site" };
  }
  for (const id of c.smartrecruiters ?? []) {
    const f = await smartrecruiters(id);
    if (f) return { found: f, status: "live", identity: "given" };
  }
  for (const slug of slugGuesses(c)) {
    for (const probe of [() => greenhouse(slug), () => ashby(slug), () => lever(slug), () => lever(slug, true)]) {
      const f = await probe();
      if (f && f.jobs.length && !c.reject?.includes(`${f.ats}:${f.slug}`)) {
        const id = c.verified ? "checked manually" : identity(c, f);
        const confirmed = id === "verified" || id === "checked manually";
        if (confirmed || (c.slugs?.includes(slug) ?? false)) return { found: f, status: "live", identity: confirmed ? id : "given slug, name not confirmed" };
      }
    }
  }
  return { status: "not found on Greenhouse/Lever/Ashby" };
}

// ---------- run ----------

type SourceRow = { name: string; jobs_url: string; scraper: string; company_url?: string; category?: string; enabled?: boolean };

async function main() {
  const curated = JSON.parse(readFileSync(join(here, "candidates.json"), "utf8")) as { exclude: string[]; candidates: Omit<Candidate, "source">[] };
  const source = (JSON.parse(readFileSync(join(here, "sources", "crypto-jobs-fyi.companies.json"), "utf8")) as { companies: SourceRow[] }).companies;

  const exclude = new Set(curated.exclude.map(norm));
  const byName = new Map<string, Candidate>();
  for (const s of source) {
    if (s.enabled === false) continue;
    byName.set(norm(s.name), {
      name: s.name.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      website: s.company_url?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""),
      segment: s.category,
      jobs_url: s.jobs_url,
      source: "crypto-jobs-fyi",
    });
  }
  for (const c of curated.candidates) {
    const key = norm(c.name.replace(/\(.*\)/, ""));
    const prev = byName.get(key) ?? [...byName.values()].find((v) => v.website && c.website && norm(v.website) === norm(c.website));
    // Hand-picked entries win on naming and segment; keep the source's known careers URL.
    if (prev) byName.delete(norm(prev.name));
    byName.set(key, { ...c, jobs_url: prev?.jobs_url, source: prev ? "candidates + crypto-jobs-fyi" : "candidates" });
  }
  let all = [...byName.values()].filter((c) => !exclude.has(norm(c.name)));
  const retry = process.argv.includes("--retry-errors");
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx > 0 ? new Set(process.argv.slice(onlyIdx + 1).map(norm)) : null;
  let kept: Record<string, unknown>[] = [];
  if (retry) {
    const prev = JSON.parse(readFileSync(join(here, "out", "curated.json"), "utf8")).companies as Record<string, unknown>[];
    const failed = new Set(prev.filter((r) => String(r.status).startsWith("error")).map((r) => r.name));
    kept = prev.filter((r) => !failed.has(r.name));
    all = all.filter((c) => failed.has(c.name));
  } else if (only) {
    const prev = JSON.parse(readFileSync(join(here, "out", "curated.json"), "utf8")).companies as Record<string, unknown>[];
    kept = prev.filter((r) => !only.has(norm(String(r.name))));
    all = all.filter((c) => only.has(norm(c.name)));
  }
  console.error(`Probing ${all.length} companies…`);

  const results: Record<string, unknown>[] = [...kept];
  let i = 0;
  const queue = [...all];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      let r: Awaited<ReturnType<typeof probeCandidate>>;
      try {
        r = await probeCandidate(c);
      } catch (err) {
        r = { status: `error: ${(err as Error).message.slice(0, 80)}` };
      }
      const jobs = r.found?.jobs ?? [];
      const gcc = jobs.filter((j) => isGcc(j.location));
      const pm = jobs.filter((j) => isPm(j.title));
      const gccPm = gcc.filter((j) => isPm(j.title));
      results.push({
        // Greenhouse/SmartRecruiters know the company's real name; prefer it over a slug-ish one.
        name: r.found?.boardName && norm(r.found.boardName) === norm(c.name) ? r.found.boardName : c.name,
        website: c.website,
        segment: c.segment,
        region: c.region,
        note: c.note,
        source: c.source,
        status: r.status,
        identity: r.identity,
        ats: r.found?.ats,
        slug: r.found?.slug,
        board_region: r.found?.region,
        careers_url: r.found?.careers_url ?? c.jobs_url ?? (c.website ? `https://${c.website}` : undefined),
        open_jobs: jobs.length,
        gcc_jobs: gcc.length,
        pm_jobs: pm.length,
        gcc_pm_jobs: gccPm.length,
        gcc_pm_titles: [...new Set(gccPm.map((j) => `${j.title} (${j.location})`))].slice(0, 4),
      });
      if (++i % 20 === 0) console.error(`  ${i}/${all.length}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  const fit = (r: Record<string, number>) => (r.gcc_pm_jobs ?? 0) * 100 + (r.gcc_jobs ?? 0) * 3 + (r.pm_jobs ?? 0);
  results.sort((a, b) => fit(b as never) - fit(a as never) || String(a.name).localeCompare(String(b.name)));
  const out = join(here, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "curated.json"), JSON.stringify({ generated_at: new Date().toISOString(), count: results.length, companies: results }, null, 2));
  console.error(`Wrote ${join(out, "curated.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
