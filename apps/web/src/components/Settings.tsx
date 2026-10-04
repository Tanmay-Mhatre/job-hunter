import { Download, RefreshCw, Save, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { canRunLocally } from "../lib/data";
import { draftToConfig, saveBlockers, saveConfig, type Draft } from "../lib/setup";
import type { Suggestions } from "../lib/suggest";
import { ResumeStep } from "../setup/ResumeStep";
import { exportState, readStateFile, type UserState } from "../lib/userState";
import { CompaniesStep, KeywordsStep, LocationsStep, RolesStep, ThresholdPicker } from "../setup/steps";
import { Button, Card } from "./ui";

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
  onImport: (s: UserState) => void;
  suggest: Suggestions;
  resumeText: string;
  saveResume: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/** Edit any part of the setup after the wizard, then save (and rescan). */
export function Settings({ draft, update, revert, dirty, onSaved, onScan, scanning, user, onImport, suggest, resumeText, saveResume }: Props) {
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
      <Section id="keywords" title="Topics" hint="Rank jobs that mention these higher.">
        <KeywordsStep draft={draft} update={update} suggest={suggest} resumeText={resumeText} />
      </Section>
      <Section id="companies" title="Companies" hint="Paste more careers links to watch more companies.">
        <CompaniesStep draft={draft} update={update} />
      </Section>
      <Section id="threshold" title="Strong match threshold" hint="Jobs at or above this get a star, and alerts once those arrive.">
        <ThresholdPicker draft={draft} update={update} />
      </Section>
      <TrackingData user={user} onImport={onImport} />

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

function TrackingData({ user, onImport }: { user: UserState; onImport: (s: UserState) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const tracked = Object.keys(user).length;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const next = await readStateFile(f);
      const count = Object.keys(next).length;
      if (tracked && !confirm(`Replace your ${tracked} tracked jobs in this browser with the ${count} in the file?`)) return;
      onImport(next);
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
        Statuses and notes for <b className="tabular text-fg">{tracked}</b> jobs are saved in this browser only. Export a backup or move them to another
        device.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => exportState(user)} disabled={!tracked}>
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
