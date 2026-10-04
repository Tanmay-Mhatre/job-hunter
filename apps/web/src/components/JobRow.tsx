import { Bookmark, CircleCheck, EyeOff } from "lucide-react";
import { forwardRef } from "react";
import type { Job } from "../lib/data";
import { formatSalary, postedOrSeen, timeAgo } from "../lib/format";
import type { Entry, Status } from "../lib/userState";
import { Chip, cx, IconButton, ScoreBadge, StatusChip } from "./ui";

type Props = {
  job: Job;
  entry?: Entry;
  min: number;
  isNew: boolean;
  selected: boolean;
  onOpen: () => void;
  onStatus: (s: Status) => void;
};

export const JobRow = forwardRef<HTMLLIElement, Props>(function JobRow({ job, entry, min, isNew, selected, onOpen, onStatus }, ref) {
  const salary = formatSalary(job.salary);
  const status = entry?.status;
  return (
    <li
      ref={ref}
      className={cx(
        "group relative flex cursor-pointer gap-3 border-b border-line px-3 py-3 transition-colors last:border-b-0 sm:px-4",
        selected ? "bg-accent-soft/40" : "hover:bg-surface-2/60",
        (job.status === "closed" || status === "dismissed") && "opacity-60",
      )}
      onClick={onOpen}
      aria-selected={selected}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden />}
      <ScoreBadge score={job.score} min={min} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-5 sm:line-clamp-1">{job.title}</h3>
          {isNew && <Chip tone="accent">New</Chip>}
          {job.status === "closed" && <Chip tone="bad">Closed</Chip>}
          {status && <StatusChip status={status} />}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">
          <span className="font-medium text-fg">{job.company}</span>
          {" · "}
          {job.location || "Location not listed"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {job.workplace !== "unknown" && <Chip>{job.workplace}</Chip>}
          <Chip>{job.postedAt ? `posted ${timeAgo(job.postedAt)}` : `seen ${timeAgo(postedOrSeen(job))}`}</Chip>
          {salary && <Chip>{salary}</Chip>}
          {job.why.gate && <Chip tone="warn">failed {job.why.gate} gate</Chip>}
          {job.why.keywords.slice(0, 4).map((k) => (
            <Chip key={k} tone="accent">
              {k}
            </Chip>
          ))}
          {job.why.keywords.length > 4 && <Chip>+{job.why.keywords.length - 4}</Chip>}
        </div>
      </div>
      <div
        className={cx("flex shrink-0 flex-col gap-0.5 sm:flex-row sm:items-start", !status && "sm:opacity-0 sm:group-hover:opacity-100", selected && "sm:opacity-100")}
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton label="Save (s)" active={status === "saved"} onClick={() => onStatus("saved")}>
          <Bookmark className="size-4" />
        </IconButton>
        <IconButton label="Mark applied (a)" active={status === "applied"} onClick={() => onStatus("applied")}>
          <CircleCheck className="size-4" />
        </IconButton>
        <IconButton label="Not interested (x)" active={status === "dismissed"} onClick={() => onStatus("dismissed")}>
          <EyeOff className="size-4" />
        </IconButton>
      </div>
    </li>
  );
});
