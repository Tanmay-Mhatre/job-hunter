import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyStorage } from "../src/lib/storage";

/** Just enough of the Storage API, backed by a Map. */
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("migrateLegacyStorage", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("copies jobhunter.* keys to rawjobs.*, keeps the old ones, and never overwrites", () => {
    localStorage.setItem("jobhunter.state.v1", '{"saved":["a"]}');
    localStorage.setItem("jobhunter.theme", "dark");
    localStorage.setItem("rawjobs.theme", "light");
    localStorage.setItem("other.key", "x");

    migrateLegacyStorage();

    expect(localStorage.getItem("rawjobs.state.v1")).toBe('{"saved":["a"]}');
    expect(localStorage.getItem("jobhunter.state.v1")).toBe('{"saved":["a"]}');
    expect(localStorage.getItem("rawjobs.theme")).toBe("light");
    expect(localStorage.getItem("rawjobs.key")).toBeNull();
  });

  it("runs once: later changes to the old keys aren't copied again", () => {
    localStorage.setItem("jobhunter.prefs.v1", "1");
    migrateLegacyStorage();
    localStorage.setItem("rawjobs.prefs.v1", "2");
    localStorage.setItem("jobhunter.prefs.v1", "3");
    localStorage.setItem("jobhunter.resume", "r");
    migrateLegacyStorage();

    expect(localStorage.getItem("rawjobs.prefs.v1")).toBe("2");
    expect(localStorage.getItem("rawjobs.resume")).toBeNull();
  });

  it("does nothing when storage is blocked", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(() => migrateLegacyStorage()).not.toThrow();
  });
});
