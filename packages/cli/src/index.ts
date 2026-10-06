#!/usr/bin/env -S npx tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  checkCompanies,
  companyKey,
  ConfigError,
  connectors,
  detectCompany,
  loadConfig,
  readIndex,
  readResume,
  saveResume,
  saveConfig,
  scan,
  setupStatus,
  suggestCompanies,
  directoryAgeDays,
  directoryStatus,
  queueContributions,
  sendContributions,
  updateDirectory,
  type CompanyCheck,
  type CompanyHealth,
  type DirectoryCompany,
  type IndexedCompany,
  type Job,
} from "@jobhunter/core";

type DirectoryEntry = DirectoryCompany & { indexed?: boolean; status?: string; origin?: "user" };

/** The published company directory plus companies added by link (empty if not built yet). */
function readDirectory(dataDir: string): DirectoryEntry[] {
  const read = (name: string): DirectoryEntry[] => {
    const file = resolve(dataDir, "catalog", name);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { companies: DirectoryEntry[] }).companies : [];
  };
  const dir = read("directory.json");
  const known = new Set(dir.map((c) => c.key));
  return [...dir, ...read("additions.json").filter((c) => !known.has(c.key)).map((c) => ({ ...c, origin: "user" as const }))];
}

/** Remember boards found by "Add by link" that the directory doesn't have yet. */
function recordAdditions(dataDir: string, results: CompanyCheck[]): void {
  const fresh = results.filter((r) => (r.status === "live" || r.status === "dormant") && !r.in_directory && r.key);
  if (!fresh.length) return;
  const file = resolve(dataDir, "catalog", "additions.json");
  const current = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { companies: (DirectoryEntry & { added_at: string })[] }).companies : [];
  const byKey = new Map(current.map((c) => [c.key, c]));
  for (const r of fresh) {
    byKey.set(r.key!, {
      key: r.key!,
      name: r.name!,
      ats: r.ats!,
      slug: r.slug!,
      ...(r.region ? { region: r.region } : {}),
      ...(r.shard ? { shard: r.shard, site: r.site } : {}),
      careers_url: r.careers_url!,
      status: r.status,
      open_jobs: r.open_jobs ?? null,
      added_at: byKey.get(r.key!)?.added_at ?? new Date().toISOString(),
    });
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ companies: [...byKey.values()] }, null, 1));
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
  // Directory companies without job rows (no openings, or not indexed): candidates to watch.
  const others = readDirectory(values.data).filter((c) => !c.indexed);
  // Leave out companies already watched and ones the user said no to.
  const exclude = new Set([...config.companies.map(companyKey), ...hidden.map((h) => h.toLowerCase())]);
  const started = Date.now();
  const result = suggestCompanies(config.profile, index.companies, {
    exclude,
    others,
    limit: Number(values.limit) || 30,
    indexGeneratedAt: new Date(index.generated_at),
  });
  if (values.json) {
    console.log(JSON.stringify({ ...result, index_generated_at: index.generated_at, took_ms: Date.now() - started }));
    return 0;
  }
  console.log(`Scanned ${result.scanned} companies in ${Date.now() - started} ms (index from ${index.generated_at.slice(0, 10)}).\n`);
  console.log("Hiring for you now:");
  for (const s of result.hiringNow) console.log(`  ${String(s.score).padStart(3)}  ${s.name} (${s.ats}) · ${s.reasons.join(" · ")}\n        e.g. ${s.examples.join(" | ")}`);
  console.log("\nWorth watching:");
  for (const s of result.worthWatching) console.log(`  ${String(s.score).padStart(3)}  ${s.name} (${s.ats}) · ${s.reasons.join(" · ")}`);
  if (result.notScannable.length) {
    console.log("\nIn your industries, not scannable yet:");
    for (const s of result.notScannable) console.log(`       ${s.name} (${s.ats}) · ${s.reasons.join(" · ")}`);
  }
  return 0;
}

const HELP = `Job Hunter — self-hosted job radar

Usage:
  jobhunter run [options]       Fetch, score and print matching jobs
  jobhunter detect <url>...     Turn careers URLs into config lines
  jobhunter validate            Check your config file
  jobhunter setup <status|save|check>   Used by the dashboard's setup wizard (JSON in/out)
  jobhunter companies suggest   Companies from the directory that fit your profile (industries, roles, places)
  jobhunter directory <status|update|share>   The shared company directory: download the latest, share additions

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
    case "directory":
      return cmdDirectory(rest);
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
  const dataDir = resolve(values.data);
  const count = config.companies.filter((c) => c.enabled).length;
  if (!count && (values.only?.length || !readIndex(dataDir))) {
    console.error(`Config: ${path}
No companies yet, and no company directory to find jobs in. Add companies in the dashboard (Companies tab),
download the directory with: pnpm jobhunter directory update, or add one with: pnpm jobhunter detect <careers url>`);
    return 0;
  }
  console.error(`Config: ${path}`);

  const { result, merged, summary, checks, indexJobs } = await scan(config, {
    dataDir,
    only: values.only,
    dryRun: values["dry-run"],
    onStart: (names, extra) =>
      console.error(
        `Checking ${values.only?.length ? values.only.join(", ") : `${names.length - extra.length} of your companies`}${extra.length ? ` and ${extra.length} more hiring for you` : ""}...
