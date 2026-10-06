import { ChevronDown, ExternalLink, LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ATS_LABEL, groupBoards, SUPPORTED, type CompanyRef } from "../lib/companies";
import { AddByLink } from "./AddByLink";
import { DirectoryBar } from "./DirectoryBar";
import { AddButton } from "./CompanyButtons";
import { Card, cx, Pagination, Segmented } from "./ui";

/** Directory entry served at data/catalog/directory.json (see scripts/catalog/publish.ts). */
export type DirCompany = CompanyRef & {
  key: string;
  tier: "curated" | "dump";
  /** unverified: a seed company on a hiring system we can't check yet. */
  status: "live" | "dormant" | "unverified";
  open_jobs: number | null;
  indexed: boolean;
  tags?: string[];
  title_tags?: string[];
  /** Found by you with "Add by link", or from the industry seed list. */
  origin?: "user" | "seed";
};

const BROWSE_PAGE = 25;

type Tab = "search" | "link";

type Props = {
  /** Keys of the companies in your list (saved or not yet). */
  watched: Set<string>;
  /** Jobs for you right now per company key (from the Radar). */
  forYou: ReadonlyMap<string, number>;
  /** The directory, once loaded (shared with the rest of the page). */
  directory: DirCompany[] | null;
  directoryError: string | null;
  onAddMany: (list: CompanyRef[]) => string[];
  onRemove: (key: string) => void;
  onDirectoryUpdated: () => void;
};

/** Add companies you'd like to work at: search the directory, or paste a careers link. */
export function CompanyFinder({ watched, forYou, directory, directoryError, onAddMany, onRemove, onDirectoryUpdated }: Props) {
  const [tab, setTab] = useState<Tab>("search");
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Add companies</h2>
          <p className="mt-0.5 text-sm text-muted">Companies you'd love to work at: we check them every scan, and their jobs come first on your Radar.</p>
        </div>
        <Segmented
          label="How to add companies"
          value={tab}
          onChange={setTab}
          options={[
            { value: "search", label: "Search the directory" },
            { value: "link", label: "Paste a link" },
          ]}
        />
      </div>
      <div className="mt-5">
        <DirectoryBar onUpdated={onDirectoryUpdated} />
        {tab === "search" ? (
          <Browse all={directory} error={directoryError} forYou={forYou} watched={watched} onAdd={(c) => void onAddMany([c])} onRemove={onRemove} />
        ) : (
          <AddByLink watched={watched} onAddMany={onAddMany} onRemove={onRemove} />
        )}
      </div>
    </Card>
  );
}

// ---------- search the whole directory ----------

