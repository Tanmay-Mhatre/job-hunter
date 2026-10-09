import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tokensCss, utilitiesCss, validate, type Tokens } from "./tokens";

const DIR = new URL("../../apps/web/src/design/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, DIR), "utf8").replace(/\r\n/g, "\n");
const tokens = () => JSON.parse(read("tokens.json")) as Tokens;

describe("design tokens", () => {
  it("compile to exactly the committed tokens.css and utilities.css", () => {
    expect(validate(tokens())).toEqual([]);
    expect(tokensCss(tokens())).toBe(read("tokens.css"));
    expect(utilitiesCss(tokens())).toBe(read("utilities.css"));
  });

  it("refuse a type style that would compile to a text-* color token", () => {
    const t = tokens();
    t.type.groups[0]!.styles.push({ name: "primary", fontSize: "16px", lineHeight: "24px", fontWeight: 400 });
    expect(validate(t)).toEqual([expect.stringContaining('"primary" compiles to --text-primary')]);
  });

  it("refuse duplicate names, dangling aliases and missing themes", () => {
    const t = tokens();
    t.spacing.tokens.push({ name: "space-1", value: "4px" });
    t.color.tokens.push({ name: "bg-extra", value: { light: "{sand-99}", dark: "{sand-1}", "light-hc": "{sand-1}" } });
    expect(validate(t)).toEqual([
      expect.stringContaining('"space-1" is defined more than once'),
      expect.stringContaining('"bg-extra" points to {sand-99}'),
      expect.stringContaining('"bg-extra" has no value for dark-hc'),
    ]);
  });
});
