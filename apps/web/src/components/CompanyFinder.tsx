import { Check, ExternalLink, EyeOff, LoaderCircle, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { canRunLocally } from "../lib/data";
import { rowId, type CompanyRow, type Draft } from "../lib/setup";
import { load, save } from "../lib/storage";
import { CompaniesStep } from "../setup/steps";
import { Button, Card, Chip, cx, Segmented } from "./ui";

/** Directory entry served at data/catalog/directory.json (see scripts/catalog/publish.ts). */
type DirCompany = {
  key: string;
  name: string;
  ats: string;
  slug: string;
  region?: string;
  shard?: string;
  site?: string;
  careers_url: string;
  tier: "curated" | "dump";
  status: "live" | "dormant";
  open_jobs: number | null;
  indexed: boolean;
};

type Suggestion = {
  key: string;
  name: string;
  ats: string;
  slug: string;
  careers_url: string;
  open_jobs: number;
  tier?: string;
  score: number;
  matches: number;
  new_matches: number;
  near_misses: number;
  examples: string[];
  topics: string[];
  reasons: string[];
};
type SuggestResult = { hiringNow: Suggestion[]; worthWatching: Suggestion[]; scanned: number; index_generated_at?: string; error?: string };

const SUPPORTED = new Set(["greenhouse", "lever", "ashby", "smartrecruiters"]);
const ATS_LABEL: Record<string, string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", smartrecruiters: "SmartRecruiters", workday: "Workday" };
const HIDDEN_KEY = "jobhunter.companies.hidden";

export const companyKey = (c: { ats?: string; slug?: string; shard?: string; site?: string }) =>
  (c.ats === "workday" ? `workday:${c.slug}|${c.shard}|${c.site}` : `${c.ats}:${c.slug}`).toLowerCase();

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
  const watched = useMemo(() => new Set(draft.companies.map(companyKey)), [draft.companies]);

  const add = (c: { name: string; ats: string; slug: string; region?: string; shard?: string; site?: string; careers_url: string }) => {
    if (watched.has(companyKey(c))) return;
    const supported = SUPPORTED.has(c.ats);
    const row: CompanyRow = {
      id: rowId(),
      input: c.careers_url,
      // Directory boards were checked live already; unbuilt ATSs are kept as "coming soon".
      state: supported ? "saved" : "soon",
      status: supported ? "ok" : "soon",
      name: c.name,
      ats: c.ats as CompanyRow["ats"],
      slug: c.slug,
      region: c.region as CompanyRow["region"],
      shard: c.shard,
      site: c.site,
    };
    update({ companies: [...draft.companies, row] });
  };
  const remove = (key: string) => update({ companies: draft.companies.filter((r) => companyKey(r) !== key) });

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
            hidden={hidden}
            watched={watched}
            onAdd={add}
            onRemove={remove}
            onHide={(k) => setHidden((h) => [...new Set([...h, k])])}
            onUnhideAll={() => setHidden([])}
          />
        )}
        {tab === "browse" && <Browse watched={watched} onAdd={add} onRemove={remove} />}
        {tab === "link" && <CompaniesStep draft={draft} update={update} />}
      </div>
    </Card>
  );
}

function AddButton({ added, onAdd, onRemove, soon }: { added: boolean; onAdd: () => void; onRemove: () => void; soon?: boolean }) {
  return added ? (
    <Button size="sm" onClick={onRemove} aria-pressed className="border-accent bg-accent-soft text-accent">
      <Check className="size-3.5" /> Added
    </Button>
  ) : (
    <Button size="sm" variant={soon ? "outline" : "primary"} onClick={onAdd}>
      <Plus className="size-3.5" /> {soon ? "Add (coming soon)" : "Add"}
    </Button>
  );
}

// ---------- suggestions ----------

