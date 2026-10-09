import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { COUNTRIES, countryTerms, REGIONS, searchPlaces } from "../src/catalog/places";
import { allTitles, ROLE_FAMILIES, SENIORITY } from "../src/catalog/roles";
import { readResume, saveResume } from "../src/resume";
import { detectFromResume, parseAiAnswer } from "../src/resume-parse";

const RESUME = `# Jane Doe
Dubai, UAE · jane@example.com

## Summary
Senior Product Manager with 9 years in payments, crypto exchanges and tokenization of real-world assets.

## Experience
### Senior Product Manager, Acme Exchange — Dubai, United Arab Emirates (Jan 2022 – Present)
- Launched stablecoin payments used by 2M customers; cut KYC onboarding time by 40%.
### Product Manager, PayCo — London, United Kingdom (Mar 2018 – Dec 2021)
- Built card issuing and merchant checkout for 30k merchants.

## Skills
Payments, crypto, KYC, AML, B2B APIs, SQL`;

const AI_ANSWER = `Here's your master resume, merged from both versions:

${RESUME}

\`\`\`json
{
  "rawjobs_profile": {
    "target_titles": ["Senior Product Manager", "head of product", "product lead", "head of product"],
    "seniority": ["senior", "head"],
    "exclude_titles": ["intern"],
    "locations": ["dubai", "abu dhabi"],
    "open_to_remote": true,
    "remote_regions": ["emea"],
    "keywords": { "payments": 5, "crypto": 9, "kyc": "3", "tokenization": 0 },
    "industries": ["Brokerage", "crypto-exchange", "space tourism"],
    "past_employers": ["Acme Exchange", " PayCo ", "Acme Exchange", 7]
  }
}
\`\`\`

Let me know if you'd like a shorter version!`;

describe("parseAiAnswer", () => {
  it("splits the master resume from the profile block and drops chat filler", () => {
    const r = parseAiAnswer(AI_ANSWER);
    expect(r.resume.startsWith("# Jane Doe")).toBe(true);
    expect(r.resume).toContain("## Skills");
    expect(r.resume).not.toContain("rawjobs_profile");
    expect(r.resume).not.toContain("Let me know");
    expect(r.profile).toEqual({
      target_titles: ["senior product manager", "head of product", "product lead"],
      seniority: ["senior", "head"],
      exclude_titles: ["intern"],
      locations: ["dubai", "abu dhabi"],
      open_to_remote: true,
      remote_regions: ["emea"],
      keywords: { payments: 5, crypto: 5, kyc: 3, tokenization: 1 },
      // Labels map to ids; unknown industries are dropped.
      industries: ["brokerage", "crypto", "crypto-exchange"],
      // Casing kept, duplicates and non-strings dropped.
      past_employers: ["Acme Exchange", "PayCo"],
    });
    expect(r.warnings).toEqual([]);
  });

  it("reads a bare (unfenced) JSON block, also under the key from before the rename", () => {
    const bare = `${RESUME}\n\n{"jobhunter_profile": {"target_titles": ["product lead"], "keywords": ["payments", "crypto"]}}`;
    const r = parseAiAnswer(bare);
    expect(r.profile?.target_titles).toEqual(["product lead"]);
    expect(r.profile?.keywords).toEqual({ payments: 3, crypto: 3 });
    expect(r.resume.endsWith("SQL")).toBe(true);
  });

  it("works without any profile block, and warns on broken JSON or a short paste", () => {
    expect(parseAiAnswer(RESUME)).toMatchObject({ profile: undefined, warnings: [] });
    const broken = parseAiAnswer(`${RESUME}\n\`\`\`json\n{ "rawjobs_profile": { "target_titles": [ }\n\`\`\``);
    expect(broken.profile).toBeUndefined();
    expect(broken.warnings.join(" ")).toMatch(/JSON looks broken/);
    expect(parseAiAnswer("# Me\nshort").warnings.join(" ")).toMatch(/very short/);
  });

  it("unwraps an answer wrapped in a markdown fence", () => {
    const r = parseAiAnswer("Sure!\n```markdown\n" + RESUME + "\n```");
    expect(r.resume.startsWith("# Jane Doe")).toBe(true);
    expect(r.resume).not.toContain("```");
  });
});

