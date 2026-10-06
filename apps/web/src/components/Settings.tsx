import { ArrowRight, Download, RefreshCw, Save, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { canRunLocally } from "../lib/data";
import { draftToConfig, saveBlockers, saveConfig, type Draft } from "../lib/setup";
import type { Suggestions } from "../lib/suggest";
import { ResumeStep } from "../setup/ResumeStep";
import type { Prefs } from "../lib/prefs";
import { exportState, readStateFile, type UserState } from "../lib/userState";
import { IndustriesStep, KeywordsStep, LocationsStep, RolesStep, ThresholdPicker } from "../setup/steps";
import { Button, Card, Toggle } from "./ui";

type Props = {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  /** Throw away unsaved edits (reload from the saved config). */
  revert: () => void;
  dirty: boolean;
  onSaved: () => Promise<void>;
  onScan: () => void;
  scanning: boolean;
  user: UserState;
  prefs: Prefs;
  onImport: (s: UserState, prefs?: Partial<Prefs>) => void;
  suggest: Suggestions;
  resumeText: string;
  saveResume: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  toCompanies: () => void;
};

/** Edit any part of the setup after the wizard, then save (and rescan). */
export function Settings({ draft, update, revert, dirty, onSaved, onScan, scanning, user, prefs, onImport, suggest, resumeText, saveResume, toCompanies }: Props) {
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const blockers = saveBlockers(draft).map((b) => b.message);

  useEffect(() => {
    if (dirty) setStatus(null);
  }, [dirty]);

  const save = async (thenScan: boolean) => {
    setSaving(true);
    try {
      const res = await saveConfig(draftToConfig(draft));
      if (!res.ok) return setStatus({ tone: "bad", text: res.errors });
      await onSaved();
      setStatus({ tone: "ok", text: thenScan ? "Saved. Scanning with your new settings…" : "Saved. Changes apply from the next scan." });
      if (thenScan) onScan();
    } catch (err) {
      setStatus({ tone: "bad", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Section id="resume" title="Master resume" hint="Used to suggest roles, places and topics. Saved on this computer only.">
        <ResumeStep draft={draft} update={update} resumeText={resumeText} saveResume={saveResume} hideSkip />
      </Section>
      <Section id="roles" title="Roles" hint="Only jobs whose title matches are shown.">
        <RolesStep draft={draft} update={update} suggest={suggest} />
      </Section>
      <Section id="locations" title="Locations" hint="Jobs outside these places are hidden.">
        <LocationsStep draft={draft} update={update} suggest={suggest} />
      </Section>
      <Section id="industries" title="Industries" hint="Lets you narrow your Radar to these industries. Never hides a job on its own.">
        <IndustriesStep draft={draft} update={update} suggest={suggest} />
      </Section>
      <Section id="keywords" title="Topics" hint="Rank jobs that mention these higher.">
        <KeywordsStep draft={draft} update={update} suggest={suggest} resumeText={resumeText} />
      </Section>
      <Section id="companies" title="Your companies" hint="Companies you'd love to work at: checked every scan, and their jobs always come first on your Radar.">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            You've picked <b className="tabular">{draft.companies.length}</b> compan{draft.companies.length === 1 ? "y" : "ies"}
            {draft.muted.length > 0 && <> and hidden {draft.muted.length}</>}.
          </p>
          <Button size="sm" onClick={toCompanies}>
            Manage in Companies tab <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </Section>
      <Section id="threshold" title="Strong match threshold" hint="Jobs at or above this get a star, and alerts once those arrive.">
        <ThresholdPicker draft={draft} update={update} />
      </Section>
      <Section
        id="directory"
        title="Jobs beyond your companies"
        hint="Your Radar finds jobs for you in a shared directory of ~21,000 companies, rebuilt weekly from public lists and what users add."
      >
        <div className="space-y-3">
          <Toggle
            checked={draft.discovery.check_per_scan > 0}
            onChange={(v) => update({ discovery: { ...draft.discovery, check_per_scan: v ? 30 : 0 } })}
          >
            Also check the best of those companies live on every scan
          </Toggle>
          {draft.discovery.check_per_scan > 0 ? (
            <label className="flex flex-wrap items-center gap-2 pl-6 text-sm">
              Up to
              <input
                type="number"
                min={1}
                max={100}
                value={draft.discovery.check_per_scan}
                onChange={(e) => update({ discovery: { ...draft.discovery, check_per_scan: Math.min(100, Math.max(1, Math.round(Number(e.target.value) || 1))) } })}
                className="h-8 w-20 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-accent"
                aria-label="Companies to check per scan"
              />
              companies per scan, best matches first; each is checked at most once a week.
            </label>
          ) : null}
          <p className="pl-6 text-xs text-muted">
            {draft.discovery.check_per_scan > 0
              ? "Checked jobs get a full score and a real apply link. The rest stay estimated (title, place and date only) until checked. Each check is one request to that company's careers page."
              : "Off: only your companies are contacted. Directory jobs stay estimated, with a link to the careers page, until you check or add the company."}
          </p>
          <Toggle checked={draft.directory.auto_update} onChange={(v) => update({ directory: { ...draft.directory, auto_update: v } })}>
            Download the latest directory automatically (checked weekly)
          </Toggle>
          <Toggle checked={draft.directory.share_additions} onChange={(v) => update({ directory: { ...draft.directory, share_additions: v } })}>
            Share companies I add by link with everyone
          </Toggle>
          <p className="text-xs text-muted">
            Sharing sends only the company's hiring system, board name and company name. Never your profile, resume, searches or which jobs you look at.
          </p>
        </div>
      </Section>
      <TrackingData user={user} prefs={prefs} onImport={onImport} />

      {canRunLocally && (dirty || status) && (
        <div className="sticky bottom-16 z-10 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur md:bottom-4">
          {status && <pre className={`mb-2 whitespace-pre-wrap font-sans text-sm ${status.tone === "ok" ? "text-good" : "text-bad"}`}>{status.text}</pre>}
          {dirty && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-sm text-muted">{blockers[0] ?? "You have unsaved changes."}</span>
              <Button variant="ghost" onClick={revert} disabled={saving}>
                Discard
              </Button>
              <Button onClick={() => void save(false)} disabled={saving || blockers.length > 0}>
                <Save className="size-4" /> Save
              </Button>
              <Button variant="primary" onClick={() => void save(true)} disabled={saving || scanning || blockers.length > 0}>
                <RefreshCw className="size-4" /> Save & rescan
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  return (
    <Card className="scroll-mt-20 p-5 sm:p-6">
      <section id={`settings-${id}`} aria-labelledby={`h-${id}`}>
        <h2 id={`h-${id}`} className="text-base font-semibold">
          {title}
        </h2>
        <p className="mb-5 mt-0.5 text-sm text-muted">{hint}</p>
        {children}
      </section>
    </Card>
  );
}

function TrackingData({ user, prefs, onImport }: { user: UserState; prefs: Prefs; onImport: (s: UserState, prefs?: Partial<Prefs>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const tracked = Object.keys(user).length;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const next = await readStateFile(f);
      const count = Object.keys(next.state).length;
      if (tracked && !confirm(`Replace your ${tracked} tracked jobs in this browser with the ${count} in the file?`)) return;
      onImport(next.state, next.prefs);
      setMsg({ tone: "ok", text: `Imported ${count} tracked jobs.` });
    } catch (err) {
      setMsg({ tone: "bad", text: (err as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-semibold">Your tracking data</h2>
      <p className="mt-0.5 text-sm text-muted">
        Statuses and notes for <b className="tabular text-fg">{tracked}</b> jobs, plus your saved Radar views and hidden companies, are saved in this
        browser only. Export a backup or move them to another device.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => exportState(user, prefs)} disabled={!tracked && !prefs.views.length && !prefs.hiddenCompanies.length}>
          <Download className="size-4" /> Export
        </Button>
        <Button onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> Import
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.tone === "ok" ? "text-good" : "text-bad"}`}>{msg.text}</p>}
    </Card>
  );
}
