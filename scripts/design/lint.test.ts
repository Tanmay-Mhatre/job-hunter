import { describe, expect, it } from "vitest";
import { lintText } from "./lint";

const rules = (line: string) => lintText(line, "x.tsx").map((f) => f.rule);

describe("design lint", () => {
  it("flags colors that bypass the tokens", () => {
    expect(rules(`<div className="bg-blue-500 text-white" />`)).toEqual(["palette"]);
    expect(rules(`color: #ff5a1f;`)).toEqual(["hex"]);
    expect(rules(`background: rgb(0 0 0 / 0.35);`)).toEqual(["color-fn"]);
    expect(rules(`var(--sand-11)`)).toEqual(["primitive"]);
  });

  it("flags solid fills used as text, but not their -text variants", () => {
    expect(rules(`className="text-danger hover:text-success"`)).toEqual(["solid-text"]);
    expect(rules(`className="text-success-text text-danger-text text-warning-text"`)).toEqual([]);
  });

  it("flags pre-RawJobs names and Tailwind sizes, radii and shadows that no longer exist", () => {
    expect(rules(`className="bg-surface-2 text-fg border-line-strong"`)).toEqual(["old-color"]);
    expect(rules(`className="text-sm font-medium"`)).toEqual(["text-size"]);
    expect(rules(`className="rounded-xl shadow-lg"`)).toEqual(["radius", "shadow"]);
    expect(rules(`className="rounded-md rounded-dot shadow-l2 type-label text-muted bg-raised"`)).toEqual([]);
  });

  it("keeps orange to its four jobs: no accent fills, borders, text or checkbox colors in app code", () => {
    expect(rules(`className="border-accent bg-accent-subtle text-accent-text"`)).toEqual(["accent"]);
    expect(rules(`className="hover:bg-accent text-on-accent"`)).toEqual(["accent"]);
    expect(rules(`className="size-4 accent-accent"`)).toEqual(["accent"]);
    expect(rules(`className="size-4 accent-ink bg-ink text-raised border-control"`)).toEqual([]);
  });

  it("allows uppercase nowhere (source tags get theirs from rj-source)", () => {
    expect(rules(`className="type-meta font-semibold uppercase tracking-wide"`)).toEqual(["uppercase"]);
    expect(rules(`className="sm:uppercase"`)).toEqual(["uppercase"]);
    expect(rules(`const t = name.toUpperCase(); className="normal-case"`)).toEqual([]);
  });

  it("leaves URLs, hash routes and opted-out lines alone", () => {
    expect(rules(`href="#add" href="#/radar" "https://x.test/#abc"`)).toEqual([]);
    expect(rules(`fill="#151412" // design-lint-ignore: logo asset`)).toEqual([]);
  });
});
