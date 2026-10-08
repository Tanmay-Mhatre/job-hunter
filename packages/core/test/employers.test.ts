import { describe, expect, it } from "vitest";
import { companyWords, employersFromResume, lookalikes, matchEmployers, rolesFromResume, seedFromRole, similarity, shapeOf, type CompanyShape } from "../src/employers";
import type { CompanySuggestion, IndexRow } from "../src/suggest";

const PLAIN = `JANE DOE
Dubai, UAE | jane@example.com

SUMMARY
Product manager in trading and crypto.

PROFESSIONAL EXPERIENCE
Senior Product Manager | Northwind Abu Dhabi, UAE | 10/2025 – Present
• Launched tokenized real-world assets.
Senior Product Manager | Contoso Financial Dubai, UAE | 12/2024 – 10/2025
Product Manager | Fabrikam Technologies Ltd. Mumbai, India | 09/2018 – 07/2020
Senior Product Manager | Tidewave Remote | 08/2020 – 05/2023
• Ran the crypto exchange spot trading and futures roadmap; crypto exchange listings.
EDUCATION
MBA – Information Technology, St. Francis Institute, Mumbai, India | 08/2015 – 06/2017`;

const MARKDOWN = `# Jane Doe

## Experience
### Senior Product Manager, Acme Exchange — Dubai, United Arab Emirates (Jan 2022 – Present)
- Launched stablecoin payments.
### Product Manager at PayCo — London (Mar 2018 – Dec 2021)
- Built card issuing.
### Product Manager, Acme Exchange — Dubai (2020 – 2021)

## Skills
Payments`;

const COMMAS = `Work Experience
Head of Product, Rain, Dubai, UAE, 2023 - present
**Bitpanda** | Product Lead | Vienna | 2019 – 2023
Education
BSc`;

describe("employersFromResume", () => {
  it("reads 'Title | Company City | dates' lines and strips the location", () => {
    expect(employersFromResume(PLAIN)).toEqual(["Northwind", "Contoso Financial", "Fabrikam Technologies Ltd.", "Tidewave"]);
  });

  it("reads Markdown role headings ('Title, Company — City', 'Title at Company') and folds repeats", () => {
    expect(employersFromResume(MARKDOWN)).toEqual(["Acme Exchange", "PayCo"]);
  });

  it("reads comma lines and 'Company | Title' lines, and stops at the next section", () => {
    expect(employersFromResume(COMMAS)).toEqual(["Rain", "Bitpanda"]);
  });

  it("finds nothing without an experience section", () => {
    expect(employersFromResume("Just some text about payments in 2020.")).toEqual([]);
  });

  it("keeps each role's lines, so a role can seed lookalikes by its industries", () => {
    const tidewave = rolesFromResume(PLAIN).find((r) => r.company === "Tidewave")!;
    expect(tidewave.text).toContain("spot trading");
    expect(seedFromRole(tidewave).tags).toContain("crypto-exchange");
  });
});

describe("matchEmployers", () => {
  const dir = [
    { key: "lever:binance", name: "Binance", status: "live", open_jobs: 40 },
    { key: "greenhouse:binanceus", name: "Binance.US", status: "live", open_jobs: 5 },
    { key: "ashby:contoso", name: "Contoso", status: "live", open_jobs: 3 },
    { key: "ashby:gusto", name: "Gusto, Inc.", status: "dormant", open_jobs: 0 },
    { key: "greenhouse:gusto", name: "Gusto", status: "live", open_jobs: 12 },
    { key: "ashby:abc", name: "ABC", status: "live", open_jobs: 9 },
  ];

  it("matches by name, ignoring case and legal suffixes, and prefers the live board", () => {
    expect(matchEmployers(["BINANCE", "Gusto Inc"], dir).map((m) => m.match?.key)).toEqual(["lever:binance", "greenhouse:gusto"]);
  });

  it("matches a directory name that starts the employer's name, but not short ones", () => {
    expect(matchEmployers(["Contoso Financial", "ABC Technology Solutions (XYZ)"], dir).map((m) => m.match?.key)).toEqual(["ashby:contoso", undefined]);
  });

  it("doesn't confuse Binance.US with Binance", () => {
    expect(matchEmployers(["Binance US"], dir)[0]!.match?.key).toBe("greenhouse:binanceus");
    expect(companyWords("Binance.US")).toEqual(["binance", "us"]);
  });
});

const pmRow = (location: string): IndexRow => ["Senior Product Manager", location, "onsite", 1, 1];
const engRow = (location: string): IndexRow => ["Software Engineer", location, "onsite", 1, 1];
const sugg = (key: string, score: number): CompanySuggestion => ({
  key,
  name: key,
  ats: "lever",
  slug: key,
  careers_url: "",
  open_jobs: 10,
  score,
  matches: 1,
  new_matches: 0,
  near_misses: 0,
  elsewhere: 0,
  in_your_places: 0,
  examples: [],
  topics: [],
  industries: [],
  hires_for: [],
  reasons: ["1 open role matches you"],
});

describe("lookalikes", () => {
  const companies: Record<string, { tags: string[]; rows: IndexRow[] }> = {
    exchange: { tags: ["crypto", "crypto-exchange"], rows: [pmRow("Dubai, UAE"), engRow("Dubai")] },
    wallet: { tags: ["crypto"], rows: [engRow("Berlin, Germany")] },
    bank: { tags: ["banking"], rows: [pmRow("Dubai, UAE")] },
  };
  const candidates = Object.keys(companies).map((k) => sugg(k, 60));

  it("needs a shared industry, ranks closer companies first and says why", () => {
    const seed = { name: "Tidewave", key: "x:tidewave", tags: ["crypto", "crypto-exchange"], rows: [pmRow("Dubai, UAE")] };
    // The bank shares no industry, so it never shows; the wallet is alike only in part.
    expect(lookalikes(seed, candidates, (k) => companies[k], new Map(), { minSimilarity: 0 }).map((s) => s.key)).toEqual(["exchange", "wallet"]);
    const r = lookalikes(seed, candidates, (k) => companies[k], new Map());
    expect(r.map((s) => s.key)).toEqual(["exchange"]);
    expect(r[0]!.reasons[0]).toBe("Like Tidewave: Crypto & Web3, Crypto exchange · hires Product Management");
  });

  it("ignores role mix for a seed read from the resume", () => {
    const shape = (rows: IndexRow[]): CompanyShape => shapeOf({ tags: ["crypto"], rows });
    expect(similarity(shape([pmRow("Dubai")]), shape([pmRow("Dubai")]))).toBe(100);
    const seed = { ...seedFromRole({ company: "Tidewave", text: "Senior Product Manager | Tidewave Remote | 2020\ncrypto exchange and crypto" }) };
    const r = lookalikes(seed, candidates, (k) => companies[k], new Map());
    expect(r[0]!.reasons[0]).not.toContain("hires");
  });
});
