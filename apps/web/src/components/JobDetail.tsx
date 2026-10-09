import { INDUSTRY_BY_ID } from "@rawjobs/core/catalog/industries";
import { SENIORITY_LEVELS } from "@rawjobs/core/catalog/seniority";
import { ArrowLeft, Building2, Check, ChevronDown, ChevronUp, CircleCheck, Copy, ExternalLink, Info, LoaderCircle, MapPin, Plus, RefreshCw, Star, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { copyText } from "../lib/clipboard";
import { useDescription, type Job, type Profile } from "../lib/data";
import { formatDate, formatSalary, placeSummary, postedOrSeen, timeAgo } from "../lib/format";
import { atsLabel, INDEX_MAX_AGE_DAYS } from "../lib/filters";
import { PIPELINE, STATUS_LABEL, type Entry, type Status } from "../lib/userState";
import { ScoreBadge, ScoreBreakdown, scoreParts } from "./primitives";
import { Button, Chip, cx, IconButton } from "./ui";

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
  /** The job is at one of your companies. */
  yours?: boolean;
  /** When the directory index behind an estimated job was built. */
  indexGeneratedAt?: string;
  /** Add or remove the job's company from your companies. Resolves to an error, or null. */
  onTrack?: (on: boolean) => Promise<string | null>;
  /** Check an estimated job's company live now. Resolves to an error, or null. */
  onCheck?: () => Promise<string | null>;
};

const SENIORITY_LABEL = Object.fromEntries(SENIORITY_LEVELS.map((s) => [s.id, s.label]));

