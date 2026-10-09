/**
 * Compile the design tokens: apps/web/src/design/tokens.json → tokens.css (custom properties for the
 * four themes, plus @font-face) and utilities.css (Tailwind utilities for type styles, durations and
 * layers, which Tailwind's own theme can't express without clashing with the token names).
 *
 *   pnpm design:build            write both files
 *   pnpm design:build --check    fail if either file is out of date (part of pnpm check)
 *
 * Either way it fails when a token name is used twice, an alias like {sand-2} points nowhere, or a
 * type style would compile to the same --text-<name> property as a text-* color token.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../apps/web/src/design/", import.meta.url));

type Themed = Record<string, string>;
type Token = { name: string; value: string | Themed; usage?: string };
type TypeStyle = { name: string; fontSize: string; lineHeight: string; fontWeight: number; letterSpacing?: string };
export type Tokens = {
  name: string;
  version: number;
  color: { themes: { id: string; name: string }[]; tokens: Token[] };
  type: {
    fonts: { family: string; file: string; weight: string; style: string }[];
    families: Record<string, string>;
    groups: { name: string; family: string; styles: TypeStyle[] }[];
  };
  spacing: { tokens: Token[] };
  radius: { tokens: Token[] };
  shadow: { tokens: Token[] };
  duration: { tokens: Token[] };
  easing: { tokens: Token[] };
  size: { tokens: Token[] };
  zIndex: { tokens: Token[] };
};

const ALIAS = /\{([a-z0-9-]+)\}/g;

/** Problems that make the tokens unusable; empty when they're fine. */
export function validate(t: Tokens): string[] {
  const problems: string[] = [];
  const styles = t.type.groups.flatMap((g) => g.styles);
  const names = [
    ...t.color.tokens.map((x) => x.name),
    ...[t.spacing, t.radius, t.shadow, t.duration, t.easing, t.size, t.zIndex].flatMap((g) => g.tokens.map((x) => x.name)),
    ...Object.keys(t.type.families).map((f) => `font-${f}`),
  ];
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) problems.push(`Token "${n}" is defined more than once.`);
    seen.add(n);
  }
  const styleSeen = new Set<string>();
  for (const s of styles) {
    if (styleSeen.has(s.name)) problems.push(`Type style "${s.name}" is defined more than once.`);
    styleSeen.add(s.name);
    // Type styles compile to --text-<style>, the same namespace as the text-* color tokens.
    if (seen.has(`text-${s.name}`)) problems.push(`Type style "${s.name}" compiles to --text-${s.name}, which is already a color token.`);
  }
  for (const tok of t.color.tokens) {
    const values = typeof tok.value === "string" ? [tok.value] : Object.values(tok.value);
    for (const v of values) for (const [, ref] of v.matchAll(ALIAS)) if (!seen.has(ref!)) problems.push(`"${tok.name}" points to {${ref}}, which doesn't exist.`);
    if (typeof tok.value !== "string") {
      const missing = t.color.themes.filter((th) => !(th.id in (tok.value as Themed))).map((th) => th.id);
      if (missing.length) problems.push(`"${tok.name}" has no value for ${missing.join(", ")}.`);
    }
  }
  return problems;
}

const css = (v: string) => v.replace(ALIAS, "var(--$1)");
const decl = (name: string, v: string) => `  --${name}: ${css(v)};`;

export function tokensCss(t: Tokens): string {
  const out = [`/* ${t.name} v0.${t.version}: generated from tokens.json. Do not edit by hand. */`];
  for (const f of t.type.fonts) {
    out.push(`@font-face { font-family: '${f.family}'; src: url('./${f.file}') format('woff2'); font-weight: ${f.weight}; font-style: ${f.style}; font-display: swap; }`);
  }
  // Light holds every color token; the other themes override only the ones that change per theme.
  t.color.themes.forEach((theme, i) => {
    out.push(i === 0 ? `:root, [data-theme="${theme.id}"] {` : `[data-theme="${theme.id}"] {`);
    for (const tok of [...t.color.tokens, ...t.shadow.tokens]) {
      if (typeof tok.value === "string") {
        if (i === 0) out.push(decl(tok.name, tok.value));
      } else out.push(decl(tok.name, tok.value[theme.id]!));
    }
    out.push("}");
  });
  out.push(":root {");
  for (const g of [t.spacing, t.radius, t.duration, t.easing, t.size, t.zIndex]) for (const tok of g.tokens) out.push(decl(tok.name, tok.value as string));
  for (const [f, stack] of Object.entries(t.type.families)) out.push(decl(`font-${f}`, stack));
  for (const g of t.type.groups) {
    for (const s of g.styles) out.push(decl(`text-${s.name}`, `${s.fontWeight} ${s.fontSize}/${s.lineHeight} var(--font-${g.family})`));
  }
  out.push("}");
  return `${out.join("\n")}\n`;
}

/**
 * Tailwind v4 keeps font sizes in --text-*, shadows in --shadow-* and so on, the same names tokens.css
 * uses. These utilities read the tokens directly instead: type-<style>, duration-<name>, z-<name>.
 */
export function utilitiesCss(t: Tokens): string {
  const out = [`/* ${t.name} v0.${t.version}: Tailwind utilities generated from tokens.json. Do not edit by hand. */`];
  for (const g of t.type.groups) {
    for (const s of g.styles) {
      // Longhands, not the --text-<style> shorthand: Tailwind orders utilities by the properties they
      // set, so font-mono, font-semibold or tracking-* on the same element still win over the style.
      out.push(
        `@utility type-${s.name} {`,
        `  font-family: var(--font-${g.family});`,
        `  font-size: ${s.fontSize};`,
        `  line-height: ${s.lineHeight};`,
        `  font-weight: ${s.fontWeight};`,
        `  letter-spacing: ${s.letterSpacing ?? "normal"};`,
        "}",
      );
    }
  }
  for (const tok of t.duration.tokens) out.push(`@utility ${tok.name} {`, `  transition-duration: var(--${tok.name});`, "}");
  for (const tok of t.zIndex.tokens) out.push(`@utility ${tok.name} {`, `  z-index: var(--${tok.name});`, "}");
  return `${out.join("\n")}\n`;
}

function main(args: string[]): number {
  const check = args.includes("--check");
  const tokens = JSON.parse(readFileSync(`${DIR}tokens.json`, "utf8")) as Tokens;
  const problems = validate(tokens);
  if (problems.length) {
    console.error(`tokens.json has problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    return 1;
  }
  const files = { "tokens.css": tokensCss(tokens), "utilities.css": utilitiesCss(tokens) };
  let stale = 0;
  for (const [name, text] of Object.entries(files)) {
    const path = `${DIR}${name}`;
    let current: string | null = null;
    try {
      current = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    } catch {
      current = null;
    }
    if (current === text) continue;
    if (check) {
      console.error(`${name} is out of date with tokens.json. Run: pnpm design:build`);
      stale++;
    } else {
      writeFileSync(path, text);
      console.log(`wrote apps/web/src/design/${name}`);
    }
  }
  if (!stale && check) console.log("design tokens: up to date");
  return stale ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
