import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../ui";

export type TabItem<T extends string> = { id: T; label: ReactNode; count?: number };

/**
 * Real ARIA tabs: role=tablist/tab, aria-selected, aria-controls, a roving tabindex and arrow/Home/End keys
 * (selection follows focus). Render the content with <TabPanel> using the same `ids`.
 */
export function useTabIds(prefix?: string) {
  const id = useId();
  const base = `${prefix ?? "tabs"}${id.replace(/:/g, "")}`;
  return { tab: (t: string) => `${base}-tab-${t}`, panel: (t: string) => `${base}-panel-${t}` };
}

export function TabList<T extends string>({
  tabs,
  value,
  onChange,
  label,
  ids,
  variant = "underline",
  className,
  after,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (t: T) => void;
  label: string;
  ids: ReturnType<typeof useTabIds>;
  variant?: "underline" | "pill";
  className?: string;
  /** Extra content after the tabs (outside the tablist), e.g. a spinner. */
  after?: ReactNode;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === value);
    const next =
      e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (next < 0 || !tabs[next]) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current.get(tabs[next].id)?.focus();
  };
  return (
    <div className={cx("flex items-center gap-1", className)}>
      <div role="tablist" aria-label={label} onKeyDown={onKey} className={cx("flex min-w-0 gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]", variant === "underline" ? "border-b border-line" : "-mx-1 px-1 pb-1")}>
        {tabs.map((t) => {
          const on = t.id === value;
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) refs.current.set(t.id, el);
                else refs.current.delete(t.id);
              }}
              type="button"
              role="tab"
              id={ids.tab(t.id)}
              aria-selected={on}
              aria-controls={ids.panel(t.id)}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={cx(
                "inline-flex shrink-0 items-center gap-1.5 font-medium transition-colors",
                variant === "underline"
                  ? cx("-mb-px h-10 border-b-2 px-3 type-small", on ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")
                  : cx("h-8 rounded-sm border px-3 type-meta", on ? "border-accent bg-accent-subtle text-accent-text" : "border-line text-muted hover:text-ink"),
              )}
            >
              {t.label}
              {t.count !== undefined && <span className="tabular font-normal opacity-70">{t.count.toLocaleString()}</span>}
            </button>
          );
        })}
      </div>
      {after}
    </div>
  );
}

export function TabPanel({ id, ids, children, className }: { id: string; ids: ReturnType<typeof useTabIds>; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={ids.panel(id)} aria-labelledby={ids.tab(id)} tabIndex={0} className={cx("outline-none focus-visible:ring-2 focus-visible:ring-focus/40 rounded-md", className)}>
      {children}
    </div>
  );
}
