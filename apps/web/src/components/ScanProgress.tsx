import { CircleAlert, CircleCheck, Clock, LoaderCircle, RefreshCw } from "lucide-react";
import { scanLine, type ScanState } from "../lib/scan";
import { Button, cx } from "./ui";

/** Rows listed under the progress bar: your companies, then directory ones that matched or failed. */
const MAX_ROWS = 60;

const toCompanies = () => {
  location.hash = "companies";
};

/** "Already up to date." from the directory update, in plain words. */
const syncLine = (sync: string) => (/already up to date/i.test(sync) ? "Company directory is up to date." : `Company directory: ${sync}`);

/** Live list of companies being scanned, then a one-line result. `onRetry` adds "Try again" to a failed scan. */
export function ScanProgress({ scan, onRetry }: { scan: ScanState; onRetry?: () => void }) {
  const total = scan.total;
  const doneCount = scan.done;
  const s = scan.summary;
  const yours = new Set(scan.companies);
  const rows = [...scan.companies, ...Object.keys(scan.results).filter((n) => !yours.has(n))].slice(0, MAX_ROWS);
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  return (
    <div className="space-y-3">
      {scan.phase === "running" && (
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium" role="status">
              {scanLine(scan)}
            </span>
            <span className="tabular text-muted" aria-hidden="true">
              {pct}%
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label="Scan progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${total ? (doneCount / total) * 100 : 4}%` }} />
          </div>
        </div>
      )}
      {s && (
        <p className="rounded-xl bg-accent-soft/50 p-3 text-sm" role="status">
          Scanned <b className="tabular">{s.jobsFound.toLocaleString()}</b> jobs and found <b className="tabular">{s.matches}</b> match{s.matches === 1 ? "" : "es"}
          {s.strong > 0 && (
            <>
              , <b className="tabular text-accent">{s.strong} strong</b>
            </>
          )}
          .
          {s.failed > 0 && (
            <>
              {" "}
              <span className="text-bad">
                {s.failed} compan{s.failed === 1 ? "y" : "ies"} couldn't be scanned
              </span>
              , usually because the careers page moved.{" "}
              <button type="button" className="font-medium text-accent hover:underline" onClick={toCompanies}>
                Review failing companies
              </button>
            </>
          )}
          {s.stopped && <span className="text-muted"> Stopped early: the next scan of this type carries on where it stopped.</span>}
        </p>
      )}
      {s?.moves?.map((m) => (
        <p key={m.name} className="rounded-xl bg-surface-2 p-3 text-sm">
          <b>{m.name}</b> moved its careers page. We found the new one and updated My companies.
        </p>
      ))}
      {scan.sync && scan.phase !== "running" && <p className="text-xs text-muted">{syncLine(scan.sync)}</p>}
      {scan.feed && scan.phase !== "running" && <p className="text-xs text-muted">{scan.feed}</p>}
      {scan.error && (
        <div className="rounded-xl bg-bad-soft/50 p-3 text-sm" role="alert">
          <p className="font-medium text-bad">The scan stopped before it finished.</p>
          <p className="mt-0.5 text-muted">Check your internet connection and try again. If it keeps happening, restart RawJobs and scan again.</p>
          {onRetry && (
            <Button size="sm" className="mt-2" onClick={onRetry}>
              <RefreshCw className="size-3.5" /> Try again
            </Button>
          )}
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer">Technical details</summary>
            <pre className="mt-1 whitespace-pre-wrap font-mono">{scan.error}</pre>
          </details>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm">
          {rows.map((name) => {
            const h = scan.results[name];
            return (
              <li key={name} className="flex items-center gap-2.5 px-3 py-2">
                {!h ? (
                  scan.phase === "running" ? (
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-muted" />
                  ) : (
                    <Clock className="size-4 shrink-0 text-muted" />
                  )
                ) : h.ok ? (
                  <CircleCheck className="size-4 shrink-0 text-accent" />
                ) : h.unsupported ? (
                  <Clock className="size-4 shrink-0 text-warn" />
                ) : (
                  <CircleAlert className="size-4 shrink-0 text-bad" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                <span className={cx("tabular shrink-0 text-xs", h && !h.ok && !h.unsupported ? "text-bad" : "text-muted")}>
                  {!h
                    ? ""
                    : h.ok
                      ? `${h.jobsFound} jobs · ${h.matches} match${h.matches === 1 ? "" : "es"}`
                      : h.unsupported
                        ? "not supported yet"
                        : "couldn't scan"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
