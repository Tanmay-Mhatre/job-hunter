import { describe, expect, it } from "vitest";
import type { Job } from "../src/lib/data";
import {
  activeChips,
  applyFilters,
  hasNewTag,
  isNewJob,
  DEFAULT_FILTERS,
  facetCounts,
  fromQuery,
  groupJobs,
  sortJobs,
  suggestRelax,
  toQuery,
  type Ctx,
  type Filters,
} from "../src/lib/filters";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

let n = 0;
const job = (o: Partial<Job> = {}): Job => ({
  id: `greenhouse:acme:${++n}`,
  ats: "greenhouse",
  company: "Acme",
  title: "Senior Product Manager",
  location: "Dubai",
  workplace: "onsite",
  url: "https://example.com",
  firstSeen: daysAgo(1),
  lastSeen: daysAgo(0),
  postedAt: daysAgo(1),
  status: "open",
  score: 75,
  why: { title: 30, location: 20, keywords: ["crypto"], keywordPoints: 5, freshness: 10 },
  countries: ["United Arab Emirates"],
  cities: ["Dubai, United Arab Emirates"],
  seniority: "senior",
  group: `Acme|senior product manager|${n}`,
  hasDescription: true,
  ...o,
});

const ctx: Ctx = { user: {}, min: 70, industriesOf: (c) => (c === "Kraken" ? ["crypto-exchange"] : []), hiddenCompanies: new Set(), now: NOW };
const f = (o: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...o });

const jobs = [
  job({ id: "a", company: "Kraken", score: 90, postedAt: daysAgo(1) }),
  job({ id: "b", company: "Rain", score: 60, countries: ["United Kingdom"], cities: ["London, United Kingdom"], location: "London", postedAt: daysAgo(20), firstSeen: daysAgo(20) }),
  job({ id: "c", company: "OKX", score: 80, workplace: "remote", countries: [], cities: [], location: "Remote - EMEA", seniority: "leadership", postedAt: daysAgo(5), firstSeen: daysAgo(5) }),
  job({ id: "d", company: "Acme", score: 0, why: { title: 0, location: 20, keywords: [], keywordPoints: 0, freshness: 2, gate: "title" } }),
];

describe("applyFilters", () => {
  it("hides jobs that failed your filters unless asked", () => {
    expect(applyFilters(jobs, f(), ctx).map((j) => j.id)).toEqual(["a", "b", "c"]);
    expect(applyFilters(jobs, f({ showFailed: true }), ctx)).toHaveLength(4);
  });

  it("combines facets: OR within a facet, AND across facets", () => {
    expect(applyFilters(jobs, f({ countries: ["United Arab Emirates", "United Kingdom"] }), ctx).map((j) => j.id)).toEqual(["a", "b"]);
    expect(applyFilters(jobs, f({ countries: ["Remote"] }), ctx).map((j) => j.id)).toEqual(["c"]);
    expect(applyFilters(jobs, f({ posted: 7, match: "strong" }), ctx).map((j) => j.id)).toEqual(["a", "c"]);
    expect(applyFilters(jobs, f({ industries: ["crypto-exchange"] }), ctx).map((j) => j.id)).toEqual(["a"]);
    expect(applyFilters(jobs, f({ seniority: ["leadership"] }), ctx).map((j) => j.id)).toEqual(["c"]);
  });

  it("hides dismissed jobs and hidden companies, and filters by tracking status", () => {
    const tracked: Ctx = {
      ...ctx,
      user: { a: { status: "saved", updatedAt: "", snapshot: {} as never }, b: { status: "dismissed", updatedAt: "", snapshot: {} as never }, c: { status: "interviewing", updatedAt: "", snapshot: {} as never } },
      hiddenCompanies: new Set(["OKX"]),
    };
    expect(applyFilters(jobs, f(), tracked).map((j) => j.id)).toEqual(["a"]);
    expect(applyFilters(jobs, f({ status: "saved" }), tracked).map((j) => j.id)).toEqual(["a"]);
    expect(applyFilters(jobs, f({ status: "applied", showHidden: true }), tracked).map((j) => j.id)).toEqual(["c"]);
    expect(applyFilters(jobs, f({ status: "new" }), ctx).map((j) => j.id)).toEqual(["a"]);
  });
});

