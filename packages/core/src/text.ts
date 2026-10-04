const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

/**
 * HTML to readable plain text. Handles double-escaped HTML (Greenhouse sends `&lt;p&gt;`).
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = html;
  // Escaped markup: decode once so the tags become real tags.
  if (!/<[a-z!/]/i.test(s) && /&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(s)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const regexCache = new Map<string, RegExp>();

/**
 * Whole-word, case-insensitive matcher. "ai" matches "AI-native" but not "maintain";
 * spaces in a term match any run of spaces or hyphens ("product manager" ~ "Product-Manager").
 */
export function termRegex(term: string): RegExp {
  const key = term.toLowerCase().trim();
  let re = regexCache.get(key);
  if (!re) {
    const body = key
      .split(/[\s\-]+/)
      .filter(Boolean)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[\\s\\-]+");
    re = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu");
    regexCache.set(key, re);
  }
  return re;
}

export function matchesTerm(text: string, term: string): boolean {
  return termRegex(term).test(text);
}

export function matchingTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((t) => matchesTerm(text, t));
}

/** Best-effort workplace from free-text location, for ATSs that don't send one. */
export function inferWorkplace(location: string): "remote" | "hybrid" | "unknown" {
  if (matchesTerm(location, "hybrid")) return "hybrid";
  if (matchesTerm(location, "remote")) return "remote";
  return "unknown";
}
