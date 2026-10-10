import { describe, expect, it } from "vitest";
import { advanceSeen } from "../src/lib/newSince";

const S1 = "2026-10-10T09:00:00.000Z";
const S2 = "2026-10-10T12:00:00.000Z";
const S3 = "2026-10-10T15:00:00.000Z";

describe("advanceSeen", () => {
  it("starts from the previous scan when nothing is stored", () => {
    expect(advanceSeen(null, S2, S1)).toEqual({ latest: S2, since: S1 });
  });
  it("keeps the same line on a reload, so New tags don't vanish", () => {
    const seen = { latest: S2, since: S1 };
    expect(advanceSeen(seen, S2, S1)).toBe(seen);
  });
  it("moves the line to the last scan you saw, however many scans ran since", () => {
    // Saw S1; S2 and S3 ran while you were away: both their finds are new.
    expect(advanceSeen({ latest: S1 }, S3, S2)).toEqual({ latest: S3, since: S1 });
  });
  it("starts over when the data is older than what was seen", () => {
    expect(advanceSeen({ latest: S3, since: S2 }, S2, S1)).toEqual({ latest: S2, since: S1 });
  });
});