describe("facetCounts", () => {
  it("counts each facet with every other filter applied, but not its own", () => {
    const counts = facetCounts(jobs, f({ countries: ["United Kingdom"], posted: 7 }), ctx);
    // Countries ignore the country pick but apply "past week": a (UAE) and c (Remote) remain.
    expect(Object.fromEntries(counts.countries.map((o) => [o.value, o.count]))).toEqual({ "United Arab Emirates": 1, Remote: 1, "United Kingdom": 0 });
    // Posted ignores the posted pick but applies the UK pick: only b, posted 20 days ago.
    expect(Object.fromEntries(counts.posted.map((o) => [o.value, o.count]))).toEqual({ "1": 0, "3": 0, "7": 0, "30": 1 });
  });
});

describe("sorting, grouping, chips, suggestions, URL", () => {
  it("sorts by best match, newest, salary and company", () => {
    expect(sortJobs(jobs.slice(0, 3), "best").map((j) => j.id)).toEqual(["a", "c", "b"]);
    expect(sortJobs(jobs.slice(0, 3), "newest").map((j) => j.id)).toEqual(["a", "c", "b"]);
    const paid = [job({ id: "x", salary: { min: 100 } }), job({ id: "y", salary: { min: 90, max: 200 } }), job({ id: "z" })];
    expect(sortJobs(paid, "salary").map((j) => j.id)).toEqual(["y", "x", "z"]);
    expect(sortJobs(jobs.slice(0, 3), "company").map((j) => j.company)).toEqual(["Kraken", "OKX", "Rain"]);
  });

  it("breaks a tie on best match by topics mentioned, then by date", () => {
    const tied = [
      job({ id: "few-new", score: 100, postedAt: daysAgo(0), why: { title: 30, location: 20, keywords: ["api"], keywordPoints: 40, freshness: 10 } }),
      job({ id: "many-old", score: 100, postedAt: daysAgo(2), why: { title: 30, location: 20, keywords: ["api", "payments", "b2b"], keywordPoints: 40, freshness: 10 } }),
      job({ id: "many-new", score: 100, postedAt: daysAgo(1), why: { title: 30, location: 20, keywords: ["api", "payments", "b2b"], keywordPoints: 40, freshness: 10 } }),
    ];
    expect(sortJobs(tied, "best").map((j) => j.id)).toEqual(["many-new", "many-old", "few-new"]);
  });

  it("groups one role posted in several places, best posting first", () => {
    const g = groupJobs([job({ id: "1", group: "K|pm", location: "Dubai" }), job({ id: "2", group: "K|pm", location: "London" }), job({ id: "3", group: "R|pm" })]);
    expect(g.map((x) => [x.lead.id, x.jobs.length])).toEqual([
      ["1", 2],
      ["3", 1],
    ]);
  });

  it("lists active filters as chips and suggests which one to drop", () => {
    const strict = f({ posted: 1, countries: ["United Kingdom"] });
    expect(activeChips(strict, ctx).map((c) => c.label)).toEqual(["Past 24 hours", "United Kingdom"]);
    expect(applyFilters(jobs, strict, ctx)).toEqual([]);
    expect(suggestRelax(jobs, strict, ctx)[0]).toMatchObject({ label: "Past 24 hours", count: 1 });
  });

  it("round-trips filters and sort through the URL", () => {
    const filters = f({ posted: 7, countries: ["United Arab Emirates", "Remote"], match: "strong", salaryOnly: true });
    const q = toQuery(filters, "newest");
    expect(q).toContain("posted=7");
    expect(fromQuery(q)).toEqual({ filters, sort: "newest" });
    expect(fromQuery("")).toBeNull();
  });
});

