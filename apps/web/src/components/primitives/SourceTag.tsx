import { cx } from "../ui";

/**
 * design/components/SourceTag: the hiring system a job was read from and how old the posting is.
 * Plain text, never a logo. The new-this-scan dot is the only round shape in RawJobs.
 */
export function SourceTag({ source, age, isNew, className }: { source: string; /** "2d" */ age?: string; isNew?: boolean; className?: string }) {
  return (
    <span className={cx("rj-source", className)}>
      {isNew && <span className="rj-dot" role="img" aria-label="New this scan" />}
      {source}
      {age && <span className="rj-source__age">{age}</span>}
    </span>
  );
}
