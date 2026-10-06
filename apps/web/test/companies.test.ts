import { describe, expect, it } from "vitest";
import { groupBoards } from "../src/lib/companies";

const b = (key: string, name: string, status = "live", open_jobs: number | null = 10) => ({ key, name, ats: key.split(":")[0]!, status, open_jobs });

describe("groupBoards", () => {
  it("shows one row per company, leading with its best board and dropping dead ones", () => {
    const groups = groupBoards([
      b("smartrecruiters:binance", "Binance", "live", 4),
      b("greenhouse:binance", "Binance", "dormant", 0),
      b("lever:binance", "Binance", "live", 311),
      b("ashby:binance.us", "Binance.US", "live", 7),
    ]);
    expect(groups.map((g) => [g.lead.key, g.others.map((o) => o.key)])).toEqual([
      ["lever:binance", ["smartrecruiters:binance"]],
      ["ashby:binance.us", []],
    ]);
  });

  it("prefers a board we can scan, and treats company suffixes as the same name", () => {
    const [g] = groupBoards([b("workday:gusto|wd1|x", "Gusto", "live", 50), b("greenhouse:gusto", "Gusto, Inc.", "live", 20)]);
    expect(g!.lead.key).toBe("greenhouse:gusto");
    expect(g!.others.map((o) => o.key)).toEqual(["workday:gusto|wd1|x"]);
  });

  it("keeps a dead board you watch, and keeps dead boards when nothing is live", () => {
    const watched = new Set(["greenhouse:old"]);
    expect(groupBoards([b("lever:old", "Old"), b("greenhouse:old", "Old", "dormant", 0)], watched)[0]!.others.map((o) => o.key)).toEqual(["greenhouse:old"]);
    expect(groupBoards([b("lever:quiet", "Quiet", "dormant", 0)])[0]!.lead.key).toBe("lever:quiet");
  });
});
