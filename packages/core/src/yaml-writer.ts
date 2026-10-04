import type { CompanyRef, Config } from "./schema";

/** Strings and lists as JSON are valid YAML flow scalars, and JSON quoting is always safe. */
const q = (s: string) => JSON.stringify(s);
const list = (xs: readonly string[]) => `[${xs.map(q).join(", ")}]`;

function companyLine(c: CompanyRef): string {
  const parts = [`name: ${q(c.name)}`, `ats: ${c.ats}`, `slug: ${q(c.slug)}`];
  if (c.region && c.region !== "global") parts.push(`region: ${c.region}`);
  if (c.shard) parts.push(`shard: ${q(c.shard)}`);
  if (c.site) parts.push(`site: ${q(c.site)}`);
  if (c.careers_url) parts.push(`careers_url: ${q(c.careers_url)}`);
  if (!c.enabled) parts.push("enabled: false");
  return `  - { ${parts.join(", ")} }`;
}

/**
 * Config -> commented YAML, in the same layout as the shipped example, so a file written by
 * the setup wizard stays easy to read and hand-edit. Pure (no Node APIs) so the browser can use it too.
 */
export function configToYaml(config: Config): string {
  const p = config.profile;
  const keywords = Object.entries(p.keywords).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return [
    "# Job Hunter config. Written by the setup wizard; safe to edit by hand.",
    "# Check it with:  pnpm jobhunter validate",
    "",
    "profile:",
    `  name: ${q(p.name)}`,
    "",
    "  titles:",
    "    # A job's title must contain one of these (whole words, case-insensitive)...",
    `    include: ${list(p.titles.include)}`,
    "    # ...and none of these.",
    `    exclude: ${list(p.titles.exclude)}`,
    "",
    "  # +10 points when the title also contains one of these.",
    `  seniority_boost: ${list(p.seniority_boost)}`,
    "",
    "  locations:",
    "    # +20: the job is in one of these places.",
    `    include: ${list(p.locations.include)}`,
    "    # +15: remote roles you can take from where you live...",
    `    remote_ok: ${list(p.locations.remote_ok)}`,
    "    # ...unless the location also names a region you can't work from.",
    `    remote_exclude: ${list(p.locations.remote_exclude)}`,
    "",
    "  # Matched as whole words in title + description. Weight 1 (nice) to 5 (core). Capped at 40 points.",
    keywords.length ? "  keywords:" : "  keywords: {}",
    ...keywords.map(([k, w]) => `    ${q(k)}: ${w}`),
    "",
    "  # Jobs scoring at least this count as strong matches (and trigger alerts).",
    `  min_score: ${p.min_score}`,
    "",
    "# One line per company. Add more with:  pnpm jobhunter detect <careers url>",
    // An empty block would read back as null, so write an explicit empty list.
    config.companies.length ? "companies:" : "companies: []",
    ...config.companies.map(companyLine),
    "",
    "alerts:",
    `  telegram: ${config.alerts.telegram}`,
    `  email: ${config.alerts.email}`,
    `  only_new: ${config.alerts.only_new}`,
    "",
  ].join("\n");
}
