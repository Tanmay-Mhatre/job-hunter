import { ArrowDown, Link2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CompanyRef } from "../../lib/companies";
import { AddByLink } from "../AddByLink";
import { BrowseRow, searchDirectory, type DirCompany } from "../CompanyFinder";
import { Button, Card, cx } from "../ui";

type Props = {
  directory: DirCompany[] | null;
  watched: Set<string>;
  forYou: ReadonlyMap<string, number>;
  fit: ReadonlyMap<string, number>;
  onAddMany: (list: CompanyRef[]) => string[];
  onRemove: (key: string) => void;
  /** "See all results": hand the search to the full finder below. */
  onSeeAll: (q: string) => void;
  /** Right side of the bar (the save status). */
  status?: ReactNode;
};

const SHOWN = 8;

/** The first thing on the Companies page: find a company by name, or add one by its careers link. */
export function QuickAdd({ directory, watched, forYou, fit, onAddMany, onRemove, onSeeAll, status }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const results = useMemo(() => (directory && q.trim().length >= 2 ? searchDirectory(directory, { q, watched, forYou, fit }) : []), [directory, q, watched, forYou, fit]);

  // Close the results on a click outside.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const showResults = open && q.trim().length >= 2;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">Add companies you'd love to work at</h2>
        {status}
      </div>
      <p className="mt-0.5 text-sm text-muted">We check them on every scan and list their jobs first on your Radar.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div ref={box} className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            placeholder={directory ? `Search ${directory.length.toLocaleString()} companies by name…` : "Search companies by name…"}
            aria-label="Search companies to add"
            aria-expanded={showResults}
            className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-9 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
          {q && (
            <button type="button" aria-label="Clear search" className="absolute right-2 top-2.5 rounded p-1 text-muted hover:text-fg" onClick={() => setQ("")}>
              <X className="size-4" />
            </button>
          )}
          {showResults && (
            <div className="absolute inset-x-0 top-12 z-20 max-h-[60vh] overflow-auto rounded-xl border border-line bg-surface shadow-xl">
              {!directory ? (
                <p className="p-4 text-sm text-muted">The company directory isn't loaded yet.</p>
              ) : results.length === 0 ? (
                <p className="p-4 text-sm text-muted">
                  No company matches “{q.trim()}”. Try{" "}
                  <button type="button" className="font-medium text-accent" onClick={() => (setLink(true), setOpen(false))}>
                    pasting its careers link
                  </button>
                  .
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-line">
                    {results.slice(0, SHOWN).map((g) => (
                      <BrowseRow
                        key={g.lead.key}
                        lead={g.lead}
                        others={g.others}
                        watched={watched}
                        jobsFor={(c) => forYou.get(c.key) ?? 0}
                        fitFor={(c) => fit.get(c.key)}
                        onAdd={(c) => void onAddMany([c])}
                        onRemove={onRemove}
                      />
                    ))}
                  </ul>
                  {results.length > SHOWN && (
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1 border-t border-line py-2.5 text-sm font-medium text-accent hover:bg-surface-2"
                      onClick={() => {
                        onSeeAll(q.trim());
                        setOpen(false);
                      }}
                    >
                      See all {results.length.toLocaleString()} results <ArrowDown className="size-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <Button className={cx("h-11 shrink-0", link && "border-accent text-accent")} onClick={() => setLink((v) => !v)} aria-expanded={link}>
          <Link2 className="size-4" /> Paste a careers link
        </Button>
      </div>
      {link && (
        <div className="mt-4 border-t border-line pt-4">
          <AddByLink watched={watched} onAddMany={onAddMany} onRemove={onRemove} />
        </div>
      )}
    </Card>
  );
}
