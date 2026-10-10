// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobDetail } from "../src/components/JobDetail";
import type { Job, Profile } from "../src/lib/data";

afterEach(cleanup);

const profile = {
  name: "Me",
  titles: { include: ["product manager"], exclude: [] },
  seniority_boost: [],
  locations: { include: ["Dubai"], remote_ok: [], remote_exclude: [], workplace: [] },
  industries: [],
  past_employers: [],
  keywords: { payments: 3 },
  min_score: 65,
} as Profile;

const job = (over: Partial<Job> = {}): Job => ({
  id: "greenhouse:acme:1",
  ats: "greenhouse",
  company: "Acme",
  title: "Senior Product Manager",
  location: "Dubai",
  workplace: "hybrid",
  url: "https://acme.example/jobs/1",
  postedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  firstSeen: new Date(Date.now() - 86_400_000).toISOString(),
  lastSeen: new Date().toISOString(),
  status: "open",
  score: 74,
  why: { title: 30, location: 20, keywords: ["payments"], keywordPoints: 14, freshness: 10 },
  countries: ["United Arab Emirates"],
  cities: ["Dubai, United Arab Emirates"],
  seniority: "senior",
  group: "Acme|senior product manager",
  hasDescription: false,
  ...over,
});

const renderDetail = (j: Job) => render(<JobDetail job={j} profile={profile} onUpdate={() => {}} isNew />);

describe("JobDetail", () => {
  it("shows the source tag with the hiring system and age in the head", () => {
    const { container } = renderDetail(job());
    const tag = container.querySelector(".rj-drawer__head .rj-source");
    expect(tag?.textContent).toContain("Greenhouse");
    expect(tag?.querySelector(".rj-source__age")?.textContent).toBe("2d");
    expect(tag?.querySelector(".rj-dot")).not.toBeNull();
  });

  it("never uses uppercase classes", () => {
    const { container } = renderDetail(job());
    expect(container.querySelector('[class*="uppercase"]')).toBeNull();
  });

  it("applies on the hiring system by name", () => {
    renderDetail(job());
    const apply = screen.getByRole("link", { name: "Apply on Greenhouse" });
    expect(apply.getAttribute("href")).toBe("https://acme.example/jobs/1");
    expect(apply.className).toContain("rj-btn--primary");
  });

  it("folds the notes field to a button until there's a note, then labels it visibly", () => {
    const { container } = renderDetail(job());
    expect(screen.queryByLabelText("Notes")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    const notes = screen.getByLabelText("Notes");
    expect(notes.tagName).toBe("TEXTAREA");
    expect(container.querySelector(`label[for="${notes.id}"]`)?.textContent).toBe("Notes");
  });

  it("shows a saved note straight away", () => {
    render(<JobDetail job={job()} entry={{ note: "Ask Sam for a referral", updatedAt: "", snapshot: { title: "", company: "", url: "", location: "", score: 0 } }} profile={profile} onUpdate={() => {}} />);
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Ask Sam for a referral");
  });

  it("hides Copy description when the job has no description, and shows it while one loads", () => {
    renderDetail(job());
    expect(screen.queryByRole("button", { name: /description/i })).toBeNull();
    cleanup();
    // descriptions.json never arrives, so the button stays in its loading state.
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    renderDetail(job({ hasDescription: true }));
    const copy = screen.getByRole("button", { name: "Copy description" }) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    vi.unstubAllGlobals();
  });

  it("puts the meta on one plain line", () => {
    const { container } = renderDetail(job());
    const meta = container.querySelector(".rj-drawer__meta");
    expect(meta?.textContent).toContain("Acme");
    expect(meta?.textContent).toContain("Hybrid");
    expect(meta?.querySelectorAll(".rj-sep").length).toBeGreaterThan(2);
  });
});
