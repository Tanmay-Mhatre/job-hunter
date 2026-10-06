import { describe, expect, it } from "vitest";
import { cleanBoard } from "./contributions";

describe("cleanBoard", () => {
  it("keeps scannable boards and explains the rest", () => {
    expect(cleanBoard({ ats: "lever", slug: "acme", name: " Acme<> " })).toEqual({ ats: "lever", slug: "acme", name: "Acme" });
    expect(cleanBoard({ ats: "greenhouse", slug: "acme", region: "eu" })).toEqual({ ats: "greenhouse", slug: "acme", region: "eu" });
    expect(cleanBoard({ ats: "taleo", slug: "acme" })).toMatch(/unsupported/);
    expect(cleanBoard({ ats: "lever", slug: "../x" })).toBe("bad slug");
    expect(cleanBoard({ ats: "workday", slug: "bank" })).toMatch(/shard and site/);
  });
});
