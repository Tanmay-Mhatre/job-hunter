import { describe, expect, it } from "vitest";
import { checkOrder } from "./check";

const board = (key: string, confidence: "high" | "single", sources: string[] = []) => ({ key, ats: "workable", slug: key, confidence, sources });

describe("check order", () => {
  it("checks boards users shared first, then the ones several sources agree on", () => {
    const boards = [board("single", "single"), board("high", "high"), board("shared", "single", ["contrib"]), board("shared-high", "high", ["latmay", "contrib"])];
    expect(boards.sort(checkOrder).map((b) => b.key)).toEqual(["shared-high", "shared", "high", "single"]);
  });
});