/** Everything about one job: actions, why it matches, details, description, notes. */
export function JobDetail(p: JobDetailProps) {
  const { job, entry, profile } = p;
  const description = useDescription(job);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const whyRef = useRef<HTMLHeadingElement>(null);
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
  /** The score badge jumps to the explanation. */
  const showWhy = () => {
    whyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    whyRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {p.onClose && (
            <IconButton label="Back (Esc)" onClick={p.onClose} className="-ml-1 lg:hidden">
              <ArrowLeft className="size-5" />
            </IconButton>
          )}
          <button type="button" onClick={showWhy} className="shrink-0 rounded-md" aria-label={`${job.estimated ? "Estimated match score" : "Match score"} ${job.score} out of 100. Show why it matches`}>
            <ScoreBadge score={job.score} threshold={profile.min_score} estimated={job.estimated} size="lg" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="type-subheading font-semibold leading-6">{job.title}</h2>
            <p className="mt-0.5 type-small text-muted">
              {p.yours && <Star className="mr-1 inline size-3.5 fill-accent text-accent-text" role="img" aria-label="Your company" />}
              <span className="font-medium text-ink">{job.company}</span>
              {p.industries?.length ? <> · {p.industries.map((i) => INDUSTRY_BY_ID.get(i)?.label ?? i).join(", ")}</> : null}
            </p>
            <p className="mt-0.5 flex items-start gap-1 type-small text-muted">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">{postings ? placeSummary(postings.flatMap((j) => (j.cities.length ? j.cities : j.location ? [j.location] : []))) : placeSummary(job.cities.length ? job.cities : job.location ? [job.location] : [])}</span>
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
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 type-label text-on-accent hover:opacity-90"
          >
            {job.estimated ? "Open careers page" : "Apply on company site"} <ExternalLink className="size-4" />
          </a>
          {p.onTrack && <TrackButton yours={!!p.yours} onTrack={p.onTrack} />}
          <Button onClick={() => p.onUpdate({ status: status === "saved" ? undefined : "saved" })} aria-pressed={status === "saved"} className={cx(status === "saved" && "border-accent text-accent-text")}>
            {status === "saved" ? <Check className="size-4" /> : null}
            {status === "saved" ? "Saved" : "Save"}
          </Button>
          <Button variant="ghost" onClick={copyJd} disabled={!description}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy description"}
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-5">
        {job.estimated && <NotCheckedYet indexGeneratedAt={p.indexGeneratedAt} onCheck={p.onCheck} />}
        <section>
          <h3 id={`status-${job.id}`} className="mb-2 type-meta font-semibold uppercase tracking-wide text-muted">
            Your status
          </h3>
          {/* The one place to set any status; Save in the header is a shortcut for "Saved". */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`status-${job.id}`}>
            {[...PIPELINE, "dismissed" as const].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => p.onUpdate({ status: status === s ? undefined : s })}
                aria-pressed={status === s}
                className={cx("h-8 rounded-md border px-2.5 type-meta font-medium transition-colors", status === s ? "border-accent bg-accent-subtle text-accent-text" : "border-line hover:bg-inset")}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <NotesField key={job.id} note={entry?.note ?? ""} onSave={(note) => p.onUpdate({ note: note || undefined })} />
        </section>

        <WhyItMatches job={job} profile={profile} headingRef={whyRef} />

        {postings && (
          <section>
            <h3 className="mb-2 type-meta font-semibold uppercase tracking-wide text-muted">Posted in {postings.length} locations</h3>
            <ul className="divide-y divide-line rounded-md border border-line">
              {postings.map((j) => (
                <li key={j.id} className={cx("flex items-center gap-2 px-3 py-2 type-small", j.id === job.id && "bg-accent-subtle/30")}>
                  <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-accent-text" onClick={() => p.onOpenJob?.(j)}>
                    {j.location || "Location not listed"}
                  </button>
                  <span className="tabular type-meta text-muted">{j.score}</span>
                  <a href={j.url} target="_blank" rel="noreferrer" onClick={() => p.onApply?.(j)} className="text-muted hover:text-accent-text" aria-label={`Open the ${j.location} posting`}>
                    <ExternalLink className="size-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 type-meta font-semibold uppercase tracking-wide text-muted">Description</h3>
          {description === undefined ? (
            <p className="flex items-center gap-2 type-small text-muted">
              <LoaderCircle className="size-4 animate-spin" /> Loading…
            </p>
          ) : description ? (
            <Highlighted text={description} terms={job.why.keywords} />
          ) : (
            <p className="type-small text-muted">
              {job.estimated ? "Not scanned yet, so no description." : job.why.gate ? "Not stored for jobs that fail your filters." : "The hiring system didn't include a description."} Open the job page to read it.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 type-meta font-semibold uppercase tracking-wide text-muted">Details</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 type-small">
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
            <dt className="text-muted">Hiring system</dt>
            <dd>{atsLabel(job.ats)}</dd>
          </dl>
        </section>

        {(p.moreFromCompany?.length || p.onHideCompany) && (
          <section>
            <h3 className="mb-2 flex items-center justify-between type-meta font-semibold uppercase tracking-wide text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5" /> More from {job.company}
              </span>
              {p.onHideCompany && (
                <button type="button" className="normal-case tracking-normal text-muted hover:text-danger-text" onClick={() => p.onHideCompany!(!p.companyHidden)}>
                  {p.companyHidden ? "Show this company again" : "Hide this company"}
                </button>
              )}
            </h3>
            {p.moreFromCompany?.length ? (
              <ul className="divide-y divide-line rounded-md border border-line">
                {p.moreFromCompany.map((j) => (
                  <li key={j.id}>
                    <button type="button" onClick={() => p.onOpenJob?.(j)} className="flex w-full items-center gap-3 px-3 py-2 text-left type-small hover:bg-inset/60">
                      <span className="tabular w-7 shrink-0 type-meta font-semibold text-muted">{j.score}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{j.title}</span>
                        <span className="block truncate type-meta text-muted">{j.location}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-small text-muted">No other matching jobs here right now.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/** Add the job's company to your companies (or remove it), with a short busy state and any error. */
function TrackButton({ yours, onTrack }: { yours: boolean; onTrack: (on: boolean) => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [yours]);
  const click = async () => {
    setBusy(true);
    setError(await onTrack(!yours));
    setBusy(false);
  };
  return (
    <>
      <Button onClick={() => void click()} disabled={busy} aria-pressed={yours} className={cx(yours && "border-accent text-accent-text")} title={yours ? "Remove from My companies" : "Add to My companies: scanned every time, its jobs listed first"}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : yours ? <Star className="size-4 fill-current" /> : <Plus className="size-4" />}
        {yours ? "In My companies" : "Add to My companies"}
      </Button>
      {error && <p className="w-full type-meta text-danger-text">{error}</p>}
    </>
  );
}

/** A job from the company directory nobody has scanned yet: what that means, and "Scan this company" to get the real job. */
function NotCheckedYet({ indexGeneratedAt, onCheck }: { indexGeneratedAt?: string; onCheck?: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = async () => {
    if (!onCheck) return;
    setBusy(true);
    setError(await onCheck());
    setBusy(false);
  };
  return (
    <section className="rounded-md border border-line bg-inset/50 p-3 type-small">
      <p className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0 text-muted" />
        <span className="min-w-0">
          <b>Not scanned yet.</b>{" "}
          <span className="text-muted">
            We found this job in the company directory{indexGeneratedAt ? ` (updated ${timeAgo(indexGeneratedAt)})` : ""}. The score is an estimate from the title, place and
            date only: topics need the description. The link opens the company's careers page. Scans cover the best of these companies a few at a time; unscanned jobs older
            than {INDEX_MAX_AGE_DAYS} days are hidden unless you ask for them.
          </span>
        </span>
      </p>
      {onCheck && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          <Button size="sm" onClick={() => void check()} disabled={busy}>
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {busy ? "Scanning…" : "Scan this company"}
          </Button>
          {error && <span className="type-meta text-danger-text">{error}</span>}
        </div>
      )}
    </section>
  );
}

/** A plain-language checklist of why the job scored what it did, then the score bars. */
function WhyItMatches({ job, profile, headingRef }: { job: Job; profile: Profile; headingRef?: Ref<HTMLHeadingElement> }) {
  const w = job.why;
  const titleTerm = useMemo(() => profile.titles.include.find((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(job.title)), [job.title, profile]);
  const items: { ok: boolean; text: ReactNode }[] = [
    { ok: w.title > 0, text: w.title > 0 ? <>Title matches <b>{titleTerm ?? "your roles"}</b>{w.title === 30 ? ", with your seniority" : ""}</> : "Title isn't one of your roles" },
    {
      ok: w.location > 0,
      text: w.location === 20 ? <>In one of your places{job.countries.length ? <> (<b>{job.countries.join(", ")}</b>)</> : null}</> : w.location === 15 ? "Remote, open to your regions" : (w.locationNote ?? "Not in one of your places"),
    },
    ...(w.scale ? [] : [{ ok: w.keywords.length > 0, text: w.keywords.length ? <>Mentions your topics: <b>{w.keywords.join(", ")}</b></> : "Doesn't mention your topics" }]),
    { ok: w.freshness >= 6, text: w.freshness === 10 ? "Posted in the last 3 days" : w.freshness === 6 ? "Posted this week" : "Posted more than a week ago" },
  ];
  return (
    <section>
      <h3 ref={headingRef} tabIndex={-1} className="mb-2 flex scroll-mt-4 items-baseline justify-between type-meta font-semibold uppercase tracking-wide text-muted outline-none">
        Why it matches
        {w.gate && <span className="normal-case tracking-normal text-warning-text">Failed your {w.gate} filter, so the score is 0</span>}
      </h3>
      <ul className="space-y-1.5 type-small">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            {it.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-text" /> : <X className="mt-0.5 size-4 shrink-0 text-muted" />}
            <span className={cx(!it.ok && "text-muted")}>{it.text}</span>
          </li>
        ))}
      </ul>
      {w.scale && <p className="mt-2 type-meta text-muted">No topics set: title, place and freshness make up the whole score.</p>}
      <ScoreBreakdown className="mt-3" score={job.score} parts={scoreParts(w)} />
    </section>
  );
}

/**
 * Notes for one job. Saved on blur, and also when the field goes away (Escape closes the drawer while typing),
 * so nothing typed is lost.
 */
function NotesField({ note, onSave }: { note: string; onSave: (note: string) => void }) {
  const pending = useRef<string | null>(null);
  const save = useRef(onSave);
  save.current = onSave;
  const flush = () => {
    if (pending.current !== null && pending.current !== note) save.current(pending.current);
    pending.current = null;
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);
  return (
    <textarea
      defaultValue={note}
      onChange={(e) => (pending.current = e.target.value)}
      onBlur={flush}
      aria-label="Notes"
      placeholder="Notes: referral, recruiter name, follow-up date…"
      rows={2}
      className="mt-2 w-full resize-y rounded-md border border-line bg-inset/50 p-2.5 type-small outline-none placeholder:text-muted focus:border-accent"
    />
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
    <div className="whitespace-pre-wrap type-small leading-6 text-ink/90">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-md bg-accent-subtle px-0.5 text-accent-text">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </div>
  );
}