function Suggested({
  hidden,
  watched,
  onAdd,
  onRemove,
  onHide,
  onUnhideAll,
}: {
  hidden: string[];
  watched: Set<string>;
  onAdd: (c: Suggestion) => void;
  onRemove: (key: string) => void;
  onHide: (key: string) => void;
  onUnhideAll: () => void;
}) {
  const [result, setResult] = useState<SuggestResult | null>(null);
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

  const visible = (list: Suggestion[]) => list.filter((s) => !hidden.includes(s.key));
  const hiring = visible(result.hiringNow);
  const watching = visible(result.worthWatching);

  return (
    <div className="space-y-6">
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <Sparkles className="size-3.5 text-accent" />
        Checked {result.scanned.toLocaleString()} companies against your roles and places
        {result.index_generated_at && <> · job data from {new Date(result.index_generated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</>}
        {loading && <LoaderCircle className="size-3 animate-spin" />}
        {hidden.length > 0 && (
          <button type="button" className="font-medium text-accent" onClick={onUnhideAll}>
            Show {hidden.length} hidden
          </button>
        )}
      </p>

      <section>
        <h3 className="mb-2 text-sm font-semibold">
          Hiring for you now <span className="tabular font-normal text-muted">({hiring.length})</span>
        </h3>
        {hiring.length === 0 ? (
          <p className="text-sm text-muted">No company in the directory has a matching opening right now. Try widening your roles or places in Settings.</p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {hiring.map((s) => (
              <SuggestionCard key={s.key} s={s} added={watched.has(s.key)} onAdd={() => onAdd(s)} onRemove={() => onRemove(s.key)} onHide={() => onHide(s.key)} />
            ))}
          </ul>
        )}
      </section>

      {watching.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">
            Worth watching <span className="tabular font-normal text-muted">({watching.length})</span>
          </h3>
          <p className="mb-2 text-xs text-muted">No exact match today, but similar roles nearby or remote.</p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {watching.map((s) => (
              <SuggestionCard key={s.key} s={s} added={watched.has(s.key)} onAdd={() => onAdd(s)} onRemove={() => onRemove(s.key)} onHide={() => onHide(s.key)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SuggestionCard({ s, added, onAdd, onRemove, onHide }: { s: Suggestion; added: boolean; onAdd: () => void; onRemove: () => void; onHide: () => void }) {
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
            {ATS_LABEL[s.ats] ?? s.ats} · {s.open_jobs.toLocaleString()} open jobs{s.tier === "curated" ? " · on your shortlist" : ""}
          </p>
        </div>
        <AddButton added={added} onAdd={onAdd} onRemove={onRemove} />
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
      {s.examples.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted">
          {s.examples.map((e) => (
            <li key={e} className="truncate">
              • {e}
            </li>
          ))}
        </ul>
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

  useEffect(() => {
    fetch("./catalog/directory.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { companies: DirCompany[] }) => setAll(d.companies))
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
      )
      .slice(0, 60);
  }, [all, q, onlyHiring, system]);

  if (error) return <p className="rounded-lg bg-warn-soft/50 p-3 text-sm text-warn">{error}</p>;
  if (!all)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted">
        <LoaderCircle className="size-4 animate-spin" /> Loading the directory…
      </p>
    );

  return (
    <div className="space-y-3">
      <div className="relative">
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
      <ul className="divide-y divide-line rounded-xl border border-line">
        {results.map((c) => {
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
                  {ATS_LABEL[c.ats] ?? c.ats}
                  {c.open_jobs ? ` · ${c.open_jobs.toLocaleString()} open jobs` : c.status === "dormant" ? " · no open jobs right now" : ""}
                  {c.tier === "curated" ? " · on your shortlist" : ""}
                  {soon ? " · support coming soon" : ""}
                </p>
              </div>
              <AddButton added={watched.has(c.key)} onAdd={() => onAdd(c)} onRemove={() => onRemove(c.key)} soon={soon} />
            </li>
          );
        })}
        {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No company matches “{q}”. Try Add by link.</li>}
      </ul>
      {results.length === 60 && <p className="text-xs text-muted">Showing the first 60. Type more of the name to narrow it down.</p>}
    </div>
  );
}

