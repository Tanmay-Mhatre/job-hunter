import { ArrowRight, Building2, Check, CircleAlert, EyeOff, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addCompanies, jobCompanyKey, keyOf, type CompanyRef } from "../lib/companies";
import type { DataMeta, Job } from "../lib/data";
import { canRunLocally } from "../lib/data";
import { draftToConfig, saveConfig, type Draft } from "../lib/setup";
import { MyCompanies, RecentRuns } from "./Companies";
import { useCompanySuggestions } from "../lib/companySuggest";
import { CompanyFinder, useDirectory } from "./CompanyFinder";
import { ForYou } from "./companies/ForYou";
import { QuickAdd } from "./companies/QuickAdd";
import { EmptyState } from "./EmptyState";
import { Button, Card } from "./ui";

type Props = {
  /** A valid personal config exists (companies are saved into it). */
  configured: boolean;
  meta?: DataMeta;
  /** The Radar's jobs (yours, checked and from the directory): "jobs for you" per company. */
  jobs: Job[];
  draft: Draft;
  saved: Draft;
  update: (patch: Partial<Draft>) => void;
  onSaved: () => Promise<void>;
  onScan: () => void;
  scanning: boolean;
  toSetup: () => void;
  /** Company names hidden on the Radar (this browser). */
  hiddenNames: string[];
  onUnhideName: (name: string) => void;
};

const companiesKey = (d: Draft) => JSON.stringify([draftToConfig(d).companies, d.muted, d.pastEmployers]);

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * Save the Companies page's changes on their own, a moment after the last one. Only its fields
 * (companies, hidden, past employers) are written on top of the saved config, so unsaved Settings
 * edits in the shared draft stay unsaved. Never scans: the next scan picks the new list up.
 */
function useAutoSave(draft: Draft, saved: Draft, onSaved: () => Promise<void>, enabled: boolean) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const latest = useRef({ draft, saved, onSaved });
  latest.current = { draft, saved, onSaved };
  const busy = useRef(false);
  const again = useRef(false);
  const run = useCallback(async () => {
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    setState({ kind: "saving" });
    try {
      do {
        again.current = false;
        const { draft: d, saved: s } = latest.current;
        const res = await saveConfig(draftToConfig({ ...s, companies: d.companies, muted: d.muted, pastEmployers: d.pastEmployers }));
        if (!res.ok) return setState({ kind: "error", message: res.errors });
        await latest.current.onSaved();
      } while (again.current);
      setState({ kind: "saved" });
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    } finally {
      busy.current = false;
    }
  }, []);
  const pending = companiesKey(draft) !== companiesKey(saved);
  const key = companiesKey(draft);
  useEffect(() => {
    if (!enabled || !pending) return;
    const t = setTimeout(() => void run(), 800);
    return () => clearTimeout(t);
  }, [key, pending, enabled, run]);
  return { state: pending && state.kind !== "error" && state.kind !== "saving" ? ({ kind: "saving" } as SaveState) : state, retry: run };
}

/** "Saving…", "Saved · used in your next scan", or what went wrong. */
function SaveStatus({ state, retry, onScan, scanning }: { state: SaveState; retry: () => void; onScan: () => void; scanning: boolean }) {
  if (!canRunLocally) return <span className="text-xs text-muted">Changes stay in this browser (run the app locally to save them).</span>;
  if (state.kind === "error")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-bad" title={state.message}>
        <CircleAlert className="size-3.5" /> Couldn't save.
        <button type="button" className="font-medium underline" onClick={retry}>
          Retry
        </button>
      </span>
    );
  if (state.kind === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <LoaderCircle className="size-3.5 animate-spin" /> Saving…
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1">
        <Check className="size-3.5 text-good" /> {state.kind === "saved" ? "Saved. Used in your next scan." : "Changes save automatically."}
      </span>
      {state.kind === "saved" && (
        <button type="button" className="inline-flex items-center gap-1 font-medium text-accent disabled:opacity-50" onClick={onScan} disabled={scanning}>
          <RefreshCw className="size-3" /> Scan now
        </button>
      )}
    </span>
  );
}

/**
 * Companies tab: the companies you'd love to work at (checked every scan, listed first on the Radar),
 * adding more (directory search or a careers link), and companies you've hidden.
 */
