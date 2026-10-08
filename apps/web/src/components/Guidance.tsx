import { diagnoseNoMatches } from "@jobhunter/core/diagnose";
import { ArrowRight, Bell, Check, ChevronRight, LoaderCircle, Radar as RadarIcon, RefreshCw, SearchX, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Config } from "@jobhunter/core/schema";
import { keyOf } from "../lib/companies";
import type { DataMeta, Job } from "../lib/data";
import { scanLine, type ScanState } from "../lib/scan";
import { STEP, STEP_COUNT } from "../lib/setup";
import { load, save } from "../lib/storage";
import { ScanProgress } from "./ScanProgress";
import { Button, Card, Chip, cx } from "./ui";

type Item = { key: string; label: string; detail: string; done: boolean; step?: number; soon?: boolean; /** Nice to have: not counted in progress. */ optional?: boolean };

/** What's set up and what's missing, from the saved config and the latest run. */
export function checklistItems(config: Config | undefined, meta: DataMeta | undefined, hasResume = false): Item[] {
  const p = config?.profile;
  const last = meta?.runs[0];
  // Your companies only: a scan also checks companies you haven't added.
  const yours = new Set((config?.companies ?? []).map(keyOf));
  const health = (last?.health ?? []).filter((h) => yours.has(keyOf(h)));
  const working = health.filter((h) => h.ok).length;
  const failing = health.filter((h) => !h.ok && !h.unsupported).length;
  const companies = config?.companies.length ?? 0;
  const kw = Object.keys(p?.keywords ?? {}).length;
  return [
    { key: "resume", label: "Master resume", detail: hasResume ? "Saved" : "Recommended", done: hasResume, step: STEP.resume },
    { key: "roles", label: "Target roles", detail: p?.titles.include.length ? p.titles.include.slice(0, 3).join(", ") : "Not set", done: !!p?.titles.include.length, step: STEP.roles },
    {
      key: "locations",
      label: "Locations",
      detail: p ? [...p.locations.include.slice(0, 3), ...(p.locations.remote_ok.length ? ["remote"] : [])].join(", ") || "Not set" : "Not set",
      done: !!p && (p.locations.include.length > 0 || p.locations.remote_ok.length > 0),
      step: STEP.locations,
    },
    { key: "keywords", label: "Topics to rank by", detail: kw ? `${kw} keywords` : "Recommended", done: kw > 0, step: STEP.keywords },
    {
      key: "companies",
      label: "Companies you'd like to work at",
      detail: !companies ? "Optional: their jobs go to the top" : last && health.length ? `${working} working${failing ? `, ${failing} failing` : ""}` : `${companies} added`,
      done: companies > 0 && failing === 0,
      optional: true,
    },
    { key: "scan", label: "First scan", detail: last ? "Done" : "Not run yet", done: !!last },
    { key: "daily", label: "Daily scan + Telegram alerts", detail: "Coming in the next update", done: false, soon: true },
  ];
}

const DISMISS_KEY = "jobhunter.checklist.dismissed";

