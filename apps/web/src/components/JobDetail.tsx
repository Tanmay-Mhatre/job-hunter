import { INDUSTRY_BY_ID } from "@jobhunter/core/catalog/industries";
import { SENIORITY_LEVELS } from "@jobhunter/core/catalog/seniority";
import { ArrowLeft, Building2, Check, ChevronDown, ChevronUp, CircleCheck, Copy, EyeOff, ExternalLink, LoaderCircle, MapPin, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { copyText } from "../lib/clipboard";
import { useDescription, type Job, type Profile } from "../lib/data";
import { formatDate, formatSalary, postedOrSeen, timeAgo } from "../lib/format";
import { PIPELINE, STATUS_LABEL, type Entry, type Status } from "../lib/userState";
import { Button, Chip, cx, IconButton, ScoreBadge } from "./ui";

export type JobDetailProps = {
  job: Job;
  entry?: Entry;
  profile: Profile;
  /** Other postings of the same role (grouped duplicates), including `job`. */
  postings?: Job[];
  industries?: string[];
  moreFromCompany?: Job[];
  companyHidden?: boolean;
  onUpdate: (patch: { status?: Status; note?: string }) => void;
  onApply?: (job: Job) => void;
  onHideCompany?: (hidden: boolean) => void;
  onOpenJob?: (job: Job) => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** Shown as an overlay (phones, Pipeline): a close / back button. */
  onClose?: () => void;
};

const SENIORITY_LABEL = Object.fromEntries(SENIORITY_LEVELS.map((s) => [s.id, s.label]));

/** Everything about one job: actions, why it matches, details, description, notes. */
export function JobDetail(p: JobDetailProps) {
  const { job, entry, profile } = p;
  const description = useDescription(job);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const salary = formatSalary(job.salary);
  const status = entry?.status;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setCopied(false);
  }, [job.id]);

  const copyJd = async () => {
    const text = [`${job.title} — ${job.company}`, job.location, job.url, "", description ?? ""].join("\n");
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const postings = p.postings && p.postings.length > 1 ? p.postings : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {p.onClose && (
            <IconButton label="Back (Esc)" onClick={p.onClose} className="-ml-1 lg:hidden">
              <ArrowLeft className="size-5" />
            </IconButton>
          )}
          <ScoreBadge score={job.score} min={profile.min_score} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-6">{job.title}</h2>
            <p className="mt-0.5 text-sm text-muted">
              <span className="font-medium text-fg">{job.company}</span>
              {p.industries?.length ? <> · {p.industries.map((i) => INDUSTRY_BY_ID.get(i)?.label ?? i).join(", ")}</> : null}
            </p>
            <p className="mt-0.5 flex items-start gap-1 text-sm text-muted">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">{postings ? `${postings.length} locations` : job.location || "Location not listed"}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {job.workplace !== "unknown" && <Chip className="capitalize">{job.workplace}</Chip>}
              {salary && <Chip tone="accent">{salary}</Chip>}
              <Chip>{SENIORITY_LABEL[job.seniority]}</Chip>
              <Chip>{job.postedAt ? `Posted ${timeAgo(job.postedAt)}` : `Seen ${timeAgo(postedOrSeen(job))}`}</Chip>
              {job.status === "closed" && <Chip tone="bad">Closed {timeAgo(job.closedAt)}</Chip>}
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            {p.onPrev && (
              <IconButton label="Previous job (k)" onClick={p.onPrev}>
                <ChevronUp className="size-4" />
              </IconButton>
            )}
            {p.onNext && (
              <IconButton label="Next job (j)" onClick={p.onNext}>
                <ChevronDown className="size-4" />
              </IconButton>
            )}
            {p.onClose && (
              <IconButton label="Close (Esc)" onClick={p.onClose} className="hidden lg:inline-flex">
                <X className="size-5" />
              </IconButton>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => p.onApply?.(job)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Apply on company site <ExternalLink className="size-4" />
          </a>
          <Button onClick={() => p.onUpdate({ status: status === "saved" ? undefined : "saved" })} aria-pressed={status === "saved"} className={cx(status === "saved" && "border-accent text-accent")}>
            {status === "saved" ? <Check className="size-4" /> : null}
            {status === "saved" ? "Saved" : "Save"}
          </Button>
          <Button onClick={() => p.onUpdate({ status: status === "dismissed" ? undefined : "dismissed" })} aria-pressed={status === "dismissed"}>
            <EyeOff className="size-4" /> {status === "dismissed" ? "Hidden" : "Not interested"}
          </Button>
          <Button variant="ghost" onClick={copyJd} disabled={!description}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy JD"}
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-5">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your status</h3>
          <div className="flex flex-wrap gap-1.5">
            {[...PIPELINE, "dismissed" as const].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => p.onUpdate({ status: status === s ? undefined : s })}
                className={cx("h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors", status === s ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2")}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <textarea
            key={job.id}
            defaultValue={entry?.note ?? ""}
            onBlur={(e) => e.target.value !== (entry?.note ?? "") && p.onUpdate({ note: e.target.value || undefined })}
            placeholder="Notes: referral, recruiter name, follow-up date…"
            rows={2}
            className="mt-2 w-full resize-y rounded-lg border border-line bg-surface-2/50 p-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
        </section>

        <WhyItMatches job={job} profile={profile} />

        {postings && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Posted in {postings.length} locations</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {postings.map((j) => (
                <li key={j.id} className={cx("flex items-center gap-2 px-3 py-2 text-sm", j.id === job.id && "bg-accent-soft/30")}>
                  <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-accent" onClick={() => p.onOpenJob?.(j)}>
                    {j.location || "Location not listed"}
                  </button>
                  <span className="tabular text-xs text-muted">{j.score}</span>
                  <a href={j.url} target="_blank" rel="noreferrer" onClick={() => p.onApply?.(j)} className="text-muted hover:text-accent" aria-label={`Open the ${j.location} posting`}>
                    <ExternalLink className="size-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Description</h3>
          {description === undefined ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin" /> Loading…
            </p>
          ) : description ? (
            <Highlighted text={description} terms={job.why.keywords} />
          ) : (
            <p className="text-sm text-muted">{job.why.gate ? "Not stored for jobs that fail your filters." : "No description in the feed."} Open the job page to read it.</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Details</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Posted</dt>
            <dd>{job.postedAt ? `${formatDate(job.postedAt)} (${timeAgo(job.postedAt)})` : "Not given by the hiring system"}</dd>
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

        {(p.moreFromCompany?.length || p.onHideCompany) && (
          <section>
            <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5" /> More from {job.company}
              </span>
              {p.onHideCompany && (
                <button type="button" className="normal-case tracking-normal text-muted hover:text-bad" onClick={() => p.onHideCompany!(!p.companyHidden)}>
                  {p.companyHidden ? "Show this company again" : "Hide this company"}
                </button>
              )}
            </h3>
            {p.moreFromCompany?.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {p.moreFromCompany.map((j) => (
                  <li key={j.id}>
                    <button type="button" onClick={() => p.onOpenJob?.(j)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2/60">
                      <span className="tabular w-7 shrink-0 text-xs font-semibold text-muted">{j.score}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{j.title}</span>
                        <span className="block truncate text-xs text-muted">{j.location}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No other matching jobs here right now.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/** A plain-language checklist of why the job scored what it did, then the score bars. */
function WhyItMatches({ job, profile }: { job: Job; profile: Profile }) {
  const w = job.why;
  const titleTerm = useMemo(() => profile.titles.include.find((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(job.title)), [job.title, profile]);
  const items: { ok: boolean; text: ReactNode }[] = [
    { ok: w.title > 0, text: w.title > 0 ? <>Title matches <b>{titleTerm ?? "your roles"}</b>{w.title === 30 ? ", with your seniority" : ""}</> : "Title isn't one of your roles" },
    {
      ok: w.location > 0,
      text: w.location === 20 ? <>In one of your places{job.countries.length ? <> (<b>{job.countries.join(", ")}</b>)</> : null}</> : w.location === 15 ? "Remote, open to your regions" : (w.locationNote ?? "Not in one of your places"),
    },
    { ok: w.keywords.length > 0, text: w.keywords.length ? <>Mentions your topics: <b>{w.keywords.join(", ")}</b></> : "Doesn't mention your topics" },
    { ok: w.freshness >= 6, text: w.freshness === 10 ? "Posted in the last 3 days" : w.freshness === 6 ? "Posted this week" : "Posted more than a week ago" },
  ];
  const rows: [string, number, number][] = [
    ["Title", w.title, 30],
    ["Location", w.location, 20],
    ["Topics", w.keywordPoints, 40],
    ["Freshness", w.freshness, 10],
  ];
  return (
    <section>
      <h3 className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted">
        Why it matches
        {w.gate && <span className="normal-case tracking-normal text-warn">Failed your {w.gate} filter, so the score is 0</span>}
      </h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            {it.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" /> : <X className="mt-0.5 size-4 shrink-0 text-muted" />}
            <span className={cx(!it.ok && "text-muted")}>{it.text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {rows.map(([label, pts, max]) => (
          <div key={label}>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(pts / max) * 100}%` }} />
            </div>
            <p className="tabular mt-1 text-[11px] text-muted">
              {label} {pts}/{max}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Description text with the user's topic words highlighted. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const parts = useMemo(() => {
    if (!terms.length) return [text];
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+")).join("|")})(?![\\p{L}\\p{N}])`, "giu");
    return text.split(re);
  }, [text, terms]);
  return (
    <div className="whitespace-pre-wrap text-sm leading-6 text-fg/90">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </div>
  );
}
