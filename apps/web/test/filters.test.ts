import { describe, expect, it } from "vitest";
import type { Job } from "../src/lib/data";
import {
  activeChips,
  applyFilters,
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

const ctx: Ctx = { user: {}, min: 70, cutoff: daysAgo(2), industriesOf: (c) => (c === "Kraken" ? ["crypto-exchange"] : []), hiddenCompanies: new Set(), now: NOW };
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
