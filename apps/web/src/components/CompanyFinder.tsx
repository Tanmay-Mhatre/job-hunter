import { INDUSTRY_BY_ID } from "@jobhunter/core/catalog/industries";
import { ChevronDown, Clock, ExternalLink, EyeOff, LoaderCircle, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ATS_LABEL, keyOf, SUPPORTED, toRow, type CompanyRef } from "../lib/companies";
import { canRunLocally } from "../lib/data";
import type { Draft } from "../lib/setup";
import { load, save } from "../lib/storage";
import { AddByLink } from "./AddByLink";
import { AddAll, AddButton } from "./CompanyButtons";
import { Button, Card, Chip, cx, Pagination, Segmented } from "./ui";

/** Directory entry served at data/catalog/directory.json (see scripts/catalog/publish.ts). */
type DirCompany = CompanyRef & {
  key: string;
  tier: "curated" | "dump";
  /** unverified: a seed company on a hiring system we can't check yet. */
  status: "live" | "dormant" | "unverified";
  open_jobs: number | null;
  indexed: boolean;
  tags?: string[];
  /** Found by you with "Add by link", or from the industry seed list. */
  origin?: "user" | "seed";
};

type Suggestion = CompanyRef & {
  key: string;
  open_jobs: number | null;
  tier?: string;
  score: number;
  matches: number;
  new_matches: number;
  near_misses: number;
  elsewhere: number;
  in_your_places: number;
  examples: string[];
  topics: string[];
  /** The user's industries this company is in. */
  industries: string[];
  reasons: string[];
};
type SuggestResult = {
  hiringNow: Suggestion[];
  worthWatching: Suggestion[];
  notScannable?: Suggestion[];
  scanned: number;
  index_generated_at?: string;
  error?: string;
};
const industryLabel = (id: string) => INDUSTRY_BY_ID.get(id)?.label ?? id;

const HIDDEN_KEY = "jobhunter.companies.hidden";
/** Suggestion cards shown per section before "Show more". */
const SHOW_STEP = 12;
const BROWSE_PAGE = 25;

type Tab = "suggested" | "browse" | "link";

type Props = {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
};

