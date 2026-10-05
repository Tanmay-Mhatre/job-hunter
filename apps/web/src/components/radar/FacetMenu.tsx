import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FacetOption } from "../../lib/filters";
import { cx } from "../ui";

type Props = {
  label: string;
  options: FacetOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** One choice at a time (e.g. "Posted"). */
  single?: boolean;
  /** Show a search box (long lists such as companies). */
  searchable?: boolean;
  /** Extra controls under the options (e.g. toggles in "More"). */
  footer?: ReactNode;
};

/** A filter button that opens a menu of options with counts. Counts reflect the other active filters. */
export function FacetMenu({ label, options, selected, onChange, single, searchable, footer }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = selected.length > 0;
  const summary = active ? (single ? options.find((o) => o.value === selected[0])?.label : selected.length === 1 ? options.find((o) => o.value === selected[0])?.label ?? selected[0] : `${label} · ${selected.length}`) : label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cx(
          "inline-flex h-8 max-w-56 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
          active ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-fg hover:bg-surface-2",
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={cx("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-xl" role="menu">
          <OptionList label={label} options={options} selected={selected} onChange={onChange} single={single} searchable={searchable} autoFocus />
          {footer}
          {active && (
            <div className="mt-1 border-t border-line pt-1 text-right">
              <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-surface-2" onClick={() => onChange([])}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Checkbox (or radio) rows with counts; used by the filter menus and the phone filter sheet. */
export function OptionList({
  label,
  options,
  selected,
  onChange,
  single,
  searchable,
  autoFocus,
}: Pick<Props, "label" | "options" | "selected" | "onChange" | "single" | "searchable"> & { autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const toggle = (v: string) => onChange(single ? (selected.includes(v) ? [] : [v]) : selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      {searchable && (
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted" />
          <input
            autoFocus={autoFocus}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-xs outline-none focus:border-accent"
          />
        </div>
      )}
      <ul className="max-h-72 overflow-y-auto">
        {shown.map((o, i) => {
          const on = selected.includes(o.value);
          // Headings when options are split into yours (from your profile) and the rest.
          const heading = o.group && o.group !== shown[i - 1]?.group ? (o.group === "yours" ? "From your profile" : "Also mentioned in jobs") : null;
          return (
            <li key={o.value}>
              {heading && <p className="px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted first:pt-0.5">{heading}</p>}
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => toggle(o.value)}
                disabled={!on && o.count === 0}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className={cx("flex size-4 shrink-0 items-center justify-center border", single ? "rounded-full" : "rounded", on ? "border-accent bg-accent text-accent-fg" : "border-line")}>
                  {on && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <span className="tabular text-xs text-muted">{o.count}</span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2 py-3 text-center text-xs text-muted">Nothing here with the current filters.</li>}
      </ul>
    </>
  );
}
