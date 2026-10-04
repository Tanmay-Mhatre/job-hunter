import { useCallback, useEffect, useState } from "react";
import { ROLE_FAMILIES } from "@jobhunter/core/catalog/roles";
import { connectors, detectCompany } from "@jobhunter/core/detect";
import type { AiProfile } from "@jobhunter/core/resume-parse";
import type { AtsType, CompanyHealth, Config } from "@jobhunter/core/schema";
import { canRunLocally } from "./data";

// ---------- API (dev server only, see apps/web/vite.config.ts) ----------

export type SetupStatus = {
  configPath: string;
  isPersonal: boolean;
  valid: boolean;
  errors?: string;
  config?: Config;
  raw?: unknown;
  hasData: boolean;
  hasResume: boolean;
};

/** null = no local API (hosted build): setup is done by editing the config file. */
export function useSetupStatus() {
  const [status, setStatus] = useState<SetupStatus | null | undefined>(undefined);
  const refresh = useCallback(async () => {
    if (!canRunLocally) return setStatus(null);
    try {
      const res = await fetch("/api/setup", { cache: "no-store" });
      setStatus(res.ok ? ((await res.json()) as SetupStatus) : null);
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { status, refresh };
}

export type SaveResult = { ok: true; path: string } | { ok: false; errors: string; issues?: { path: string; message: string }[] };

export async function saveConfig(config: Config): Promise<SaveResult> {
  const res = await fetch("/api/setup/config", { method: "POST", body: JSON.stringify(config) });
  return (await res.json()) as SaveResult;
}

export type CompanyCheck = {
  input: string;
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

/** Live check through the local API; offline (hosted) falls back to URL detection only. */
export async function checkCompanies(urls: string[]): Promise<CompanyCheck[]> {
  if (!canRunLocally) {
    return urls.map((input): CompanyCheck => {
      const d = detectCompany(input);
      if (!d) return { input, status: "unknown", error: "Not a careers site we recognise yet." };
      const { supported, ...ref } = d;
      return { input, ...ref, status: supported ? "ok" : "soon" };
    });
  }
  const res = await fetch("/api/setup/check", { method: "POST", body: JSON.stringify({ urls }) });
  if (!res.ok) throw new Error(((await res.json()) as { errors?: string }).errors ?? `HTTP ${res.status}`);
  return (await res.json()) as CompanyCheck[];
}

export type RunEvent =
  | { type: "start"; companies: string[] }
  | ({ type: "company" } & CompanyHealth)
  | { type: "done"; jobsFound: number; matches: number; strong: number; newMatches: number; failed: number }
  | { type: "error"; message: string };

/** Run a scan on this machine, reporting progress as it streams in. */
export async function runScan(onEvent: (e: RunEvent) => void): Promise<void> {
  const res = await fetch("/api/run", { method: "POST" });
  if (!res.ok || !res.body) {
    onEvent({ type: "error", message: `Couldn't start the scan (HTTP ${res.status}).` });
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line) as RunEvent);
      } catch {
        // ignore stray output
      }
    }
  }
}

// ---------- the wizard's working copy ----------

export type CompanyRow = CompanyCheck & {
  id: string;
  /** "saved" = loaded from an existing config, not re-checked. */
  state: CompanyCheck["status"] | "saved" | "checking";
  name: string;
};

export type Draft = {
  name: string;
  include: string[];
  exclude: string[];
  seniority: string[];
  places: string[];
  remote: boolean;
  remoteOk: string[];
  remoteExclude: string[];
  keywords: Record<string, number>;
  companies: CompanyRow[];
  minScore: number;
  alerts: Config["alerts"];
  /** Furthest wizard step visited, so "Continue setup" can resume there. */
  furthestStep: number;
  /** Profile block from the AI master-resume answer, used for suggestions. */
  aiProfile?: AiProfile;
  /** Chosen job family id (Roles step); its titles are the toggle list. */
  family?: string;
};

