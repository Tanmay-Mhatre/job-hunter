import { Bookmark, CircleCheck, EyeOff, Star } from "lucide-react";
import { forwardRef } from "react";
import type { Job } from "../../lib/data";
import type { JobGroup } from "../../lib/filters";
import { ageDays, formatSalary, placeSummary, postedOrSeen, timeAgo } from "../../lib/format";
import type { Entry, Status } from "../../lib/userState";
import { ScoreBadge } from "../primitives";
import { cx, IconButton } from "../ui";

type Props = {
  group: JobGroup;
  entry?: Entry;
  min: number;
  isNew: boolean;
  selected: boolean;
  onSelect: () => void;
  onStatus: (s: Status) => void;
  /** At one of your companies. */
  yours?: boolean;
};

const SHORT_SENIORITY: Record<Job["seniority"], string> = { leadership: "Leadership", principal: "Principal/Lead", senior: "Senior", mid: "Mid-level", entry: "Entry" };

/** Where the role is, across all its postings: "Berlin +3" (cities when we recognised them, else the raw location). */
function placeLine(group: JobGroup): string {
  const cities = group.jobs.flatMap((j) => j.cities);
  if (cities.length) return placeSummary(cities);
  const lead = group.lead.location || "Location not listed";
  return group.jobs.length > 1 ? `${lead} +${group.jobs.length - 1}` : lead;
}

/** Initial-letter avatar: neutral, so the score stays the loudest thing on the row. */
function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-hairline bg-inset type-label text-muted" aria-hidden>
      {name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

/**
 * One role in the list: who, what, where, how good a match, and why. The title is a real button whose
 * click area stretches over the whole card (the action buttons sit above it), so Tab and screen readers reach it.
 */
export const JobCard = forwardRef<HTMLLIElement, Props>(function JobCard({ group, entry, min, isNew, selected, onSelect, onStatus, yours }, ref) {
  const job = group.lead;
  const salary = formatSalary(job.salary);
  const status = entry?.status;
  const fresh = ageDays(postedOrSeen(job)) <= 3;
  const where = job.countries.length ? job.countries.join(", ") : job.workplace === "remote" ? "Remote" : null;
  const reasons = [SHORT_SENIORITY[job.seniority], where, job.why.keywords.slice(0, 3).join(", ")].filter(Boolean);

  return (
    <li
      ref={ref}
      className={cx(
        "group relative flex gap-3 border-b border-line px-3 py-3 transition-colors last:border-b-0 has-[.jc-open:focus-visible]:ring-2 has-[.jc-open:focus-visible]:ring-inset has-[.jc-open:focus-visible]:ring-focus",
        selected ? "bg-accent-subtle/40" : "hover:bg-inset/60",
        (job.status === "closed" || status === "dismissed" || job.why.gate) && "opacity-60",
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden />}
      <Avatar name={job.company} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-2 min-w-0 flex-1 type-body font-semibold leading-5">
            <button
              type="button"
              onClick={onSelect}
              aria-current={selected ? "true" : undefined}
              className="jc-open cursor-pointer text-left outline-none after:absolute after:inset-0 after:content-['']"
            >
              {job.title}
            </button>
          </h3>
          {isNew && (
            <span className="mt-0.5 shrink-0 rounded-md bg-accent px-1.5 py-0.5 type-meta font-semibold uppercase leading-3 tracking-wide text-on-accent" title="New to you since your last scan">
              New<span className="sr-only"> to you since your last scan</span>
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate type-small text-muted">
          {yours && <Star className="mr-1 inline size-3.5 fill-accent text-accent-text" role="img" aria-label="Your company" />}
          <span className="font-medium text-ink">{job.company}</span> · {placeLine(group)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 type-meta">
          <span title={job.estimated ? "Estimated: scored on title, place and date only, until the full posting is fetched" : undefined}>
            <ScoreBadge score={job.score} threshold={min} estimated={job.estimated} />
          </span>
          <span className={cx(fresh ? "font-medium text-success-text" : "text-muted")}>{job.postedAt ? timeAgo(job.postedAt) : `seen ${timeAgo(job.firstSeen)}`}</span>
          {job.workplace !== "unknown" && <span className="capitalize text-muted">· {job.workplace}</span>}
          {salary && <span className="font-medium text-ink">· {salary}</span>}
          {job.status === "closed" && <span className="font-medium text-danger-text">· Closed</span>}
          {job.why.gate && <span className="font-medium text-warning-text">· Failed your {job.why.gate} filter</span>}
          {job.estimated && <span className="text-muted">· Not scanned yet</span>}
        </div>
        {reasons.length > 0 && !job.why.gate && <p className="mt-1 truncate type-meta text-muted">Matches: {reasons.join(" · ")}</p>}
      </div>
      {/* Above the title's stretched click area. Dimmed at rest on desktop, full on hover, focus or when selected. */}
      <div
        className={cx(
          "relative z-10 flex shrink-0 flex-col items-center gap-0.5 transition-opacity",
          !status && !selected && "lg:opacity-60 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100",
        )}
      >
        <IconButton label="Save (s)" active={status === "saved"} onClick={() => onStatus("saved")}>
          <Bookmark className="size-4" />
        </IconButton>
        <IconButton label="Mark applied (a)" active={!!status && ["applied", "interviewing", "offer"].includes(status)} onClick={() => onStatus("applied")}>
          <CircleCheck className="size-4" />
        </IconButton>
        <IconButton label="Hide job (x)" active={status === "dismissed"} onClick={() => onStatus("dismissed")}>
          <EyeOff className="size-4" />
        </IconButton>
      </div>
    </li>
  );
});
