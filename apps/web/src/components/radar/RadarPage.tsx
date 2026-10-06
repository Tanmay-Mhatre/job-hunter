import { INDUSTRY_BY_ID } from "@jobhunter/core/catalog/industries";
import { ArrowRight, ArrowUpDown, Building2, Check, LoaderCircle, Pencil, Plus, Search, SlidersHorizontal, Star, UserRound, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useOtherJobs, type DataMeta, type Job, type Profile } from "../../lib/data";
import {
  activeChips,
  applyFilters,
  DEFAULT_FILTERS,
  facetCounts,
  fromQuery,
  groupJobs,
  INDEX_MAX_AGE_DAYS,
  isNewJob,
  profileFilters,
  profilePlaces,
  sameFilters,
  sortJobs,
  suggestRelax,
  toQuery,
  type Ctx,
  type FacetKey,
  type FacetOption,
  type Filters,
  type Sort,
} from "../../lib/filters";
import type { Prefs, SavedView } from "../../lib/prefs";
import type { FilterPicks } from "../../lib/profileSync";
import { load, save } from "../../lib/storage";
import type { Status, UserState } from "../../lib/userState";
import { JobDetail } from "../JobDetail";
import { Button, Card, cx } from "../ui";
import { FacetMenu, OptionList } from "./FacetMenu";
import { JobCard } from "./JobCard";

type Props = {
  jobs: Job[];
  meta: DataMeta;
  user: UserState;
  cutoff: string | null;
  prefs: Prefs;
  onMarkAllSeen: () => void;
  /** Phones: open the job full screen. */
  onOpenOverlay: (job: Job) => void;
  overlayOpen: boolean;
  onStatus: (job: Job, s: Status) => void;
  onUpdate: (job: Job, patch: { status?: Status; note?: string }) => void;
  onApply: (job: Job) => void;
  onSaveView: (name: string, filters: Filters, sort: Sort) => SavedView;
  onRenameView: (id: string, name: string) => void;
  onDeleteView: (id: string) => void;
  onHideCompany: (company: string, hidden: boolean) => void;
  /** Is this job at one of your companies? Their jobs always come first. */
  isYours: (j: Job) => boolean;
  /** How many companies you've added. */
  companyCount: number;
  /** When the directory index behind the estimated jobs was built. */
  indexGeneratedAt?: string;
  onCompanies: () => void;
  /** Add (or remove) a job's company to your companies (local app only). Resolves to an error, or null. */
  onTrack?: (job: Job, on: boolean) => Promise<string | null>;
  /** Check a directory job's company live now (local app only). Resolves to an error, or null. */
  onCheck?: (job: Job) => Promise<string | null>;
  /** Your saved profile now (Settings); falls back to the one from the last scan. */
  profile?: Profile;
  onEditProfile: () => void;
  /** Save the Radar's place picks to your profile, then rescan. Resolves to an error, or null. */
  onSaveProfile?: (picks: FilterPicks) => Promise<string | null>;
};

const FILTER_KEY = "jobhunter.radar.v2";
const PAGE = 40;
const SORTS: { value: Sort; label: string }[] = [
  { value: "best", label: "Best match" },
  { value: "newest", label: "Newest" },
  { value: "salary", label: "Highest salary" },
  { value: "company", label: "Company A–Z" },
];

/**
 * Filters + sort: from the URL (shareable, Back works), else your own changes if you made any,
 * else your profile's filters. Until you change them, they follow your profile (e.g. after Settings).
 */
