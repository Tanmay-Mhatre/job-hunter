import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";
import { findCandidates, pickChecks, readLedger, recordChecks, toIndexJobs, type DiscoverFile, type IndexFile } from "../src/discover";
import { scan } from "../src/scan";
import type { IndexedCompany, IndexRow } from "../src/suggest";
import { fakeHttp, fixture, json, profile } from "./helpers";

const now = new Date("2026-10-03T12:00:00Z");
const DAY = 86_400_000;

const co = (key: string, rows: IndexRow[]): IndexedCompany => {
  const [ats, slug] = key.split(":") as [string, string];
  return { key, name: slug, ats, slug, careers_url: `https://careers.example/${slug}`, open_jobs: rows.length, rows };
};
const pm = (location: string, age = 2): IndexRow => ["Senior Product Manager", location, "onsite", age, 1];
const index = (companies: IndexedCompany[], generated = now): IndexFile => ({ generated_at: generated.toISOString(), companies });
const noLedger = { version: 1 as const, companies: {} };

describe("findCandidates", () => {
  it("keeps rows that pass your gates, best estimate first, ages counted from the index build", () => {
    const built = new Date(now.getTime() - 5 * DAY);
    const c = findCandidates(
      profile(),
      index([co("lever:a", [pm("Dubai", 30), ["Software Engineer", "Dubai", "onsite", 1, 1]]), co("ashby:b", [pm("Dubai", 1), pm("Berlin")])], built),
      now,
    );
    expect(c.map((x) => [x.company.key, x.location])).toEqual([
      ["ashby:b", "Dubai"],
      ["lever:a", "Dubai"],
    ]);
    // Posted a day before an index built 5 days ago: 6 days old now.
    expect(c[0]!.postedAt).toBe(new Date(built.getTime() - DAY).toISOString());
    expect(c[0]!.estimate).toBeGreaterThan(c[1]!.estimate);
    expect(c[0]!.why.keywordPoints).toBe(0);
  });

  it("counts a company's ages from when it was fetched, which can be before the index was built", () => {
    const fetched = new Date(now.getTime() - 3 * DAY);
    const company = { ...co("lever:a", [pm("Dubai", 4)]), fetched_at: fetched.toISOString() };
    const [c] = findCandidates(profile(), index([company], now), now);
    // 4 days old when fetched 3 days ago: posted 7 days ago.
    expect(c!.postedAt).toBe(new Date(now.getTime() - 7 * DAY).toISOString());
  });
});

describe("pickChecks", () => {
  const candidates = findCandidates(
    profile(),
    index([
      co("lever:best", [pm("Dubai", 0), pm("Abu Dhabi", 0)]),
      co("greenhouse:yours", [pm("Dubai", 0)]),
      co("ashby:muted", [pm("Dubai", 0)]),
      co("ashby:recent", [pm("Dubai", 1)]),
      co("workday:x|wd1|y", [pm("Dubai", 1)]),
      co("greenhouse:old", [pm("Dubai", 20)]),
      co("ashby:older", [pm("Dubai", 25)]),
    ]),
    now,
  );
  const ledger = {
    version: 1 as const,
    companies: {
      "ashby:recent": { name: "recent", ats: "ashby" as const, slug: "recent", lastChecked: new Date(now.getTime() - 3 * DAY).toISOString(), matches: 1 },
      "greenhouse:old": { name: "old", ats: "greenhouse" as const, slug: "old", lastChecked: new Date(now.getTime() - 8 * DAY).toISOString(), matches: 1 },
    },
  };

  it("picks companies that aren't yours, muted, unreadable or checked this week, one per company, best first", () => {
    const picked = pickChecks(candidates, { tracked: new Set(["greenhouse:yours"]), muted: new Set(["ashby:muted"]), ledger, limit: 10, now });
    expect(picked.map((c) => `${c.ats}:${c.slug}`)).toEqual(["lever:best", "greenhouse:old", "ashby:older"]);
    expect(picked[0]).toMatchObject({ name: "best", careers_url: "https://careers.example/best", enabled: true });
  });

  it("stops at the limit, and picks nothing when checks are off", () => {
    expect(pickChecks(candidates, { tracked: new Set(), muted: new Set(), ledger, limit: 2, now })).toHaveLength(2);
    expect(pickChecks(candidates, { tracked: new Set(), muted: new Set(), ledger, limit: 0, now })).toEqual([]);
  });
});

describe("recordChecks", () => {
  it("records each check, failures too, and forgets checks older than 30 days", () => {
    const old = { name: "gone", ats: "lever" as const, slug: "gone", lastChecked: new Date(now.getTime() - 31 * DAY).toISOString(), matches: 2 };
    const ledger = recordChecks(
      { version: 1, companies: { "lever:gone": old } },
      [
        { name: "A", ats: "lever", slug: "a", enabled: true },
        { name: "B", ats: "ashby", slug: "b", enabled: true },
      ],
      [
        { ats: "lever", slug: "a", ok: true, matches: 3 },
        { ats: "ashby", slug: "b", ok: false, matches: 0, error: "board not found" },
      ],
      now,
    );
    expect(Object.keys(ledger.companies).sort()).toEqual(["ashby:b", "lever:a"]);
    expect(ledger.companies["lever:a"]).toMatchObject({ matches: 3, lastChecked: now.toISOString() });
    expect(ledger.companies["ashby:b"]!.error).toBe("board not found");
  });
});

