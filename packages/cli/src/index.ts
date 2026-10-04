#!/usr/bin/env -S npx tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  checkCompanies,
  ConfigError,
  connectors,
  detectCompany,
  loadConfig,
  mergeHistory,
  readJobs,
  readResume,
  saveResume,
  runRadar,
  saveConfig,
  saveRun,
  setupStatus,
  suggestCompanies,
  type CompanyHealth,
  type IndexedCompany,
  type Job,
} from "@jobhunter/core";

/** Directory key for a configured company, matching scripts/catalog keys. */
function companyKey(c: { ats: string; slug: string; shard?: string; site?: string }): string {
  return (c.ats === "workday" ? `workday:${c.slug}|${c.shard}|${c.site}` : `${c.ats}:${c.slug}`).toLowerCase();
}

async function cmdCompanies(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      config: { type: "string", short: "c" },
      data: { type: "string", short: "d", default: "data" },
      limit: { type: "string", short: "n", default: "30" },
      json: { type: "boolean", default: false },
      stdin: { type: "boolean", default: false },
    },
  });
  if (positionals[0] !== "suggest") {
    console.error("Usage: jobhunter companies suggest [--json] [--limit n]");
    return 2;
  }
  const indexFile = resolve(values.data, "catalog", "index.json");
  if (!existsSync(indexFile)) {
    const msg = "No company index yet. Build it with: pnpm catalog:refresh";
    if (values.json) console.log(JSON.stringify({ error: msg, hiringNow: [], worthWatching: [], scanned: 0 }));
    else console.error(msg);
    return values.json ? 0 : 1;
  }
  const { config } = loadConfig(values.config);
  const hidden: string[] = values.stdin ? ((JSON.parse((await readStdin()) || "{}") as { hidden?: string[] }).hidden ?? []) : [];
  const index = JSON.parse(readFileSync(indexFile, "utf8")) as { generated_at: string; companies: IndexedCompany[] };
  // Leave out companies already watched and ones the user said no to.
  const exclude = new Set([...config.companies.map(companyKey), ...hidden.map((h) => h.toLowerCase())]);
  const started = Date.now();
  const result = suggestCompanies(config.profile, index.companies, { exclude, limit: Number(values.limit) || 30 });
  if (values.json) {
    console.log(JSON.stringify({ ...result, index_generated_at: index.generated_at, took_ms: Date.now() - started }));
    return 0;
  }
  console.log(`Scanned ${result.scanned} companies in ${Date.now() - started} ms (index from ${index.generated_at.slice(0, 10)}).\n`);
  console.log("Hiring for you now:");
  for (const s of result.hiringNow) console.log(`  ${String(s.score).padStart(3)}  ${s.name} (${s.ats}) · ${s.reasons.join(" · ")}\n        e.g. ${s.examples.join(" | ")}`);
  console.log("\nWorth watching:");
  for (const s of result.worthWatching) console.log(`  ${String(s.score).padStart(3)}  ${s.name} (${s.ats}) · ${s.reasons.join(" · ")}`);
  return 0;
}

const HELP = `Job Hunter — self-hosted job radar

Usage:
  jobhunter run [options]       Fetch, score and print matching jobs
  jobhunter detect <url>...     Turn careers URLs into config lines
  jobhunter validate            Check your config file
  jobhunter setup <status|save|check>   Used by the dashboard's setup wizard (JSON in/out)
  jobhunter companies suggest   Companies from the directory that are hiring for your profile

Options for companies suggest:
  -c, --config <path>   Config file (as for run)
  -d, --data <dir>      Where data/catalog/index.json lives (default: data)
  -n, --limit <n>       How many to suggest (default 30)
      --json            Print JSON (used by the dashboard)
      --stdin           Read {"hidden": ["ats:slug", …]} from stdin to leave out

Options for run:
  -c, --config <path>   Config file (default: jobhunter.config.local.yaml, then jobhunter.config.yaml)
  -o, --only <name>     Only this company (name or slug); repeatable
  -a, --all             Also list jobs that failed the title/location gates
  -n, --limit <n>       Max jobs to print (default 50)
  -d, --data <dir>      Where history is kept for the dashboard (default: data)
      --dry-run         Don't save anything
      --json <path>     Also write this run's raw result as JSON
      --progress ndjson Print one JSON line per event instead of the report (for the dashboard)
`;

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "run":
      return cmdRun(rest);
    case "detect":
      return cmdDetect(rest);
    case "validate":
      return cmdValidate(rest);
    case "setup":
      return cmdSetup(rest);
    case "companies":
      return cmdCompanies(rest);
    case undefined:
    case "help":
    case "-h":
    case "--help":
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command "${cmd}".\n\n${HELP}`);
      return 2;
  }
}

async function cmdRun(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      only: { type: "string", short: "o", multiple: true },
      all: { type: "boolean", short: "a", default: false },
      limit: { type: "string", short: "n", default: "50" },
      json: { type: "string" },
      data: { type: "string", short: "d", default: "data" },
      "dry-run": { type: "boolean", default: false },
      progress: { type: "string" },
    },
  });
  if (values.progress === "ndjson") return runNdjson(values);
  const { config, path } = loadConfig(values.config);
  const count = config.companies.filter((c) => c.enabled).length;
  if (!count) {
    console.error(`Config: ${path}
