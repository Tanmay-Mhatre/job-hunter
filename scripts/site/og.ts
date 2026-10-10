/**
 * Render the site's share image, apps/site/public/og.png (1200 x 630), from apps/site/src/og.html,
 * so it uses the real tokens, score badges and source tags.
 *
 *   pnpm site:og
 *
 * Builds the site with the template, serves dist/ to the system Edge (playwright-core, channel
 * "msedge", like design:shots) and takes a screenshot. Nothing leaves this machine.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "../..");
const dist = join(root, "apps/site/dist");
const out = join(root, "apps/site/public/og.png");
const TYPES: Record<string, string> = { ".html": "text/html", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };

execFileSync(process.execPath, [join(root, "apps/site/build.mjs"), "--og"], { stdio: "inherit" });
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: "light" });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.host !== "og.local") return route.abort();
    const file = join(dist, decodeURIComponent(url.pathname));
    return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? "application/octet-stream" });
  });
  await page.goto("http://og.local/og.html");
  await page.evaluate("document.fonts.ready");
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
