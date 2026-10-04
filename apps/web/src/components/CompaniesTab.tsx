import { ArrowRight, Building2, Clock, RefreshCw, Save, X } from "lucide-react";
import { useState } from "react";
import type { DataMeta } from "../lib/data";
import { canRunLocally } from "../lib/data";
import { companiesBlocker, draftToConfig, saveConfig, type Draft } from "../lib/setup";
import { Companies } from "./Companies";
import { CompanyFinder, companyKey } from "./CompanyFinder";
import { EmptyState } from "./EmptyState";
import { Button, Card, cx } from "./ui";

type Props = {
  /** A valid personal config exists (companies are saved into it). */
  configured: boolean;
  meta?: DataMeta;
  draft: Draft;
  saved: Draft;
  update: (patch: Partial<Draft>) => void;
  onSaved: () => Promise<void>;
  onScan: () => void;
  scanning: boolean;
  toSetup: () => void;
};

const companiesKey = (d: Draft) => JSON.stringify(draftToConfig(d).companies);

/**
 * Companies tab: find companies (suggested for you, browse the directory, or add by link),
 * see the ones you watch, save and scan. The health table appears after a scan.
 */
export function CompaniesTab({ configured, meta, draft, saved, update, onSaved, onScan, scanning, toSetup }: Props) {
  const [tab, setTab] = useState<"suggested" | "browse" | "link">("suggested");
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = companiesKey(draft) !== companiesKey(saved);
  const blocker = companiesBlocker(draft);
  const savedKeys = new Set(saved.companies.map(companyKey));
  const added = draft.companies.filter((r) => !savedKeys.has(companyKey(r))).length;

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
        Tell us the roles and places you want. Then we'll suggest companies that are hiring for you, and watch their careers pages.
      </EmptyState>
    );
  }

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

  const trackable = draftToConfig(draft).companies.filter((c) => ["greenhouse", "lever", "ashby", "smartrecruiters"].includes(c.ats)).length;

  return (
    <div className="space-y-4">
      <CompanyFinder draft={draft} update={update} tab={tab} setTab={setTab} />

      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-semibold">
          Your companies <span className="tabular font-normal text-muted">({draft.companies.length})</span>
        </h2>
        {draft.companies.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Add companies from the suggestions above; we'll scan their careers pages every day.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {draft.companies.map((r) => {
              const isNew = !savedKeys.has(companyKey(r));
              return (
                <li
                  key={r.id}
                  className={cx(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg border pl-2.5 pr-1 text-sm",
                    isNew ? "border-accent bg-accent-soft/50" : "border-line",
                  )}
                >
                  {r.state === "soon" && <Clock className="size-3.5 text-warn" aria-label="support coming soon" />}
                  <span className="font-medium">{r.name || r.slug}</span>
                  {isNew && <span className="text-xs text-accent">new</span>}
                  <button
                    type="button"
                    aria-label={`Remove ${r.name || r.slug}`}
                    onClick={() => update({ companies: draft.companies.filter((x) => x.id !== r.id) })}
                    className="rounded p-0.5 text-muted hover:text-bad"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {(dirty || status) && canRunLocally && (
        <div className="sticky bottom-16 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur md:bottom-4">
          <span className={`mr-auto text-sm ${status?.tone === "bad" ? "text-bad" : status ? "text-good" : "text-muted"}`}>
            {status?.text ?? blocker ?? (added ? `${added} compan${added === 1 ? "y" : "ies"} added, not saved yet.` : "You have unsaved changes.")}
          </span>
          {dirty && (
            <>
              <Button variant="ghost" onClick={() => update({ companies: saved.companies })} disabled={saving}>
                Discard
              </Button>
              <Button onClick={() => void save(false)} disabled={saving || !!blocker}>
                <Save className="size-4" /> Save
              </Button>
              <Button variant="primary" onClick={() => void save(true)} disabled={saving || scanning || !!blocker || trackable === 0}>
                <RefreshCw className="size-4" /> Save & scan
              </Button>
            </>
          )}
        </div>
      )}

      {meta && (
        <Companies
          meta={meta}
          onAdd={() => {
            setTab("suggested");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
