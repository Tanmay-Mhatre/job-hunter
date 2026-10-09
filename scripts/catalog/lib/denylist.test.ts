import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDenylist } from "./denylist";

describe("readDenylist", () => {
  it("matches by key, name and careers domain; no file denies nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "deny-"));
    const file = join(dir, "denylist.json");
    writeFileSync(file, JSON.stringify({ companies: [{ key: "lever:acme" }, { name: "Example Holdings, Inc." }, { domain: "blocked.example" }] }));
    const denied = readDenylist(file);
    expect(denied({ key: "LEVER:acme" })).toBe(true);
    expect(denied({ name: "example holdings inc" })).toBe(true);
    expect(denied({ careers_url: "https://jobs.blocked.example/careers" })).toBe(true);
    expect(denied({ key: "lever:other", name: "Other", careers_url: "https://notblocked.example" })).toBe(false);
    expect(readDenylist(join(dir, "missing.json"))({ key: "lever:acme" })).toBe(false);
    writeFileSync(file, "{ broken");
    expect(() => readDenylist(file)).toThrow();
    rmSync(dir, { recursive: true, force: true });
  });
});
