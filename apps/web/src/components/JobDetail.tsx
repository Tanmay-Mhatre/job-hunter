import { INDUSTRY_BY_ID } from "@rawjobs/core/catalog/industries";
import { SENIORITY_LEVELS } from "@rawjobs/core/catalog/seniority";
import { ArrowLeft, Bookmark, Check, ChevronDown, ChevronUp, CircleCheck, Copy, ExternalLink, Info, LoaderCircle, Plus, RefreshCw, Star, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { copyText } from "../lib/clipboard";
import { useDescription, type Job, type Profile } from "../lib/data";
import { formatDate, formatSalary, placeSummary, postedOrSeen, timeAgo } from "../lib/format";
import { atsLabel, INDEX_MAX_AGE_DAYS } from "../lib/filters";
import { PIPELINE, STATUS_LABEL, type Entry, type Status } from "../lib/userState";
import { Button, buttonClass, Chip, ChipGroup, IconButton, ScoreBadge, scoreBandOf, ScoreBreakdown, scoreParts, SourceTag } from "./primitives";
import { cx } from "./ui";

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
  /** New this scan: the source tag shows the new dot. */
  isNew?: boolean;
  /** When the directory index behind an estimated job was built. */
  indexGeneratedAt?: string;
  /** Add or remove the job's company from your companies. Resolves to an error, or null. */
  onTrack?: (on: boolean) => Promise<string | null>;
  /** Check an estimated job's company live now. Resolves to an error, or null. */
  onCheck?: () => Promise<string | null>;
};

const SENIORITY_LABEL = Object.fromEntries(SENIORITY_LEVELS.map((s) => [s.id, s.label]));
const WORKPLACE_LABEL: Record<Job["workplace"], string | null> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote", unknown: null };
const BAND_WORD = { strong: "Strong", fair: "Fair", weak: "Weak" } as const;

/** Plain text pieces joined by the kit's " · " separator. */
function MetaLine({ parts, className }: { parts: ReactNode[]; className?: string }) {
  return (
    <p className={className}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="rj-sep" aria-hidden>
              ·
            </span>
          )}
          {/* Each part wraps as a whole ("Copperkettle Pay" never splits across lines) unless it's wider than the line. */}
          <span className="inline-block max-w-full">{part}</span>
        </Fragment>
      ))}
    </p>
  );
}

