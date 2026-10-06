/**
 * Shrink the catalog's working state (scripts/catalog/out): the check and index logs are
 * append-only, so keep just the result each later step would use per board.
 *
 *   pnpm exec tsx scripts/catalog/compact.ts
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
const lines = (file: string) =>
  readFileSync(join(OUT, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { key: string; status?: string; error?: string; fetched_at?: string });

function compact(pattern: RegExp, target: string, keep: (prev: ReturnType<typeof lines>[number] | undefined, next: ReturnType<typeof lines>[number]) => boolean) {
  const files = readdirSync(OUT).filter((n) => pattern.test(n));
  const latest = new Map<string, ReturnType<typeof lines>[number]>();
  let before = 0;
  for (const f of files) {
    for (const r of lines(f)) {
      before++;
      if (keep(latest.get(r.key), r)) latest.set(r.key, r);
    }
  }
  for (const f of files) rmSync(join(OUT, f));
  writeFileSync(join(OUT, target), [...latest.values()].map((r) => JSON.stringify(r)).join("\n") + (latest.size ? "\n" : ""));
  console.error(`${target}: ${before} lines -> ${latest.size}`);
}

// Checks: the latest result wins, but a definite answer beats a later error (as in build.ts).
compact(/^checks(-.+)?\.jsonl$/, "checks.jsonl", (prev, next) => !prev || next.status !== "error" || prev.status === "error");
// Index: the newest successful fetch wins; an error only when there's nothing better.
compact(/^index-.+\.jsonl$/, "index-all.jsonl", (prev, next) => {
  if (!prev) return true;
  if (next.error && !prev.error) return false;
  if (prev.error && !next.error) return true;
  return (next.fetched_at ?? "") >= (prev.fetched_at ?? "");
});