function useRadarFilters(base: Filters) {
  const [state, setState] = useState<{ filters: Filters; sort: Sort }>(() => {
    const fromUrl = fromQuery(location.hash.split("?")[1] ?? "");
    if (fromUrl) return fromUrl;
    const stored = load<{ filters?: Partial<Filters>; sort?: Sort; custom?: boolean }>(FILTER_KEY, {});
    return { filters: stored.custom ? { ...DEFAULT_FILTERS, ...stored.filters, q: "" } : base, sort: stored.sort ?? "best" };
  });
  const baseRef = useRef(base);
  /** Set after "Save to my profile": the next profile is yours, so the filters follow it. */
  const adopt = useRef(false);
  useEffect(() => {
    // Profile changed: follow it, unless you've changed the filters yourself.
    if (adopt.current || sameFilters(state.filters, baseRef.current)) setState((s) => ({ ...s, filters: { ...base, q: s.filters.q } }));
    adopt.current = false;
    baseRef.current = base;
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    save(FILTER_KEY, { filters: { ...state.filters, q: "" }, sort: state.sort, custom: !sameFilters(state.filters, baseRef.current) });
    const q = toQuery(state.filters, state.sort);
    const next = `#radar${q ? `?${q}` : ""}`;
    if (location.hash !== next && location.hash.split("?")[0] === "#radar") history.replaceState(null, "", next);
  }, [state]);
  const setFilters = useCallback((patch: Partial<Filters>) => setState((s) => ({ ...s, filters: { ...s.filters, ...patch } })), []);
  const setSort = useCallback((sort: Sort) => setState((s) => ({ ...s, sort })), []);
  const replace = useCallback((filters: Filters, sort: Sort) => setState({ filters, sort }), []);
  const adoptNextProfile = useCallback((on = true) => {
    adopt.current = on;
  }, []);
  return { ...state, setFilters, setSort, replace, adoptNextProfile };
}

