import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DataMeta, Job } from "../lib/data";
import { applyFilters, DEFAULT_FILTERS, isDefault, type Filters } from "../lib/filters";
import { load, save } from "../lib/storage";
import type { Status, UserState } from "../lib/userState";
import { JobRow } from "./JobRow";
import { Button, Card, cx, Segmented, Select, Toggle } from "./ui";

type Props = {
  jobs: Job[];
  meta: DataMeta;
  user: UserState;
  cutoff: string | null;
  onMarkAllSeen: () => void;
  onOpen: (job: Job) => void;
  onStatus: (job: Job, s: Status) => void;
  drawerOpen: boolean;
};

const FILTER_KEY = "jobhunter.filters.v1";

export function Radar({ jobs, meta, user, cutoff, onMarkAllSeen, onOpen, onStatus, drawerOpen }: Props) {
  const [filters, setFilters] = useState<Filters>(() => ({ ...DEFAULT_FILTERS, ...load<Partial<Filters>>(FILTER_KEY, {}), q: "" }));
  const [showFilters, setShowFilters] = useState(false);
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const min = meta.profile.min_score;

  useEffect(() => save(FILTER_KEY, { ...filters, q: "" }), [filters]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const companies = useMemo(() => [...new Set(jobs.map((j) => j.company))].sort((a, b) => a.localeCompare(b)), [jobs]);
  const atsList = useMemo(() => [...new Set(jobs.map((j) => j.ats))].sort(), [jobs]);

  const isNew = (j: Job) => !cutoff || j.firstSeen > cutoff;
  const visible = useMemo(() => applyFilters(jobs, filters, user), [jobs, filters, user]);
  const fresh = visible.filter((j) => j.status === "open" && isNew(j));
  const rest = visible.filter((j) => !(j.status === "open" && isNew(j)));
  const ordered = useMemo(() => [...fresh, ...rest], [fresh, rest]);

  useEffect(() => setCursor((c) => Math.min(c, Math.max(0, ordered.length - 1))), [ordered.length]);

  // j/k/s/a/x/o and "/" — ignored while typing or with the drawer open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (drawerOpen) return;
      const job = ordered[cursor];
      const move = (d: number) => {
        e.preventDefault();
        const next = Math.max(0, Math.min(ordered.length - 1, cursor + d));
        setCursor(next);
        rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
      };
      if (e.key === "j" || e.key === "ArrowDown") move(1);
      else if (e.key === "k" || e.key === "ArrowUp") move(-1);
      else if (!job) return;
      else if (e.key === "Enter" || e.key === "o") onOpen(job);
      else if (e.key === "s") onStatus(job, "saved");
      else if (e.key === "a") onStatus(job, "applied");
      else if (e.key === "x") onStatus(job, "dismissed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, cursor, drawerOpen, onOpen, onStatus]);

  const openMatches = jobs.filter((j) => !j.why.gate && j.status === "open");
  const stats = [
    { label: "Open matches", value: openMatches.length },
    { label: "New since last visit", value: openMatches.filter(isNew).length, accent: true },
    { label: `Scored ${min}+`, value: openMatches.filter((j) => j.score >= min).length },
    { label: "Jobs scanned", value: jobs.filter((j) => j.status === "open").length },
  ];

  const renderRows = (list: Job[], offset: number) =>
    list.map((job, i) => (
      <JobRow
        key={job.id}
        ref={(el) => {
          rowRefs.current[offset + i] = el;
        }}
        job={job}
        entry={user[job.id]}
        min={min}
        isNew={job.status === "open" && isNew(job)}
        selected={cursor === offset + i}
        onOpen={() => {
          setCursor(offset + i);
          onOpen(job);
        }}
        onStatus={(s) => onStatus(job, s)}
      />
    ));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <div className={cx("tabular text-2xl font-semibold", s.accent && s.value > 0 && "text-accent")}>{s.value}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </Card>
        ))}
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), set("q", ""))}
              placeholder="Search title, company, location, keyword…"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          <Button className="sm:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <SlidersHorizontal className="size-4" /> Filters
          </Button>
          <div className={cx("w-full flex-wrap items-center gap-2 sm:flex sm:w-auto", showFilters ? "flex" : "hidden")}>
            <Select value={filters.minScore} onChange={(e) => set("minScore", Number(e.target.value))} aria-label="Minimum score">
              <option value={0}>Any score</option>
              {[40, 50, 60, min, 80]
                .filter((v, i, a) => a.indexOf(v) === i)
                .sort((a, b) => a - b)
                .map((v) => (
                  <option key={v} value={v}>
                    Score {v}+
                  </option>
                ))}
            </Select>
            <Select value={filters.company} onChange={(e) => set("company", e.target.value)} aria-label="Company" className="max-w-44">
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select value={filters.postedWithin} onChange={(e) => set("postedWithin", Number(e.target.value) as Filters["postedWithin"])} aria-label="Posted within">
              <option value={0}>Any time</option>
              <option value={3}>Last 3 days</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </Select>
            <Segmented
              label="Workplace"
              value={filters.workplace}
              onChange={(v) => set("workplace", v)}
              options={[
                { value: "", label: "All" },
                { value: "onsite", label: "On-site" },
                { value: "hybrid", label: "Hybrid" },
                { value: "remote", label: "Remote" },
              ]}
            />
            {atsList.length > 1 && (
              <Select value={filters.ats} onChange={(e) => set("ats", e.target.value)} aria-label="ATS">
                <option value="">All sources</option>
                {atsList.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
        <div className={cx("mt-3 flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 sm:flex", showFilters ? "flex" : "hidden")}>
          <Toggle checked={filters.showGated} onChange={(v) => set("showGated", v)}>
            Show jobs that failed the gates
          </Toggle>
          <Toggle checked={filters.showClosed} onChange={(v) => set("showClosed", v)}>
            Show closed
          </Toggle>
          <Toggle checked={filters.showDismissed} onChange={(v) => set("showDismissed", v)}>
            Show not interested
          </Toggle>
          {!isDefault({ ...filters }) && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setFilters(DEFAULT_FILTERS)}>
              <X className="size-3.5" /> Reset filters
            </Button>
          )}
        </div>
      </Card>

      {ordered.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="font-medium">No jobs match these filters.</p>
          <p className="mt-1 text-sm text-muted">
            {jobs.some((j) => !j.why.gate)
              ? "Try resetting the filters."
              : "Nothing passed your title and location gates yet. Add more companies, or loosen titles / locations in your config."}
          </p>
        </Card>
      ) : (
        <>
          {fresh.length > 0 && (
            <Card className="overflow-hidden">
              <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <h2 className="text-sm font-semibold">
                  New since your last visit <span className="tabular ml-1 text-muted">{fresh.length}</span>
                </h2>
                <Button variant="ghost" size="sm" onClick={onMarkAllSeen}>
                  Mark all seen
                </Button>
              </header>
              <ul>{renderRows(fresh, 0)}</ul>
            </Card>
          )}
          {rest.length > 0 && (
            <Card className="overflow-hidden">
              <header className="border-b border-line px-4 py-2.5">
                <h2 className="text-sm font-semibold">
                  {fresh.length ? "Everything else" : "All matches"} <span className="tabular ml-1 text-muted">{rest.length}</span>
                </h2>
              </header>
              <ul>{renderRows(rest, fresh.length)}</ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
