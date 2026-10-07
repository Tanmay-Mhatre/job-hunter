/**
 * Guessing a company's board slug on another hiring system, and checking that a board found that
 * way really is the same company (short slugs like "rain" or "kraken" belong to many firms).
 */

const LEGAL = /\b(inc|incorporated|llc|ltd|limited|plc|gmbh|ag|sa|sas|bv|nv|ab|as|oy|pty|corp|corporation|co|company)\b/g;
const GENERIC = /\b(group|holdings?|technologies|technology|labs?|hq|the)\b/g;

/** Lowercase ASCII words; `.com`-style endings and legal suffixes removed. */
function words(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\.(com|io|ai|co|net|org|xyz|app|dev|tech)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(LEGAL, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Acme Labs, Inc." -> "acme" (also drops generic words like labs, group, technologies). */
export function normalizeName(name: string): string {
  const w = words(name);
  return w.replace(GENERIC, " ").replace(/\s+/g, " ").trim() || w;
}

/** Slugs to try for a company, most likely first. `slug` is a board slug already known elsewhere. */
export function slugCandidates(name: string, slug?: string): string[] {
  const out: string[] = [];
  const push = (s: string | undefined) => {
    const v = s?.trim().toLowerCase();
    if (v && v.length >= 2 && v.length <= 60 && /^[a-z0-9][a-z0-9._-]*$/.test(v) && !out.includes(v)) out.push(v);
  };
  push(slug);
  const full = words(name).split(" ").filter(Boolean);
  const core = normalizeName(name).split(" ").filter(Boolean);
  for (const w of [full, core]) {
    push(w.join(""));
    push(w.join("-"));
  }
  if (core.length) {
    push(`${core.join("")}hq`);
    push(`${core.join("")}inc`);
  }
  return out;
}

/** Same company? Normalized names equal, or one contains the other as whole words with ≥ 5 letters. */
export function sameCompany(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y || x.replace(/ /g, "") === y.replace(/ /g, "")) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.replace(/ /g, "").length >= 5 && new RegExp(`(^| )${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(long);
}
