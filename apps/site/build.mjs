// Builds the RawJobs marketing site into apps/site/dist (served by Cloudflare, see wrangler.toml).
//
//   pnpm site:build                     # https://www.rawjobs.workers.dev
//   SITE_URL=https://example.com pnpm site:build
//
// The page uses the app's own design files, so the site and the dashboard never drift:
// tokens and fonts from apps/web/src/design, components from design/components/bundle.css.
// No dependencies: plain Node, so it runs in CI without installing the workspace.
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SITE, "../..");
const DS = join(ROOT, "apps/web/src/design");
const DIST = join(SITE, "dist");

const SITE_URL = (process.env.SITE_URL || "https://www.rawjobs.workers.dev").replace(/\/$/, "");
// Cloudflare Web Analytics site token (public, cookieless). Unset: no analytics script.
const ANALYTICS_TOKEN = (process.env.CF_ANALYTICS_TOKEN || "").trim();

// The 23 hiring systems with a connector in packages/core (README, "Adding companies").
const SYSTEMS = [
  "Greenhouse", "Lever", "Ashby", "SmartRecruiters", "Workday", "Workable", "Recruitee", "Personio",
  "BambooHR", "Breezy HR", "Teamtailor", "Pinpoint", "Rippling", "HiBob", "Freshteam", "Comeet",
  "Oracle Recruiting", "SAP SuccessFactors", "Taleo", "iCIMS", "Jobvite", "JazzHR", "Zoho Recruit",
];

const read = (p) => readFileSync(p, "utf8");

// Fonts are served as files next to the page instead of the app's relative ./fonts/ paths.
let tokens = read(join(DS, "tokens.css")).replace(/url\('\.\/fonts\//g, "url('/fonts/");
// Follow the OS when no theme is set yet (and when scripts are off): reuse the dark block.
const dark = tokens.match(/\[data-theme="dark"\] \{([\s\S]*?)\n\}/);
if (!dark) throw new Error("tokens.css: dark theme block not found");
tokens = tokens.replace('[data-theme="dark"] {', '[data-theme="dark"] { color-scheme: dark;');
tokens += `\n@media (prefers-color-scheme: dark) { :root:not([data-theme]) {${dark[1]}\n  color-scheme: dark;\n} }\n`;

const bundle = read(join(ROOT, "design/components/bundle.css"));
const wordmark = read(join(DS, "logos/rawjobs-wordmark-ink.svg"))
  .trim()
  .replace('fill="#151412"', 'fill="currentColor"')
  .replace('role="img" aria-label="rawjobs"', 'aria-hidden="true" focusable="false"');
const ats = SYSTEMS.map((s) => `<li class="ats">${s}</li>`).join("");
const analytics = ANALYTICS_TOKEN
  ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({ token: ANALYTICS_TOKEN })}'></script>`
  : "";

let html = read(join(SITE, "src/index.html"))
  .replace("/*__TOKENS__*/", () => tokens)
  .replace("/*__BUNDLE__*/", () => bundle)
  .replaceAll("__WORDMARK__", () => wordmark)
  .replace("__ATS__", () => ats)
  .replace("<!--__ANALYTICS__-->", () => analytics)
  .replaceAll("__SITE_URL__", () => SITE_URL);
const left = html.match(/__[A-Z_]+__/);
if (left) throw new Error(`Unfilled placeholder ${left[0]} in src/index.html`);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "fonts"), { recursive: true });
writeFileSync(join(DIST, "index.html"), html);
for (const f of readdirSync(join(DS, "fonts"))) copyFileSync(join(DS, "fonts", f), join(DIST, "fonts", f));
copyFileSync(join(DS, "logos/rawjobs-mark.svg"), join(DIST, "favicon.svg"));
cpSync(join(SITE, "public"), DIST, { recursive: true });
writeFileSync(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
writeFileSync(
  join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}/</loc></url>\n</urlset>\n`,
);

console.log(`Built ${DIST} for ${SITE_URL}${ANALYTICS_TOKEN ? " (with Web Analytics)" : ""}: ${Math.round(Buffer.byteLength(html) / 1024)} KB page`);