No companies yet. Add some in the dashboard (Companies tab) or with: pnpm jobhunter detect <careers url>`);
    return 0;
  }
  console.error(`Config: ${path}\nChecking ${values.only?.length ? values.only.join(", ") : `${count} companies`}...\n`);

  const dataDir = resolve(values.data);
  const previous = readJobs(dataDir);
  const result = await runRadar(config, {
    only: values.only,
    previous,
    onCompanyDone: (h) => console.error(`  ${h.ok ? "ok " : "ERR"} ${h.company.padEnd(24)} ${healthLine(h)}`),
  });

  const merged = mergeHistory(previous, result, config.companies);
  const min = config.profile.min_score;
  const shown = result.jobs.filter((j) => values.all || !j.why.gate).slice(0, Number.isFinite(Number(values.limit)) ? Number(values.limit) : 50);
  const matches = result.jobs.filter((j) => !j.why.gate);
  const fresh = matches.filter((j) => merged.newIds.has(j.id)).length;
  console.log(
    `\n${matches.length} jobs passed your title and location gates (${fresh} new); ${matches.filter((j) => j.score >= min).length} scored ${min}+ (alert threshold).\n`,
  );
  if (shown.length) printJobs(shown, min);

  const failed = result.health.filter((h) => !h.ok);
  if (failed.length) {
    console.log(`\n${failed.length} compan${failed.length === 1 ? "y" : "ies"} failed:`);
    for (const h of failed) console.log(`  ${h.company} (${h.ats}:${h.slug}): ${h.error}`);
  }

  if (!values["dry-run"]) {
    const summary = saveRun(dataDir, config, result, merged);
    console.error(`\nSaved to ${dataDir} (${merged.jobs.length} jobs tracked, ${summary.closed} closed this run). Open the dashboard with: pnpm dev`);
  }

  if (values.json) {
    const out = resolve(values.json);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(result, null, 2));
    console.error(`\nWrote ${out}`);
  }
  return 0;
}

const emit = (event: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(event)}
`);

/** Machine-readable run for the dashboard: start, one line per company, done (or error). */
async function runNdjson(values: { config?: string; only?: string[]; data: string; "dry-run": boolean }): Promise<number> {
  try {
    const { config } = loadConfig(values.config);
    const companies = config.companies.filter((c) => c.enabled).map((c) => c.name);
    emit({ type: "start", companies });
    const dataDir = resolve(values.data);
    const previous = readJobs(dataDir);
    const result = await runRadar(config, { only: values.only, previous, onCompanyDone: (h) => emit({ type: "company", ...h }) });
    const merged = mergeHistory(previous, result, config.companies);
    const summary = values["dry-run"] ? undefined : saveRun(dataDir, config, result, merged);
    const matches = result.jobs.filter((j) => !j.why.gate);
    emit({
      type: "done",
      jobsFound: result.jobs.length,
      matches: matches.length,
      strong: matches.filter((j) => j.score >= config.profile.min_score).length,
      newMatches: summary?.newMatches ?? matches.filter((j) => merged.newIds.has(j.id)).length,
      failed: result.health.filter((h) => !h.ok && !h.unsupported).length,
    });
    return 0;
  } catch (err) {
    emit({ type: "error", message: (err as Error).message });
    return 1;
  }
}

function readStdin(): Promise<string> {
  return new Promise((done, fail) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (text += d));
    process.stdin.on("end", () => done(text));
    process.stdin.on("error", fail);
  });
}

