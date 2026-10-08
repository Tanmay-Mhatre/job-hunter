import { ChevronDown, LoaderCircle, RefreshCw, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { aboutTime, SCOPE_LABEL, scanPrefs, setScanPrefs, useScanPrefs, type ScanState } from "../lib/scan";
import { scanPlan, type ScanPlan, type ScanScope } from "../lib/setup";
import { Button, Card, cx } from "./ui";

const SCOPE_HINT: Record<ScanScope, string> = {
  mine: "Your companies, plus every company in the directory tagged with your industries.",
  all: "Every company in the directory we can check. Keep this computer on while it runs; you can stop it and carry on later.",
};

/**
 * "Scan now": asks which scan to run (preselecting your default), or, if you chose "don't ask
 * again", runs your default straight away. The ▾ next to it always asks. While a scan runs, the
 * button stops it (what's done is kept, and the next scan of the same type carries on).
 */
export function ScanButton({ scan, onRequest, onChoose, onStop }: { scan: ScanState; onRequest: () => void; onChoose: () => void; onStop: () => void }) {
  const prefs = useScanPrefs();
  if (scan.phase === "running")
    return (
      <Button size="sm" onClick={onStop} disabled={scan.stopping} title="Stop after the companies in progress; the next scan carries on from there">
        {scan.stopping ? <LoaderCircle className="size-3.5 animate-spin" /> : <Square className="size-3 fill-current" />}
        {scan.stopping ? "Stopping…" : "Stop scan"}
      </Button>
    );
  return (
    <div className="inline-flex">
      <Button size="sm" className="rounded-r-none" onClick={onRequest} title={prefs.ask ? "Scan now: choose which scan" : `Scan now: ${SCOPE_LABEL[prefs.scope]}`}>
        <RefreshCw className="size-3.5" /> Scan now
      </Button>
      <Button size="sm" className="-ml-px rounded-l-none px-1.5" onClick={onChoose} aria-label="Choose which scan to run" title="Choose which scan to run">
        <ChevronDown className="size-3.5" />
      </Button>
    </div>
  );
}

/** The "which scan?" pop-up. What you start becomes your default; tick the box to stop being asked. */
export function ScanChooser({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: (scope: ScanScope) => void }) {
  const [plan, setPlan] = useState<ScanPlan | null>(null);
  const [scope, setScope] = useState<ScanScope>("mine");
  const [always, setAlways] = useState(false);

  useEffect(() => {
    if (!open) return;
    const p = scanPrefs();
    setScope(p.scope);
    setAlways(!p.ask);
    void scanPlan().then(setPlan);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;
  const start = () => {
    setScanPrefs({ scope, ask: !always });
    onClose();
    onStart(scope);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="scan-chooser-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <Card className="relative w-full max-w-md p-5 shadow-2xl sm:p-6">
        <h2 id="scan-chooser-title" className="text-lg font-semibold">
          Which scan?
        </h2>
        <p className="mt-0.5 text-sm text-muted">Both sync the company directory first, then check each company live for new jobs.</p>

        <div role="radiogroup" aria-label="Scan type" className="mt-4 space-y-2">
          {(["mine", "all"] as const).map((s) => {
            const p = plan?.[s];
            return (
              <label key={s} className={cx("flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors", scope === s ? "border-accent bg-accent-soft/30" : "border-line hover:border-muted/50")}>
                <input type="radio" name="scan-scope" checked={scope === s} onChange={() => setScope(s)} className="mt-1 accent-[var(--accent)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{SCOPE_LABEL[s]}</span>
                  <span className="block text-xs text-muted">{SCOPE_HINT[s]}</span>
                  <span className="mt-1.5 block text-xs font-medium tabular">
                    {p ? `${(p.yours + p.extra).toLocaleString()} companies · ${aboutTime(p.seconds)}` : <LoaderCircle className="inline size-3 animate-spin text-muted" />}
                  </span>
                  {p?.resumable && <span className="mt-0.5 block text-xs text-accent">Carries on a stopped scan ({p.resumable.done.toLocaleString()} done)</span>}
                </span>
              </label>
            );
          })}
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            Always run this scan, don't ask again
            <span className="block text-xs text-muted">Change it any time with ▾ next to Scan now, or in Settings.</span>
          </span>
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start} autoFocus>
            <RefreshCw className="size-4" /> Start scan
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Settings: what "Scan now" does. Saved right away (in this browser). */
export function ScanPrefsPicker() {
  const prefs = useScanPrefs();
  const options: { id: string; label: string; hint: string; on: boolean; pick: () => void }[] = [
    { id: "ask", label: "Ask me every time", hint: `Your last choice is preselected (now: ${SCOPE_LABEL[prefs.scope]}).`, on: prefs.ask, pick: () => setScanPrefs({ ask: true }) },
    ...(["mine", "all"] as const).map((s) => ({
      id: s,
      label: `Always: ${SCOPE_LABEL[s]}`,
      hint: s === "mine" ? "Starts straight away, a few minutes." : "Starts straight away, about 2 hours.",
      on: !prefs.ask && prefs.scope === s,
      pick: () => setScanPrefs({ ask: false, scope: s }),
    })),
  ];
  return (
    <fieldset>
      <legend className="text-sm font-medium">When I click Scan now</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.id} className={cx("flex cursor-pointer gap-2.5 rounded-xl border p-3", o.on ? "border-accent bg-accent-soft/30" : "border-line hover:border-muted/50")}>
            <input type="radio" name="scan-now" checked={o.on} onChange={o.pick} className="mt-0.5 accent-[var(--accent)]" />
            <span className="text-sm">
              <b>{o.label}</b>
              <span className="block text-xs text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
