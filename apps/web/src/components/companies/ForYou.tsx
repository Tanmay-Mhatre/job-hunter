import { INDUSTRY_BY_ID } from "@jobhunter/core/catalog/industries";
import { Briefcase, History, LoaderCircle, Package, Plus, Sparkles, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { keyOf, type CompanyRef } from "../../lib/companies";
import { refOf, visible, type CompanySuggestion, type CompanySuggestions, type SuggestState } from "../../lib/companySuggest";
import { load, save } from "../../lib/storage";
import { AddAll, AddButton } from "../CompanyButtons";
import { Button, Card, Chip, cx } from "../ui";
import { CardSkeleton, Monogram, SuggestionCard } from "./SuggestionCard";

type Lens = "hiring" | "like" | "watching" | "packs" | "soon";

type Props = {
  state: SuggestState;
  /** Keys of companies in your list (saved or not). */
  watched: Set<string>;
  /** Keys you said "not interested" to. */
  muted: Set<string>;
  pastEmployers: string[];
  onPastEmployers: (names: string[]) => void;
  onAddMany: (list: CompanyRef[]) => string[];
  onRemoveMany: (keys: string[]) => void;
  onMute: (key: string) => void;
  onUnmute: (key: string) => void;
  /** Fewer cards, for the setup wizard. */
  compact?: boolean;
  /** Shown when there is nothing to suggest from (no roles yet). */
  offHint?: ReactNode;
};

const DISMISSED_KEY = "jobhunter.goBackDismissed";
const PAGE = 9;

/**
 * Companies picked for you: hiring for your roles now, like the companies on your resume, worth
 * watching, one pack per industry, and ones we can't track yet. Rule-based and local: nothing
 * about you leaves this computer.
 */
export function ForYou({ state, watched, muted, pastEmployers, onPastEmployers, onAddMany, onRemoveMany, onMute, onUnmute, compact, offHint }: Props) {
  const data = state.kind === "ready" ? state.data : state.kind === "loading" ? state.previous : undefined;
  const [lens, setLens] = useState<Lens | null>(null);
  const [shown, setShown] = useState(compact ? 6 : PAGE);
  const [hidden, setHidden] = useState<{ key: string; name: string } | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(() => load<string[]>(DISMISSED_KEY, []));

  const lists = useMemo(() => {
    if (!data) return null;
    return {
      hiring: visible(data.hiringNow, muted),
      watching: visible(data.worthWatching, muted),
      soon: visible(data.notScannable, muted),
      like: data.lookalikes.map((r) => ({ ...r, items: visible(r.items, muted) })).filter((r) => r.items.length),
      packs: data.packs.map((p) => ({ ...p, items: visible(p.items, muted) })).filter((p) => p.items.length),
    };
  }, [data, muted]);

  // Open on the most useful lens once the first answer arrives.
  // Open on packs (the quickest way to add many), else the most useful list.
  const current: Lens = lens ?? (lists?.packs.length ? "packs" : lists && lists.hiring.length < 3 ? (lists.like.length ? "like" : "watching") : "hiring");
  useEffect(() => setShown(compact ? 6 : PAGE), [current, compact]);

  const hide = (s: CompanySuggestion) => {
    onMute(s.key);
    setHidden({ key: s.key, name: s.name });
  };
  const card = (s: CompanySuggestion) => (
    <SuggestionCard
      key={s.key}
      s={s}
      added={watched.has(s.key) || watched.has(keyOf(s))}
      onAdd={() => void onAddMany([refOf(s)])}
      onRemove={() => onRemoveMany([s.key])}
      onHide={() => hide(s)}
    />
  );
  const grid = (items: CompanySuggestion[], limit = shown, more = () => setShown((n) => n + PAGE)) => (
    <>
      <div className={cx("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>{items.slice(0, limit).map(card)}</div>
      {items.length > limit && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={more}>
            Show more ({items.length - limit})
          </Button>
        </div>
      )}
    </>
  );

  type Tab = { id: Lens; label: string; count: number };
  const tabs: Tab[] = lists
    ? ([
        { id: "packs", label: "Starter packs", count: lists.packs.length },
        { id: "hiring", label: "Hiring for you now", count: lists.hiring.length },
        { id: "like", label: "Like your past employers", count: lists.like.reduce((n, r) => n + r.items.length, 0) },
        { id: "watching", label: "Worth watching", count: lists.watching.length },
        { id: "soon", label: "Not trackable yet", count: lists.soon.length },
      ] satisfies Tab[]).filter((t) => t.count || t.id === "hiring" || t.id === "like")
    : [];

  const goBack = (data?.pastEmployers ?? []).filter((p) => p.company && !dismissed.includes(p.company.key) && !muted.has(p.company.key));

  const Wrap = compact ? "div" : Card;
  const top5 = lists ? [...lists.hiring, ...lists.like.flatMap((r) => r.items)].filter((s, i, all) => all.findIndex((x) => x.key === s.key) === i).slice(0, 5) : [];
  return (
    <Wrap className={compact ? "" : "p-5 sm:p-6"}>
      <div className={cx("flex flex-wrap items-start justify-between gap-3", compact && "hidden")}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-4 text-accent" /> Picked for you
          </h2>
          <p className="mt-0.5 text-sm text-muted">From your roles, places, industries and past employers. Worked out on this computer; nothing about you is sent anywhere.</p>
        </div>
        {data && data.coverage.in_industries > 0 && (
          <p className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted" title="Companies in the directory tagged with your industries, and how many of them are on a hiring system we can check">
            We can track <b className="tabular text-fg">{data.coverage.trackable}</b> of {data.coverage.in_industries} companies in your industries
          </p>
        )}
      </div>

      <PastEmployers names={pastEmployers} suggested={data?.pastEmployers.map((p) => p.name)} onChange={onPastEmployers} />
      {compact && top5.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-accent-soft/50 p-3 text-sm">
          <span className="mr-auto">Quick start: watch the 5 best fits ({top5.map((s) => s.name).join(", ")}).</span>
          <AddAll items={top5.map(refOf)} watched={watched} onAddMany={onAddMany} onRemoveMany={onRemoveMany} />
        </div>
      )}

      {state.kind === "off" ? (
        <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-muted">{offHint ?? "Pick the roles you want first, and we'll suggest companies hiring for them."}</p>
      ) : state.kind === "error" ? (
        <p className="mt-4 rounded-xl bg-warn-soft/50 p-3 text-sm text-warn">Couldn't work out suggestions: {state.message}</p>
      ) : !lists ? (
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" /> Matching thousands of companies to your profile… (the first time takes about 10 seconds)
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: compact ? 2 : 3 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : (
        <div className={cx("mt-4 space-y-4", state.kind === "loading" && "opacity-60 transition-opacity")}>
          <div role="tablist" aria-label="Suggestions" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={current === t.id}
                onClick={() => setLens(t.id)}
                className={cx(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  current === t.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg",
                )}
              >
                {t.label}
                <span className="tabular opacity-70">{t.count}</span>
              </button>
            ))}
            {state.kind === "loading" && <LoaderCircle className="ml-1 size-4 shrink-0 self-center animate-spin text-muted" />}
          </div>

          <LensHeader lens={current} lists={lists} watched={watched} onAddMany={onAddMany} onRemoveMany={onRemoveMany} />

          {hidden && muted.has(hidden.key) && (
            <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="mr-auto">
                Hid <b>{hidden.name}</b>. Its jobs won't show either.
              </span>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-accent" onClick={() => (onUnmute(hidden.key), setHidden(null))}>
                <Undo2 className="size-3.5" /> Undo
              </button>
            </p>
          )}

          {current === "hiring" &&
            (lists.hiring.length ? grid(lists.hiring) : <Empty>No company has an opening that passes your filters today. Try Worth watching, or widen your places.</Empty>)}
          {current === "watching" && grid(lists.watching)}
          {current === "soon" && grid(lists.soon)}
          {current === "like" && (
            <LikeLens
              rows={lists.like}
              goBack={goBack}
              hasEmployers={pastEmployers.length > 0 || !!data?.pastEmployers.length}
              grid={grid}
              compact={compact}
              watched={watched}
              onAddMany={onAddMany}
              onRemoveMany={onRemoveMany}
              onDismiss={(key) => {
                const next = [...dismissed, key];
                setDismissed(next);
                save(DISMISSED_KEY, next);
              }}
            />
          )}
          {current === "packs" && <Packs packs={lists.packs} watched={watched} onAddMany={onAddMany} onRemoveMany={onRemoveMany} />}
        </div>
      )}
    </Wrap>
  );
}

