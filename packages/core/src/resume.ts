import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The master resume lives next to the config, in a gitignored folder. Never committed or published. */
export const RESUME_PATH = "profile/resume.md";
const MAX_BYTES = 300_000;

export type StoredResume = { path: string; text: string | null; updatedAt?: string };

export function readResume(cwd = process.cwd()): StoredResume {
  const path = resolve(cwd, RESUME_PATH);
  if (!existsSync(path)) return { path, text: null };
  return { path, text: readFileSync(path, "utf8"), updatedAt: statSync(path).mtime.toISOString() };
}

export function saveResume(text: string, cwd = process.cwd()): { ok: true; path: string } | { ok: false; error: string } {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return { ok: false, error: "The resume is empty." };
  if (Buffer.byteLength(clean) > MAX_BYTES) return { ok: false, error: "That's longer than any resume should be (over 300 KB). Paste the text only." };
  const path = resolve(cwd, RESUME_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${clean}\n`);
  return { ok: true, path };
}
