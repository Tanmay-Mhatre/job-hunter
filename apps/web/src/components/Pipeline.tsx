import { ArrowRight, KanbanSquare, StickyNote } from "lucide-react";
import { useState } from "react";
import type { Job } from "../lib/data";
import { timeAgo } from "../lib/format";
import { PIPELINE, STATUS_LABEL, type Entry, type PipelineStatus, type Status, type UserState } from "../lib/userState";
import { EmptyState } from "./EmptyState";
import { Button, cx, Select } from "./ui";

type Props = {
  user: UserState;
  jobsById: Map<string, Job>;
  min: number;
  onOpen: (job: Job) => void;
  onMove: (id: string, entry: Entry, status: Status) => void;
  /** Radar not set up yet: the empty state points to setup instead of the Radar. */
  onSetup?: () => void;
  goRadar: () => void;
};

export function Pipeline({ user, jobsById, min, onOpen, onMove, onSetup, goRadar }: Props) {
  const [dragOver, setDragOver] = useState<PipelineStatus | null>(null);
  const entries = Object.entries(user).filter(([, e]) => e.status && e.status !== "dismissed");
  const total = entries.length;

  if (total === 0) {
    return (
      <EmptyState
        icon={<KanbanSquare className="size-6" />}
        title="Track your applications here"
        actions={
          onSetup ? (
            <Button variant="primary" onClick={onSetup}>
              Set up my radar <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button variant="primary" onClick={goRadar}>
              Browse my matches <ArrowRight className="size-4" />
            </Button>
          )
        }
      >
        {onSetup
          ? "Jobs you save or apply to show up here as cards you can move from Saved to Offer. Set up your radar to start finding them."
          : "Save a job from the Radar (bookmark icon, or press s) and it shows up here. Drag cards between columns as you progress."}
      </EmptyState>
    );
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[900px] grid-cols-5 gap-3">
        {PIPELINE.map((col) => {
          const items = entries.filter(([, e]) => e.status === col).sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt));
          return (
            <section
              key={col}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col);
              }}
              onDragLeave={() => setDragOver((c) => (c === col ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                const entry = user[id];
                if (entry && entry.status !== col) onMove(id, entry, col);
              }}
              className={cx(
                "flex min-h-64 flex-col rounded-2xl border bg-surface-2/50 p-2 transition-colors",
                dragOver === col ? "border-accent bg-accent-soft/30" : "border-line",
              )}
            >
              <h2 className="flex items-center justify-between px-1.5 py-1 text-sm font-semibold">
                {STATUS_LABEL[col]} <span className="tabular text-xs font-medium text-muted">{items.length}</span>
              </h2>
              <ul className="mt-1 flex flex-col gap-2">
                {items.map(([id, e]) => {
                  const job = jobsById.get(id);
                  const s = e.snapshot;
                  return (
                    <li
                      key={id}
                      draggable
                      onDragStart={(ev) => ev.dataTransfer.setData("text/plain", id)}
                      onClick={() => job && onOpen(job)}
                      className={cx(
                        "rounded-xl border border-line bg-surface p-3 shadow-sm transition-shadow hover:shadow-md",
                        job ? "cursor-pointer" : "cursor-grab",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-5">{s.title}</p>
                        <span className={cx("tabular text-xs font-semibold", (job?.score ?? s.score) >= min ? "text-accent" : "text-muted")}>
                          {job?.score ?? s.score}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{s.company}</p>
                      {e.note && (
                        <p className="mt-2 line-clamp-2 flex gap-1 text-xs text-muted">
                          <StickyNote className="mt-0.5 size-3 shrink-0" />
                          {e.note}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted">
                          {job?.status === "closed" ? "Closed · " : !job ? "No longer listed · " : ""}
                          {timeAgo(e.updatedAt)}
                        </span>
                        {/* Keyboard / touch alternative to dragging */}
                        <Select
                          aria-label="Move to"
                          value={e.status}
                          onClick={(ev) => ev.stopPropagation()}
                          onChange={(ev) => onMove(id, e, ev.target.value as Status)}
                          className="h-6 px-1 text-[11px]"
                        >
                          {PIPELINE.map((p) => (
                            <option key={p} value={p}>
                              {STATUS_LABEL[p]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