const unique = (items: CompanySuggestion[]) => items.filter((s, i) => items.findIndex((x) => x.key === s.key) === i);

const LENS_INTRO: Record<Lens, string> = {
  packs: "The best-fitting companies in each of your industries. Add a whole pack in one go.",
  hiring: "Companies with open roles that pass your title and place filters today.",
  like: "Companies like the ones on your resume that also fit what you want now.",
  watching: "A good fit, but nothing open for you today. Watch them to hear first when something opens.",
  soon: "In your industries, but on hiring systems we can't check yet. Add them now and we'll track them when support lands.",
};

/** What the lens is, and "Add all" for everything in it (not just the cards on screen). */
function LensHeader({
  lens,
  lists,
  watched,
  onAddMany,
  onRemoveMany,
}: {
  lens: Lens;
  lists: { hiring: CompanySuggestion[]; watching: CompanySuggestion[]; soon: CompanySuggestion[]; like: { items: CompanySuggestion[] }[]; packs: { items: CompanySuggestion[] }[] };
  watched: Set<string>;
  onAddMany: (list: CompanyRef[]) => string[];
  onRemoveMany: (keys: string[]) => void;
}) {
  const items =
    lens === "packs"
      ? unique(lists.packs.flatMap((p) => p.items))
      : lens === "like"
        ? unique(lists.like.flatMap((r) => r.items))
        : lens === "hiring"
          ? lists.hiring
          : lens === "watching"
            ? lists.watching
            : lists.soon;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="min-w-0 flex-1 text-sm text-muted">{LENS_INTRO[lens]}</p>
      {/* Keyed by lens, so its "Added n · Undo" belongs to this list only. */}
      <AddAll key={lens} items={items.map(refOf)} watched={watched} onAddMany={onAddMany} onRemoveMany={onRemoveMany} />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{children}</p>;
}

