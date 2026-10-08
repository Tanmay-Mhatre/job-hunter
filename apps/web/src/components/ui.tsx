import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { scoreBand, type Band } from "../lib/format";
import { STATUS_LABEL, type Status } from "../lib/userState";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline"; size?: "sm" | "md" };

export function Button({ variant = "outline", size = "md", className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "outline" && "border border-line bg-surface hover:bg-surface-2",
        variant === "ghost" && "hover:bg-surface-2",
        className,
      )}
      {...rest}
    />
  );
}

export function IconButton({ label, active, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cx(
        "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
        className,
      )}
      {...rest}
    />
  );
}

export function Chip({ children, tone = "plain", className }: { children: ReactNode; tone?: "plain" | "accent" | "warn" | "bad"; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
        tone === "plain" && "bg-surface-2 text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "bad" && "bg-bad-soft text-bad",
        className,
      )}
    >
      {children}
    </span>
  );
}

const BAND_STYLE: Record<Band, string> = {
  top: "border-accent text-accent bg-accent-soft",
  mid: "border-warn/60 text-warn bg-warn-soft",
  low: "border-line text-fg bg-surface-2",
  none: "border-line text-muted bg-transparent",
};

export function ScoreBadge({ score, min, size = "md" }: { score: number; min: number; size?: "md" | "lg" }) {
  const band = scoreBand(score, min);
  return (
    <div
      className={cx(
        "tabular flex shrink-0 items-center justify-center rounded-xl border font-semibold",
        size === "lg" ? "size-14 text-xl" : "size-11 text-base",
        BAND_STYLE[band],
      )}
      title={band === "top" ? `At or above your alert score (${min})` : `Score ${score} / 100`}
    >
      {score}
    </div>
  );
}

const STATUS_TONE: Record<Status, "accent" | "warn" | "bad" | "plain"> = {
  saved: "plain",
  applied: "accent",
  interviewing: "accent",
  offer: "accent",
  rejected: "bad",
  dismissed: "plain",
};

export function StatusChip({ status }: { status: Status }) {
  return <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx("h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-fg outline-none focus:border-accent", className)}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md px-2.5 text-xs font-medium transition-colors",
            o.value === value ? "bg-surface-2 text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-muted hover:text-fg">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--accent)]" />
      {children}
    </label>
  );
}

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("rounded-2xl border border-line bg-surface", className)}>
      {children}
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}

/** Page numbers to show: first, last, and the current page's neighbours, with gaps as null. */
export function pageList(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

/** "Showing 26–50 of 6,592" with Prev / page numbers / Next (page numbers hidden on phones). */
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2">
      <p className="tabular text-xs text-muted">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page">
            ‹ Prev
          </Button>
          <span className="tabular px-1 text-xs text-muted sm:hidden">
            Page {page} of {pages.toLocaleString()}
          </span>
          {pageList(page, pages).map((p, i) =>
            p === null ? (
              <span key={`gap${i}`} className="hidden px-1 text-xs text-muted sm:inline">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={cx(
                  "tabular hidden h-8 min-w-8 rounded-lg px-2 text-xs sm:inline-block",
                  p === page ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {p.toLocaleString()}
              </button>
            ),
          )}
          <Button size="sm" variant="ghost" onClick={() => onPage(page + 1)} disabled={page === pages} aria-label="Next page">
            Next ›
          </Button>
        </div>
      )}
    </nav>
  );
}
