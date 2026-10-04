import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";
import { detectCompany } from "../src/connectors";
import { diagnoseNoMatches } from "../src/diagnose";
import type { Job } from "../src/schema";
import { checkCompanies, saveConfig, setupStatus } from "../src/setup";
import { configToYaml } from "../src/yaml-writer";
import { fakeHttp, fixture, json } from "./helpers";

const example = parseConfig(readFileSync(new URL("../../../jobhunter.config.yaml", import.meta.url), "utf8"));

describe("configToYaml", () => {
  it("writes an empty company list that reads back as empty, not null", () => {
    const empty = { ...example, companies: [] };
    expect(configToYaml(empty)).toContain("companies: []");
    expect(parseConfig(configToYaml(empty)).companies).toEqual([]);
  });

  it("round-trips through parseConfig, with comments", () => {
    const yaml = configToYaml(example);
    expect(parseConfig(yaml)).toEqual(example);
    expect(yaml).toContain("# A job's title must contain one of these");
  });

  it("quotes awkward values and keeps optional company fields", () => {
    const cfg = parseConfig(`
profile:
  name: 'Quotes "and" colons: yes'
  titles: { include: ["c++ engineer", "head: product"] }
  locations: { include: ["zürich"] }
  keywords: { "open banking": 3, "e-commerce": 2 }
companies:
  - { name: "Bank #1", ats: workday, slug: "bank", shard: "wd3", site: "External", careers_url: "https://bank.wd3.myworkdayjobs.com/External" }
  - { name: "Off", ats: lever, slug: "off", region: eu, enabled: false }
`);
    expect(parseConfig(configToYaml(cfg))).toEqual(cfg);
  });
});

describe("detectCompany for not-yet-supported ATSs", () => {
  it.each([
    ["https://acme.wd3.myworkdayjobs.com/en-US/External", { ats: "workday", slug: "acme", shard: "wd3", site: "External", supported: false }],
    ["https://acme.wd5.myworkdayjobs.com/Careers/job/Dubai/PM_123", { ats: "workday", slug: "acme", shard: "wd5", site: "Careers" }],
    ["https://careers.smartrecruiters.com/AcmeCorp", { ats: "smartrecruiters", slug: "AcmeCorp" }],
    ["https://apply.workable.com/acme/", { ats: "workable", slug: "acme" }],
    ["https://acme.recruitee.com/", { ats: "recruitee", slug: "acme" }],
    ["https://acme.jobs.personio.de/", { ats: "personio", slug: "acme" }],
    ["https://acme.bamboohr.com/careers", { ats: "bamboohr", slug: "acme" }],
    ["https://acme.breezy.hr/", { ats: "breezy", slug: "acme" }],
  ])("%s", (url, expected) => {
    expect(detectCompany(url)).toMatchObject(expected);
  });

  it("marks built connectors as supported", () => {
    expect(detectCompany("https://jobs.lever.co/acme")).toMatchObject({ supported: true });
  });
});

describe("checkCompanies", () => {
  it("reports ok / error / soon / unknown", async () => {
    const { http, calls } = fakeHttp((url) => (url.includes("greenhouse") ? json(fixture("greenhouse.json")) : json({}, 404)));
    const res = await checkCompanies(
      ["https://job-boards.greenhouse.io/acme", " jobs.lever.co/nope ", "https://acme.wd3.myworkdayjobs.com/en-US", "https://example.com/careers", ""],
      http,
    );
    expect(res.map((r) => r.status)).toEqual(["ok", "error", "soon", "unknown"]);
    expect(res[0]).toMatchObject({ name: "Acme", ats: "greenhouse", slug: "acme", jobs: 3 });
    expect(res[0]!.sampleTitles).toHaveLength(3);
    expect(res[1]!.error).toMatch(/Not found/);
    expect(res[2]!.error).toMatch(/full Workday link/); // no site in that URL
    expect(calls).toHaveLength(2); // never fetches unsupported or unknown
  });
});

describe("saveConfig / setupStatus", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("only counts the .local file as personal, and writes a valid one", () => {
    dir = mkdtempSync(join(tmpdir(), "jobhunter-setup-"));
    writeFileSync(join(dir, "jobhunter.config.yaml"), configToYaml(example));
    expect(setupStatus(dir)).toMatchObject({ isPersonal: false, valid: false, hasData: false });

    const res = saveConfig(example, dir);
    expect(res.ok).toBe(true);
    const status = setupStatus(dir);
    expect(status).toMatchObject({ isPersonal: true, valid: true });
    expect(status.config).toEqual(example);
  });

  it("rejects an invalid config with readable issues, and reports a broken file", () => {
    dir = mkdtempSync(join(tmpdir(), "jobhunter-setup-"));
    const res = saveConfig({ ...example, profile: { ...example.profile, titles: { include: [], exclude: [] } } }, dir);
    expect(res).toMatchObject({ ok: false, issues: [{ path: "profile.titles.include", message: "add at least one title to titles.include" }] });
    expect(saveConfig({ ...example, companies: [] }, dir)).toMatchObject({ ok: true });

    writeFileSync(join(dir, "jobhunter.config.local.yaml"), "profile: { titles: { include: [] } }\n");
    const status = setupStatus(dir);
    expect(status).toMatchObject({ isPersonal: true, valid: false });
    expect(status.errors).toMatch(/titles\.include/);
    expect(status.raw).toBeTruthy();
  });
});

describe("diagnoseNoMatches", () => {
  const base = { ats: "lever", company: "A", url: "u", workplace: "onsite", firstSeen: "x", lastSeen: "x", status: "open", score: 0 } as const;
  const j = (id: string, title: string, location: string, why: Partial<Job["why"]>): Job => ({
    ...base,
    id,
    title,
    location,
    why: { title: 0, location: 0, keywords: [], keywordPoints: 0, freshness: 2, ...why },
  });

  it("counts gate failures and lists near misses", () => {
    const jobs = [
      j("1", "Software Engineer", "Dubai", { gate: "title", location: 20 }),
      j("2", "Software Engineer", "Dubai", { gate: "title", location: 20 }),
      j("3", "Designer", "London", { gate: "title" }),
      j("4", "Product Manager", "London", { gate: "location", title: 20 }),
      j("5", "Senior Product Manager", "London", { gate: "location", title: 30 }),
      j("6", "Product Manager", "New York", { gate: "location", title: 20 }),
      { ...j("7", "Product Manager", "Dubai", { title: 20, location: 20 }), score: 50 },
      { ...j("8", "Old PM", "London", { gate: "location" }), status: "closed" as const },
    ];
    expect(diagnoseNoMatches(jobs)).toEqual({
      scanned: 7,
      matched: 1,
      titleMiss: 3,
      locationMiss: 3,
      nearMissLocations: [
        { location: "London", count: 2 },
        { location: "New York", count: 1 },
      ],
      nearMissTitles: ["Software Engineer"],
    });
  });
});
