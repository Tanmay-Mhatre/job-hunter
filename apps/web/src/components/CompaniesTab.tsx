import { ArrowRight, Building2, EyeOff, RefreshCw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { jobCompanyKey, keyOf, toRow, type CompanyRef } from "../lib/companies";
import type { DataMeta, Job } from "../lib/data";
import { canRunLocally } from "../lib/data";
import { draftToConfig, saveConfig, type Draft } from "../lib/setup";
import { MyCompanies, RecentRuns } from "./Companies";
import { CompanyFinder, useDirectory } from "./CompanyFinder";
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

const companiesKey = (d: Draft) => JSON.stringify([draftToConfig(d).companies, d.muted]);

/**
 * Companies tab: the companies you'd love to work at (checked every scan, listed first on the Radar),
 * adding more (directory search or a careers link), and companies you've hidden.
 */
export function CompaniesTab({ configured, meta, jobs, draft, saved, update, onSaved, onScan, scanning, toSetup, hiddenNames, onUnhideName }: Props) {
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  /** Bumped after the directory updates, so search reloads it. */
  const [rev, setRev] = useState(0);
  const { directory, error: directoryError } = useDirectory(rev);
  const dirty = companiesKey(draft) !== companiesKey(saved);
  const savedKeys = useMemo(() => new Set(saved.companies.map(keyOf)), [saved.companies]);
  const watched = useMemo(() => new Set(draft.companies.map(keyOf)), [draft.companies]);
  const added = draft.companies.filter((r) => !savedKeys.has(keyOf(r))).length;
  const removed = saved.companies.filter((r) => !watched.has(keyOf(r))).length;

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
    const seen = new Set(watched);
    const rows = list.filter((c) => {
      const k = keyOf(c);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (rows.length) {
      const keys = new Set(rows.map(keyOf));
      update({ companies: [...draft.companies, ...rows.map(toRow)], muted: draft.muted.filter((k) => !keys.has(k)) });
    }
    return rows.map(keyOf);
  };
  const removeMany = (keys: readonly string[]) => {
    const drop = new Set(keys);
    update({ companies: draft.companies.filter((r) => !drop.has(keyOf(r))) });
  };

  const save = async (thenScan: boolean) => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await saveConfig(draftToConfig(draft));
      if (!res.ok) return setStatus({ tone: "bad", text: res.errors });
      await onSaved();
      setStatus({ tone: "ok", text: thenScan ? "Saved. Scanning…" : "Saved." });
      if (thenScan) onScan();
    } catch (err) {
      setStatus({ tone: "bad", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  // Hidden companies: muted in your config (by key) and hidden on the Radar (by name), shown once each.
  const names = new Map((directory ?? []).map((c) => [c.key, c.name]));
  const mutedRows = draft.muted.map((key) => ({ key, name: names.get(key) }));
  const mutedNames = new Set(mutedRows.map((m) => m.name).filter(Boolean));
  const hidden = [...mutedRows, ...hiddenNames.filter((n) => !mutedNames.has(n)).map((name) => ({ key: undefined, name }))];

  const changes = [added && `${added} added`, removed && `${removed} removed`].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <MyCompanies rows={draft.companies} savedKeys={savedKeys} meta={meta} forYou={forYou} onRemove={(k) => removeMany([k])} onRemoveMany={removeMany} />

      <CompanyFinder
        watched={watched}
        forYou={forYou}
        directory={directory}
        directoryError={directoryError}
        onAddMany={addMany}
        onRemove={(k) => removeMany([k])}
        onDirectoryUpdated={() => setRev((r) => r + 1)}
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

      {(dirty || status) && canRunLocally && (
        <div className="sticky bottom-16 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur md:bottom-4">
          <span className={`mr-auto text-sm ${status?.tone === "bad" ? "text-bad" : status ? "text-good" : "text-muted"}`}>
            {status?.text ?? (changes ? `${changes}, not saved yet.` : "You have unsaved changes.")}
          </span>
          {dirty && (
            <>
              <Button variant="ghost" onClick={() => update({ companies: saved.companies, muted: saved.muted })} disabled={saving}>
                Discard
              </Button>
              <Button onClick={() => void save(false)} disabled={saving}>
                <Save className="size-4" /> Save
              </Button>
              <Button variant="primary" onClick={() => void save(true)} disabled={saving || scanning}>
                <RefreshCw className="size-4" /> Save & scan
              </Button>
            </>
          )}
        </div>
      )}

      {meta && <RecentRuns meta={meta} />}
    </div>
  );
}
