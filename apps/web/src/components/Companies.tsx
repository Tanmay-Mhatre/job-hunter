import { Clock, ExternalLink, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ATS_LABEL, keyOf } from "../lib/companies";
import type { CompanyHealth, DataMeta } from "../lib/data";
import { formatDate, formatDateTime, timeAgo } from "../lib/format";
import type { CompanyRow } from "../lib/setup";
import { Button, Card, Chip, cx, Segmented } from "./ui";

/** A company with no jobs for you in at least this many scans in a row, over at least QUIET_DAYS, gets a "remove?" flag. */
export const QUIET_SCANS = 10;
/** ...so ten quick scans in one afternoon don't count. */
export const QUIET_DAYS = 7;

const isQuiet = (q: Row["quiet"], now = Date.now()) => q.scans >= QUIET_SCANS && !!q.since && now - Date.parse(q.since) >= QUIET_DAYS * 86_400_000;

type Row = {
  r: CompanyRow;
  key: string;
  /** Not saved yet. */
  isNew: boolean;
  forYou: number;
  last?: { h: CompanyHealth; at: string };
  history: (CompanyHealth | undefined)[];
  /** Scans in a row (newest first) that found nothing for you, and since when. */
  quiet: { scans: number; since?: string };
};

/** Newest first: the company's health in each scan that included it. */
function healthOf(meta: DataMeta | undefined, key: string): { h: CompanyHealth; at: string }[] {
  const out: { h: CompanyHealth; at: string }[] = [];
  for (const run of meta?.runs ?? []) {
    const h = run.health.find((x) => keyOf(x) === key);
    if (h) out.push({ h, at: run.startedAt });
  }
  return out;
}

function quietOf(seen: { h: CompanyHealth; at: string }[]): Row["quiet"] {
  let scans = 0;
  let since: string | undefined;
  for (const { h, at } of seen) {
    if (!h.ok || h.matches > 0) break;
    scans++;
    since = at;
  }
  return { scans, since };
}

const failing = (row: Row) => !!row.last && !row.last.h.ok && !row.last.h.unsupported;

/**
 * Your companies: what each has for you right now, whether its careers page still works, and which
 * ones haven't had anything for you in a while (remove them, so scans stay quick and polite).
 */
