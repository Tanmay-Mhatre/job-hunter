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
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 type-meta" : "h-9 px-3 type-small",
        variant === "primary" && "bg-accent text-on-accent hover:opacity-90",
        variant === "outline" && "border border-line bg-raised hover:bg-inset",
        variant === "ghost" && "hover:bg-inset",
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
        "inline-flex size-8 items-center justify-center rounded-md transition-colors",
        active ? "bg-accent-subtle text-accent-text" : "text-muted hover:bg-inset hover:text-ink",
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 type-meta font-medium leading-4",
        tone === "plain" && "bg-inset text-muted",
        tone === "accent" && "bg-accent-subtle text-accent-text",
        tone === "warn" && "bg-warning-subtle text-warning-text",
        tone === "bad" && "bg-danger-subtle text-danger-text",
        className,
      )}
    >
      {children}
    </span>
  );
}

const BAND_STYLE: Record<Band, string> = {
  top: "border-accent text-accent-text bg-accent-subtle",
  mid: "border-warning/60 text-warning-text bg-warning-subtle",
  low: "border-line text-ink bg-inset",
  none: "border-line text-muted bg-transparent",
};

export function ScoreBadge({ score, min, size = "md" }: { score: number; min: number; size?: "md" | "lg" }) {
  const band = scoreBand(score, min);
  return (
    <span
      className={cx(
        "tabular flex shrink-0 items-center justify-center rounded-md border font-semibold",
        size === "lg" ? "size-14 type-heading" : "size-11 type-body",
        BAND_STYLE[band],
      )}
      title={band === "top" ? `Match score ${score}/100 · strong match (${min}+)` : `Match score ${score}/100`}
    >
      <span className="sr-only">Match score </span>
      {score}
    </span>
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
      className={cx("h-9 rounded-md border border-line bg-raised px-2.5 type-small text-ink outline-none focus:border-accent", className)}
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
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 rounded-md border border-line bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md px-2.5 type-meta font-medium transition-colors",
            o.value === value ? "bg-inset text-ink shadow-l1" : "text-muted hover:text-ink",
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
    <label className="inline-flex cursor-pointer select-none items-center gap-2 type-small text-muted hover:text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-accent" />
      {children}
    </label>
  );
}

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("rounded-md border border-line bg-raised", className)}>
      {children}
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded-md border border-line bg-inset px-1 font-mono type-meta text-muted">
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
      <p className="tabular type-meta text-muted">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page">
            ‹ Prev
          </Button>
          <span className="tabular px-1 type-meta text-muted sm:hidden">
            Page {page} of {pages.toLocaleString()}
          </span>
          {pageList(page, pages).map((p, i) =>
            p === null ? (
              <span key={`gap${i}`} className="hidden px-1 type-meta text-muted sm:inline">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={cx(
                  "tabular hidden h-8 min-w-8 rounded-md px-2 type-meta sm:inline-block",
                  p === page ? "bg-accent text-on-accent" : "text-muted hover:bg-inset hover:text-ink",
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
