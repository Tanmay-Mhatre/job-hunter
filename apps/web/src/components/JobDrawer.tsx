import { Check, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Job, Profile } from "../lib/data";
import { copyText } from "../lib/clipboard";
import { formatDate, formatSalary, timeAgo } from "../lib/format";
import { PIPELINE, STATUS_LABEL, type Entry, type Status } from "../lib/userState";
import { Button, Chip, cx, IconButton, ScoreBadge } from "./ui";

type Props = {
  job: Job;
  entry?: Entry;
  profile: Profile;
  onClose: () => void;
  onUpdate: (patch: { status?: Status; note?: string }) => void;
};

export function JobDrawer({ job, entry, profile, onClose, onUpdate }: Props) {
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    setCopied(false);
  }, [job.id]);

  const copyJd = async () => {
    const text = [`${job.title} — ${job.company}`, job.location, job.url, "", job.description ?? ""].join("\n");
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const salary = formatSalary(job.salary);
  const status = entry?.status;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={job.title}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col border-l border-line bg-surface shadow-2xl outline-none sm:max-w-xl"
      >
        <header className="flex items-start gap-3 border-b border-line p-4 sm:p-5">
          <ScoreBadge score={job.score} min={profile.min_score} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-6">{job.title}</h2>
            <p className="mt-0.5 text-sm text-muted">
              <span className="font-medium text-fg">{job.company}</span> · {job.location || "Location not listed"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {job.workplace !== "unknown" && <Chip>{job.workplace}</Chip>}
              {salary && <Chip>{salary}</Chip>}
              {job.status === "closed" && <Chip tone="bad">Closed {timeAgo(job.closedAt)}</Chip>}
            </div>
          </div>
          <IconButton label="Close (Esc)" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              Open job page <ExternalLink className="size-4" />
            </a>
            <Button onClick={copyJd} disabled={!job.description}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy JD"}
            </Button>
          </div>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your status</h3>
            <div className="flex flex-wrap gap-1.5">
              {[...PIPELINE, "dismissed" as const].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdate({ status: status === s ? undefined : s })}
                  className={cx(
                    "h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                    status === s ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2",
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <textarea
              key={job.id}
              defaultValue={entry?.note ?? ""}
              onBlur={(e) => e.target.value !== (entry?.note ?? "") && onUpdate({ note: e.target.value || undefined })}
              placeholder="Notes: referral, recruiter name, follow-up date…"
              rows={3}
              className="mt-2 w-full resize-y rounded-lg border border-line bg-surface-2/50 p-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </section>

          <ScoreBreakdown job={job} profile={profile} />

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Details</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Posted</dt>
              <dd>{job.postedAt ? `${formatDate(job.postedAt)} (${timeAgo(job.postedAt)})` : "Not given by the ATS"}</dd>
              <dt className="text-muted">First seen</dt>
              <dd>{formatDate(job.firstSeen)}</dd>
              <dt className="text-muted">Last seen</dt>
              <dd>{timeAgo(job.lastSeen)}</dd>
              {job.department && (
                <>
                  <dt className="text-muted">Department</dt>
                  <dd>{job.department}</dd>
                </>
              )}
              <dt className="text-muted">Source</dt>
              <dd className="capitalize">{job.ats}</dd>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Description</h3>
            {job.description ? (
              <div className="whitespace-pre-wrap text-sm leading-6 text-fg/90">{job.description}</div>
            ) : (
              <p className="text-sm text-muted">
                {job.why.gate ? "Not stored for jobs that fail your gates." : "No description in the feed."} Open the job page to read it.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ScoreBreakdown({ job, profile }: { job: Job; profile: Profile }) {
  const w = job.why;
  const rows: [string, number, number, string?][] = [
    ["Title", w.title, 30, w.title === 30 ? "match + seniority" : w.title === 20 ? "match" : "no match"],
    ["Location", w.location, 20, w.location === 20 ? "target location" : w.location === 15 ? "accepted remote" : "no match"],
    ["Keywords", w.keywordPoints, 40],
    ["Freshness", w.freshness, 10, w.freshness === 10 ? "≤ 3 days" : w.freshness === 6 ? "≤ 7 days" : "older"],
  ];
  return (
    <section>
      <h3 className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted">
        Why this score
        {w.gate && <span className="normal-case tracking-normal text-warn">Failed the {w.gate} gate, so the score is 0</span>}
      </h3>
      <div className="space-y-2 rounded-xl border border-line p-3">
        {rows.map(([label, pts, max, note]) => (
          <div key={label} className="grid grid-cols-[76px_1fr_52px] items-center gap-3 text-sm">
            <span className="text-muted">{label}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(pts / max) * 100}%` }} />
            </div>
            <span className="tabular text-right font-medium">
              {pts}
              <span className="text-muted">/{max}</span>
            </span>
            {note && <span className="col-start-2 -mt-1.5 text-xs text-muted">{note}</span>}
          </div>
        ))}
        {w.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-line pt-2">
            {w.keywords.map((k) => (
              <Chip key={k} tone="accent">
                {k} +{profile.keywords[k] ?? "?"}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