export function MyCompanies({
  rows: list,
  savedKeys,
  meta,
  forYou,
  onRemove,
  onRemoveMany,
}: {
  rows: CompanyRow[];
  savedKeys: Set<string>;
  meta?: DataMeta;
  forYou: ReadonlyMap<string, number>;
  onRemove: (key: string) => void;
  onRemoveMany: (keys: string[]) => void;
}) {
  const [sort, setSort] = useState<"jobs" | "name" | "attention">("jobs");
  const rows = useMemo<Row[]>(
    () =>
      list.map((r) => {
        const key = keyOf(r);
        const seen = healthOf(meta, key);
        const history = (meta?.runs ?? []).slice(0, 14).map((run) => run.health.find((x) => keyOf(x) === key)).reverse();
        return { r, key, isNew: !savedKeys.has(key), forYou: forYou.get(key) ?? 0, last: seen[0], history, quiet: quietOf(seen) };
      }),
    [list, savedKeys, meta, forYou],
  );
  const quiet = rows.filter((x) => x.forYou === 0 && isQuiet(x.quiet));
  const broken = rows.filter(failing).length;
  const sorted = [...rows].sort((a, b) => {
    if (sort === "name") return (a.r.name || "").localeCompare(b.r.name || "");
    if (sort === "attention") return Number(failing(b)) - Number(failing(a)) || b.quiet.scans - a.quiet.scans || a.forYou - b.forYou;
    return b.forYou - a.forYou || (b.last?.h.jobsFound ?? 0) - (a.last?.h.jobsFound ?? 0);
  });
  const oldestQuiet = quiet.map((x) => x.quiet.since).filter(Boolean).sort()[0];

  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">
            Your companies <span className="tabular font-normal text-muted">({rows.length})</span>
          </h2>
          <p className="text-xs text-muted">
            {rows.filter((x) => x.forYou > 0).length} with jobs for you now
            {broken > 0 && <span className="text-bad"> · {broken} couldn't be checked</span>}
          </p>
        </div>
        {rows.length > 1 && (
          <Segmented
            label="Sort your companies"
            value={sort}
            onChange={setSort}
            options={[
              { value: "jobs", label: "Most jobs for you" },
              { value: "attention", label: "Needs attention" },
              { value: "name", label: "A–Z" },
            ]}
          />
        )}
      </header>

      {quiet.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-warn-soft/30 px-4 py-2.5 text-sm">
          <Clock className="size-4 shrink-0 text-warn" />
          <p className="min-w-0 flex-1">
            <b>
              {quiet.length} compan{quiet.length === 1 ? "y has" : "ies have"} had no jobs for you
            </b>{" "}
            <span className="text-muted">
              in {QUIET_SCANS}+ scans in a row over {QUIET_DAYS}+ days{oldestQuiet ? ` (some since ${formatDate(oldestQuiet)})` : ""}. Removing them keeps scans quick; jobs there still
              reach your Radar from the directory.
            </span>
          </p>
          <Button size="sm" onClick={() => onRemoveMany(quiet.map((x) => x.key))}>
            Remove {quiet.length}
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">
          None yet, and that's fine: your Radar already finds jobs across the directory. Add companies you'd love to work at and their jobs will always come first.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Company</th>
                <th className="px-3 py-2.5 text-right font-semibold">For you</th>
                <th className="px-3 py-2.5 text-right font-semibold">Open jobs</th>
                <th className="px-3 py-2.5 font-semibold">Last {Math.min(14, meta?.runs.length ?? 0)} scans</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((x) => (
                <tr key={x.r.id} className={cx("border-b border-line last:border-b-0", x.isNew && "bg-accent-soft/20")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 font-medium">
                      {x.r.name || x.r.slug}
                      {/^https?:/.test(x.r.input) && (
                        <a href={x.r.input} target="_blank" rel="noreferrer" className="text-muted hover:text-accent" aria-label={`${x.r.name} careers page`}>
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                      {x.isNew && <span className="text-xs font-normal text-accent">new</span>}
                    </div>
                    <div className="text-[11px] text-muted">{x.r.ats ? (ATS_LABEL[x.r.ats] ?? x.r.ats) : ""}</div>
                  </td>
                  <td className={cx("tabular px-3 py-2.5 text-right", x.forYou > 0 ? "font-semibold text-accent" : "text-muted")}>{x.forYou || "—"}</td>
                  <td className="tabular px-3 py-2.5 text-right text-muted">{x.last?.h.ok ? x.last.h.jobsFound : "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex h-5 items-end gap-0.5" aria-label="Scan history">
                      {x.history.map((h, i) => (
                        <span
                          key={i}
                          title={!h ? "not in this scan" : h.ok ? `${h.jobsFound} jobs, ${h.matches} for you` : h.error}
                          className={cx(
                            "w-1.5 rounded-sm",
                            !h ? "h-1 bg-line" : h.unsupported ? "h-1.5 bg-warn/50" : !h.ok ? "h-5 bg-bad" : h.matches > 0 ? "h-5 bg-accent/70" : "h-2.5 bg-line",
                          )}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Status row={x} />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button type="button" onClick={() => onRemove(x.key)} aria-label={`Remove ${x.r.name}`} title="Remove from your companies" className="rounded p-1 text-muted hover:text-bad">
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Status({ row }: { row: Row }) {
  const { last, r, isNew, quiet } = row;
  if (isNew) return <Chip>{r.state === "soon" ? "support coming soon" : "not saved yet"}</Chip>;
  if (!last) return r.state === "soon" ? <Chip tone="warn">support coming soon</Chip> : <Chip>not scanned yet</Chip>;
  if (last.h.unsupported) return <Chip tone="warn">{ATS_LABEL[last.h.ats] ?? last.h.ats} support coming soon</Chip>;
  if (!last.h.ok)
    return (
      <div>
        <Chip tone="bad">
          <TriangleAlert className="size-3" /> failed
        </Chip>
        <p className="mt-1 max-w-80 text-xs text-muted">{last.h.error}</p>
      </div>
    );
  if (isQuiet(quiet) && !row.forYou) return <Chip tone="warn">nothing for you since {formatDate(quiet.since)}</Chip>;
  return <Chip tone="accent">ok · {timeAgo(last.at)}</Chip>;
}

/** The latest scans: how many jobs, matches, and companies checked beyond yours. */
export function RecentRuns({ meta }: { meta: DataMeta }) {
  if (!meta.runs.length) return null;
  return (
    <Card className="overflow-hidden">
      <header className="border-b border-line px-4 py-2.5 text-sm font-semibold">Recent scans</header>
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
              {!!r.checked && <span className="tabular text-muted">+{r.checked} companies checked</span>}
              <span className="tabular text-muted">{secs.toFixed(0)}s</span>
              {failed > 0 && <Chip tone="bad">{failed} failed</Chip>}
              {r.partial && <Chip>partial</Chip>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