/** Find companies to watch: suggestions for your profile, the whole directory, or a pasted link. */
export function CompanyFinder({ draft, update, tab, setTab }: Props) {
  const [hidden, setHidden] = useState<string[]>(() => load<string[]>(HIDDEN_KEY, []));
  useEffect(() => save(HIDDEN_KEY, hidden), [hidden]);
  const watched = useMemo(() => new Set(draft.companies.map(keyOf)), [draft.companies]);

  /** Add companies not already watched; returns the keys actually added. */
  const addMany = (list: CompanyRef[]): string[] => {
    const seen = new Set(watched);
    const rows = list.filter((c) => {
      const k = keyOf(c);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (rows.length) update({ companies: [...draft.companies, ...rows.map(toRow)] });
    return rows.map(keyOf);
  };
  const add = (c: CompanyRef) => void addMany([c]);
  const removeMany = (keys: readonly string[]) => {
    const drop = new Set(keys);
    update({ companies: draft.companies.filter((r) => !drop.has(keyOf(r))) });
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Find companies to watch</h2>
          <p className="mt-0.5 text-sm text-muted">We scan their careers pages and rank every opening for you.</p>
        </div>
        <Segmented
          label="How to find companies"
          value={tab}
          onChange={setTab}
          options={[
            { value: "suggested", label: "Suggested for you" },
            { value: "browse", label: "Browse all" },
            { value: "link", label: "Add by link" },
          ]}
        />
      </div>
      <div className="mt-5">
        {tab === "suggested" && (
          <Suggested
            industries={draft.industries}
            hidden={hidden}
            watched={watched}
            onAdd={add}
            onAddMany={addMany}
            onRemove={(k) => removeMany([k])}
            onRemoveMany={removeMany}
            onHide={(k) => setHidden((h) => [...new Set([...h, k])])}
            onUnhideAll={() => setHidden([])}
          />
        )}
        {tab === "browse" && <Browse watched={watched} onAdd={add} onRemove={(k) => removeMany([k])} />}
        {tab === "link" && <AddByLink watched={watched} onAddMany={addMany} onRemove={(k) => removeMany([k])} />}
      </div>
    </Card>
  );
}

// ---------- suggestions ----------

type SuggestedProps = {
  /** The user's industries (filter default and chips). */
  industries: string[];
  hidden: string[];
  watched: Set<string>;
  onAdd: (c: Suggestion) => void;
  onAddMany: (c: CompanyRef[]) => string[];
  onRemove: (key: string) => void;
  onRemoveMany: (keys: string[]) => void;
  onHide: (key: string) => void;
  onUnhideAll: () => void;
};

function Suggested({ industries, hidden, watched, onAdd, onAddMany, onRemove, onRemoveMany, onHide, onUnhideAll }: SuggestedProps) {
  const [result, setResult] = useState<SuggestResult | null>(null);
  /** "all", "mine" (any of the user's industries) or one industry id. */
  const [filter, setFilter] = useState<string>(industries.length ? "mine" : "all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hiddenKey = hidden.join(",");

  useEffect(() => {
    if (!canRunLocally) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/companies/suggest", { method: "POST", body: JSON.stringify({ hidden }) })
      .then((r) => r.json() as Promise<SuggestResult>)
      .then((r) => {
        if (cancelled) return;
        if (r.error) setError(r.error);
        setResult(r);
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [hiddenKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canRunLocally) return <p className="text-sm text-muted">Suggestions need the local app (pnpm dev). Use Browse all or Add by link.</p>;
  if (loading && !result)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted">
        <LoaderCircle className="size-4 animate-spin" /> Checking thousands of companies against your profile… this takes a few seconds.
      </p>
    );
  if (error && !result?.hiringNow.length) return <p className="rounded-lg bg-warn-soft/50 p-3 text-sm text-warn">{error}</p>;
  if (!result) return null;

  const inFilter = (s: Suggestion) => filter === "all" || (filter === "mine" ? s.industries.length > 0 : s.industries.includes(filter));
  const visible = (list: Suggestion[]) => list.filter((s) => !hidden.includes(s.key) && inFilter(s));
  const card = { watched, onAdd, onRemove, onHide };
  const everything = [...result.hiringNow, ...result.worthWatching].filter((s) => !hidden.includes(s.key));
  const count = (f: string) => everything.filter((s) => (f === "all" ? true : f === "mine" ? s.industries.length > 0 : s.industries.includes(f))).length;
  const notScannable = (result.notScannable ?? []).filter((s) => !hidden.includes(s.key) && inFilter(s));

  return (
    <div className="space-y-8">
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <Sparkles className="size-3.5 text-accent" />
        Checked {result.scanned.toLocaleString()} companies against your roles, places and topics
        {result.index_generated_at && <> · job data from {new Date(result.index_generated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</>}
        {loading && <LoaderCircle className="size-3 animate-spin" />}
        {hidden.length > 0 && (
          <button type="button" className="font-medium text-accent" onClick={onUnhideAll}>
            Show {hidden.length} hidden
          </button>
        )}
      </p>

      {industries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by industry">
          {["mine", ...industries, "all"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cx(
                "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                filter === f ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg",
              )}
            >
              {f === "mine" ? "Your industries" : f === "all" ? "All" : industryLabel(f)} <span className="tabular opacity-70">{count(f)}</span>
            </button>
          ))}
        </div>
      )}

      <SuggestionSection
        title="Hiring for you now"
        hint="These companies have open roles that match your titles and places today."
        empty="No company in the directory has a matching opening right now. The ones below are worth watching."
        items={visible(result.hiringNow)}
        onAddMany={onAddMany}
        onRemoveMany={onRemoveMany}
        {...card}
      />
      <SuggestionSection
        title="Worth watching"
        hint="No matching opening today, but they fit you: your shortlist, your topics, your role in other places, or a team where you want to work. Add them so you hear first when one opens."
        empty="Nothing else stands out yet. Add topics in Settings to find more."
        items={visible(result.worthWatching)}
        onAddMany={onAddMany}
        onRemoveMany={onRemoveMany}
        {...card}
      />

      {notScannable.length > 0 && <NotScannable byIndustry={industries.length > 0} items={notScannable} watched={watched} onAdd={onAdd} onRemove={onRemove} onAddMany={onAddMany} onRemoveMany={onRemoveMany} />}
    </div>
  );
}

/** Companies that fit but sit on hiring systems we can't scan yet: watch them as "coming soon". */
function NotScannable({
  byIndustry,
  items,
  watched,
  onAdd,
  onRemove,
  onAddMany,
  onRemoveMany,
}: {
  /** Chosen by the user's industries (else by their shortlist). */
  byIndustry: boolean;
  items: Suggestion[];
  watched: Set<string>;
  onAdd: (c: Suggestion) => void;
  onRemove: (key: string) => void;
  onAddMany: (c: CompanyRef[]) => string[];
  onRemoveMany: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const systems = [...new Set(items.map((s) => ATS_LABEL[s.ats] ?? s.ats))];
  return (
    <section className="rounded-xl border border-dashed border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 items-start gap-2 text-left">
          <ChevronDown className={cx("mt-0.5 size-4 shrink-0 text-muted transition-transform", !open && "-rotate-90")} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">
              {byIndustry ? "In your industries" : "On your shortlist"}, not scannable yet <span className="tabular font-normal text-muted">({items.length})</span>
            </span>
            <span className="block text-xs text-muted">
              They use {systems.slice(0, 4).join(", ")}
              {systems.length > 4 ? " and others" : ""}. Watch them now and they start working when support arrives.
            </span>
          </span>
        </button>
        <AddAll items={items} watched={watched} onAddMany={onAddMany} onRemoveMany={onRemoveMany} />
      </div>
      {open && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {items.map((s) => (
            <li key={s.key} className="flex items-center gap-3 px-3 py-2">
              <Clock className="size-4 shrink-0 text-warn" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="truncate">{s.name}</span>
                  <a href={s.careers_url} target="_blank" rel="noreferrer" className="shrink-0 text-muted hover:text-accent" aria-label={`${s.name} careers page`}>
                    <ExternalLink className="size-3.5" />
                  </a>
                </p>
                <p className="truncate text-xs text-muted">
                  {[ATS_LABEL[s.ats] ?? s.ats, s.open_jobs ? `${s.open_jobs.toLocaleString()} open jobs` : null, s.industries.map(industryLabel).join(", ")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <AddButton added={watched.has(s.key)} onAdd={() => onAdd(s)} onRemove={() => onRemove(s.key)} soon />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SuggestionSection({
  title,
  hint,
  empty,
  items,
  watched,
  onAdd,
  onAddMany,
  onRemove,
  onRemoveMany,
  onHide,
}: {
  title: string;
  hint: string;
  empty: string;
  items: Suggestion[];
  watched: Set<string>;
  onAdd: (c: Suggestion) => void;
  onAddMany: (c: CompanyRef[]) => string[];
  onRemove: (key: string) => void;
  onRemoveMany: (keys: string[]) => void;
  onHide: (key: string) => void;
}) {
  const [shown, setShown] = useState(SHOW_STEP);
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {title} <span className="tabular font-normal text-muted">({items.length})</span>
          </h3>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <AddAll items={items} watched={watched} onAddMany={onAddMany} onRemoveMany={onRemoveMany} />
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <>
          <ul className="grid gap-3 lg:grid-cols-2">
            {items.slice(0, shown).map((s) => (
              <SuggestionCard key={s.key} s={s} added={watched.has(s.key)} onAdd={() => onAdd(s)} onRemove={() => onRemove(s.key)} onHide={() => onHide(s.key)} />
            ))}
          </ul>
          {items.length > shown && (
            <div className="mt-3 text-center">
              <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + SHOW_STEP)}>
                Show {Math.min(SHOW_STEP, items.length - shown)} more <span className="text-muted">({items.length - shown} left)</span>
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SuggestionCard({ s, added, onAdd, onRemove, onHide }: { s: Suggestion; added: boolean; onAdd: () => void; onRemove: () => void; onHide: () => void }) {
  const soon = !SUPPORTED.has(s.ats);
  const jobs =
    s.open_jobs === 0 ? "no openings right now" : s.open_jobs === null ? null : `${s.open_jobs.toLocaleString()} open job${s.open_jobs === 1 ? "" : "s"}`;
  return (
    // min-w-0: grid items otherwise grow to their longest example line and push Add off-screen.
    <li className={cx("flex min-w-0 flex-col gap-2 rounded-xl border p-3", added ? "border-accent bg-accent-soft/20" : "border-line")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{s.name}</span>
            <a href={s.careers_url} target="_blank" rel="noreferrer" className="shrink-0 text-muted hover:text-accent" aria-label={`${s.name} careers page`}>
              <ExternalLink className="size-3.5" />
            </a>
          </p>
          <p className="text-xs text-muted">
            {[ATS_LABEL[s.ats] ?? s.ats, jobs, soon && "support coming soon"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <AddButton added={added} onAdd={onAdd} onRemove={onRemove} soon={soon} />
        <button type="button" onClick={onHide} aria-label={`Not interested in ${s.name}`} title="Not interested" className="rounded p-1.5 text-muted hover:text-bad">
          <EyeOff className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {s.reasons.map((r, i) => (
          <Chip key={r} tone={i === 0 && s.matches ? "accent" : "plain"}>
            {r}
          </Chip>
        ))}
      </div>
      {s.examples.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted">
          {s.examples.map((e) => (
            <li key={e} className="truncate">
              • {e}
            </li>
          ))}
        </ul>
      ) : (
        s.open_jobs === 0 && <p className="text-xs text-muted">No openings right now. Add it and we'll tell you when one appears.</p>
      )}
    </li>
  );
}

// ---------- browse the whole directory ----------

function Browse({ watched, onAdd, onRemove }: { watched: Set<string>; onAdd: (c: DirCompany) => void; onRemove: (key: string) => void }) {
  const [all, setAll] = useState<DirCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyHiring, setOnlyHiring] = useState(true);
  const [system, setSystem] = useState<"all" | "supported" | "soon">("all");
  const [page, setPage] = useState(1);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const get = (path: string) => fetch(path, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<{ companies: DirCompany[] }>) : null));
    Promise.all([get("./catalog/directory.json"), get("./catalog/additions.json").catch(() => null)])
      .then(([dir, adds]) => {
        if (!dir) throw new Error("no directory");
        // Boards found by link since the last publish, until the next one merges them in.
        const known = new Set(dir.companies.map((c) => c.key));
        const extra = (adds?.companies ?? []).filter((c) => !known.has(c.key)).map((c): DirCompany => ({ ...c, tier: "dump", indexed: false, origin: "user" }));
        setAll([...dir.companies, ...extra]);
      })
      .catch(() => setError("The company directory isn't built yet. Run: pnpm catalog:refresh"));
  }, []);

  const results = useMemo(() => {
    if (!all) return [];
    const s = q.trim().toLowerCase();
    return all
      .filter((c) => (!onlyHiring || c.status === "live") && (system === "all" || (system === "supported") === SUPPORTED.has(c.ats)))
      .filter((c) => !s || c.name.toLowerCase().includes(s) || c.slug.toLowerCase().includes(s))
      .sort(
        (a, b) =>
          Number(b.name.toLowerCase().startsWith(s)) - Number(a.name.toLowerCase().startsWith(s)) ||
          Number(b.tier === "curated") - Number(a.tier === "curated") ||
          (b.open_jobs ?? 0) - (a.open_jobs ?? 0),
      );
  }, [all, q, onlyHiring, system]);

  // Back to page 1 whenever the search or filters change.
  useEffect(() => setPage(1), [q, onlyHiring, system]);
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
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyHiring} onChange={(e) => setOnlyHiring(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Only companies with open jobs
        </label>
      </div>
      <Pagination page={page} pageSize={BROWSE_PAGE} total={results.length} onPage={goTo} />
      <ul className="divide-y divide-line rounded-xl border border-line">
        {pageItems.map((c) => {
          const soon = !SUPPORTED.has(c.ats);
          return (
            <li key={c.key} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="truncate">{c.name}</span>
                  <a href={c.careers_url} target="_blank" rel="noreferrer" className="shrink-0 text-muted hover:text-accent" aria-label={`${c.name} careers page`}>
                    <ExternalLink className="size-3.5" />
                  </a>
                </p>
                <p className="text-xs text-muted">
                  {[
                    ATS_LABEL[c.ats] ?? c.ats,
                    c.open_jobs ? `${c.open_jobs.toLocaleString()} open jobs` : c.status === "dormant" ? "no open jobs right now" : c.status === "unverified" ? "not checked yet" : null,
                    c.tier === "curated" && "on your shortlist",
                    c.origin === "user" && "added by you",
                    soon && "support coming soon",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <AddButton added={watched.has(c.key)} onAdd={() => onAdd(c)} onRemove={() => onRemove(c.key)} soon={soon} />
            </li>
          );
        })}
        {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No company matches “{q}”. Try Add by link.</li>}
      </ul>
      {results.length > BROWSE_PAGE && <Pagination page={page} pageSize={BROWSE_PAGE} total={results.length} onPage={goTo} />}
    </div>
  );
}
