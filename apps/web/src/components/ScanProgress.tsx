import { CircleAlert, CircleCheck, Clock, LoaderCircle } from "lucide-react";
import { scanLine, type ScanState } from "../lib/scan";
import { cx } from "./ui";

/** Rows listed under the progress bar: your companies, then directory ones that matched or failed. */
const MAX_ROWS = 60;

/** Live list of companies being scanned, then a one-line result. */
export function ScanProgress({ scan }: { scan: ScanState }) {
  const total = scan.total;
  const doneCount = scan.done;
  const s = scan.summary;
  const yours = new Set(scan.companies);
  const rows = [...scan.companies, ...Object.keys(scan.results).filter((n) => !yours.has(n))].slice(0, MAX_ROWS);
  return (
    <div className="space-y-3">
      {scan.phase === "running" && (
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{scanLine(scan)}</span>
            <span className="tabular text-muted">{total ? Math.round((doneCount / total) * 100) : 0}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${total ? (doneCount / total) * 100 : 4}%` }} />
          </div>
        </div>
      )}
      {s && (
        <p className="rounded-xl bg-accent-soft/50 p-3 text-sm">
          Scanned <b className="tabular">{s.jobsFound.toLocaleString()}</b> jobs and found <b className="tabular">{s.matches}</b> match{s.matches === 1 ? "" : "es"}
          {s.strong > 0 && (
            <>
              , <b className="tabular text-accent">{s.strong} strong</b>
            </>
          )}
          .{s.failed > 0 && <span className="text-bad"> {s.failed} compan{s.failed === 1 ? "y" : "ies"} couldn't be checked.</span>}
          {s.stopped && <span className="text-muted"> Stopped early: the next scan of this type carries on where it stopped.</span>}
        </p>
      )}
      {s?.moves?.map((m) => (
        <p key={m.name} className="rounded-xl bg-surface-2 p-3 text-sm">
          <b>{m.name}</b> moved its job board ({m.from} → {m.to}). We checked the new one and updated your companies.
        </p>
      ))}
      {scan.sync && scan.phase !== "running" && <p className="text-xs text-muted">Company directory: {scan.sync}</p>}
      {scan.error && <p className="whitespace-pre-wrap rounded-xl bg-bad-soft/50 p-3 font-mono text-xs text-bad">{scan.error}</p>}
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
                        ? "coming soon"
                        : "couldn't check"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
