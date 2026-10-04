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
      keywordPoints: 14,
      freshness: 10,
    });
    expect(r.score).toBe(74);
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
