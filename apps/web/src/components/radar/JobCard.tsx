import { Bookmark, CircleCheck, EyeOff, Star } from "lucide-react";
import { forwardRef } from "react";
import type { Job } from "../../lib/data";
import type { JobGroup } from "../../lib/filters";
import { ageDays, formatSalary, postedOrSeen, scoreBand, timeAgo } from "../../lib/format";
import type { Entry, Status } from "../../lib/userState";
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

const PILL: Record<ReturnType<typeof scoreBand>, string> = {
  top: "bg-accent text-accent-fg",
  mid: "bg-warn-soft text-warn",
  low: "bg-surface-2 text-fg",
  none: "bg-surface-2 text-muted",
};

/** Clean cities when we recognised them ("New York · San Francisco"), else the raw location text. */
function cityLine(job: Job): string {
  if (!job.cities.length) return job.location || "Location not listed";
  const names = job.cities.map((c) => c.replace(/, [^,]+$/, ""));
  return names.length > 2 ? `${names.slice(0, 2).join(" · ")} +${names.length - 2}` : names.join(" · ");
}

/** Initial-letter avatar with a stable colour per company. */
function Avatar({ name }: { name: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ background: `hsl(${h} 45% 45%)` }} aria-hidden>
      {name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

/** One role in the list: who, what, where, how good a match, and why. */
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
      onClick={onSelect}
      aria-selected={selected}
      className={cx(
        "group relative flex cursor-pointer gap-3 border-b border-line px-3 py-3 transition-colors last:border-b-0",
        selected ? "bg-accent-soft/40" : "hover:bg-surface-2/60",
        (job.status === "closed" || status === "dismissed" || job.why.gate) && "opacity-60",
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden />}
      <Avatar name={job.company} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-5">{job.title}</h3>
          {isNew && (
            <span className="mt-0.5 shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-3 tracking-wide text-accent-fg" title="Found by a scan in the last 2 days">
              New
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">
          {yours && <Star className="mr-1 inline size-3.5 fill-accent text-accent" aria-label="Your company" />}
          <span className="font-medium text-fg">{job.company}</span> · {cityLine(job)}
          {group.jobs.length > 1 && <span className="text-accent"> · +{group.jobs.length - 1} more location{group.jobs.length > 2 ? "s" : ""}</span>}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {job.estimated ? (
            <span className="tabular rounded-md border border-dashed border-line px-1.5 py-0.5 font-semibold text-muted" title="Estimated: not checked live yet, so no topic points">
              ~{job.score}
            </span>
          ) : (
            <span className={cx("tabular rounded-md px-1.5 py-0.5 font-semibold", PILL[scoreBand(job.score, min)])} title="Match score">
              {job.score}
            </span>
          )}
          <span className={cx(fresh ? "font-medium text-good" : "text-muted")}>{job.postedAt ? timeAgo(job.postedAt) : `seen ${timeAgo(job.firstSeen)}`}</span>
          {job.workplace !== "unknown" && <span className="capitalize text-muted">· {job.workplace}</span>}
          {salary && <span className="font-medium text-fg">· {salary}</span>}
          {job.status === "closed" && <span className="font-medium text-bad">· Closed</span>}
          {job.why.gate && <span className="font-medium text-warn">· Failed your {job.why.gate} filter</span>}
          {job.estimated && <span className="text-muted">· From the directory, not checked yet</span>}
        </div>
        {reasons.length > 0 && !job.why.gate && <p className="mt-1 truncate text-xs text-muted">Matches: {reasons.join(" · ")}</p>}
      </div>
      <div className={cx("flex shrink-0 flex-col items-center gap-0.5", !status && "lg:opacity-0 lg:group-hover:opacity-100", selected && "lg:opacity-100")} onClick={(e) => e.stopPropagation()}>
        <IconButton label="Save (s)" active={status === "saved"} onClick={() => onStatus("saved")}>
          <Bookmark className="size-4" />
        </IconButton>
        <IconButton label="Mark applied (a)" active={!!status && ["applied", "interviewing", "offer"].includes(status)} onClick={() => onStatus("applied")}>
          <CircleCheck className="size-4" />
        </IconButton>
        <IconButton label="Not interested (x)" active={status === "dismissed"} onClick={() => onStatus("dismissed")}>
          <EyeOff className="size-4" />
        </IconButton>
      </div>
    </li>
  );
});
