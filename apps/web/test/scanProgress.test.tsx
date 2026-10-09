// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScanProgress } from "../src/components/ScanProgress";
import { applyScanEvent, progressRows, type ScanState } from "../src/lib/scan";
import type { RunEvent } from "../src/lib/setup";

afterEach(cleanup);

const IDLE: ScanState = { phase: "running", companies: [], total: 0, done: 0, resumed: 0, results: {} };
const health = (company: string, ats: "greenhouse" | "lever", matches = 0) => ({ company, ats, slug: company.toLowerCase(), ok: true, jobsFound: 10, matches, durationMs: 5 });
const play = (events: RunEvent[], from: ScanState = IDLE) => events.reduce(applyScanEvent, from);

describe("applyScanEvent", () => {
  it("keeps per-hiring-system totals from start and done counts from company and progress events", () => {
    const s = play([
      { type: "start", companies: ["Acme"], total: 5, resumed: 1, byAts: { greenhouse: 3, lever: 2 }, doneByAts: { lever: 1 } },
      { type: "company", done: 2, doneByAts: { lever: 1, greenhouse: 1 }, ...health("Acme", "greenhouse", 2) },
      { type: "progress", done: 3, ats: "lever", doneByAts: { lever: 2, greenhouse: 1 } },
    ]);
    expect(s.byAts).toEqual({ greenhouse: 3, lever: 2 });
    expect(s.doneByAts).toEqual({ lever: 2, greenhouse: 1 });
    expect(s.done).toBe(3);
    expect(s.resumed).toBe(1);
    expect(s.results.Acme).toMatchObject({ matches: 2 });
    expect(s.results.Acme).not.toHaveProperty("doneByAts");
    expect(progressRows(s)).toEqual([
      { ats: "greenhouse", total: 3, done: 1 },
      { ats: "lever", total: 2, done: 2 },
    ]);
  });

  it("works with an older CLI that sends no breakdown: one row for all companies", () => {
    const s = play([
      { type: "start", companies: ["Acme"], total: 4 },
      { type: "company", done: 1, ...health("Acme", "greenhouse") },
      { type: "progress", done: 2 },
    ]);
    expect(s.byAts).toBeUndefined();
    expect(progressRows(s)).toEqual([{ ats: "", total: 4, done: 2 }]);
  });
});

describe("ScanProgress", () => {
  it("shows one bar per hiring system, biggest first, with counts and no percentage", () => {
    const s = play([{ type: "start", companies: [], total: 184, byAts: { lever: 64, greenhouse: 120 }, doneByAts: { greenhouse: 41, lever: 64 } }]);
    render(<ScanProgress scan={{ ...s, done: 105 }} />);
    const group = screen.getByRole("group", { name: "Scan progress" });
    const rows = group.querySelectorAll(".rj-progress__row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("41 / 120")).toBeTruthy();
    expect(rows[0]!.querySelector(".rj-source")?.textContent).toMatch(/greenhouse/i);
    expect((rows[0]!.querySelector(".rj-progress__fill") as HTMLElement).style.transform).toMatch(/scaleX\(0\.341/);
    expect(within(rows[1] as HTMLElement).getByText("64 / 64")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%/);
  });

  it("falls back to one All companies row", () => {
    render(<ScanProgress scan={{ ...IDLE, total: 120, done: 41 }} />);
    const group = screen.getByRole("group", { name: "Scan progress" });
    expect(within(group).getByText("All companies")).toBeTruthy();
    expect(within(group).getByText("41 / 120")).toBeTruthy();
  });
});
