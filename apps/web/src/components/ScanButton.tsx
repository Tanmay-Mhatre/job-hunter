import { ChevronDown, LoaderCircle, RefreshCw, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { roughCount } from "../lib/format";
import { aboutTime, SCOPE_LABEL, scanPrefs, scopeLabel, setScanPrefs, useScanPrefs, type ScanState } from "../lib/scan";
import { scanPlan, type ScanPlan, type ScanScope } from "../lib/setup";
import { Dialog } from "./Dialog";
import { Button, Card, cx, IconButton } from "./ui";

const SCOPE_HINT: Record<ScanScope, string> = {
  mine: "Your companies, plus every company in the directory tagged with your industries.",
  all: "Every company in the directory we can scan. Keep this computer on while it runs; you can stop it and carry on later.",
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
      <Button size="sm" className="rounded-r-0" onClick={onRequest} title={prefs.ask ? "Scan now: choose which scan" : `Scan now: ${SCOPE_LABEL[prefs.scope]}`}>
        <RefreshCw className="size-3.5" /> Scan now
      </Button>
      <Button size="sm" className="-ml-px rounded-l-0 px-1.5" onClick={onChoose} aria-label="Choose which scan to run" title="Choose which scan to run">
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
  }, [open]);

  const start = () => {
    setScanPrefs({ scope, ask: !always });
    onClose();
    onStart(scope);
  };
  // No industry companies on top of yours: the "mine" scan is just My companies.
  const hasIndustries = !plan || plan.mine.extra > 0;

  return (
    <Dialog open={open} onClose={onClose} labelledBy="scan-chooser-title" placement="bottom" initialFocus="[data-autofocus]">
      <Card className="relative p-5 shadow-l3 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="scan-chooser-title" className="type-subheading font-semibold">
              Which scan?
            </h2>
            <p className="mt-0.5 type-small text-muted">Both update the company directory first, then scan each company live for new jobs.</p>
          </div>
          <IconButton label="Close" className="-mr-2 -mt-1" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>

        <div role="radiogroup" aria-label="Scan type" className="mt-4 space-y-2">
          {(["mine", "all"] as const).map((s) => {
            const p = plan?.[s];
            const count = p ? p.yours + p.extra : 0;
            return (
              <label key={s} className={cx("flex cursor-pointer gap-3 rounded-md border p-3.5 transition-colors", scope === s ? "border-accent bg-accent-subtle/30" : "border-line hover:border-muted/50")}>
                <input type="radio" name="scan-scope" checked={scope === s} onChange={() => setScope(s)} className="mt-1 accent-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block type-small font-semibold">{scopeLabel(s, hasIndustries)}</span>
                  <span className="block type-meta text-muted">{s === "mine" && !hasIndustries ? "The companies you've added. Add industries in Settings to scan more." : SCOPE_HINT[s]}</span>
                  <span className="mt-1.5 block type-meta font-medium tabular">
                    {p ? `${s === "all" ? roughCount(count) : count.toLocaleString()} companies · ${aboutTime(p.seconds)}` : <LoaderCircle className="inline size-3 animate-spin text-muted" />}
                  </span>
                  {p?.resumable && <span className="mt-0.5 block type-meta text-accent-text">Carries on a stopped scan ({p.resumable.done.toLocaleString()} done)</span>}
                </span>
              </label>
            );
          })}
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2 type-small">
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
          <span>
            Always run this scan, don't ask again
            <span className="block type-meta text-muted">Change it any time with ▾ next to Scan now, or in Settings.</span>
          </span>
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start} data-autofocus>
            <RefreshCw className="size-4" /> Start scan
          </Button>
        </div>
      </Card>
    </Dialog>
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
      hint: s === "mine" ? "Starts straight away, a few minutes." : "Starts straight away. Minutes with the daily job feed, up to 2 hours without it.",
      on: !prefs.ask && prefs.scope === s,
      pick: () => setScanPrefs({ ask: false, scope: s }),
    })),
  ];
  return (
    <fieldset>
      <legend className="type-label">When I click Scan now</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.id} className={cx("flex cursor-pointer gap-2.5 rounded-md border p-3", o.on ? "border-accent bg-accent-subtle/30" : "border-line hover:border-muted/50")}>
            <input type="radio" name="scan-now" checked={o.on} onChange={o.pick} className="mt-0.5 accent-accent" />
            <span className="type-small">
              <b>{o.label}</b>
              <span className="block type-meta text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
