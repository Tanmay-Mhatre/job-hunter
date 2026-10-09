import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { HttpCache } from "./http";

/** Responses bigger than this aren't kept (a 6 MB Lever board still is). */
const MAX_BODY_BYTES = 12_000_000;
/** Entries not used for this long are dropped on save. */
const KEEP_DAYS = 30;

type Entry = { etag: string; file: string; usedAt: number };

/**
 * HttpCache on disk: data/cache/http/index.json (url -> ETag) plus one gzipped body per URL.
 * Call save() when a scan ends (or saves progress) to write the index.
 */
export class FileHttpCache implements HttpCache {
  private readonly index: Map<string, Entry>;

  constructor(private readonly dir: string) {
    const file = join(dir, "index.json");
    let saved: Record<string, Entry> = {};
    try {
      if (existsSync(file)) saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, Entry>;
    } catch {
      // A broken index only costs one full download per board.
    }
    this.index = new Map(Object.entries(saved));
  }

  get(url: string): { etag: string; body: string } | undefined {
    const e = this.index.get(url);
    if (!e) return undefined;
    try {
      const body = gunzipSync(readFileSync(join(this.dir, e.file))).toString("utf8");
      e.usedAt = Date.now();
      return { etag: e.etag, body };
    } catch {
      this.index.delete(url);
      return undefined;
    }
  }

  set(url: string, etag: string, body: string): void {
    if (body.length > MAX_BODY_BYTES) return;
    const file = `${createHash("sha1").update(url).digest("hex")}.gz`;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, file), gzipSync(body));
    this.index.set(url, { etag, file, usedAt: Date.now() });
  }

  /** Write the index, dropping entries unused for KEEP_DAYS and bodies nothing points to. */
  save(now = Date.now()): void {
    for (const [url, e] of this.index) if (now - e.usedAt > KEEP_DAYS * 86_400_000) this.index.delete(url);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, "index.json"), JSON.stringify(Object.fromEntries(this.index)));
    const live = new Set([...this.index.values()].map((e) => e.file));
    for (const f of readdirSync(this.dir)) if (f.endsWith(".gz") && !live.has(f)) rmSync(join(this.dir, f), { force: true });
  }
}
