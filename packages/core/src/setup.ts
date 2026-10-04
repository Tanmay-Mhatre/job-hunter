import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { CONFIG_CANDIDATES } from "./config";
import { detectCompany, getConnector } from "./connectors";
import { HttpClient, HttpError } from "./http";
import { RESUME_PATH } from "./resume";
import { ConfigSchema, type AtsType, type Config } from "./schema";
import { configToYaml } from "./yaml-writer";

/** The user's own config. The shipped jobhunter.config.yaml is only an example. */
export const PERSONAL_CONFIG = CONFIG_CANDIDATES[0]!;

export type SetupStatus = {
  configPath: string;
  /** A personal config file exists. */
  isPersonal: boolean;
  valid: boolean;
  /** Human-readable validation problems when the personal config is broken. */
  errors?: string;
  config?: Config;
  /** Whatever could be parsed from a broken config, for the wizard to prefill from. */
  raw?: unknown;
  /** A run has written data. */
  hasData: boolean;
  /** A master resume is saved (profile/resume.md). */
  hasResume: boolean;
};

export function setupStatus(cwd = process.cwd(), dataDir = resolve(cwd, "data")): SetupStatus {
  const configPath = resolve(cwd, PERSONAL_CONFIG);
  const hasData = existsSync(join(dataDir, "jobs.json"));
  const hasResume = existsSync(resolve(cwd, RESUME_PATH));
  if (!existsSync(configPath)) return { configPath, isPersonal: false, valid: false, hasData, hasResume };

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(configPath, "utf8"));
  } catch (err) {
    return { configPath, isPersonal: true, valid: false, errors: `Not valid YAML: ${(err as Error).message}`, hasData, hasResume };
  }
  const parsed = ConfigSchema.safeParse(raw);
  return parsed.success
    ? { configPath, isPersonal: true, valid: true, config: parsed.data, hasData, hasResume }
    : { configPath, isPersonal: true, valid: false, errors: z.prettifyError(parsed.error), raw, hasData, hasResume };
}

export type SaveResult = { ok: true; path: string } | { ok: false; errors: string; issues: { path: string; message: string }[] };

/** Validate a config object (from the wizard) and write it as commented YAML. */
export function saveConfig(input: unknown, cwd = process.cwd()): SaveResult {
  const parsed = ConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: z.prettifyError(parsed.error),
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const path = resolve(cwd, PERSONAL_CONFIG);
  writeFileSync(path, configToYaml(parsed.data));
  return { ok: true, path };
}

export type CompanyCheck = {
  input: string;
  /**
   * ok: feed works · soon: recognised ATS, connector not built yet · error: recognised but the
   * feed failed (usually a wrong link) · unknown: not a careers site we recognise.
   */
  status: "ok" | "soon" | "error" | "unknown";
  name?: string;
  ats?: AtsType;
  slug?: string;
  region?: "global" | "eu";
  shard?: string;
  site?: string;
  jobs?: number;
  sampleTitles?: string[];
  error?: string;
};

/** Detect each careers URL and, where we have a connector, fetch it once to prove it works. */
export async function checkCompanies(inputs: readonly string[], http = new HttpClient({ retries: 1 })): Promise<CompanyCheck[]> {
  const out: CompanyCheck[] = [];
  for (const raw of inputs) {
    const input = raw.trim();
    if (!input) continue;
    const found = detectCompany(input);
    if (!found) {
      out.push({ input, status: "unknown", error: "Not a careers site we recognise yet." });
      continue;
    }
    const { supported, ...ref } = found;
    const base: CompanyCheck = { input, status: "soon", ...ref };
    if (!supported) {
      if (ref.ats === "workday" && !ref.site) base.error = "Use the full Workday link, including the site name (e.g. …/en-US/External).";
      out.push(base);
      continue;
    }
    try {
      const connector = getConnector(ref.ats)!;
      const company = { ...ref, enabled: true };
      const jobs = await connector.fetch(company, { http, now: new Date() });
      if (!jobs.length) {
        out.push({ ...base, status: "error", error: "No open jobs on this board. Check the link: some sites show an empty board for a wrong company name." });
        continue;
      }
      const normalized = [...new Set(jobs.map((j) => connector.normalize(j, company).title))].slice(0, 3);
      // Greenhouse and SmartRecruiters tell us the real company name.
      const first = jobs[0] as { company_name?: string; company?: { name?: string } } | undefined;
      const realName = first?.company_name ?? first?.company?.name;
      out.push({ ...base, status: "ok", name: realName || ref.name, jobs: jobs.length, sampleTitles: normalized });
    } catch (err) {
      const msg =
        err instanceof HttpError && err.status === 404
          ? "Not found. Check the link: open it in a browser and copy the careers page address."
          : (err as Error).message;
      out.push({ ...base, status: "error", error: msg });
    }
  }
  return out;
}
