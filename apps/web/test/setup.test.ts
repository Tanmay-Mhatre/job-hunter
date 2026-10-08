import { describe, expect, it } from "vitest";
import { emptyDraft, rebaseDraft, type Draft } from "../src/lib/setup";

const base: Draft = { ...emptyDraft(), include: ["product manager"], places: ["dubai"] };
const row = (slug: string) => ({ id: slug, input: `https://jobs.lever.co/${slug}`, state: "saved" as const, name: slug, ats: "lever" as const, slug });

describe("rebaseDraft", () => {
  it("takes the newly saved value for fields the user hasn't touched", () => {
    const next = { ...base, companies: [row("kraken")] };
    expect(rebaseDraft(base, base, next).companies).toEqual([row("kraken")]);
  });

  it("keeps unsaved edits to other fields (a Settings edit survives a Companies auto-save)", () => {
    const draft = { ...base, places: ["dubai", "london"], companies: [row("kraken")] };
    const next = { ...base, companies: [row("kraken")] };
    const out = rebaseDraft(draft, base, next);
    expect(out.places).toEqual(["dubai", "london"]);
    expect(out.companies).toEqual([row("kraken")]);
  });

  it("leaves nothing dirty once the auto-saved fields match what was saved", () => {
    const draft = { ...base, companies: [row("kraken")], muted: ["lever:bybit"] };
    const next = { ...base, companies: [row("kraken")], muted: ["lever:bybit"] };
    expect(JSON.stringify(rebaseDraft(draft, base, next))).toBe(JSON.stringify(next));
  });
});
