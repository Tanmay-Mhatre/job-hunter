import { describe, expect, it } from "vitest";
import { suggestCompanies, type IndexedCompany, type IndexRow } from "../src/suggest";
import { profile } from "./helpers";

const now = new Date("2026-10-04T12:00:00Z");

const co = (key: string, rows: IndexRow[], extra: Partial<IndexedCompany> = {}): IndexedCompany => ({
  key,
  name: key.split(":")[1]!,
  ats: key.split(":")[0]!,
  slug: key.split(":")[1]!,
  careers_url: `https://example.com/${key}`,
  open_jobs: rows.reduce((s, r) => s + r[4], 0),
  rows,
  ...extra,
});

const pm = (location: string, age = 2, count = 1, workplace = "onsite"): IndexRow => ["Senior Product Manager", location, workplace, age, count];
const eng = (location: string): IndexRow => ["Software Engineer", location, "onsite", 2, 1];

describe("suggestCompanies", () => {
  it("ranks companies by how many open jobs pass the user's own filters", () => {
    const r = suggestCompanies(
      profile(),
      [
        co("greenhouse:one", [pm("Dubai"), eng("Dubai")]),
        co("lever:three", [pm("Dubai"), pm("Abu Dhabi"), pm("Dubai, UAE", 30)]),
        co("ashby:none", [eng("Dubai"), pm("Berlin")]),
      ],
      { now },
    );
    expect(r.hiringNow.map((s) => s.key)).toEqual(["lever:three", "greenhouse:one"]);
    expect(r.hiringNow[0]).toMatchObject({ matches: 3, new_matches: 2 });
    expect(r.hiringNow[0]!.reasons).toEqual(["3 open roles match you", "2 new this week"]);
    expect(r.hiringNow[0]!.examples[0]).toBe("Senior Product Manager (Dubai)");
    expect(r.scanned).toBe(3);
  });

  it("puts right-title, nearby-place roles in Worth watching", () => {
    // profile() targets UAE places, so other GCC countries are "near"; Berlin is not.
    const r = suggestCompanies(profile(), [co("greenhouse:riyadh", [pm("Riyadh, Saudi Arabia")]), co("greenhouse:berlin", [pm("Berlin")])], { now });
    expect(r.hiringNow).toEqual([]);
    expect(r.worthWatching.map((s) => s.key)).toEqual(["greenhouse:riyadh"]);
    expect(r.worthWatching[0]!.reasons).toEqual(["1 similar role nearby or remote"]);
  });

  it("leaves out excluded (watched or hidden) companies", () => {
    const r = suggestCompanies(profile(), [co("greenhouse:a", [pm("Dubai")]), co("greenhouse:b", [pm("Dubai")])], { now, exclude: new Set(["greenhouse:a"]) });
    expect(r.hiringNow.map((s) => s.key)).toEqual(["greenhouse:b"]);
  });

  it("counts merged duplicate rows and log-scales volume so giants don't win on size alone", () => {
    const giant = co("workday:giant", [pm("Dubai", 2, 40)]);
    const small = co("ashby:small", [pm("Dubai"), pm("Abu Dhabi")]);
    const r = suggestCompanies(profile(), [giant, small], { now });
    expect(r.hiringNow.find((s) => s.key === "workday:giant")!.matches).toBe(40);
    const scores = Object.fromEntries(r.hiringNow.map((s) => [s.key, s.score]));
    // 40 matches vs 2: a modest lead, not a landslide.
    expect(scores["workday:giant"]! - scores["ashby:small"]!).toBeLessThanOrEqual(25);
  });

  it("caps very large employers at 3 in any 12 consecutive suggestions", () => {
    const big = Array.from({ length: 6 }, (_, i) => co(`greenhouse:big${i}`, [pm("Dubai", 1, 6), eng("Dubai")], { open_jobs: 500 }));
    const smallOnes = Array.from({ length: 12 }, (_, i) => co(`lever:small${i}`, [pm("Dubai", 20)], { open_jobs: 10 }));
    const r = suggestCompanies(profile(), [...big, ...smallOnes], { now });
    const first12 = r.hiringNow.slice(0, 12);
    expect(first12.filter((s) => s.open_jobs > 300)).toHaveLength(3);
    // The other giants are pushed further down, not dropped.
    expect(r.hiringNow).toHaveLength(18);
    expect(r.hiringNow.slice(12).filter((s) => s.open_jobs > 300)).toHaveLength(3);
  });

  it("uses topic data when present and rescales when it isn't", () => {
    const withTerms = co("greenhouse:t", [pm("Dubai")], { terms: { crypto: 0.6, payments: 0.4 } });
    const r = suggestCompanies(profile(), [withTerms], { now });
    expect(r.hiringNow[0]!.topics).toEqual(["crypto", "payments"]);
    expect(r.hiringNow[0]!.reasons).toContain("Your topics: crypto, payments");
  });
});