describe("detectFromResume", () => {
  it("finds titles, places and topics offline", () => {
    const d = detectFromResume(RESUME, {
      titles: allTitles().map((t) => t.title),
      countries: COUNTRIES,
      keywords: { payments: 5, crypto: 5, kyc: 3, aml: 3, tokenization: 4, "machine learning": 4 },
    });
    expect(d.titles[0]).toBe("product manager");
    expect(d.places).toEqual(["united arab emirates", "dubai", "london", "united kingdom"]);
    expect(d.keywords.map(([k]) => k)).toEqual(["crypto", "payments", "tokenization", "aml", "kyc"]);
  });

  it("returns nothing for tiny input", () => {
    expect(detectFromResume("hi", { titles: ["x"], countries: COUNTRIES, keywords: {} })).toEqual({ titles: [], places: [], keywords: [], industries: [] });
  });
});

describe("saveResume / readResume", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("round-trips profile/resume.md and rejects empty text", () => {
    dir = mkdtempSync(join(tmpdir(), "rawjobs-resume-"));
    expect(readResume(dir).text).toBeNull();
    expect(saveResume("   ", dir)).toMatchObject({ ok: false });
    expect(saveResume("# Me\r\nline", dir)).toMatchObject({ ok: true });
    expect(existsSync(join(dir, "profile", "resume.md"))).toBe(true);
    expect(readResume(dir)).toMatchObject({ text: "# Me\nline\n" });
  });
});

describe("catalogues", () => {
  const lower = (s: string) => s === s.toLowerCase() && s === s.trim();

  it("roles: lowercase, no duplicates inside a family, 400+ titles", () => {
    for (const f of ROLE_FAMILIES) {
      expect(new Set(f.titles).size, f.id).toBe(f.titles.length);
      for (const t of [...f.titles, ...f.exclude]) expect(lower(t), t).toBe(true);
    }
    expect(new Set(ROLE_FAMILIES.map((f) => f.id)).size).toBe(ROLE_FAMILIES.length);
    expect(ROLE_FAMILIES.length).toBeGreaterThanOrEqual(30);
    expect(allTitles().length).toBeGreaterThanOrEqual(400);
    expect(SENIORITY.every(lower)).toBe(true);
  });

  it("roles: every family suggests at least 8 distinct lowercase topics", () => {
    for (const f of ROLE_FAMILIES) {
      expect(f.topics.length, f.id).toBeGreaterThanOrEqual(8);
      expect(new Set(f.topics).size, f.id).toBe(f.topics.length);
      for (const t of f.topics) expect(lower(t), t).toBe(true);
    }
  });

  it("places: every country has a lowercase name and a city; no duplicate countries", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(180);
    expect(new Set(COUNTRIES.map((c) => c.name)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) {
      expect(lower(c.name), c.name).toBe(true);
      expect(c.cities.length, c.name).toBeGreaterThan(0);
      for (const t of [...c.aliases, ...c.cities]) expect(lower(t), t).toBe(true);
    }
    for (const r of REGIONS) expect(lower(r.name)).toBe(true);
  });

  it("searchPlaces ranks exact and prefix matches first, across countries, cities and regions", () => {
    expect(searchPlaces("kenya")[0]).toMatchObject({ kind: "country", country: { name: "kenya" } });
    expect(searchPlaces("riyadh")[0]).toMatchObject({ kind: "city", city: "riyadh" });
    expect(searchPlaces("uae")[0]).toMatchObject({ kind: "country", country: { name: "united arab emirates" } });
    expect(searchPlaces("emea")[0]).toMatchObject({ kind: "region" });
    expect(searchPlaces("")).toEqual([]);
    const ke = COUNTRIES.find((c) => c.name === "kenya")!;
    expect(countryTerms(ke, true)).toEqual(["kenya", "nairobi", "mombasa"]);
    expect(countryTerms(ke, false)).toEqual(["kenya"]);
  });
});

describe("groupPlaces", () => {
  it("groups a country's name, aliases and cities into one selection, in first-seen order", async () => {
    const { groupPlaces } = await import("../src/catalog/places");
    const groups = groupPlaces(["dubai", "uae", "london", "abu dhabi", "united arab emirates", "kenya", "remote", "middle east", "mena"]);
    expect(groups.map((g) => [g.key, g.terms])).toEqual([
      ["country:united arab emirates", ["dubai", "uae", "abu dhabi", "united arab emirates"]],
      ["country:united kingdom", ["london"]],
      ["country:kenya", ["kenya"]],
      ["term:remote", ["remote"]],
      ["region:mena", ["middle east", "mena"]],
    ]);
    const uae = groups[0]!;
    expect(uae.options).toEqual(expect.arrayContaining(["united arab emirates", "uae", "emirates", "dubai", "abu dhabi", "sharjah"]));
    expect(groupPlaces([])).toEqual([]);
  });
});