function LikeLens({
  rows,
  goBack,
  hasEmployers,
  grid,
  compact,
  watched,
  onAddMany,
  onRemoveMany,
  onDismiss,
}: {
  rows: { seed: string; in_directory: boolean; items: CompanySuggestion[] }[];
  goBack: CompanySuggestions["pastEmployers"];
  hasEmployers: boolean;
  grid: (items: CompanySuggestion[], limit?: number, more?: () => void) => ReactNode;
  compact?: boolean;
  watched: Set<string>;
  onAddMany: (list: CompanyRef[]) => string[];
  onRemoveMany: (keys: string[]) => void;
  onDismiss: (key: string) => void;
}) {
  const [open, setOpen] = useState<string[]>([]);
  if (!hasEmployers) return <Empty>Add the companies you've worked at above, and we'll find companies like them that are hiring for you.</Empty>;
  return (
    <div className="space-y-5">
      {rows.length === 0 && <Empty>No close match yet for your past employers among companies that fit your roles and places.</Empty>}
      {rows.map((r) => (
        <section key={r.seed} className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="min-w-0 flex-1 text-sm font-semibold">
              Because you worked at {r.seed}
              {!r.in_directory && <span className="ml-2 text-xs font-normal text-muted">(matched on the industries in that role on your resume)</span>}
            </h3>
            <AddAll items={r.items.map(refOf)} watched={watched} onAddMany={onAddMany} onRemoveMany={onRemoveMany} />
          </div>
          {grid(r.items, open.includes(r.seed) ? r.items.length : compact ? 2 : 3, () => setOpen((o) => [...o, r.seed]))}
        </section>
      ))}
      {goBack.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4 text-muted" /> Go back?
          </h3>
          <p className="text-xs text-muted">Your past employers that we can track. Some people like to keep an eye on them.</p>
          <ul className="flex flex-wrap gap-2">
            {goBack.map(({ company: c }) => (
              <li key={c!.key} className="flex items-center gap-2 rounded-xl border border-line py-1.5 pl-2 pr-1.5">
                <Monogram name={c!.name} size="sm" />
                <span className="text-sm font-medium">{c!.name}</span>
                {c!.open_jobs ? <span className="text-xs text-muted">{c!.open_jobs} jobs</span> : null}
                <AddButton added={watched.has(c!.key)} onAdd={() => void onAddMany([c!])} onRemove={() => onRemoveMany([c!.key])} />
                <button type="button" aria-label={`Don't suggest ${c!.name}`} title="Don't suggest" className="rounded p-1 text-muted hover:text-fg" onClick={() => onDismiss(c!.key)}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Packs({
  packs,
  watched,
  onAddMany,
  onRemoveMany,
}: {
  packs: { industry: string; items: CompanySuggestion[] }[];
  watched: Set<string>;
  onAddMany: (list: CompanyRef[]) => string[];
  onRemoveMany: (keys: string[]) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {packs.map((p) => (
        <section key={p.industry} className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <header className="flex items-center gap-2">
            <Package className="size-4 text-accent" />
            <h3 className="mr-auto text-sm font-semibold">{INDUSTRY_BY_ID.get(p.industry)?.label ?? p.industry}</h3>
            <AddAll items={p.items.map(refOf)} watched={watched} onAddMany={onAddMany} onRemoveMany={onRemoveMany} />
          </header>
          <ul className="flex flex-wrap gap-1.5">
            {p.items.map((s) => {
              const on = watched.has(s.key);
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => (on ? onRemoveMany([s.key]) : onAddMany([refOf(s)]))}
                    title={s.reasons.join(" · ")}
                    className={cx(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg border pl-1.5 pr-2.5 text-xs font-medium transition-colors",
                      on ? "border-accent bg-accent-soft text-accent" : "border-line hover:border-muted/50",
                    )}
                  >
                    <Monogram name={s.name} size="xs" />
                    {s.name}
                    {s.matches > 0 && <span className="tabular text-accent">{s.matches}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">Numbers are roles that match you now. Tap a company to add or remove it.</p>
        </section>
      ))}
    </div>
  );
}

/** The companies on your resume, as editable chips. They seed "companies like them". */
export function PastEmployers({ names, suggested = [], onChange }: { names: string[]; suggested?: string[]; onChange: (names: string[]) => void }) {
  const [text, setText] = useState("");
  if (!names.length && suggested.length) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-line p-2.5">
        <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          <Briefcase className="size-3.5" /> From your resume, you've worked at
        </span>
        {suggested.map((n) => (
          <Chip key={n} className="h-7 text-xs">
            {n}
          </Chip>
        ))}
        <Button size="sm" variant="primary" className="ml-auto" onClick={() => onChange(suggested)}>
          Looks right
        </Button>
      </div>
    );
  }
  const add = () => {
    const n = text.trim().replace(/\s+/g, " ");
    if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) onChange([...names, n]);
    setText("");
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        <Briefcase className="size-3.5" /> You've worked at
      </span>
      {names.map((n) => (
        <Chip key={n} className="h-7 gap-1 pl-2 pr-1 text-xs">
          {n}
          <button type="button" aria-label={`Remove ${n}`} className="rounded p-0.5 hover:text-fg" onClick={() => onChange(names.filter((x) => x !== n))}>
            <X className="size-3" />
          </button>
        </Chip>
      ))}
      <form
        className="inline-flex items-center"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={names.length ? "Add another" : "Add a company you've worked at"}
          aria-label="Add a past employer"
          className="h-7 w-44 rounded-md border border-dashed border-line bg-transparent px-2 text-xs outline-none placeholder:text-muted focus:border-accent"
        />
        {text.trim() && (
          <button type="submit" aria-label="Add" className="ml-1 rounded p-1 text-accent">
            <Plus className="size-3.5" />
          </button>
        )}
      </form>
    </div>
  );
}