function useIsWide() {
  const query = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export function RadarPage(p: Props) {
  const profile = p.profile ?? p.meta.profile;
  const profileKey = JSON.stringify([profile.locations, profile.industries]);
  const base = useMemo(() => profileFilters(profile), [profileKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { filters, sort, setFilters, setSort, replace, adoptNextProfile } = useRadarFilters(base);
  const wide = useIsWide();
  const min = p.meta.profile.min_score;
  const other = useOtherJobs(filters.showFailed);
  const pool = useMemo(() => (filters.showFailed && other ? [...p.jobs, ...other] : p.jobs), [p.jobs, other, filters.showFailed]);

  // Industries per company: your companies (from the last scan), and any job that carries its company's.
  const industriesByCompany = useMemo(() => {
    const m = new Map(p.meta.companies.map((c) => [c.name, c.industries ?? []]));
    for (const j of p.jobs) if (j.industries?.length && !m.get(j.company)?.length) m.set(j.company, j.industries);
    return m;
  }, [p.meta.companies, p.jobs]);
  const hidden = useMemo(() => new Set(p.prefs.hiddenCompanies), [p.prefs.hiddenCompanies]);
  const ctx: Ctx = useMemo(
    () => {
      const places = profilePlaces(profile);
      return {
        user: p.user,
        min,
        cutoff: p.cutoff,
        industriesOf: (c: string) => industriesByCompany.get(c) ?? [],
        hiddenCompanies: hidden,
        isYours: p.isYours,
        mine: { countries: new Set([...places.countries, ...(places.remote ? ["Remote"] : [])]), locations: new Set(places.locations), industries: new Set(profile.industries) },
      };
    },
    [p.user, min, p.cutoff, industriesByCompany, hidden, profileKey, p.isYours], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Your companies' jobs always lead, whatever the sort.
  const visible = useMemo(() => sortJobs(applyFilters(pool, filters, ctx), sort, p.isYours), [pool, filters, ctx, sort, p.isYours]);
  const groups = useMemo(() => groupJobs(visible), [visible]);
  const counts = useMemo(() => facetCounts(pool, filters, ctx), [pool, filters, ctx]);
  const chips = activeChips(filters, ctx, base);

  // Summary numbers over all matches (not the current filters).
  // View counts are within your profile, like the views themselves.
  const open = useMemo(() => applyFilters(p.jobs, base, ctx), [p.jobs, base, ctx]);
  const newCount = open.filter((j) => isNewJob(j, ctx)).length;
  const strongCount = open.filter((j) => j.score >= min).length;
  const yourGroups = groups.filter((g) => p.isYours(g.lead)).length;
  const noCompaniesYet = filters.mine && p.companyCount === 0;

  // ----- list paging and selection -----
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [filters, sort]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedGroup = groups.find((g) => g.jobs.some((j) => j.id === selectedId)) ?? (wide ? groups[0] : undefined);
  const selected = selectedGroup?.jobs.find((j) => j.id === selectedId) ?? selectedGroup?.lead;
  const index = selectedGroup ? groups.indexOf(selectedGroup) : -1;
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const sentinel = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setLimit((l) => l + PAGE), { root: wide ? listRef.current : null, rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [wide, groups.length, limit]);

  const select = useCallback(
    (job: Job) => {
      setSelectedId(job.id);
      if (!wide) p.onOpenOverlay(job);
    },
    [wide, p],
  );
  const move = useCallback(
    (d: number) => {
      if (!groups.length) return;
      const next = Math.max(0, Math.min(groups.length - 1, (index < 0 ? -1 : index) + d));
      const g = groups[next]!;
      if (next >= limit) setLimit(next + PAGE);
      setSelectedId(g.lead.id);
      if (!wide && p.overlayOpen) p.onOpenOverlay(g.lead);
      requestAnimationFrame(() => rowRefs.current.get(g.key)?.scrollIntoView({ block: "nearest" }));
    },
    [groups, index, limit, wide, p],
  );

  // ----- keyboard: j/k move, s/a/x status, Enter opens (phones), "/" search -----
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!wide && p.overlayOpen && !["j", "k", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      if (e.key === "j" || e.key === "ArrowDown") (e.preventDefault(), move(1));
      else if (e.key === "k" || e.key === "ArrowUp") (e.preventDefault(), move(-1));
      else if (!selected) return;
      else if (e.key === "Enter" || e.key === "o") {
        // Desktop: the details are already showing, so Enter opens the job page (and asks "Did you apply?" later).
        if (wide) {
          window.open(selected.url, "_blank", "noopener");
          p.onApply(selected);
        } else p.onOpenOverlay(selected);
      }
      else if (e.key === "s") p.onStatus(selected, "saved");
      else if (e.key === "a") p.onStatus(selected, "applied");
      else if (e.key === "x") p.onStatus(selected, "dismissed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, selected, wide, p]);

  // ----- hide a company, with undo -----
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const hideCompany = (company: string, hide: boolean) => {
    p.onHideCompany(company, hide);
    setToast(hide ? company : null);
  };

  const [sheet, setSheet] = useState(false);
  const facet = (key: FacetKey) => counts[key];
  const relax = groups.length === 0 ? suggestRelax(pool, filters, ctx) : [];

  const detailProps = selected && {
    job: selected,
    entry: p.user[selected.id],
    profile: p.meta.profile,
    postings: selectedGroup!.jobs,
    industries: industriesByCompany.get(selected.company),
    moreFromCompany: sortJobs(
      p.jobs.filter((j) => j.company === selected.company && j.group !== selected.group && j.status === "open"),
      "best",
    ).slice(0, 5),
    yours: p.isYours(selected),
    indexGeneratedAt: p.indexGeneratedAt,
    onTrack: p.onTrack && ((on: boolean) => p.onTrack!(selected, on)),
    onCheck: p.onCheck && selected.estimated ? () => p.onCheck!(selected) : undefined,
    companyHidden: hidden.has(selected.company),
    onUpdate: (patch: { status?: Status; note?: string }) => p.onUpdate(selected, patch),
    onApply: p.onApply,
    onHideCompany: (h: boolean) => hideCompany(selected.company, h),
    onOpenJob: (j: Job) => setSelectedId(j.id),
    onPrev: index > 0 ? () => move(-1) : undefined,
    onNext: index < groups.length - 1 ? () => move(1) : undefined,
  };

  // Have the place or industry filters moved away from your profile?
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const changedFromProfile = !sameSet(filters.countries, base.countries) || !sameSet(filters.locations, base.locations);

  return (
    <div className="space-y-3">
      <ProfileBar
        profile={profile}
        changed={changedFromProfile}
        onEdit={p.onEditProfile}
        onReset={() => setFilters({ countries: base.countries, locations: base.locations })}
        onSave={
          p.onSaveProfile &&
          (() => {
            adoptNextProfile();
            return p.onSaveProfile!({ countries: filters.countries, locations: filters.locations }).then((err) => {
              if (err) adoptNextProfile(false);
              return err;
            });
          })
        }
      />

      {/* Summary + search + sort */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              value={filters.q}
              onChange={(e) => setFilters({ q: e.target.value })}
              onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), setFilters({ q: "" }))}
              placeholder="Search title, company, location, topic…  ( / )"
              aria-label="Search jobs"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          <label className="relative inline-flex items-center">
            <ArrowUpDown className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort"
              className="h-9 appearance-none rounded-lg border border-line bg-surface pl-8 pr-3 text-sm outline-none focus:border-accent"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <Button className="lg:hidden" onClick={() => setSheet(true)}>
            <SlidersHorizontal className="size-4" /> Filters{chips.length ? ` · ${chips.length}` : ""}
          </Button>
        </div>

        <ViewsBar
          base={base}
          filters={filters}
          sort={sort}
          views={p.prefs.views}
          counts={{ all: open.length, mine: open.filter(p.isYours).length, new: newCount, strong: strongCount, saved: open.filter((j) => p.user[j.id]?.status === "saved").length }}
          onPick={replace}
          onSave={(name) => p.onSaveView(name, filters, sort)}
          onRename={p.onRenameView}
          onDelete={p.onDeleteView}
          onMarkAllSeen={newCount ? p.onMarkAllSeen : undefined}
        />

        <div className="mt-2 hidden flex-wrap items-center gap-1.5 lg:flex">
          <FacetMenu label="Date posted" single options={facet("posted")} selected={filters.posted ? [String(filters.posted)] : []} onChange={(v) => setFilters({ posted: (Number(v[0]) || 0) as Filters["posted"] })} />
          <FacetMenu label="Country" searchable options={facet("countries")} selected={filters.countries} onChange={(v) => setFilters({ countries: v })} />
          <FacetMenu label="Location" searchable options={facet("locations")} selected={filters.locations} onChange={(v) => setFilters({ locations: v })} />
          <FacetMenu label="Workplace" options={facet("workplace")} selected={filters.workplace} onChange={(v) => setFilters({ workplace: v as Filters["workplace"] })} />
          <FacetMenu label="Seniority" options={facet("seniority")} selected={filters.seniority} onChange={(v) => setFilters({ seniority: v as Filters["seniority"] })} />
          {facet("industries").length > 0 && <FacetMenu label="Industry" options={facet("industries")} selected={filters.industries} onChange={(v) => setFilters({ industries: v })} />}
          <FacetMenu label="Company" searchable options={facet("companies")} selected={filters.companies} onChange={(v) => setFilters({ companies: v })} />
          {facet("topics").length > 0 && <FacetMenu label="Topics" searchable options={facet("topics")} selected={filters.topics} onChange={(v) => setFilters({ topics: v })} />}
          <FacetMenu
            label="Match"
            single
            options={facet("match")}
            selected={filters.match === "all" ? [] : [filters.match]}
            onChange={(v) => setFilters({ match: (v[0] as Filters["match"]) ?? "all" })}
          />
          <MoreMenu filters={filters} setFilters={setFilters} ats={facet("ats")} hiddenCompanies={p.prefs.hiddenCompanies} onUnhide={(c) => p.onHideCompany(c, false)} />
        </div>

        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilters(c.remove)}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-xs font-medium text-accent hover:opacity-80"
                aria-label={`Remove filter: ${c.label}`}
              >
                {c.label} <X className="size-3" />
              </button>
            ))}
            <button type="button" onClick={() => replace(base, sort)} className="ml-1 text-xs font-medium text-muted hover:text-fg">
              Clear all
            </button>
            <span className="tabular ml-auto text-xs text-muted">
              {groups.length} {groups.length === 1 ? "role" : "roles"}
              {visible.length !== groups.length && ` (${visible.length} postings)`}
            </span>
          </div>
        )}
      </Card>

      {noCompaniesYet ? (
        <Card className="px-6 py-14 text-center">
          <Building2 className="mx-auto size-6 text-muted" />
          <p className="mt-2 font-medium">You haven't picked any companies yet.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Add the companies you'd love to work at: we check them every scan, and their jobs always come first here.</p>
          <Button variant="primary" className="mt-4" onClick={p.onCompanies}>
            Pick my companies <ArrowRight className="size-4" />
          </Button>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="font-medium">No jobs match these filters.</p>
          {relax.length > 0 ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {relax.map((r) => (
                <Button key={r.label} size="sm" onClick={() => setFilters(r.remove)}>
                  Remove {r.label} → {r.count} job{r.count === 1 ? "" : "s"}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">{filters.mine ? "None of your companies has a matching job right now. We'll keep checking." : "Try clearing the filters."}</p>
          )}
        </Card>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-3">
          <Card className="overflow-hidden lg:sticky lg:top-[4.5rem] lg:h-[calc(100dvh-5.5rem)]">
            <div ref={listRef} className="lg:h-full lg:overflow-y-auto">
              <ul>
                {groups.slice(0, limit).map((g, i) => (
                  <Fragment key={g.key}>
                  {!filters.mine && yourGroups > 0 && (i === 0 || i === yourGroups) && (
                    <ListHeading>{i === 0 ? `Your companies (${yourGroups})` : `All jobs for you (${groups.length - yourGroups})`}</ListHeading>
                  )}
                  <JobCard
                    ref={(el) => {
                      if (el) rowRefs.current.set(g.key, el);
                      else rowRefs.current.delete(g.key);
                    }}
                    group={g}
                    entry={p.user[g.lead.id]}
                    min={min}
                    isNew={isNewJob(g.lead, ctx)}
                    selected={!!selectedGroup && g.key === selectedGroup.key && (wide || p.overlayOpen)}
                    onSelect={() => select(g.lead)}
                    onStatus={(s) => p.onStatus(g.lead, s)}
                    yours={p.isYours(g.lead)}
                  />
                  </Fragment>
                ))}
                {limit < groups.length && (
                  <li ref={sentinel} className="flex items-center justify-center gap-2 py-4 text-xs text-muted">
                    <LoaderCircle className="size-3.5 animate-spin" /> Loading more…
                  </li>
                )}
              </ul>
            </div>
          </Card>
          {wide && (
            <Card className="hidden overflow-hidden lg:sticky lg:top-[4.5rem] lg:block lg:h-[calc(100dvh-5.5rem)]">
              {detailProps ? <JobDetail {...detailProps} /> : <p className="p-6 text-sm text-muted">Pick a job to see the details.</p>}
            </Card>
          )}
        </div>
      )}

      {sheet && (
        <FilterSheet onClose={() => setSheet(false)} count={groups.length} onClear={() => replace(base, sort)}>
          <SheetSection label="Date posted">
            <OptionList label="Date posted" single options={facet("posted")} selected={filters.posted ? [String(filters.posted)] : []} onChange={(v) => setFilters({ posted: (Number(v[0]) || 0) as Filters["posted"] })} />
          </SheetSection>
          <SheetSection label="Country">
            <OptionList label="Country" searchable options={facet("countries")} selected={filters.countries} onChange={(v) => setFilters({ countries: v })} />
          </SheetSection>
          <SheetSection label="Location">
            <OptionList label="Location" searchable options={facet("locations")} selected={filters.locations} onChange={(v) => setFilters({ locations: v })} />
          </SheetSection>
          <SheetSection label="Workplace">
            <OptionList label="Workplace" options={facet("workplace")} selected={filters.workplace} onChange={(v) => setFilters({ workplace: v as Filters["workplace"] })} />
          </SheetSection>
          <SheetSection label="Seniority">
            <OptionList label="Seniority" options={facet("seniority")} selected={filters.seniority} onChange={(v) => setFilters({ seniority: v as Filters["seniority"] })} />
          </SheetSection>
          {facet("industries").length > 0 && (
            <SheetSection label="Industry">
              <OptionList label="Industry" options={facet("industries")} selected={filters.industries} onChange={(v) => setFilters({ industries: v })} />
            </SheetSection>
          )}
          <SheetSection label="Match">
            <OptionList label="Match" single options={facet("match")} selected={filters.match === "all" ? [] : [filters.match]} onChange={(v) => setFilters({ match: (v[0] as Filters["match"]) ?? "all" })} />
          </SheetSection>
          <SheetSection label="Company">
            <OptionList label="Company" searchable options={facet("companies")} selected={filters.companies} onChange={(v) => setFilters({ companies: v })} />
          </SheetSection>
          <SheetSection label="More">
            <MoreToggles filters={filters} setFilters={setFilters} />
          </SheetSection>
        </FilterSheet>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6" role="status">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm shadow-xl">
            Hid all jobs from <b>{toast}</b>.
            <button type="button" className="font-medium text-accent" onClick={() => (p.onHideCompany(toast, false), setToast(null))}>
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A section title inside the job list ("Your companies", "All jobs for you"). */
function ListHeading({ children }: { children: ReactNode }) {
  return <li className="sticky top-0 z-10 border-b border-line bg-surface-2/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur">{children}</li>;
}

// ---------- views ----------

const BUILT_IN: { id: string; label: string; filters: Partial<Filters>; count: keyof ViewCounts }[] = [
  { id: "all", label: "All", filters: {}, count: "all" },
  { id: "mine", label: "My companies", filters: { mine: true }, count: "mine" },
  { id: "new", label: "New", filters: { status: "new" }, count: "new" },
  { id: "strong", label: "Strong matches", filters: { match: "strong" }, count: "strong" },
  { id: "saved", label: "Saved", filters: { status: "saved" }, count: "saved" },
  { id: "applied", label: "Applied", filters: { status: "applied" }, count: "all" },
];
type ViewCounts = { all: number; mine: number; new: number; strong: number; saved: number };

function ViewsBar(props: {
  /** Your profile's filters: the built-in views start from them. */
  base: Filters;
  filters: Filters;
  sort: Sort;
  views: SavedView[];
  counts: ViewCounts;
  onPick: (f: Filters, s: Sort) => void;
  onSave: (name: string) => SavedView;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMarkAllSeen?: () => void;
}) {
  const [naming, setNaming] = useState<{ id?: string; value: string } | null>(null);
  const matchesView = (f: Filters) => sameFilters(f, props.filters);
  const builtInActive = BUILT_IN.find((b) => matchesView({ ...props.base, ...b.filters }));
  const customActive = props.views.find((v) => matchesView(v.filters) && v.sort === props.sort);
  const submit = () => {
    if (!naming?.value.trim()) return setNaming(null);
    if (naming.id) props.onRename(naming.id, naming.value);
    else props.onSave(naming.value);
    setNaming(null);
  };

  return (
    <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {BUILT_IN.map((b) => {
        const on = builtInActive?.id === b.id && !customActive;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => props.onPick({ ...props.base, ...b.filters }, props.sort)}
            aria-pressed={on}
            className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium", on ? "bg-fg text-surface" : "text-muted hover:bg-surface-2 hover:text-fg")}
          >
            {b.label}
            {b.id !== "applied" && <span className={cx("tabular text-xs", on ? "opacity-70" : "opacity-60", b.id === "new" && props.counts.new > 0 && !on && "text-accent opacity-100")}>{props.counts[b.count]}</span>}
          </button>
        );
      })}
      {props.onMarkAllSeen && builtInActive?.id === "new" && (
        <button type="button" onClick={props.onMarkAllSeen} className="shrink-0 px-1 text-xs font-medium text-accent">
          Mark all seen
        </button>
      )}
      <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
      {props.views.map((v) =>
        naming?.id === v.id ? (
          <NameInput key={v.id} value={naming.value} onChange={(value) => setNaming({ id: v.id, value })} onSubmit={submit} onCancel={() => setNaming(null)} />
        ) : (
          <span key={v.id} className={cx("group inline-flex h-8 shrink-0 items-center rounded-lg text-sm font-medium", customActive?.id === v.id ? "bg-fg text-surface" : "text-muted hover:bg-surface-2 hover:text-fg")}>
            <button type="button" className="inline-flex h-full items-center gap-1 pl-2.5 pr-1" onClick={() => props.onPick(v.filters, v.sort)} onDoubleClick={() => setNaming({ id: v.id, value: v.name })} title="Double-click to rename">
              <Star className="size-3.5" /> {v.name}
            </button>
            <button type="button" className="mr-1 rounded p-0.5 opacity-50 hover:opacity-100" onClick={() => props.onDelete(v.id)} aria-label={`Delete view ${v.name}`}>
              <X className="size-3" />
            </button>
          </span>
        ),
      )}
      {naming && !naming.id ? (
        <NameInput value={naming.value} onChange={(value) => setNaming({ value })} onSubmit={submit} onCancel={() => setNaming(null)} />
      ) : (
        !customActive &&
        (!builtInActive || props.sort !== "best") && (
          <button type="button" onClick={() => setNaming({ value: "" })} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-accent hover:bg-surface-2">
            <Plus className="size-3.5" /> Save view
          </button>
        )
      )}
    </div>
  );
}

function NameInput({ value, onChange, onSubmit, onCancel }: { value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => (e.key === "Enter" ? onSubmit() : e.key === "Escape" && onCancel())}
        placeholder="Name this view"
        aria-label="View name"
        className="h-8 w-40 rounded-lg border border-accent bg-surface px-2 text-sm outline-none"
      />
      <button type="button" onClick={onSubmit} className="rounded p-1 text-accent" aria-label="Save view">
        <Check className="size-4" />
      </button>
    </span>
  );
}

// ---------- "More" filters ----------

function MoreToggles({ filters, setFilters }: { filters: Filters; setFilters: (p: Partial<Filters>) => void }) {
  const rows: [keyof Filters, string][] = [
    ["salaryOnly", "Salary listed"],
    ["showFailed", "Include jobs that failed your filters"],
    ["showClosed", "Include closed jobs"],
    ["showHidden", "Include hidden jobs and companies"],
    ["olderIndex", `Include directory jobs older than ${INDEX_MAX_AGE_DAYS} days`],
  ];
  return (
    <div className="space-y-0.5">
      {rows.map(([k, label]) => (
        <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
          <input type="checkbox" checked={filters[k] as boolean} onChange={(e) => setFilters({ [k]: e.target.checked })} className="size-4 accent-[var(--accent)]" />
          {label}
        </label>
      ))}
    </div>
  );
}

function MoreMenu({
  filters,
  setFilters,
  ats,
  hiddenCompanies,
  onUnhide,
}: {
  filters: Filters;
  setFilters: (p: Partial<Filters>) => void;
  ats: FacetOption[];
  hiddenCompanies: string[];
  onUnhide: (company: string) => void;
}) {
  const extra = [filters.salaryOnly, filters.showFailed, filters.showClosed, filters.showHidden, filters.olderIndex].filter(Boolean).length + filters.ats.length;
  return (
    <FacetMenu
      label={extra ? `More · ${extra}` : "More"}
      options={ats.length > 1 ? ats : []}
      selected={filters.ats}
      onChange={(v) => setFilters({ ats: v })}
      footer={
        <div className="mt-1 border-t border-line pt-1">
          <MoreToggles filters={filters} setFilters={setFilters} />
          {hiddenCompanies.length > 0 && (
            <div className="mt-1 border-t border-line px-2 pt-2">
              <p className="mb-1 text-xs font-semibold text-muted">Hidden companies</p>
              <ul className="space-y-0.5">
                {hiddenCompanies.map((c) => (
                  <li key={c} className="flex items-center justify-between text-sm">
                    <span className="truncate">{c}</span>
                    <button type="button" className="text-xs font-medium text-accent" onClick={() => onUnhide(c)}>
                      Show
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      }
    />
  );
}

// ---------- phone filter sheet ----------

function FilterSheet({ children, count, onClose, onClear }: { children: ReactNode; count: number; onClose: () => void; onClear: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold">Filters</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear all
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close filters">
            <X className="size-4" />
          </Button>
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
      <footer className="border-t border-line p-3">
        <Button variant="primary" className="w-full" onClick={onClose}>
          Show {count} {count === 1 ? "job" : "jobs"}
        </Button>
      </footer>
    </div>
  );
}

function SheetSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</h3>
      {children}
    </section>
  );
}

// ---------- your profile ----------

/**
 * What your profile searches for, always visible, with Edit. When the place or industry filters
 * differ from it: Reset, or Save to my profile (updates Settings and rescans).
 */
function ProfileBar({
  profile,
  changed,
  onEdit,
  onReset,
  onSave,
}: {
  profile: Profile;
  changed: boolean;
  onEdit: () => void;
  onReset: () => void;
  onSave?: () => Promise<string | null>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const places = profilePlaces(profile);
  const regions = profile.locations.remote_ok.filter((r) => r !== "remote");
  const parts = [
    profile.titles.include.slice(0, 3).join(", ") + (profile.titles.include.length > 3 ? ` +${profile.titles.include.length - 3}` : ""),
    places.countries.length ? places.countries.join(", ") : null,
    places.remote ? (regions.length ? `Remote in ${regions.slice(0, 3).map((r) => (r.length <= 4 ? r.toUpperCase() : r)).join(", ")}` : "Remote") : null,
    profile.industries.length ? profile.industries.map((i) => INDUSTRY_BY_ID.get(i)?.label ?? i).join(", ") : null,
  ].filter(Boolean);

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    setError(null);
    const err = await onSave();
    setSaving(false);
    setError(err);
  };

  return (
    <div className={cx("rounded-2xl border px-3 py-2.5 text-sm", changed ? "border-warn/50 bg-warn-soft/30" : "border-line bg-surface")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <UserRound className="size-4 shrink-0 text-muted" />
        <p className="min-w-0 flex-1">
          <span className="font-medium">Your profile:</span> <span className="text-muted">{parts.join(" · ")}</span>
        </p>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="size-3.5" /> Edit
        </Button>
      </div>
      {changed && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-warn/30 pt-2">
          <p className="min-w-0 flex-1 text-xs text-warn">
            Your place filters differ from your profile. This only changes what you see here; your scans and alerts still use your profile.
          </p>
          <Button size="sm" variant="ghost" onClick={onReset} disabled={saving}>
            Reset to my profile
          </Button>
          {onSave && (
            <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {saving ? "Saving…" : "Save to my profile"}
            </Button>
          )}
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-bad">{error}</p>}
    </div>
  );
}