/** JSON in (stdin) / JSON out (stdout), for the dashboard's local setup API. */
async function cmdSetup(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { data: { type: "string", short: "d", default: "data" } } });
  switch (positionals[0]) {
    case "status":
      console.log(JSON.stringify(setupStatus(process.cwd(), resolve(values.data))));
      return 0;
    case "save": {
      const result = saveConfig(JSON.parse(await readStdin()));
      console.log(JSON.stringify(result));
      return result.ok ? 0 : 1;
    }
    case "resume": {
      if (positionals[1] === "save") {
        const body = JSON.parse(await readStdin()) as { text?: string };
        const result = saveResume(body.text ?? "");
        console.log(JSON.stringify(result));
        return result.ok ? 0 : 1;
      }
      console.log(JSON.stringify(readResume()));
      return 0;
    }
    case "check": {
      const body = JSON.parse(await readStdin()) as { urls?: string[] };
      console.log(JSON.stringify(await checkCompanies(body.urls ?? [])));
      return 0;
    }
    default:
      console.error("Usage: jobhunter setup <status|save|check|resume [save]>");
      return 2;
  }
}

function healthLine(h: CompanyHealth): string {
  if (!h.ok) return h.error ?? "failed";
  return `${String(h.jobsFound).padStart(4)} jobs, ${h.matches} match${h.matches === 1 ? "" : "es"} (${(h.durationMs / 1000).toFixed(1)}s)`;
}

function printJobs(jobs: Job[], min: number): void {
  for (const j of jobs) {
    const mark = j.score >= min ? "★" : " ";
    const why = j.why.gate
      ? `failed ${j.why.gate} gate`
      : `title ${j.why.title} · loc ${j.why.location} · kw ${j.why.keywordPoints}${j.why.keywords.length ? ` (${j.why.keywords.join(", ")})` : ""} · fresh ${j.why.freshness}`;
    const posted = j.postedAt ? j.postedAt.slice(0, 10) : "—";
    console.log(`${mark} ${String(j.score).padStart(3)}  ${j.title}`);
    console.log(`        ${j.company} · ${j.location || "location n/a"} · ${j.workplace} · posted ${posted}`);
    console.log(`        ${why}`);
    console.log(`        ${j.url}\n`);
  }
}

function cmdDetect(urls: string[]): number {
  if (!urls.length) {
    console.error("Usage: jobhunter detect <careers-url> [more urls...]");
    return 2;
  }
  let failures = 0;
  for (const u of urls) {
    const c = detectCompany(u);
    if (!c) {
      console.error(`# could not detect an ATS for ${u} (supported so far: ${Object.keys(connectors).join(", ")})`);
      failures++;
      continue;
    }
    if (!c.supported) console.error(`# ${c.ats} is recognised but not fetched yet; this line will start working when its connector ships`);
    const extra = [c.region && `region: ${c.region}`, c.shard && `shard: "${c.shard}"`, c.site && `site: "${c.site}"`]
      .filter(Boolean)
      .map((s) => `, ${s}`)
      .join("");
    console.log(`  - { name: "${c.name}", ats: ${c.ats}, slug: "${c.slug}"${extra} }`);
  }
  return failures ? 1 : 0;
}

function cmdValidate(args: string[]): number {
  const { values } = parseArgs({ args, options: { config: { type: "string", short: "c" } } });
  const { config, path } = loadConfig(values.config);
  const byAts = new Map<string, number>();
  for (const c of config.companies) byAts.set(c.ats, (byAts.get(c.ats) ?? 0) + 1);
  const unsupported = config.companies.filter((c) => !connectors[c.ats]);
  console.log(`✓ ${path} is valid`);
  console.log(`  profile: ${config.profile.name}, min_score ${config.profile.min_score}, ${Object.keys(config.profile.keywords).length} keywords`);
  console.log(`  companies: ${config.companies.length} (${[...byAts].map(([a, n]) => `${a} ${n}`).join(", ")})`);
  if (unsupported.length) {
    console.log(`  note: no connector yet for ${unsupported.map((c) => `${c.name} (${c.ats})`).join(", ")}; they're kept and will start working when support ships`);
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    if (err instanceof ConfigError || (err as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
      console.error((err as Error).message);
      process.exit(2);
    }
    console.error(err);
    process.exit(1);
  },
);