let seq = 0;
export const rowId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export function emptyDraft(): Draft {
  return {
    name: "My job search",
    include: [],
    exclude: [],
    seniority: [],
    places: [],
    remote: false,
    remoteOk: [],
    remoteExclude: [],
    keywords: {},
    companies: [],
    minScore: 70,
    alerts: { telegram: false, email: false, only_new: true },
    furthestStep: 0,
  };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Build a draft from a valid config, or best-effort from a broken one. */
export function draftFromConfig(input: unknown): Draft {
  const c = obj(input);
  const p = obj(c.profile);
  const t = obj(p.titles);
  const l = obj(p.locations);
  const d = emptyDraft();
  const remoteOk = strings(l.remote_ok);
  const keywords: Record<string, number> = {};
  for (const [k, w] of Object.entries(obj(p.keywords))) {
    if (typeof w === "number") keywords[k] = Math.min(5, Math.max(1, Math.round(w)));
  }
  const companies: CompanyRow[] = (Array.isArray(c.companies) ? c.companies : []).flatMap((x): CompanyRow[] => {
    const co = obj(x);
    if (typeof co.slug !== "string" || typeof co.ats !== "string") return [];
    return [
      {
        id: rowId(),
        input: typeof co.careers_url === "string" ? co.careers_url : `${co.ats}: ${co.slug}`,
        // Saved companies on ATSs we can't fetch yet stay "coming soon".
        state: connectors[co.ats as AtsType] ? "saved" : "soon",
        status: connectors[co.ats as AtsType] ? "ok" : "soon",
        name: typeof co.name === "string" ? co.name : co.slug,
        ats: co.ats as AtsType,
        slug: co.slug,
        region: co.region as CompanyRow["region"],
        shard: typeof co.shard === "string" ? co.shard : undefined,
        site: typeof co.site === "string" ? co.site : undefined,
      },
    ];
  });
  const alerts = obj(c.alerts);
  return {
    name: typeof p.name === "string" ? p.name : d.name,
    include: strings(t.include),
    exclude: strings(t.exclude),
    seniority: strings(p.seniority_boost),
    places: strings(l.include),
    remote: remoteOk.length > 0,
    remoteOk,
    remoteExclude: strings(l.remote_exclude),
    keywords,
    companies,
    minScore: typeof p.min_score === "number" ? p.min_score : d.minScore,
    alerts: {
      telegram: alerts.telegram === true,
      email: alerts.email === true,
      only_new: alerts.only_new !== false,
    },
    furthestStep: STEPS.length,
    family: inferFamily(strings(t.include)),
  };
}

/** Rows that go into the config: working, saved, or recognised-but-coming-soon (with what they need). */
export function usableCompanies(d: Draft): CompanyRow[] {
  return d.companies.filter(
    (r) => (r.state === "ok" || r.state === "saved" || (r.state === "soon" && (r.ats !== "workday" || (r.shard && r.site)))) && r.ats && r.slug,
  );
}

export function draftToConfig(d: Draft): Config {
  const seen = new Set<string>();
  const companies = usableCompanies(d)
    .filter((r) => {
      const k = `${r.ats}:${r.slug!.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((r) => ({
      name: r.name.trim() || r.slug!,
      ats: r.ats!,
      slug: r.slug!,
      ...(r.region && r.region !== "global" ? { region: r.region } : {}),
      ...(r.shard ? { shard: r.shard } : {}),
      ...(r.site ? { site: r.site } : {}),
      ...(/^https?:\/\//i.test(r.input) ? { careers_url: r.input } : {}),
      enabled: true,
    }));
  return {
    profile: {
      name: d.name.trim() || "My job search",
      titles: { include: d.include, exclude: d.exclude },
      seniority_boost: d.seniority,
      locations: {
        include: d.places,
        remote_ok: d.remote ? d.remoteOk : [],
        remote_exclude: d.remote ? d.remoteExclude : [],
      },
      keywords: d.keywords,
      min_score: d.minScore,
    },
    companies,
    alerts: d.alerts,
  };
}

// ---------- step rules (shared by the wizard and Settings) ----------

export const STEPS = [
  { id: 1, key: "resume", label: "Resume" },
  { id: 2, key: "roles", label: "Roles" },
  { id: 3, key: "locations", label: "Locations" },
  { id: 4, key: "keywords", label: "Topics" },
  { id: 5, key: "review", label: "Review" },
] as const;

/** Step numbers by name, so screens never hard-code positions. Companies are added after setup. */
export const STEP = { welcome: 0, resume: 1, roles: 2, locations: 3, keywords: 4, review: 5 } as const;
export const STEP_COUNT = STEPS.length;

/** Why the user can't continue yet, or null. Resume and Topics are optional. */
export function stepBlocker(step: number, d: Draft): string | null {
  if (step === STEP.roles && d.include.length === 0) return "Pick at least one job title.";
  if (step === STEP.locations && d.places.length === 0 && !(d.remote && d.remoteOk.length > 0)) return "Add a place, or allow remote roles in at least one region.";
  return null;
}

/** Why the companies list can't be saved yet, or null (Companies tab / Settings). */
export function companiesBlocker(d: Draft): string | null {
  if (d.companies.some((r) => r.state === "checking")) return "Checking links…";
  return null;
}

export type SetupProgress = {
  /** The user has answered anything yet. */
  started: boolean;
  /** Where "Continue setup" should go. */
  nextStep: number;
};

export function setupProgress(d: Draft, hasResume = false): SetupProgress {
  const furthest = d.furthestStep ?? 0;
  const started = furthest > 0 || hasResume || d.include.length > 0 || d.places.length > 0 || Object.keys(d.keywords).length > 0;
  // Optional steps only send people back if they never got past them.
  if (furthest <= STEP.resume && !hasResume && d.include.length === 0) return { started, nextStep: STEP.resume };
  for (const s of [STEP.roles, STEP.locations]) if (stepBlocker(s, d)) return { started, nextStep: s };
  if (furthest <= STEP.keywords && Object.keys(d.keywords).length === 0) return { started, nextStep: STEP.keywords };
  return { started, nextStep: STEP.review };
}

/** Steps that still block saving, for the Review screen. */
export function saveBlockers(d: Draft): { step: number; message: string }[] {
  return [STEP.roles, STEP.locations].flatMap((step) => {
    const message = stepBlocker(step, d);
    return message ? [{ step, message }] : [];
  });
}

/** The job family whose titles overlap most with these titles. */
export function inferFamily(titles: readonly string[]): string | undefined {
  let best: { id: string; n: number } | undefined;
  for (const f of ROLE_FAMILIES) {
    const n = titles.filter((t) => f.titles.includes(t)).length;
    if (n > 0 && (!best || n > best.n)) best = { id: f.id, n };
  }
  return best?.id;
}
