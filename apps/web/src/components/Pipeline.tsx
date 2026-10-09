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
  /** Phones show one column at a time, picked from the status chips. */
  const [mobileCol, setMobileCol] = useState<PipelineStatus | null>(null);
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

  const columns = PIPELINE.map((col) => ({
    col,
    items: entries.filter(([, e]) => e.status === col).sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt)),
  }));
  // Default to the first column with cards in it.
  const shown = mobileCol ?? columns.find((c) => c.items.length)?.col ?? PIPELINE[0];

  return (
    <div className="pb-2 md:overflow-x-auto">
      <div className="-mx-4 mb-3 overflow-x-auto px-4 md:hidden [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1.5rem),transparent)]">
        <div className="flex w-max gap-2 pr-4" role="group" aria-label="Pipeline column">
          {columns.map(({ col, items }) => (
            <button
              key={col}
              type="button"
              aria-pressed={shown === col}
              onClick={() => setMobileCol(col)}
              className={cx(
                "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium",
                shown === col ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted",
              )}
            >
              {STATUS_LABEL[col]} <span className="tabular text-xs">{items.length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:min-w-[900px] md:grid-cols-5">
        {columns.map(({ col, items }) => {
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
                "min-h-64 flex-col rounded-2xl border bg-surface-2/50 p-2 transition-colors md:flex",
                shown === col ? "flex" : "hidden",
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
                      // Mouse shortcut: the whole card opens the job; the title button is the keyboard / screen-reader way in.
                      onClick={() => job && onOpen(job)}
                      className={cx(
                        "rounded-xl border border-line bg-surface p-3 shadow-sm transition-shadow hover:shadow-md",
                        job ? "cursor-pointer" : "cursor-grab",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {job ? (
                          <button
                            type="button"
                            className="text-left text-sm font-semibold leading-5 hover:underline"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onOpen(job);
                            }}
                          >
                            {s.title}
                          </button>
                        ) : (
                          <p className="text-sm font-semibold leading-5">{s.title}</p>
                        )}
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
                          aria-label={`Move ${s.title} to`}
                          value={e.status}
                          onClick={(ev) => ev.stopPropagation()}
                          onChange={(ev) => onMove(id, e, ev.target.value as Status)}
                          className="h-8 px-1.5 text-xs"
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
