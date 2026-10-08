import { CircleAlert, Clock, LoaderCircle, Plus, Power, Play, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { removeSchedule, runScheduleNow, saveSchedule, scheduleStatus, type ScheduledRun, type ScheduleStatus } from "../lib/automation";
import { formatDateTime, timeAgo } from "../lib/format";
import { aboutTime, SCOPE_LABEL } from "../lib/scan";
import { scanPlan, type ScanPlan, type ScanScope } from "../lib/setup";
import { Button, cx } from "./ui";

const NOTIFIED: Record<string, string> = { sent: "sent to Telegram", "nothing-new": "nothing new to send", off: "Telegram not set up" };

function runLine(r: ScheduledRun): string {
  if (!r.ok) return r.error ?? "failed";
  const parts = [`${r.matches ?? 0} matches, ${r.newMatches ?? 0} new`];
  if (r.notified) parts.push(NOTIFIED[r.notified] ?? r.notified);
  if (r.stopped) parts.push("stopped early");
  return parts.join(" · ");
}

/**
 * Scans on a timer, run by this computer's own scheduler (Task Scheduler on Windows), so they
 * happen with the dashboard closed. They need the computer on (or asleep).
 */
export function ScheduledScans() {
  const [status, setStatus] = useState<ScheduleStatus | null>(null);
  const [plan, setPlan] = useState<ScanPlan | null>(null);
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [scope, setScope] = useState<ScanScope>("mine");
  const [busy, setBusy] = useState<"save" | "remove" | "run" | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const s = await scheduleStatus();
    setStatus(s);
    if (s.settings) {
      setTimes(s.settings.times);
      setScope(s.settings.scope);
    }
  }, []);
  useEffect(() => {
    void refresh();
    void scanPlan().then(setPlan);
  }, [refresh]);

  const run = async (kind: "save" | "remove" | "run") => {
    setBusy(kind);
    setNote(null);
    try {
      const s = kind === "save" ? await saveSchedule(times, scope) : kind === "remove" ? await removeSchedule() : await runScheduleNow();
      if (!s.ok) setNote({ tone: "bad", text: s.error ?? "Something went wrong." });
      else
        setNote({
          tone: "ok",
          text: kind === "save" ? "Saved. Your computer will scan at these times." : kind === "remove" ? "Scheduled scans are off." : "Started. It runs in the background; the result shows below when it's done.",
        });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  if (!status) return <p className="flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" /> Checking…</p>;
  if (!status.supported) return <p className="text-sm text-muted">Scheduled scans aren't supported on this system yet.</p>;

  const saved = status.settings;
  const changed = !saved || saved.times.join() !== [...times].sort().join() || saved.scope !== scope;

  return (
    <div className="space-y-4">
      {status.installed && saved ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-accent-soft/50 p-3 text-sm">
          <Clock className="size-4 text-accent" />
          <span>
            On: <b>{SCOPE_LABEL[saved.scope]}</b>, daily at <b>{saved.times.join(" and ")}</b>.
            {status.nextRun && <> Next scan {formatDateTime(status.nextRun)}.</>}
          </span>
        </div>
      ) : (
        status.problem && (
          <p className="flex items-start gap-2 rounded-xl bg-warn-soft/50 p-3 text-sm text-warn">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {status.problem}
          </p>
        )
      )}

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">When</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {times.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <input
                  type="time"
                  value={t}
                  onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))}
                  aria-label={`Scan time ${i + 1}`}
                  className="h-9 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-accent"
                />
                {times.length > 1 && (
                  <button type="button" aria-label="Remove this time" className="rounded p-1 text-muted hover:text-fg" onClick={() => setTimes(times.filter((_, j) => j !== i))}>
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            ))}
            {times.length < 2 && (
              <Button size="sm" variant="ghost" onClick={() => setTimes([...times, times[0] === "20:00" ? "08:00" : "20:00"])}>
                <Plus className="size-3.5" /> Twice a day
              </Button>
            )}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">What to scan</p>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {(["mine", "all"] as const).map((s) => {
              const p = plan?.[s];
              return (
                <label key={s} className={cx("flex cursor-pointer gap-2.5 rounded-xl border p-3", scope === s ? "border-accent bg-accent-soft/30" : "border-line")}>
                  <input type="radio" name="schedule-scope" checked={scope === s} onChange={() => setScope(s)} className="mt-0.5 accent-[var(--accent)]" />
                  <span className="text-sm">
                    <b>{SCOPE_LABEL[s]}</b>
                    <span className="block text-xs text-muted">{p ? `${(p.yours + p.extra).toLocaleString()} companies · ${aboutTime(p.seconds)}` : "…"}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void run("save")} disabled={!!busy || (status.installed && !changed)}>
            {busy === "save" && <LoaderCircle className="size-3.5 animate-spin" />}
            {status.installed ? "Save changes" : "Turn on scheduled scans"}
          </Button>
          {status.installed && (
            <>
              <Button onClick={() => void run("run")} disabled={!!busy}>
                {busy === "run" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Run it now
              </Button>
              <Button variant="ghost" onClick={() => void run("remove")} disabled={!!busy}>
                <Power className="size-3.5" /> Turn off
              </Button>
            </>
          )}
        </div>
        {note && <p className={cx("text-sm", note.tone === "bad" ? "text-bad" : "text-good")}>{note.text}</p>}
      </div>

      <p className="text-xs text-muted">
        Scans run on this computer, even with this page closed, but only while it's on or asleep (it wakes up for them). A scan missed while it was off runs as
        soon as it's back on. {scope === "all" && "All companies takes about 2 hours: keep the computer on until it's done."}
      </p>

      {status.runs.length > 0 && (
        <div>
          <p className="text-sm font-medium">Recent scheduled scans</p>
          <ul className="mt-1.5 divide-y divide-line rounded-xl border border-line text-sm">
            {status.runs.slice(0, 5).map((r) => (
              <li key={r.startedAt} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="w-32 shrink-0 text-muted" title={formatDateTime(r.startedAt)}>
                  {timeAgo(r.startedAt)}
                </span>
                <span className={cx("min-w-0 flex-1", !r.ok && "text-bad")}>{runLine(r)}</span>
                <span className="text-xs text-muted">{SCOPE_LABEL[r.scope]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
