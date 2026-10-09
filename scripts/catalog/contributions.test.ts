import { describe, expect, it } from "vitest";
import { cleanBoard } from "./contributions";

describe("cleanBoard", () => {
  it("keeps scannable boards and explains the rest", () => {
    expect(cleanBoard({ ats: "lever", slug: "acme", name: " Acme<> " })).toEqual({ ats: "lever", slug: "acme", name: "Acme" });
    expect(cleanBoard({ ats: "greenhouse", slug: "acme", region: "eu" })).toEqual({ ats: "greenhouse", slug: "acme", region: "eu" });
    expect(cleanBoard({ ats: "kenexa", slug: "acme" })).toMatch(/unsupported/);
    expect(cleanBoard({ ats: "taleo", slug: "acme" })).toBe("taleo needs site");
    expect(cleanBoard({ ats: "taleo", slug: "aa010", site: "ex" })).toEqual({ ats: "taleo", slug: "aa010", site: "ex" });
    expect(cleanBoard({ ats: "successfactors", slug: "Acme", shard: "career2.successfactors.eu" })).toEqual({ ats: "successfactors", slug: "Acme", shard: "career2.successfactors.eu" });
    expect(cleanBoard({ ats: "oracle", slug: "abcd", shard: "evil.com/x" })).toBe("bad shard");
    expect(cleanBoard({ ats: "lever", slug: "acme", shard: "wd1" })).toBe("bad shard");
    expect(cleanBoard({ ats: "lever", slug: "../x" })).toBe("bad slug");
    expect(cleanBoard({ ats: "workday", slug: "bank" })).toMatch(/shard and site/);
  });
});
