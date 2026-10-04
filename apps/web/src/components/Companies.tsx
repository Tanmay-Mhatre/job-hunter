import { ExternalLink, Plus, TriangleAlert } from "lucide-react";
import type { CompanyHealth, DataMeta } from "../lib/data";
import { formatDateTime, timeAgo } from "../lib/format";
import { Button, Card, Chip, cx } from "./ui";

const key = (ats: string, slug: string) => `${ats}:${slug.toLowerCase()}`;

/** Runs in a row (newest first) where this company returned zero jobs. */
function zeroStreak(meta: DataMeta, k: string): number {
  let n = 0;
  for (const run of meta.runs) {
    const h = run.health.find((x) => key(x.ats, x.slug) === k);
    if (!h) continue;
    if (h.ok && h.jobsFound > 0) break;
    n++;
  }
  return n;
}

function lastHealth(meta: DataMeta, k: string): { h: CompanyHealth; at: string } | undefined {
  for (const run of meta.runs) {
    const h = run.health.find((x) => key(x.ats, x.slug) === k);
    if (h) return { h, at: run.startedAt };
  }
  return undefined;
}

export function Companies({ meta, onAdd }: { meta: DataMeta; onAdd: () => void }) {
  const rows = meta.companies.map((c) => {
    const k = key(c.ats, c.slug);
    const last = lastHealth(meta, k);
    const history = meta.runs
      .slice(0, 14)
      .map((r) => r.health.find((x) => key(x.ats, x.slug) === k))
      .reverse();
    return { c, last, history, zero: zeroStreak(meta, k) };
  });
  const failing = rows.filter((r) => r.last && !r.last.h.ok && !r.last.h.unsupported).length;
  const flagged = rows.filter((r) => r.zero >= 3).length;
  const latest = meta.runs[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        <Card className="px-4 py-3">
          <div className="tabular text-2xl font-semibold">{meta.companies.filter((c) => c.enabled).length}</div>
          <div className="text-xs text-muted">Companies tracked</div>
        </Card>
        <Card className="px-4 py-3">
          <div className={cx("tabular text-2xl font-semibold", failing > 0 && "text-bad")}>{failing}</div>
          <div className="text-xs text-muted">Failed in their last run</div>
        </Card>
        <Card className="px-4 py-3">
          <div className={cx("tabular text-2xl font-semibold", flagged > 0 && "text-warn")}>{flagged}</div>
          <div className="text-xs text-muted">Zero jobs for 3+ runs (check the slug)</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">Your companies</h2>
          <Button size="sm" onClick={onAdd}>
            <Plus className="size-3.5" /> Add companies
          </Button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Company</th>
                <th className="px-3 py-2.5 font-semibold">Source</th>
                <th className="px-3 py-2.5 text-right font-semibold">Jobs</th>
                <th className="px-3 py-2.5 text-right font-semibold">Matches</th>
                <th className="px-3 py-2.5 font-semibold">Last {Math.min(14, meta.runs.length)} runs</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, last, history, zero }) => (
                <tr key={key(c.ats, c.slug)} className={cx("border-b border-line last:border-b-0", !c.enabled && "opacity-50")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 font-medium">
                      {c.name}
                      {c.careers_url && (
                        <a href={c.careers_url} target="_blank" rel="noreferrer" className="text-muted hover:text-accent" aria-label={`${c.name} careers page`}>
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-muted">{c.slug}</div>
                  </td>
                  <td className="px-3 py-2.5 capitalize text-muted">{c.ats}</td>
                  <td className="tabular px-3 py-2.5 text-right">{last?.h.ok ? last.h.jobsFound : "—"}</td>
                  <td className="tabular px-3 py-2.5 text-right">{last?.h.ok ? last.h.matches : "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex h-5 items-end gap-0.5" aria-label="Run history">
                      {history.map((h, i) => (
                        <span
                          key={i}
                          title={!h ? "not run" : h.ok ? `${h.jobsFound} jobs` : h.error}
                          className={cx(
                            "w-1.5 rounded-sm",
                            !h ? "h-1 bg-line" : h.unsupported ? "h-1.5 bg-warn/50" : !h.ok ? "h-5 bg-bad" : h.jobsFound === 0 ? "h-1.5 bg-warn" : "h-5 bg-accent/70",
                          )}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {!c.enabled ? (
                      <Chip>disabled</Chip>
                    ) : !last ? (
                      <Chip>not run yet</Chip>
                    ) : last.h.unsupported ? (
                      <Chip tone="warn">{c.ats} support coming soon</Chip>
                    ) : !last.h.ok ? (
                      <div>
                        <Chip tone="bad">
                          <TriangleAlert className="size-3" /> failed
                        </Chip>
                        <p className="mt-1 max-w-80 text-xs text-muted">{last.h.error}</p>
                      </div>
                    ) : zero >= 3 ? (
                      <Chip tone="warn">0 jobs for {zero} runs</Chip>
                    ) : (
                      <Chip tone="accent">ok · {timeAgo(last.at)}</Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {latest && (
        <Card className="overflow-hidden">
          <header className="border-b border-line px-4 py-2.5 text-sm font-semibold">Recent runs</header>
          <ul className="divide-y divide-line text-sm">
            {meta.runs.slice(0, 10).map((r) => {
              const failed = r.health.filter((h) => !h.ok && !h.unsupported).length;
              const secs = (Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000;
              return (
                <li key={r.startedAt} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                  <span className="w-36 font-medium">{formatDateTime(r.startedAt)}</span>
                  <span className="tabular text-muted">{r.jobsFound} jobs</span>
                  <span className="tabular text-muted">{r.matches} matches</span>
                  <span className={cx("tabular", r.newMatches > 0 ? "text-accent" : "text-muted")}>{r.newMatches} new</span>
                  <span className="tabular text-muted">{r.closed} closed</span>
                  <span className="tabular text-muted">{secs.toFixed(0)}s</span>
                  {failed > 0 && <Chip tone="bad">{failed} failed</Chip>}
                  {r.partial && <Chip>partial</Chip>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
