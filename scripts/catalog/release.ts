/**
 * Package a published directory for download: gzipped files plus a manifest apps check first.
 *
 *   pnpm exec tsx scripts/catalog/release.ts [--data dist-data] [--out dist]
 *     -> dist/directory.json.gz, dist/index.json.gz, dist/manifest.json
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return resolve(i > 0 ? process.argv[i + 1]! : fallback);
};
const DATA = arg("--data", join(here, "..", "..", "data"));
const OUT = arg("--out", join(here, "..", "..", "dist"));

export type DirectoryManifest = {
  version: string;
  generated_at: string;
  companies: number;
  indexed: number;
  files: Record<string, { sha256: string; bytes: number }>;
};

const files: Record<string, { sha256: string; bytes: number }> = {};
const counts: Record<string, number> = {};
let generated = "";
mkdirSync(OUT, { recursive: true });
for (const name of ["directory.json", "index.json"]) {
  const src = join(DATA, "catalog", name);
  if (!existsSync(src)) throw new Error(`${src} missing: run publish.ts first`);
  const raw = readFileSync(src);
  const parsed = JSON.parse(raw.toString("utf8")) as { generated_at: string; count: number };
  generated = parsed.generated_at;
  counts[name] = parsed.count;
  const gz = gzipSync(raw, { level: 9 });
  writeFileSync(join(OUT, `${name}.gz`), gz);
  files[`${name}.gz`] = { sha256: createHash("sha256").update(gz).digest("hex"), bytes: gz.length };
}
const manifest: DirectoryManifest = {
  version: generated.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"),
  generated_at: generated,
  companies: counts["directory.json"] ?? 0,
  indexed: counts["index.json"] ?? 0,
  files,
};
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Release ${manifest.version}: ${manifest.companies} companies, ${manifest.indexed} indexed -> ${OUT}`);