`,
      ),
    onCompanyDone: (h) => console.error(`  ${h.ok ? "ok " : "ERR"} ${h.company.padEnd(24)} ${healthLine(h)}`),
  });

  const min = config.profile.min_score;
  const shown = result.jobs.filter((j) => values.all || !j.why.gate).slice(0, Number.isFinite(Number(values.limit)) ? Number(values.limit) : 50);
  const matches = result.jobs.filter((j) => !j.why.gate);
  const fresh = matches.filter((j) => merged.newIds.has(j.id)).length;
  console.log(
    `
${matches.length} jobs passed your title and location gates (${fresh} new); ${matches.filter((j) => j.score >= min).length} scored ${min}+ (alert threshold).`,
  );
  if (checks.length) console.log(`Also checked ${checks.length} companies you haven't added, because the directory says they're hiring for you.`);
  if (indexJobs !== undefined) console.log(`${indexJobs} more jobs for you in the directory, not checked live yet (see the Radar).`);
  console.log("");
  if (shown.length) printJobs(shown, min);

  const failed = result.health.filter((h) => !h.ok);
  if (failed.length) {
    console.log(`
${failed.length} compan${failed.length === 1 ? "y" : "ies"} failed:`);
    for (const h of failed) console.log(`  ${h.company} (${h.ats}:${h.slug}): ${h.error}`);
  }

  if (summary) console.error(`
Saved to ${dataDir} (${merged.jobs.length} jobs tracked, ${summary.closed} closed this run). Open the dashboard with: pnpm dev`);

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
    const { result, merged, summary, checks, indexJobs } = await scan(config, {
      dataDir: resolve(values.data),
      only: values.only,
      dryRun: values["dry-run"],
      onStart: (companies, extra) => emit({ type: "start", companies, checking: extra.length }),
      onCompanyDone: (h) => emit({ type: "company", ...h }),
    });
    const matches = result.jobs.filter((j) => !j.why.gate);
    emit({
      type: "done",
      jobsFound: result.jobs.length,
      matches: matches.length,
      strong: matches.filter((j) => j.score >= config.profile.min_score).length,
      newMatches: summary?.newMatches ?? matches.filter((j) => merged.newIds.has(j.id)).length,
      failed: result.health.filter((h) => !h.ok && !h.unsupported).length,
      checked: checks.length,
      indexJobs: indexJobs ?? 0,
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

/** The shared company directory: status, download the latest copy, share waiting additions. */
async function cmdDirectory(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      data: { type: "string", short: "d", default: "data" },
      json: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "if-older": { type: "string" },
      /** Background update: skipped when auto_update is off in your settings. */
      auto: { type: "boolean", default: false },
    },
  });
  const dataDir = resolve(values.data);
  const out = (o: object, text: string) => console.log(values.json ? JSON.stringify(o) : text);
  switch (positionals[0] ?? "status") {
    case "status": {
      const s = directoryStatus(dataDir);
      const age = directoryAgeDays(dataDir);
      out(
        { ...s, age_days: Number.isFinite(age) ? Math.round(age * 10) / 10 : null },
        s.local
          ? `Shared directory ${s.local.version}: ${s.local.companies.toLocaleString()} companies, downloaded ${Math.round(age)} day(s) ago.`
          : s.present
            ? "Using a directory built on this computer (not downloaded)."
            : "No company directory yet. Run: pnpm jobhunter directory update",
      );
      return 0;
    }
    case "update": {
      if (values.auto) {
        const autoOn = (() => {
          try {
            return loadConfig().config.directory.auto_update;
          } catch {
            return true;
          }
        })();
        if (!autoOn) {
          out({ updated: false, message: "Automatic updates are off." }, "Automatic updates are off in your settings.");
          return 0;
        }
      }
      const olderThan = values["if-older"] ? Number(values["if-older"]) : undefined;
      if (olderThan !== undefined && directoryAgeDays(dataDir) < olderThan) {
        out({ updated: false, message: "Recent enough." }, "Directory is recent enough.");
        return 0;
      }
      const shared = await sendContributions(dataDir);
      const result = await updateDirectory(dataDir, { force: values.force }).catch((err: Error) => ({ updated: false, message: `Update failed: ${err.message}` }));
      out({ ...result, shared: shared.sent }, `${result.message}${shared.sent ? ` ${shared.message}` : ""}`);
      return 0;
    }
    case "share": {
      const result = await sendContributions(dataDir);
      out(result, result.message);
      return 0;
    }
    default:
      console.error("Usage: jobhunter directory <status|update|share> [--force] [--if-older <days>] [--json]");
      return 2;
  }
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
      // Your saved profile (to count matching jobs) and the directory (to mark known companies).
      const status = setupStatus(process.cwd(), resolve(values.data));
      const directory = new Map(readDirectory(values.data).map((c) => [c.key, c]));
      const results = await checkCompanies(body.urls ?? [], { profile: status.config?.profile, directory });
      recordAdditions(values.data, results);
      // Share new boards with the directory (unless turned off in settings). Best effort: the
      // outbox keeps anything that couldn't be sent, and the next update retries it.
      if (status.config?.directory.share_additions !== false) {
        const fresh = results.filter((r) => (r.status === "live" || r.status === "dormant") && !r.in_directory && r.ats && r.slug);
        if (fresh.length) {
          queueContributions(
            values.data,
            fresh.map((r) => ({ ats: r.ats!, slug: r.slug!, ...(r.region === "eu" ? { region: "eu" } : {}), ...(r.shard ? { shard: r.shard, site: r.site } : {}), ...(r.name ? { name: r.name } : {}) })),
          );
          await sendContributions(values.data);
        }
      }
      console.log(JSON.stringify(results));
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