describe("location facet", () => {
  it("filters by city (OR within), combines with country (AND), and counts without its own pick", () => {
    expect(applyFilters(jobs, f({ locations: ["Dubai, United Arab Emirates", "London, United Kingdom"] }), ctx).map((j) => j.id)).toEqual(["a", "b"]);
    expect(applyFilters(jobs, f({ locations: ["London, United Kingdom"], countries: ["United Arab Emirates"] }), ctx)).toEqual([]);
    const counts = facetCounts(jobs, f({ locations: ["London, United Kingdom"] }), ctx);
    expect(counts.locations.map((o) => [o.value, o.label, o.count])).toEqual([
      ["Dubai, United Arab Emirates", "Dubai · United Arab Emirates", 1],
      ["London, United Kingdom", "London · United Kingdom", 1],
    ]);
    // Country counts respect the location pick.
    expect(Object.fromEntries(counts.countries.map((o) => [o.value, o.count]))).toEqual({ "United Kingdom": 1 });
    expect(activeChips(f({ locations: ["Dubai, United Arab Emirates"] }), ctx).map((c) => c.label)).toEqual(["Dubai"]);
  });
});

describe("your companies and directory jobs", () => {
  const mine: Ctx = { ...ctx, isYours: (j) => j.company === "Rain" };
  const directory = job({ id: "index:lever:far:1", company: "Far", score: 56, estimated: true, companyKey: "lever:far", postedAt: daysAgo(3), firstSeen: daysAgo(3) });
  const stale = job({ id: "index:lever:old:1", company: "Old", score: 56, estimated: true, companyKey: "lever:old", postedAt: daysAgo(45), firstSeen: daysAgo(45) });

  it("lists your companies' jobs first in every sort, then the rest in that sort", () => {
    const list = applyFilters(jobs, f(), mine);
    expect(sortJobs(list, "best", mine.isYours).map((j) => j.id)).toEqual(["b", "a", "c"]);
    expect(sortJobs(list, "newest", mine.isYours).map((j) => j.id)).toEqual(["b", "a", "c"]);
    expect(sortJobs(list, "best").map((j) => j.id)).toEqual(["a", "c", "b"]);
  });

  it("'My companies' shows only theirs", () => {
    expect(applyFilters(jobs, f({ mine: true }), mine).map((j) => j.id)).toEqual(["b"]);
    expect(applyFilters(jobs, f({ mine: true }), ctx)).toEqual([]);
    expect(activeChips(f({ mine: true }), ctx).map((c) => c.label)).toContain("My companies");
  });

  it("hides directory jobs older than 30 days unless asked, and never calls them new", () => {
    expect(applyFilters([directory, stale], f(), ctx).map((j) => j.id)).toEqual([directory.id]);
    expect(applyFilters([directory, stale], f({ olderIndex: true }), ctx)).toHaveLength(2);
    expect(applyFilters([directory], f({ status: "new" }), ctx)).toEqual([]);
  });

  it("New = first found since the previous scan (2 days without one), posted within a month; never on the first scan", () => {
    const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
    const found = (h: number) => job({ id: `h${h}`, firstSeen: hoursAgo(h), postedAt: hoursAgo(h) });
    // No previous scan time: the last 48 hours count. The tag uses the same rule as the New view.
    expect([2, 30, 47, 50].map((h) => [h, isNewJob(found(h), ctx), hasNewTag(found(h), ctx)])).toEqual([
      [2, true, true],
      [30, true, true],
      [47, true, true],
      [50, false, false],
    ]);
    // Since the previous scan finished 10 hours ago.
    const since = { ...ctx, newSince: NOW - 10 * 3_600_000 };
    expect([2, 12].map((h) => isNewJob(found(h), since))).toEqual([true, false]);
    // First scan: nothing is new.
    expect(isNewJob(found(2), { ...ctx, firstScan: true })).toBe(false);
    // An old posting a scan only just found isn't new.
    expect(isNewJob(job({ firstSeen: hoursAgo(1), postedAt: daysAgo(120) }), ctx)).toBe(false);
    // Closed jobs aren't new, however recent.
    expect(isNewJob(job({ firstSeen: hoursAgo(1), status: "closed" }), ctx)).toBe(false);
  });

  it("hides postings older than about 6 months unless asked", () => {
    const old = job({ id: "old", postedAt: daysAgo(200), firstSeen: daysAgo(200) });
    expect(applyFilters([old], f(), ctx)).toEqual([]);
    expect(applyFilters([old], f({ showOld: true }), ctx)).toHaveLength(1);
  });

  it("round-trips the new filters through the URL", () => {
    const q = toQuery(f({ mine: true, olderIndex: true }), "best");
    expect(fromQuery(q)!.filters).toMatchObject({ mine: true, olderIndex: true });
  });
});
