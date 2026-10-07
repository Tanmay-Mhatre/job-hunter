import { describe, expect, it } from "vitest";
import { cleanBoardName, sameCompanyStrict } from "./crossprobe";

describe("cleanBoardName", () => {
  it("strips the board's own words around the company name", () => {
    expect(cleanBoardName("Ramp Jobs")).toBe("Ramp");
    expect(cleanBoardName("Jobs at Acme &amp; Co")).toBe("Acme & Co");
    expect(cleanBoardName("Palantir Technologies")).toBe("Palantir Technologies");
    expect(cleanBoardName("Acme - Careers")).toBe("Acme");
  });
});

describe("sameCompanyStrict", () => {
  it("accepts the same company under suffixes and spacing", () => {
    expect(sameCompanyStrict("Palantir", "Palantir Technologies")).toBe(true);
    expect(sameCompanyStrict("Door Dash", "DoorDash, Inc.")).toBe(true);
  });
  it("rejects a different company sharing a word", () => {
    expect(sameCompanyStrict("Kraken", "Kraken Robotics")).toBe(false);
    expect(sameCompanyStrict("Rain", "Rain Industries")).toBe(false);
  });
});
