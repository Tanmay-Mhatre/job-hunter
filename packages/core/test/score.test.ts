import { describe, expect, it } from "vitest";
import { scoreJob } from "../src/score";
import { profile } from "./helpers";

const now = new Date("2026-10-03T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

const job = (o: Partial<Parameters<typeof scoreJob>[0]> = {}) => ({
  title: "Senior Product Manager",
  location: "Dubai",
  workplace: "onsite" as const,
  description: "",
  postedAt: daysAgo(1),
  ...o,
});

describe("scoreJob", () => {
  it("adds up title, location, keywords and freshness", () => {
    const r = scoreJob(job({ description: "Crypto exchange, payments and KYC." }), profile(), now);
    expect(r.why).toEqual({
      title: 30,
      location: 20,
      keywords: ["crypto", "exchange", "payments", "kyc"],
      keywordPoints: 40,
      freshness: 10,
    });
    expect(r.score).toBe(100);
  });

  it("topic points are the share of min(total weight, 12) matched", () => {
    // Matched weight 5 of 12: 40 * 5/12 = 16.7 -> 17.
    const r = scoreJob(job({ description: "A crypto company." }), profile(), now);
    expect(r.why).toMatchObject({ keywords: ["crypto"], keywordPoints: 17 });
    expect(r.why.scale).toBeUndefined();
    expect(r.score).toBe(30 + 20 + 17 + 10);
  });

  it("three topics at weight 3 can fill the topic bar", () => {
    const three = profile({ keywords: { crypto: 3, payments: 3, kyc: 3 } });
    expect(scoreJob(job({ description: "crypto payments kyc" }), three, now)).toMatchObject({ score: 100, why: { keywordPoints: 40 } });
    expect(scoreJob(job({ description: "crypto payments" }), three, now)).toMatchObject({ score: 87, why: { keywordPoints: 27 } });
    expect(scoreJob(job({ title: "Product Manager", location: "Remote - EMEA", description: "crypto", postedAt: daysAgo(30) }), three, now).score).toBe(20 + 15 + 13 + 2);
  });

  it("with no topics, title + location + freshness are scaled to 0..100", () => {
    const none = profile({ keywords: {} });
    const best = scoreJob(job(), none, now);
    expect(best.why).toMatchObject({ keywordPoints: 0, scale: 100 / 60 });
    expect(best.score).toBe(100);
    // Right title and place, posted this week: a strong match.
    expect(scoreJob(job({ title: "Product Manager", postedAt: daysAgo(5) }), none, now).score).toBe(Math.round((20 + 20 + 6) * (100 / 60)));
    expect(scoreJob(job({ title: "Product Manager", location: "Remote - EMEA", postedAt: daysAgo(30) }), none, now).score).toBe(62);
    expect(scoreJob(job({ location: "London" }), none, now).score).toBe(0);
  });

  it("gives 20 for a title without a seniority term", () => {
    expect(scoreJob(job({ title: "Product Manager" }), profile(), now).why.title).toBe(20);
  });

  it("caps keyword points at 40", () => {
    const heavy = profile({ keywords: { crypto: 5, tokenization: 5, stablecoin: 5, exchange: 5, payments: 5, fintech: 5, ai: 5, kyc: 5, defi: 5 } });
    const r = scoreJob(job({ description: "crypto tokenization stablecoin exchange payments fintech ai kyc defi" }), heavy, now);
    expect(r.why.keywordPoints).toBe(40);
    expect(r.score).toBe(100);
  });

  it("scores 0 with gate=title when the title misses include or hits exclude", () => {
    expect(scoreJob(job({ title: "Software Engineer" }), profile(), now)).toMatchObject({ score: 0, why: { gate: "title" } });
    expect(scoreJob(job({ title: "Senior Product Marketing Manager" }), profile(), now)).toMatchObject({
      score: 0,
      why: { gate: "title" },
    });
  });

  it("scores 0 with gate=location when the location doesn't fit", () => {
    expect(scoreJob(job({ location: "London" }), profile(), now)).toMatchObject({ score: 0, why: { gate: "location" } });
  });

  it("accepts remote regions but not excluded ones", () => {
    expect(scoreJob(job({ location: "Remote - EMEA" }), profile(), now).why.location).toBe(15);
    expect(scoreJob(job({ location: "Remote (US)" }), profile(), now).why.gate).toBe("location");
    expect(scoreJob(job({ location: "SF, NYC, Remote (US)" }), profile(), now).why.gate).toBe("location");
  });

  it("an included city wins even if an excluded region is also listed", () => {
    expect(scoreJob(job({ location: "Dubai; Remote (US)" }), profile(), now).why.location).toBe(20);
  });

  it("treats workplace=remote as remote even when the location text doesn't say so", () => {
    expect(scoreJob(job({ location: "", workplace: "remote" }), profile(), now).why.location).toBe(15);
    expect(scoreJob(job({ location: "Canada", workplace: "remote" }), profile(), now).why.gate).toBe("location");
  });

  it("freshness: 10 within 3 days, 6 within 7, else 2", () => {
    expect(scoreJob(job({ postedAt: daysAgo(3) }), profile(), now).why.freshness).toBe(10);
    expect(scoreJob(job({ postedAt: daysAgo(6) }), profile(), now).why.freshness).toBe(6);
    expect(scoreJob(job({ postedAt: daysAgo(30) }), profile(), now).why.freshness).toBe(2);
  });

  it("falls back to first-seen date when the ATS gives no posting date", () => {
    expect(scoreJob(job({ postedAt: undefined }), profile(), now, new Date(daysAgo(10))).why.freshness).toBe(2);
    expect(scoreJob(job({ postedAt: undefined }), profile(), now).why.freshness).toBe(10);
  });
});

describe("location: only places the user picked", () => {
  // Like the real profile that leaked: UAE, UK, US, Ireland, plus remote in a few regions and plain "remote".
  const wide = profile({
    locations: {
      include: ["dubai", "uae", "united arab emirates", "emirates", "united kingdom", "uk", "wales", "london", "united states", "us", "america", "new york", "ireland"],
      remote_ok: ["emea", "mena", "gcc", "europe", "eu", "anywhere", "worldwide", "global", "remote"],
      remote_exclude: [],
    },
  });
  const loc = (location: string, workplace: "onsite" | "remote" | "hybrid" | "unknown" = "remote", p = wide) => scoreJob(job({ location, workplace }), p, now).why;

  it.each(["India", "Asia; Hong Kong; Taiwan, Taipei", "Portugal", "Argentina", "Remote, Ontario; Remote, British Columbia", "AMER - Remote", "LatAm", "Chennai or Remote, India", "Bogota"])(
    "drops remote jobs tied to somewhere else: %s",
    (where) => expect(loc(where).gate).toBe("location"),
  );

  it("explains why, naming the place", () => {
    expect(loc("Chennai or Remote, India").locationNote).toBe("Remote, but only in India: not one of your places.");
    expect(loc("AMER - Remote").locationNote).toBe("Remote, but only in Americas: not one of your places.");
    expect(loc("Remote (async)", "unknown").locationNote).toMatch(/limited to "async"/);
    expect(loc("Berlin", "onsite").locationNote).toBeUndefined();
  });

  it.each([
    ["Remote", 15],
    ["Fully remote, any time zone", 15],
    ["Remote - EMEA", 15],
    ["Remote - Global", 15],
    ["Amsterdam, Netherlands; Remote - Europe", 15],
    ["Remote (US)", 20],
    ["Dubai", 20],
    ["London, England, United Kingdom", 20],
  ] as const)("keeps %s", (where, points) => expect(loc(where).location).toBe(points));

  it("lets the longest place name win", () => {
    expect(loc("North America", "onsite").gate).toBe("location"); // not "america"
    expect(loc("Sydney, New South Wales", "onsite").gate).toBe("location"); // not "wales"
    expect(loc("Cardiff, Wales", "onsite").location).toBe(20);
    const york = profile({ locations: { include: ["york"], remote_ok: [], remote_exclude: [] } });
    expect(loc("New York, NY", "onsite", york).gate).toBe("location");
    expect(loc("York, England", "onsite", york).location).toBe(20);
    // Names of the same place never hide each other.
    const emirates = profile({ locations: { include: ["emirates"], remote_ok: [], remote_exclude: [] } });
    expect(loc("Abu Dhabi, United Arab Emirates", "onsite", emirates).location).toBe(20);
  });

  it("counts states, provinces, their codes and U.S. spellings for a country the user picked", () => {
    for (const where of ["Santa Monica, CA/Remote", "California", "Remote-Friendly | Washington, DC (Washington, D.C.)", "U.S. Remote", "AMER - Remote (Tampa, FL)"]) {
      expect(loc(where).location).toBe(20);
    }
    // Canada wasn't picked, so its provinces still don't count.
    expect(loc("Remote, Ontario; Remote, British Columbia").gate).toBe("location");
    const canada = profile({ locations: { include: ["canada"], remote_ok: [], remote_exclude: [] } });
    expect(loc("Remote, Ontario", "remote", canada).location).toBe(20);
    expect(loc("Toronto, ON", "onsite", canada).location).toBe(20);
    // Codes count only in capitals after a comma or bracket.
    expect(loc("Dubai, ca", "onsite", canada).gate).toBe("location");
  });

  it("doesn't count a picked city that the job places in another country", () => {
    const ukIe = profile({ locations: { include: ["united kingdom", "uk", "london", "cambridge", "ireland", "dublin"], remote_ok: [], remote_exclude: [] } });
    expect(loc("Cambridge, MA USA; San Francisco, CA USA", "onsite", ukIe).gate).toBe("location");
    expect(loc("London, Ontario, Canada", "onsite", ukIe).gate).toBe("location");
    expect(loc("Cambridge, England", "onsite", ukIe).location).toBe(20);
    expect(loc("Cambridge", "onsite", ukIe).location).toBe(20);
    // A place inside brackets is its own location.
    expect(loc("Amsterdam, Netherlands (London; Tel Aviv)", "onsite", ukIe).location).toBe(20);
  });

  it("is strict for a UAE-only profile", () => {
    const uae = profile({ locations: { include: ["dubai", "uae", "united arab emirates"], remote_ok: ["mena", "gcc", "remote"], remote_exclude: [] } });
    expect(loc("U.S. Remote", "remote", uae).gate).toBe("location");
    expect(loc("Santa Monica, CA/Remote", "remote", uae).gate).toBe("location");
    expect(loc("Remote - GCC", "remote", uae).location).toBe(15);
    expect(loc("Remote", "remote", uae).location).toBe(15);
  });

  it("still honours remote exclusions, and needs plain remote to be allowed", () => {
    const noUs = profile({ locations: { include: [], remote_ok: ["remote", "emea"], remote_exclude: ["emea"] } });
    expect(loc("Remote - EMEA", "remote", noUs).gate).toBe("location");
    const regionsOnly = profile({ locations: { include: [], remote_ok: ["emea"], remote_exclude: [] } });
    expect(loc("Remote", "remote", regionsOnly).gate).toBe("location");
    expect(loc("Remote - EMEA", "remote", regionsOnly).location).toBe(15);
  });
});