describe("toIndexJobs", () => {
  const candidates = findCandidates(profile(), index([co("lever:live", [pm("Dubai")]), co("ashby:muted", [pm("Dubai")]), co("ashby:other", [pm("Dubai"), pm("Abu Dhabi")])]), now);

  it("lists jobs at companies that aren't live or muted, marked estimated, linking to the careers page", () => {
    const jobs = toIndexJobs(candidates, { live: new Set(["lever:live"]), muted: new Set(["ashby:muted"]), indexGeneratedAt: now.toISOString() });
    expect(jobs.map((j) => j.location)).toEqual(["Dubai", "Abu Dhabi"]);
    expect(jobs[0]).toMatchObject({ estimated: true, companyKey: "ashby:other", company: "other", url: "https://careers.example/other", status: "open", hasDescription: false });
    expect(jobs[0]!.id).toMatch(/^index:ashby:other:/);
    // Same row, same id: the Radar keeps statuses and "seen" across scans.
    expect(toIndexJobs(candidates, { live: new Set(), muted: new Set(), indexGeneratedAt: now.toISOString() }).map((j) => j.id)).toContain(jobs[0]!.id);
    expect(toIndexJobs(candidates, { live: new Set(), muted: new Set(), indexGeneratedAt: now.toISOString(), limit: 1 })).toHaveLength(1);
  });
});

describe("scan", () => {
  const config = (yaml = "") =>
    parseConfig(`
profile:
  titles: { include: ["product manager", "head of product"], exclude: ["product marketing"] }
  seniority_boost: ["senior", "head", "group"]
  locations: { include: ["dubai", "abu dhabi"], remote_ok: ["emea"], remote_exclude: ["us"] }
  keywords: { crypto: 5, exchange: 4, payments: 3, tokenization: 5 }
companies:
  - { name: "GH Co", ats: greenhouse, slug: "ghco" }
${yaml}`);

  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), "jh-scan-"));
    mkdirSync(join(dir, "catalog"));
    const idx = index([
      co("greenhouse:ghco", [pm("Dubai")]),
      co("lever:leverco", [pm("Dubai", 1)]),
      co("ashby:quiet", [pm("Abu Dhabi", 10)]),
      co("ashby:nope", [pm("Dubai", 3)]),
    ]);
    writeFileSync(join(dir, "catalog", "index.json"), JSON.stringify(idx));
    return dir;
  };
  const routes = (url: string) => {
    if (url.includes("greenhouse")) return json(fixture("greenhouse.json"));
    if (url.includes("lever.co/v0/postings/leverco")) return json(fixture("lever.json"));
    return json({ error: "not found" }, 404);
  };
  const read = <T>(dir: string, f: string) => JSON.parse(readFileSync(join(dir, f), "utf8")) as T;

  it("checks your companies plus the best other ones, and lists the rest as index jobs", async () => {
    const dir = setup();
    const { http, calls } = fakeHttp(routes);
    const names: string[][] = [];
    const r = await scan(config(`companies_muted: ["ashby:nope"]\ndiscovery: { check_per_scan: 1 }`), {
      dataDir: dir,
      http,
      now,
      onStart: (n) => names.push(n),
    });

    expect(names[0]).toEqual(["GH Co", "leverco"]);
    expect(calls.some((u) => u.includes("leverco"))).toBe(true);
    expect(r.checks.map((c) => c.slug)).toEqual(["leverco"]);
    // Your company keeps every job; the checked one only its matches.
    const byCompany = (c: string) => r.merged.jobs.filter((j) => j.company === c);
    expect(byCompany("GH Co").length).toBe(3);
    expect(byCompany("leverco").every((j) => !j.why.gate)).toBe(true);
    expect(byCompany("leverco").length).toBe(1);

    // Not yours, not checked, not muted: an index job.
    const discover = read<DiscoverFile>(dir, "discover.json");
    expect(discover.jobs.map((j) => j.companyKey)).toEqual(["ashby:quiet"]);
    expect(readLedger(dir).companies["lever:leverco"]).toMatchObject({ matches: 1 });
    expect(read<{ runs: { checked?: number }[] }>(dir, "meta.json").runs[0]!.checked).toBe(1);
  });

  it("keeps a checked company's jobs on the next scans without checking it again", async () => {
    const dir = setup();
    const cfg = config("discovery: { check_per_scan: 1 }");
    await scan(cfg, { dataDir: dir, http: fakeHttp(routes).http, now });

    const later = new Date(now.getTime() + 2 * DAY);
    const { http, calls } = fakeHttp(routes);
    const r = await scan(cfg, { dataDir: dir, http, now: later });
    expect(calls.some((u) => u.includes("leverco"))).toBe(false);
    // The next best company is checked instead (its board 404s, recorded as a failed check).
    expect(r.checks.map((c) => c.slug)).toEqual(["nope"]);
    expect(r.merged.jobs.some((j) => j.company === "leverco" && j.status === "open")).toBe(true);
    expect(readLedger(dir).companies["ashby:nope"]!.error).toMatch(/404/);
  });

  it("checks no other companies when checks are off, but still lists index jobs", async () => {
    const dir = setup();
    const { http, calls } = fakeHttp(routes);
    const r = await scan(config("discovery: { check_per_scan: 0 }"), { dataDir: dir, http, now });
    expect(r.checks).toEqual([]);
    expect(calls.every((u) => u.includes("greenhouse"))).toBe(true);
    expect(read<DiscoverFile>(dir, "discover.json").jobs.map((j) => j.companyKey).sort()).toEqual(["ashby:nope", "ashby:quiet", "lever:leverco"]);
  });

  it("works without companies of your own", async () => {
    const dir = setup();
    const cfg = parseConfig(`
profile:
  titles: { include: ["product manager"] }
  locations: { include: ["dubai", "abu dhabi"] }
`);
    const r = await scan(cfg, { dataDir: dir, http: fakeHttp(routes).http, now });
    expect(r.checks.length).toBe(4);
    expect(r.summary?.matches).toBeGreaterThan(0);
  });
});