/** Everything about one job (design/components/Drawer): head with source, title and meta; body with the score, status, description and details; foot with the actions. */
export function JobDetail(p: JobDetailProps) {
  const { job, entry, profile } = p;
  const description = useDescription(job);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const salary = formatSalary(job.salary);
  const status = entry?.status;
  const source = atsLabel(job.ats);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setCopied(false);
  }, [job.id]);

  const copyJd = async () => {
    if (!description) return;
    const text = [`${job.title}, ${job.company}`, job.location, job.url, "", description].join("\n");
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const copyRef = useRef(copyJd);
  copyRef.current = copyJd;

  // C copies the description, like the shortcut shown on the button. Not while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "c" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
      // Not while some other dialog (Settings, the "Did you apply?" prompt) is on top of this job.
      const dialog = [...document.querySelectorAll("dialog[open]")].pop();
      if (dialog && !dialog.contains(rootRef.current)) return;
      void copyRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const postings = p.postings && p.postings.length > 1 ? p.postings : null;
  const places = postings
    ? placeSummary(postings.flatMap((j) => (j.cities.length ? j.cities : j.location ? [j.location] : [])))
    : placeSummary(job.cities.length ? job.cities : job.location ? [job.location] : []);
  const age = timeAgo(postedOrSeen(job)).replace(/ ago$/, "");
  const workplace = WORKPLACE_LABEL[job.workplace];
  const meta: ReactNode[] = [
    job.company,
    places,
    ...(workplace ? [workplace] : []),
    SENIORITY_LABEL[job.seniority],
    job.postedAt ? `Posted ${formatDate(job.postedAt)}` : `First seen ${formatDate(job.firstSeen)}`,
    ...(salary ? [salary] : []),
    ...(job.status === "closed" ? ["Closed"] : []),
  ];
  const saved = status === "saved";

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <header className="rj-drawer__head">
        <div className="rj-drawer__top">
          <SourceTag source={source} age={age} isNew={p.isNew} />
          <div className="flex shrink-0 items-center gap-1">
            {p.onClose && (
              <IconButton label="Back" title="Back (Esc)" aria-keyshortcuts="Escape" size="sm" onClick={p.onClose} className="lg:hidden">
                <ArrowLeft className="rj-icon" />
              </IconButton>
            )}
            {p.onPrev && (
              <IconButton label="Previous job" shortcut="K" size="sm" onClick={p.onPrev}>
                <ChevronUp className="rj-icon" />
              </IconButton>
            )}
            {p.onNext && (
              <IconButton label="Next job" shortcut="J" size="sm" onClick={p.onNext}>
                <ChevronDown className="rj-icon" />
              </IconButton>
            )}
            {p.onClose && (
              <IconButton label="Close" title="Close (Esc)" aria-keyshortcuts="Escape" size="sm" onClick={p.onClose} className="hidden lg:inline-flex">
                <X className="rj-icon" />
              </IconButton>
            )}
          </div>
        </div>
        <h2 className="rj-drawer__title">
          {p.yours && <Star className="rj-star" role="img" aria-label="My company" />}
          <span className="min-w-0">{job.title}</span>
        </h2>
        <MetaLine className="rj-drawer__meta" parts={meta} />
      </header>

      <div ref={scrollRef} className="rj-drawer__body min-h-0 flex-1">
        <WhyItMatches job={job} profile={profile} />

        {job.estimated && <NotCheckedYet indexGeneratedAt={p.indexGeneratedAt} onCheck={p.onCheck} />}

        <section className="rj-drawer__section">
          <h3 className="rj-h">Your status</h3>
          {/* The one place to set any status; Save in the foot is a shortcut for "Saved". */}
          <ChipGroup label="Your status">
            {[...PIPELINE, "dismissed" as const].map((s) => (
              <Chip key={s} pressed={status === s} onClick={() => p.onUpdate({ status: status === s ? undefined : s })}>
                {STATUS_LABEL[s]}
              </Chip>
            ))}
          </ChipGroup>
          <NotesField key={job.id} id={`notes-${job.id}`} note={entry?.note ?? ""} onSave={(note) => p.onUpdate({ note: note || undefined })} />
        </section>

        {postings && (
          <section className="rj-drawer__section">
            <h3 className="rj-h">Posted in {postings.length} locations</h3>
            <ul className="divide-y divide-line rounded-md border border-line">
              {postings.map((j) => (
                <li key={j.id} className={cx("flex items-center gap-2 px-3 py-2 type-small", j.id === job.id && "bg-active")}>
                  <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => p.onOpenJob?.(j)} aria-current={j.id === job.id || undefined}>
                    {j.location || "Location not listed"}
                  </button>
                  <span className="tabular text-muted">{j.score}</span>
                  <a href={j.url} target="_blank" rel="noreferrer" onClick={() => p.onApply?.(j)} className="text-muted hover:text-ink" aria-label={`Open the ${j.location} posting`}>
                    <ExternalLink className="rj-icon" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rj-drawer__section">
          <h3 className="rj-h">Description</h3>
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

        <section className="rj-drawer__section">
          <h3 className="rj-h">Details</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 type-small">
            <dt className="text-muted">Posted</dt>
            <dd className="text-muted">{job.postedAt ? `${formatDate(job.postedAt)} (${timeAgo(job.postedAt)})` : "Not given by the hiring system"}</dd>
            <dt className="text-muted">First seen</dt>
            <dd className="text-muted">{formatDate(job.firstSeen)}</dd>
            <dt className="text-muted">Last seen</dt>
            <dd className="text-muted">{timeAgo(job.lastSeen)}</dd>
            {job.status === "closed" && job.closedAt && (
              <>
                <dt className="text-muted">Closed</dt>
                <dd className="text-muted">{formatDate(job.closedAt)}</dd>
              </>
            )}
            {job.department && (
              <>
                <dt className="text-muted">Department</dt>
                <dd>{job.department}</dd>
              </>
            )}
            {p.industries?.length ? (
              <>
                <dt className="text-muted">Industry</dt>
                <dd>{p.industries.map((i) => INDUSTRY_BY_ID.get(i)?.label ?? i).join(", ")}</dd>
              </>
            ) : null}
            <dt className="text-muted">Hiring system</dt>
            <dd>{source}</dd>
          </dl>
        </section>

        {(p.moreFromCompany?.length || p.onHideCompany) && (
          <section className="rj-drawer__section">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="rj-h">More from {job.company}</h3>
              {p.onHideCompany && (
                <button type="button" className="type-small text-muted hover:text-danger-text" onClick={() => p.onHideCompany!(!p.companyHidden)}>
                  {p.companyHidden ? "Show this company again" : "Hide this company"}
                </button>
              )}
            </div>
            {p.moreFromCompany?.length ? (
              <ul className="divide-y divide-line rounded-md border border-line">
                {p.moreFromCompany.map((j) => (
                  <li key={j.id}>
                    <button type="button" onClick={() => p.onOpenJob?.(j)} className="flex w-full items-center gap-3 px-3 py-2 text-left type-small hover:bg-hover">
                      <span className="tabular w-7 shrink-0 font-semibold text-muted">{j.score}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{j.title}</span>
                        <span className="block truncate text-muted">{j.location}</span>
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

      <footer className="rj-drawer__foot">
        <a href={job.url} target="_blank" rel="noreferrer" onClick={() => p.onApply?.(job)} className={buttonClass("primary")}>
          <ExternalLink className="rj-icon" />
          {job.estimated ? "Open careers page" : `Apply on ${source}`}
        </a>
        <Button
          icon={saved ? <Check className="rj-icon" /> : <Bookmark className="rj-icon" />}
          shortcut="S"
          onClick={() => p.onUpdate({ status: saved ? undefined : "saved" })}
          aria-pressed={saved}
          className="aria-pressed:border-ink aria-pressed:bg-active"
        >
          {saved ? "Saved" : "Save"}
        </Button>
        {p.onTrack && <TrackButton yours={!!p.yours} onTrack={p.onTrack} />}
        {job.hasDescription && (
          <Button
            variant="quiet"
            icon={copied ? <Check className="rj-icon" /> : description === undefined ? <LoaderCircle className="rj-icon animate-spin" /> : <Copy className="rj-icon" />}
            shortcut={description ? "C" : undefined}
            onClick={() => void copyJd()}
            disabled={!description}
          >
            {description === undefined ? "Loading description…" : copied ? "Copied" : "Copy description"}
          </Button>
        )}
      </footer>
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
      <Button
        icon={busy ? <LoaderCircle className="rj-icon animate-spin" /> : yours ? <Check className="rj-icon" /> : <Plus className="rj-icon" />}
        onClick={() => void click()}
        disabled={busy}
        aria-pressed={yours}
        className="aria-pressed:border-ink aria-pressed:bg-active"
        title={yours ? "Remove from My companies" : "Add to My companies: scanned every time, its jobs listed first"}
      >
        {/* Short enough for half a phone screen, and the same everywhere; the tooltip says the rest. */}
        {yours ? "In My companies" : "Add company"}
      </Button>
      {error && (
        <p role="alert" className="col-span-full w-full type-small text-danger-text">
          {error}
        </p>
      )}
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
    <section className="rounded-md border border-line bg-inset p-3 type-small">
      <p className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0 text-muted" />
        <span className="min-w-0">
          <b>Not scanned yet.</b>{" "}
          <span className="text-muted">
            This job comes from the company directory{indexGeneratedAt ? ` (updated ${timeAgo(indexGeneratedAt)})` : ""}. The score is an estimate from the title, place and
            date only: topics need the description. The link opens the company's careers page. Scans cover the best of these companies a few at a time; unscanned jobs older
            than {INDEX_MAX_AGE_DAYS} days are hidden unless you ask for them.
          </span>
        </span>
      </p>
      {onCheck && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          <Button size="sm" icon={busy ? <LoaderCircle className="rj-icon animate-spin" /> : <RefreshCw className="rj-icon" />} onClick={() => void check()} disabled={busy}>
            {busy ? "Scanning…" : "Scan this company"}
          </Button>
          {error && (
            <span role="alert" className="type-small text-danger-text">
              {error}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/** The score, its band against your threshold, the score bars, then a plain-language checklist of why. */
function WhyItMatches({ job, profile }: { job: Job; profile: Profile }) {
  const w = job.why;
  const band = BAND_WORD[scoreBandOf(job.score, profile.min_score)];
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
    <section className="rj-drawer__section gap-4">
      <div className="flex items-center gap-4">
        <ScoreBadge score={job.score} threshold={profile.min_score} estimated={job.estimated} size="lg" />
        <div className="min-w-0">
          <h3 className="rj-h">Why it matched</h3>
          <p className="type-small text-muted">
            {band} match. {job.estimated ? "Estimated from title, place and date." : `Threshold ${profile.min_score}.`}
          </p>
        </div>
      </div>
      {w.gate && <p className="type-small text-warning-text">Failed your {w.gate} filter, so the score is 0.</p>}
      <ScoreBreakdown score={job.score} parts={scoreParts(w)} />
      <ul className="space-y-1.5 type-small">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            {it.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-text" /> : <X className="mt-0.5 size-4 shrink-0 text-muted" />}
            <span className={cx(!it.ok && "text-muted")}>{it.text}</span>
          </li>
        ))}
      </ul>
      {w.scale && <p className="type-small text-muted">No topics set: title, place and freshness make up the whole score.</p>}
    </section>
  );
}

/**
 * Notes for one job. Saved on blur, and also when the field goes away (Escape closes the drawer while typing),
 * so nothing typed is lost.
 */
function NotesField({ id, note, onSave }: { id: string; note: string; onSave: (note: string) => void }) {
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
    <div className="mt-2 grid gap-1">
      <label htmlFor={id} className="type-label">
        Notes
      </label>
      <textarea
        id={id}
        defaultValue={note}
        onChange={(e) => (pending.current = e.target.value)}
        onBlur={flush}
        placeholder="Referral, recruiter name, follow-up date…"
        rows={2}
        className="w-full resize-y rounded-md border border-line bg-inset p-2.5 type-small placeholder:text-muted"
      />
    </div>
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
    <div className="max-w-prose whitespace-pre-wrap type-small leading-6 text-ink">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-inset px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </div>
  );
}