export function CompaniesTab({ configured, meta, jobs, draft, saved, update, onSaved, onScan, scanning, toSetup, hiddenNames, onUnhideName }: Props) {
  /** A search handed from the top bar to the full finder. */
  const [browseQuery, setBrowseQuery] = useState<{ text: string; n: number }>();
  /** Bumped after the directory updates, so search reloads it. */
  const [rev, setRev] = useState(0);
  const { directory, error: directoryError } = useDirectory(rev);
  const autosave = useAutoSave(draft, saved, onSaved, configured && canRunLocally);
  const savedKeys = useMemo(() => new Set(saved.companies.map(keyOf)), [saved.companies]);
  const watched = useMemo(() => new Set(draft.companies.map(keyOf)), [draft.companies]);
  const muted = useMemo(() => new Set(draft.muted), [draft.muted]);
  // From the saved profile (not half-made Settings edits), with the past employers edited here.
  const suggestFrom = useMemo(() => ({ ...saved, pastEmployers: draft.pastEmployers }), [saved, draft.pastEmployers]);
  const suggestions = useCompanySuggestions(suggestFrom, configured);
  /** Fit scores from the suggestions, for ordering and labelling search results. */
  const fit = useMemo(() => {
    const m = new Map<string, number>();
    if (suggestions.kind !== "ready") return m;
    const d = suggestions.data;
    const all = [...d.hiringNow, ...d.worthWatching, ...d.notScannable, ...d.lookalikes.flatMap((r) => r.items), ...d.packs.flatMap((p) => p.items)];
    for (const s of all) m.set(s.key, Math.max(m.get(s.key) ?? 0, s.score));
    return m;
  }, [suggestions]);

  /** Open jobs for you per company key, from the Radar's data. */
  const forYou = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) if (j.status === "open" && !j.why.gate) m.set(jobCompanyKey(j), (m.get(jobCompanyKey(j)) ?? 0) + 1);
    return m;
  }, [jobs]);

  if (!configured) {
    return (
      <EmptyState
        icon={<Building2 className="size-6" />}
        title="Set up your radar first"
        actions={
          <Button variant="primary" onClick={toSetup}>
            Set up my radar <ArrowRight className="size-4" />
          </Button>
        }
      >
        Tell us the roles and places you want. Then pick the companies you'd love to work at: we check them every scan and list their jobs first.
      </EmptyState>
    );
  }

  /** Add companies not already yours (adding one also unhides it); returns the keys actually added. */
  const addMany = (list: CompanyRef[]): string[] => {
    const { patch, keys } = addCompanies(draft, list);
    if (patch) update(patch);
    return keys;
  };
  const removeMany = (keys: readonly string[]) => {
    const drop = new Set(keys);
    update({ companies: draft.companies.filter((r) => !drop.has(keyOf(r))) });
  };

  // Hidden companies: muted in your config (by key) and hidden on the Radar (by name), shown once each.
  const names = new Map((directory ?? []).map((c) => [c.key, c.name]));
  const mutedRows = draft.muted.map((key) => ({ key, name: names.get(key) }));
  const mutedNames = new Set(mutedRows.map((m) => m.name).filter(Boolean));
  const hidden = [...mutedRows, ...hiddenNames.filter((n) => !mutedNames.has(n)).map((name) => ({ key: undefined, name }))];

  return (
    <div className="space-y-4">
      <QuickAdd
        directory={directory}
        watched={watched}
        forYou={forYou}
        fit={fit}
        onAddMany={addMany}
        onRemove={(k) => removeMany([k])}
        onSeeAll={(text) => {
          setBrowseQuery((b) => ({ text, n: (b?.n ?? 0) + 1 }));
          setTimeout(() => document.getElementById("browse-companies")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        }}
        status={<SaveStatus state={autosave.state} retry={() => void autosave.retry()} onScan={onScan} scanning={scanning} />}
      />

      <ForYou
        state={suggestions}
        watched={watched}
        muted={muted}
        pastEmployers={draft.pastEmployers}
        onPastEmployers={(pastEmployers) => update({ pastEmployers })}
        onAddMany={addMany}
        onRemoveMany={removeMany}
        onMute={(key) => update({ muted: [...new Set([...draft.muted, key])], companies: draft.companies.filter((r) => keyOf(r) !== key) })}
        onUnmute={(key) => update({ muted: draft.muted.filter((k) => k !== key) })}
        offHint={canRunLocally ? undefined : "Suggestions are worked out by the local app. Run it on your computer (pnpm dev) to see companies picked for you."}
      />

      <MyCompanies rows={draft.companies} savedKeys={savedKeys} meta={meta} forYou={forYou} onRemove={(k) => removeMany([k])} onRemoveMany={removeMany} />

      <CompanyFinder
        watched={watched}
        forYou={forYou}
        directory={directory}
        directoryError={directoryError}
        onAddMany={addMany}
        onRemove={(k) => removeMany([k])}
        onDirectoryUpdated={() => setRev((r) => r + 1)}
        fit={fit}
        industries={draft.industries}
        query={browseQuery}
      />

      {hidden.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <EyeOff className="size-4 text-muted" /> Hidden companies <span className="tabular font-normal text-muted">({hidden.length})</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted">Their jobs don't show on your Radar, and scans don't check them.</p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {hidden.map((h) => (
              <li key={h.key ?? h.name} className="inline-flex h-8 items-center gap-2 rounded-lg border border-line pl-2.5 pr-1.5 text-sm">
                <span className="font-medium">{h.name ?? h.key}</span>
                <button
                  type="button"
                  className="text-xs font-medium text-accent"
                  onClick={() => {
                    if (h.key) update({ muted: draft.muted.filter((k) => k !== h.key) });
                    if (h.name) onUnhideName(h.name);
                  }}
                >
                  Show again
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {meta && <RecentRuns meta={meta} />}
    </div>
  );
}
