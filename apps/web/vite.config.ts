import { spawn } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
/** The run output folder is served as the site root: /jobs.json, /meta.json. */
const dataDir = resolve(repoRoot, process.env.JOBHUNTER_DATA ?? "data");
// Vite only serves a public dir that exists at startup; the first scan creates the files later.
mkdirSync(dataDir, { recursive: true });
const tsxCli = resolve(repoRoot, "node_modules/tsx/dist/cli.mjs");
const jobhunterCli = resolve(repoRoot, "packages/cli/src/index.ts");

/** Run `jobhunter <args>` from the repo root (node + tsx directly: no shell, so no quoting issues). */
function cli(args: string[], stdin?: string) {
  const child = spawn(process.execPath, [tsxCli, jobhunterCli, ...args], { cwd: repoRoot });
  if (stdin !== undefined) child.stdin.end(stdin);
  else child.stdin.end();
  return child;
}

function collect(args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = cli(args, stdin);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => done({ code: 1, stdout, stderr: String(err) }));
    child.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (d) => (body += d));
    req.on("end", () => done(body));
    req.on("error", fail);
  });
}

/** Send the CLI's JSON stdout as the response, or a JSON error. */
async function respondJson(res: ServerResponse, args: string[], stdin?: string) {
  const r = await collect(args, stdin);
  res.setHeader("content-type", "application/json");
  const out = r.stdout.trim();
  if (out.startsWith("{") || out.startsWith("[")) {
    res.end(out);
  } else {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, errors: (r.stderr || r.stdout || "jobhunter failed").trim().slice(-2000) }));
  }
}

/**
 * Dev only: a small local API so the dashboard can set up and run Job Hunter on this machine.
 *   GET  /api/setup           setup status (+ current config)
 *   POST /api/setup/config    validate and save jobhunter.config.local.yaml
 *   POST /api/setup/check     detect + live-check careers URLs
 *   GET/POST /api/setup/resume  read / save the master resume (profile/resume.md, gitignored)
 *   POST /api/companies/suggest companies from the directory hiring for the saved profile
 *   POST /api/run             run the radar; streams NDJSON progress
 * Not part of the static build; the dev server listens on 127.0.0.1 only.
 */
/** File modification time, or 0 if missing (cache key for suggestions). */
function mtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function localApi(): Plugin {
  let running = false;
  let suggestCache: { stamp: string; body: string } | undefined;
  return {
    name: "jobhunter-local-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/")) return next();
        try {
          if (url === "/api/setup" && req.method === "GET") return await respondJson(res, ["setup", "status", "--data", dataDir]);
          if (url === "/api/setup/config" && req.method === "POST") return await respondJson(res, ["setup", "save"], await readBody(req));
          if (url === "/api/setup/resume" && req.method === "GET") return await respondJson(res, ["setup", "resume"]);
          if (url === "/api/setup/resume" && req.method === "POST") return await respondJson(res, ["setup", "resume", "save"], await readBody(req));
          if (url === "/api/setup/check" && req.method === "POST") return await respondJson(res, ["setup", "check"], await readBody(req));
          if (url === "/api/companies/suggest" && req.method === "POST") {
            // Scoring every indexed company takes seconds, so reuse the answer until the
            // profile, the index or the hidden list changes.
            const body = await readBody(req);
            const stamp = [body, mtime(join(repoRoot, "jobhunter.config.local.yaml")), mtime(join(dataDir, "catalog", "index.json"))].join("|");
            if (suggestCache?.stamp !== stamp) {
              const r = await collect(["companies", "suggest", "--json", "--stdin", "--data", dataDir], body);
              suggestCache = { stamp, body: r.stdout.trim() || JSON.stringify({ error: r.stderr.trim().slice(-500) }) };
            }
            res.setHeader("content-type", "application/json");
            res.end(suggestCache.body);
            return;
          }
          if (url === "/api/run" && req.method === "POST") {
            res.setHeader("content-type", "application/x-ndjson");
            res.setHeader("cache-control", "no-cache");
            if (running) {
              res.end(`${JSON.stringify({ type: "error", message: "A scan is already running." })}\n`);
              return;
            }
            running = true;
            const child = cli(["run", "--progress", "ndjson", "--data", dataDir]);
            let stderr = "";
            child.stdout.pipe(res, { end: false });
            child.stderr.on("data", (d) => (stderr += d));
            child.on("close", (code) => {
              running = false;
              if (code !== 0 && stderr) res.write(`${JSON.stringify({ type: "error", message: stderr.trim().slice(-1500) })}\n`);
              res.end();
            });
            return;
          }
          res.statusCode = 404;
          res.end();
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, errors: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: dataDir,
  plugins: [react(), tailwindcss(), localApi()],
  server: { port: 5173, host: "127.0.0.1" },
});