function ChecklistRows({ items, onStep, onScan, onCompanies }: { items: Item[]; onStep: (n: number) => void; onScan: () => void; onCompanies: () => void }) {
  return (
    <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
      {items.map((i) => {
        const action = i.soon ? undefined : i.key === "scan" ? onScan : i.key === "companies" ? onCompanies : i.step ? () => onStep(i.step!) : undefined;
        return (
          <li key={i.key} className="sm:border-b sm:border-line sm:odd:border-r">
            <button
              type="button"
              disabled={!action}
              onClick={action}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left enabled:hover:bg-surface-2/60 disabled:cursor-default"
            >
              <span
                className={cx(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  i.done ? "border-accent bg-accent text-accent-fg" : i.soon ? "border-dashed border-line text-muted" : "border-line",
                )}
              >
                {i.done ? <Check className="size-3.5" /> : i.soon ? <Bell className="size-3" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block text-sm font-medium", i.soon && "text-muted")}>{i.label}</span>
                <span className={cx("block truncate text-xs", i.detail.includes("failing") ? "text-bad" : "text-muted")}>{i.detail}</span>
              </span>
              {i.soon ? <Chip>soon</Chip> : action && <ChevronRight className="size-4 text-muted" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const countDone = (items: Item[]) => {
  const core = items.filter((i) => !i.soon && !i.optional);
  return { done: core.filter((i) => i.done).length, total: core.length };
};

function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-surface-2", className)}>
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / total) * 100}%` }} />
    </div>
  );
}

/** Configured, but something's still missing (or it's all done and collapses to one line). */
export function SetupChecklist({
  items,
  onStep,
  onScan,
  onCompanies,
}: {
  items: Item[];
  onStep: (n: number) => void;
  onScan: () => void;
  onCompanies: () => void;
}) {
  const [dismissed, setDismissed] = useState(() => load(DISMISS_KEY, false));
  const { done, total } = countDone(items);
  const complete = done === total;
  if (complete && dismissed) return null;
  if (complete) {
    const soon = items.find((i) => i.soon);
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
          <Check className="size-3" />
        </span>
        <span className="min-w-0 flex-1">
          <b>Setup complete.</b> <span className="text-muted">{soon ? `Next: ${soon.label.toLowerCase()} (coming soon).` : ""}</span>
        </span>
        <button
          type="button"
          aria-label="Hide"
          className="rounded p-1 text-muted hover:text-fg"
          onClick={() => {
            save(DISMISS_KEY, true);
            setDismissed(true);
          }}
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Finish setting up</h2>
          <p className="text-xs text-muted">
            {done} of {total} done
          </p>
        </div>
        <ProgressBar done={done} total={total} className="hidden w-32 sm:block" />
      </header>
      <ChecklistRows items={items} onStep={onStep} onScan={onScan} onCompanies={onCompanies} />
    </Card>
  );
}

/** Not set up yet: what Job Hunter does, how far they got, and one clear next step. */
export function SetupHero({
  items,
  started,
  nextStep,
  onStep,
  onCompanies,
}: {
  items: Item[];
  started: boolean;
  nextStep: number;
  onStep: (n: number) => void;
  onCompanies: () => void;
}) {
  const { done, total } = countDone(items);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg">
          <RadarIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{started ? "Finish setting up your radar" : "Set up your radar"}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Tell us the roles and places you want, and we'll find and rank matching jobs across thousands of companies. About 3 minutes.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar done={done} total={total} className="w-40" />
            <span className="tabular text-xs text-muted">
              {done} of {total} done
            </span>
          </div>
        </div>
        <Button variant="primary" className="h-11 shrink-0 px-5 text-base" onClick={() => onStep(started ? nextStep : STEP.resume)}>
          {started ? `Continue setup · step ${nextStep} of ${STEP_COUNT}` : "Start setup"} <ArrowRight className="size-4" />
        </Button>
      </div>
      <div className="border-t border-line">
        <ChecklistRows items={items} onStep={onStep} onScan={() => onStep(STEP.review)} onCompanies={onCompanies} />
      </div>
    </Card>
  );
}

/** The config file exists but doesn't validate (usually a hand edit). */
export function ConfigProblemCard({ errors, onFix }: { errors?: string; onFix: () => void }) {
  return (
    <Card className="border-warn/40 p-5">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Your config file has a problem</h2>
          <p className="mt-0.5 text-sm text-muted">Scans can't run until it's fixed. Setup loads everything it can read, so you only fix what's wrong.</p>
          {errors && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-2.5 font-mono text-xs text-muted">{errors}</pre>}
        </div>
      </div>
      <Button variant="primary" className="mt-4" onClick={onFix}>
        Fix in setup <ArrowRight className="size-4" />
      </Button>
    </Card>
  );
}

/** Saved config, no scan yet. */
export function FirstScanCard({ scan, onScan }: { scan: ScanState; onScan: () => void }) {
  const running = scan.phase === "running";
  return (
    <Card className="p-6 text-center sm:p-8">
      <h2 className="text-lg font-semibold">{running ? "Finding jobs for you…" : "Ready for your first scan"}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        We sync the company directory, check your companies and every company in your industries live, and score each job against your profile.
      </p>
      {running ? (
        <div className="mx-auto mt-5 max-w-md text-left">
          <ScanProgress scan={scan} />
        </div>
      ) : (
        <Button variant="primary" className="mt-5 h-11 px-5 text-base" onClick={onScan}>
          <RefreshCw className="size-4" /> Run my first scan
        </Button>
      )}
    </Card>
  );
}

/** A scan ran but nothing passed the title and location gates: explain why, and offer fixes. */
export function NoMatches({ jobs, onStep, onCompanies }: { jobs: Job[]; onStep: (n: number) => void; onCompanies: () => void }) {
  const d = useMemo(() => diagnoseNoMatches(jobs), [jobs]);
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">
          <SearchX className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">No matches yet. Here's why.</h2>
          <p className="mt-1 text-sm text-muted">
            We checked <b className="tabular text-fg">{d.scanned.toLocaleString()}</b> open jobs:{" "}
            <b className="tabular text-fg">{d.titleMiss.toLocaleString()}</b> had other job titles and{" "}
            <b className="tabular text-fg">{d.locationMiss.toLocaleString()}</b> had the right title but were in other places.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3">
          <h3 className="text-sm font-semibold">Right title, other places</h3>
          {d.nearMissLocations.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {d.nearMissLocations.map((l) => (
                <li key={l.location} className="flex justify-between gap-2">
                  <span className="truncate text-muted">{l.location}</span>
                  <span className="tabular shrink-0">{l.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">None. Nobody is hiring for this role in the companies we checked right now.</p>
          )}
          <Button size="sm" className="mt-3" onClick={() => onStep(STEP.locations)}>
            Add locations or remote <ArrowRight className="size-3.5" />
          </Button>
        </div>
        <div className="rounded-xl border border-line p-3">
          <h3 className="text-sm font-semibold">Right place, other titles</h3>
          {d.nearMissTitles.length ? (
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {d.nearMissTitles.map((t) => (
                <li key={t} className="truncate">
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">No other openings in your places right now.</p>
          )}
          <Button size="sm" className="mt-3" onClick={() => onStep(STEP.roles)}>
            Widen job titles <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">
        Or{" "}
        <button type="button" className="font-medium text-accent" onClick={onCompanies}>
          add companies you'd like to work at
        </button>
        : we check them every scan, even ones the directory doesn't list.
      </p>
    </Card>
  );
}

export function FailingBanner({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-xl border border-warn/40 bg-warn-soft/40 px-4 py-2.5 text-left text-sm hover:bg-warn-soft/60"
    >
      <TriangleAlert className="size-4 shrink-0 text-warn" />
      <span className="flex-1">
        <b>
          {count} compan{count === 1 ? "y" : "ies"}
        </b>{" "}
        couldn't be checked in the last scan. Usually the careers link changed.
      </span>
      <span className="font-medium text-warn">Review</span>
    </button>
  );
}

export function ScanningBar({ scan, onStop }: { scan: ScanState; onStop?: () => void }) {
  if (scan.phase !== "running") return null;
  return (
    <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm">
      <LoaderCircle className="size-4 animate-spin text-accent" />
      <span className="min-w-0 flex-1">{scanLine(scan)}</span>
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${scan.total ? (scan.done / scan.total) * 100 : 4}%` }} />
      </div>
      {onStop && (
        <Button size="sm" variant="ghost" onClick={onStop} disabled={scan.stopping}>
          {scan.stopping ? "Stopping…" : "Stop"}
        </Button>
      )}
    </Card>
  );
}