function Browse({
  all,
  error,
  forYou,
  watched,
  onAdd,
  onRemove,
}: {
  all: DirCompany[] | null;
  error: string | null;
  forYou: ReadonlyMap<string, number>;
  watched: Set<string>;
  onAdd: (c: DirCompany) => void;
  onRemove: (key: string) => void;
}) {
  const [q, setQ] = useState("");
  const [onlyForYou, setOnlyForYou] = useState(false);
  const [system, setSystem] = useState<"all" | "supported" | "soon">("all");
  const [page, setPage] = useState(1);
  const top = useRef<HTMLDivElement>(null);
  const jobsFor = (c: DirCompany) => forYou.get(c.key) ?? 0;

  const results = useMemo(() => {
    if (!all) return [];
    const s = q.trim().toLowerCase();
    const sorted = all
      // Browsing lists companies with open jobs; a search finds any (and yours always show).
      .filter((c) => c.status === "live" || !!s || watched.has(c.key))
      .filter((c) => system === "all" || (system === "supported") === SUPPORTED.has(c.ats))
      .filter((c) => !onlyForYou || jobsFor(c) > 0)
      .filter((c) => !s || c.name.toLowerCase().includes(s) || c.slug.toLowerCase().includes(s))
      .sort(
        (a, b) =>
          Number(b.name.toLowerCase().startsWith(s)) - Number(a.name.toLowerCase().startsWith(s)) ||
          // Companies hiring for you right now first, then the biggest.
          jobsFor(b) - jobsFor(a) ||
          (b.open_jobs ?? 0) - (a.open_jobs ?? 0),
      );
    // One row per company: its other boards fold under it.
    return groupBoards(sorted, watched);
  }, [all, q, onlyForYou, system, watched, forYou]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back to page 1 whenever the search or filters change.
  useEffect(() => setPage(1), [q, onlyForYou, system]);
  const goTo = (p: number) => {
    setPage(p);
    top.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  if (error) return <p className="rounded-lg bg-warn-soft/50 p-3 text-sm text-warn">{error}</p>;
  if (!all)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted">
        <LoaderCircle className="size-4 animate-spin" /> Loading the directory…
      </p>
    );

  const hiring = all.filter((c) => jobsFor(c) > 0).length;
  const pageItems = results.slice((page - 1) * BROWSE_PAGE, page * BROWSE_PAGE);

  return (
    <div className="space-y-3">
      <div ref={top} className="relative scroll-mt-20">
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${all.length.toLocaleString()} companies by name…`}
          aria-label="Search companies"
          className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Hiring system"
          value={system}
          onChange={setSystem}
          options={[
            { value: "all", label: "All" },
            { value: "supported", label: "Trackable now" },
            { value: "soon", label: "Coming soon" },
          ]}
        />
        {hiring > 0 && (
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyForYou} onChange={(e) => setOnlyForYou(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Only companies with jobs for you ({hiring.toLocaleString()})
          </label>
        )}
      </div>
      <Pagination page={page} pageSize={BROWSE_PAGE} total={results.length} onPage={goTo} />
      <ul className="divide-y divide-line rounded-xl border border-line">
        {pageItems.map((g) => (
          <BrowseRow key={g.lead.key} lead={g.lead} others={g.others} jobsFor={jobsFor} watched={watched} onAdd={onAdd} onRemove={onRemove} />
        ))}
        {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No company matches “{q}”. Try Paste a link.</li>}
      </ul>
      {results.length > BROWSE_PAGE && <Pagination page={page} pageSize={BROWSE_PAGE} total={results.length} onPage={goTo} />}
    </div>
  );
}

type LineProps = { watched: Set<string>; jobsFor: (c: DirCompany) => number; onAdd: (c: DirCompany) => void; onRemove: (key: string) => void };

function BoardLine({ c, watched, jobsFor, onAdd, onRemove, sub }: LineProps & { c: DirCompany; sub?: boolean }) {
  const soon = !SUPPORTED.has(c.ats);
  const mine = jobsFor(c);
  return (
    <div className={cx("flex items-center gap-3", sub && "pl-4")}>
      <div className="min-w-0 flex-1">
        <p className={cx("flex items-center gap-1.5 text-sm", sub ? "text-muted" : "font-semibold")}>
          <span className="truncate">{sub ? `${c.name} on ${ATS_LABEL[c.ats] ?? c.ats}` : c.name}</span>
          <a href={c.careers_url} target="_blank" rel="noreferrer" className="shrink-0 text-muted hover:text-accent" aria-label={`${c.name} careers page`}>
            <ExternalLink className="size-3.5" />
          </a>
        </p>
        <p className="text-xs text-muted">
          {mine > 0 && <span className="font-medium text-accent">{mine === 1 ? "1 job for you · " : `${mine} jobs for you · `}</span>}
          {[
            !sub && (ATS_LABEL[c.ats] ?? c.ats),
            c.open_jobs ? `${c.open_jobs.toLocaleString()} open jobs` : c.status === "dormant" ? "no open jobs right now" : c.status === "unverified" ? "not checked yet" : null,
            c.origin === "user" && "added by you",
            soon && "support coming soon",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <AddButton added={watched.has(c.key)} onAdd={() => onAdd(c)} onRemove={() => onRemove(c.key)} soon={soon} />
    </div>
  );
}

/** A company and, folded under it, its other live boards (or ones you watch). */
function BrowseRow({ lead, others, ...line }: LineProps & { lead: DirCompany; others: DirCompany[] }) {
  const [open, setOpen] = useState(() => others.some((o) => line.watched.has(o.key)));
  return (
    <li className="space-y-2 px-3 py-2.5">
      <BoardLine c={lead} {...line} />
      {others.length > 0 && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-medium text-accent">
          <ChevronDown className={cx("size-3.5 transition-transform", !open && "-rotate-90")} />
          {others.length} other board{others.length === 1 ? "" : "s"}
        </button>
      )}
      {open && others.map((o) => <BoardLine key={o.key} c={o} sub {...line} />)}
    </li>
  );
}

/** Load the directory (data/catalog/directory.json, plus companies added by link since the last publish). */
export function useDirectory(rev: number): { directory: DirCompany[] | null; error: string | null } {
  const [directory, setDirectory] = useState<DirCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const get = (path: string) => fetch(path, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<{ companies: DirCompany[] }>) : null));
    let live = true;
    setError(null);
    Promise.all([get("./catalog/directory.json"), get("./catalog/additions.json").catch(() => null)])
      .then(([dir, adds]) => {
        if (!dir) throw new Error("no directory");
        const known = new Set(dir.companies.map((c) => c.key));
        const extra = (adds?.companies ?? []).filter((c) => !known.has(c.key)).map((c): DirCompany => ({ ...c, tier: "dump", indexed: false, origin: "user" }));
        if (live) setDirectory([...dir.companies, ...extra]);
      })
      .catch(() => live && setError("The company directory isn't downloaded yet. Use Download directory above, or run: pnpm jobhunter directory update"));
    return () => {
      live = false;
    };
  }, [rev]);
  return { directory, error };
}
