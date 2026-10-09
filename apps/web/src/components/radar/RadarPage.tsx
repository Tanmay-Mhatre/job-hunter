import { INDUSTRY_BY_ID } from "@rawjobs/core/catalog/industries";
import { ArrowRight, ArrowUpDown, Building2, Check, Globe, LoaderCircle, MapPin, Pencil, Plus, Search, SlidersHorizontal, Star, UserRound, X } from "lucide-react";
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
  hasNewTag,
  OLD_POSTING_DAYS,
  REMOTE,
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
import { displayPlace } from "../../lib/format";
import { load, save } from "../../lib/storage";
import type { Status, UserState } from "../../lib/userState";
import { Dialog } from "../Dialog";
import { JobDetail } from "../JobDetail";
import { toast } from "../Toast";
import { Button, Card, cx, IconButton } from "../ui";
import { FacetMenu, OptionList } from "./FacetMenu";
import { JobCard } from "./JobCard";

type Props = {
  jobs: Job[];
  meta: DataMeta;
  user: UserState;
  prefs: Prefs;
  /** Phones: open the job full screen. */
  onOpenOverlay: (job: Job) => void;
  overlayOpen: boolean;
  onStatus: (job: Job, s: Status) => void;
  onUpdate: (job: Job, patch: { status?: Status; note?: string }) => void;
  onApply: (job: Job) => void;
  onSaveView: (name: string, filters: Filters, sort: Sort) => SavedView;
  onRenameView: (id: string, name: string) => void;
  onDeleteView: (id: string) => void;
  /** Undo a delete: put the view back at its old position. */
  onRestoreView: (view: SavedView, index: number) => void;
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

const FILTER_KEY = "rawjobs.radar.v2";
/** "Show everywhere" was picked for these profile places (JSON); a change of places brings the place filter back. */
const EVERYWHERE_KEY = "rawjobs.radar.everywhere";
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
  // The Radar starts filtered to your places, said out loud in the profile bar, with "Show everywhere" to drop it
  // (remembered until your places change).
  const placesKey = JSON.stringify(profile.locations);
  const [everywhereFor, setEverywhereFor] = useState(() => load<string | null>(EVERYWHERE_KEY, null));
  const everywhere = everywhereFor === placesKey;
  const placeBase = useMemo(() => profileFilters(profile), [profileKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => (everywhere ? { ...placeBase, countries: [], locations: [] } : placeBase), [placeBase, everywhere]);
  const { filters, sort, setFilters, setSort, replace, adoptNextProfile } = useRadarFilters(base);
  const setEverywhere = (on: boolean) => {
    const v = on ? placesKey : null;
    setEverywhereFor(v);
    save(EVERYWHERE_KEY, v);
    setFilters(on ? { countries: [], locations: [] } : { countries: placeBase.countries, locations: placeBase.locations });
  };
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
  // "New to you": first found since the previous full scan. On the first scan everything would be, so nothing is.
  const fullRuns = p.meta.runs.filter((r) => !r.partial);
  const firstScan = fullRuns.length <= 1;
  const newSince = fullRuns[1] ? Date.parse(fullRuns[1].finishedAt) : undefined;
  const ctx: Ctx = useMemo(
    () => {
      const places = profilePlaces(profile);
      return {
        firstScan,
        newSince,
        user: p.user,
        min,
        industriesOf: (c: string) => industriesByCompany.get(c) ?? [],
        hiddenCompanies: hidden,
        isYours: p.isYours,
        mine: { countries: new Set([...places.countries, ...(places.remote ? ["Remote"] : [])]), locations: new Set(places.locations), industries: new Set(profile.industries) },
      };
    },
    [p.user, min, industriesByCompany, hidden, profileKey, p.isYours, firstScan, newSince], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Your companies' jobs always lead, whatever the sort.
  const visible = useMemo(() => sortJobs(applyFilters(pool, filters, ctx), sort, p.isYours), [pool, filters, ctx, sort, p.isYours]);
  const groups = useMemo(() => groupJobs(visible), [visible]);
  const counts = useMemo(() => facetCounts(pool, filters, ctx), [pool, filters, ctx]);
  const chips = activeChips(filters, ctx, base);
  // Postings older than ~6 months that the other filters would show: "Show older jobs (N)".
  const olderCount = useMemo(
    () => (filters.showOld ? 0 : applyFilters(pool, { ...filters, showOld: true }, ctx).length - visible.length),
    [pool, filters, ctx, visible.length],
  );

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
      if (e.key === "Enter" && t?.closest?.("button, a, [role=button]")) return;
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
  const hideCompany = (company: string, hide: boolean) => {
    p.onHideCompany(company, hide);
    if (hide)
      toast({
        message: (
          <>
            Hid all jobs from <b>{company}</b>.
          </>
        ),
        actionLabel: "Undo",
        onAction: () => p.onHideCompany(company, false),
      });
  };
  const deleteView = (view: SavedView) => {
    const index = p.prefs.views.findIndex((v) => v.id === view.id);
    p.onDeleteView(view.id);
    toast({ message: <>Deleted the view <b>{view.name}</b>.</>, actionLabel: "Undo", onAction: () => p.onRestoreView(view, index) });
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
        placeFilter={placeBase.countries}
        everywhere={everywhere}
        onEverywhere={setEverywhere}
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
              className="h-9 w-full rounded-md border border-line bg-raised pl-8 pr-3 type-small outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          <label className="relative inline-flex items-center">
            <ArrowUpDown className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort"
              className="h-9 appearance-none rounded-md border border-line bg-raised pl-8 pr-3 type-small outline-none focus:border-accent"
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
          hideNew={firstScan}
          onPick={replace}
          onSave={(name) => p.onSaveView(name, filters, sort)}
          onRename={p.onRenameView}
          onDelete={deleteView}
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
          <MoreMenu filters={filters} setFilters={setFilters} ats={facet("ats")} olderCount={olderCount} hiddenCompanies={p.prefs.hiddenCompanies} onUnhide={(c) => p.onHideCompany(c, false)} />
        </div>

        {(chips.length > 0 || olderCount > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilters(c.remove)}
                className="inline-flex h-7 items-center gap-1 rounded-sm bg-accent-subtle px-2.5 type-meta font-medium text-accent-text hover:opacity-80"
                aria-label={`Remove filter: ${c.label}`}
              >
                {c.label} <X className="size-3" />
              </button>
            ))}
            {chips.length > 0 && (
              <button type="button" onClick={() => replace(base, sort)} className="ml-1 h-7 rounded-md px-1.5 type-meta font-medium text-muted hover:bg-inset hover:text-ink">
                Clear all
              </button>
            )}
            {olderCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters({ showOld: true })}
                className="h-7 rounded-md px-1.5 type-meta font-medium text-accent-text hover:bg-inset"
                title={`Postings older than ${OLD_POSTING_DAYS / 30} months are hidden: they're usually filled`}
              >
                Show older jobs ({olderCount})
              </button>
            )}
            <span className="tabular ml-auto type-meta text-muted">
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
          <p className="mx-auto mt-1 max-w-md type-small text-muted">Add the companies you'd love to work at: we check them every scan, and their jobs always come first here.</p>
          <Button variant="primary" className="mt-4" onClick={p.onCompanies}>
            Pick my companies <ArrowRight className="size-4" />
          </Button>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="font-medium">{filters.match === "strong" ? "No strong matches yet." : "No jobs match these filters."}</p>
          {filters.match === "strong" && (
            <p className="mx-auto mt-1 max-w-md type-small text-muted">
              Strong matches need the right title and place, and a description that mentions your topics.{" "}
              <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => (location.hash = "settings?section=keywords")}>
                {Object.keys(p.profile?.keywords ?? {}).length ? "Add more topics" : "Add topics"}
              </button>{" "}
              to find more.
            </p>
          )}
          {relax.length > 0 ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {relax.map((r) => (
                <Button key={r.label} size="sm" onClick={() => setFilters(r.remove)}>
                  Remove {r.label} → {r.count} job{r.count === 1 ? "" : "s"}
                </Button>
              ))}
            </div>
          ) : filters.mine ? (
            <p className="mt-1 type-small text-muted">None of your companies has a matching job right now. We'll keep scanning them.</p>
          ) : (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="primary" onClick={() => replace(base, sort)}>
                Clear filters
              </Button>
              {olderCount > 0 && (
                <Button size="sm" onClick={() => setFilters({ showOld: true })}>
                  Show older jobs ({olderCount})
                </Button>
              )}
            </div>
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
                    isNew={hasNewTag(g.lead, ctx)}
                    selected={!!selectedGroup && g.key === selectedGroup.key && (wide || p.overlayOpen)}
                    onSelect={() => select(g.lead)}
                    onStatus={(s) => p.onStatus(g.lead, s)}
                    yours={p.isYours(g.lead)}
                  />
                  </Fragment>
                ))}
                {limit < groups.length && (
                  <li ref={sentinel} className="flex items-center justify-center gap-2 py-4 type-meta text-muted">
                    <LoaderCircle className="size-3.5 animate-spin" /> Loading more…
                  </li>
                )}
              </ul>
            </div>
          </Card>
          {wide && (
            <Card className="hidden overflow-hidden lg:sticky lg:top-[4.5rem] lg:block lg:h-[calc(100dvh-5.5rem)]">
              {detailProps ? <JobDetail {...detailProps} /> : <p className="p-6 type-small text-muted">Pick a job to see the details.</p>}
            </Card>
          )}
        </div>
      )}

      {sheet && !wide && (
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
            <MoreToggles filters={filters} setFilters={setFilters} olderCount={olderCount} />
          </SheetSection>
          {facet("ats").length > 1 && (
            <SheetSection label="Hiring system">
              <OptionList label="Hiring system" options={facet("ats")} selected={filters.ats} onChange={(v) => setFilters({ ats: v })} />
            </SheetSection>
          )}
        </FilterSheet>
      )}

    </div>
  );
}

/** A section title inside the job list ("Your companies", "All jobs for you"). */
function ListHeading({ children }: { children: ReactNode }) {
  return (
    <li className="sticky top-0 z-10 border-b border-line bg-inset/95 px-3 py-1.5 backdrop-blur">
      {/* A real heading, so the job titles (h3) sit under it. */}
      <h2 className="type-meta font-semibold uppercase tracking-wide text-muted">{children}</h2>
    </li>
  );
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
  /** First scan: every job would be new, so there's no New view. */
  hideNew?: boolean;
  onPick: (f: Filters, s: Sort) => void;
  onSave: (name: string) => SavedView;
  onRename: (id: string, name: string) => void;
  onDelete: (view: SavedView) => void;
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
      {BUILT_IN.filter((b) => !(b.id === "new" && props.hideNew)).map((b) => {
        const on = builtInActive?.id === b.id && !customActive;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => props.onPick({ ...props.base, ...b.filters }, props.sort)}
            aria-pressed={on}
            title={b.id === "new" ? "New to you since your last scan" : undefined}
            className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 type-label", on ? "bg-ink text-raised" : "text-muted hover:bg-inset hover:text-ink")}
          >
            {b.label}
            {b.id !== "applied" && <span className={cx("tabular type-meta", !on && (b.id === "new" && props.counts.new > 0 ? "text-accent-text" : "text-muted"))}>{props.counts[b.count]}</span>}
          </button>
        );
      })}
      <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
      {props.views.map((v) =>
        naming?.id === v.id ? (
          <NameInput key={v.id} value={naming.value} onChange={(value) => setNaming({ id: v.id, value })} onSubmit={submit} onCancel={() => setNaming(null)} />
        ) : (
          <span key={v.id} className={cx("group inline-flex h-8 shrink-0 items-center rounded-md type-label", customActive?.id === v.id ? "bg-ink text-raised" : "text-muted hover:bg-inset hover:text-ink")}>
            <button
              type="button"
              className="inline-flex h-full items-center gap-1 pl-2.5 pr-1"
              onClick={() => props.onPick(v.filters, v.sort)}
              onDoubleClick={() => setNaming({ id: v.id, value: v.name })}
              aria-pressed={customActive?.id === v.id}
            >
              <Star className="size-3.5" /> {v.name}
            </button>
            {/* Rename and delete: 24px targets that work with keyboard and touch, not only double-click. */}
            <button type="button" className="inline-flex size-6 items-center justify-center rounded-md opacity-60 hover:opacity-100 focus-visible:opacity-100" onClick={() => setNaming({ id: v.id, value: v.name })} aria-label={`Rename view ${v.name}`} title="Rename">
              <Pencil className="size-3.5" />
            </button>
            <button type="button" className="mr-1 inline-flex size-6 items-center justify-center rounded-md opacity-60 hover:opacity-100 focus-visible:opacity-100" onClick={() => props.onDelete(v)} aria-label={`Delete view ${v.name}`} title="Delete">
              <X className="size-3.5" />
            </button>
          </span>
        ),
      )}
      {naming && !naming.id ? (
        <NameInput value={naming.value} onChange={(value) => setNaming({ value })} onSubmit={submit} onCancel={() => setNaming(null)} />
      ) : (
        !customActive &&
        (!builtInActive || props.sort !== "best") && (
          <button type="button" onClick={() => setNaming({ value: "" })} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 type-label text-accent-text hover:bg-inset">
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
        className="h-8 w-40 rounded-md border border-accent bg-raised px-2 type-small outline-none"
      />
      <button type="button" onClick={onSubmit} className="inline-flex size-8 items-center justify-center rounded-md text-accent-text" aria-label="Save view name">
        <Check className="size-4" />
      </button>
    </span>
  );
}

// ---------- "More" filters ----------

function MoreToggles({ filters, setFilters, olderCount }: { filters: Filters; setFilters: (p: Partial<Filters>) => void; olderCount: number }) {
  const rows: [keyof Filters, string][] = [
    ["salaryOnly", "Salary listed"],
    ["showOld", `Show older jobs${olderCount ? ` (${olderCount})` : ""}: posted over ${OLD_POSTING_DAYS / 30} months ago`],
    ["showFailed", "Include jobs that failed your filters"],
    ["showClosed", "Include closed jobs"],
    ["showHidden", "Include hidden jobs and companies"],
    ["olderIndex", `Include not-yet-scanned jobs older than ${INDEX_MAX_AGE_DAYS} days`],
  ];
  return (
    <div className="space-y-0.5">
      {rows.map(([k, label]) => (
        <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 type-small hover:bg-inset">
          <input type="checkbox" checked={filters[k] as boolean} onChange={(e) => setFilters({ [k]: e.target.checked })} className="size-4 accent-accent" />
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
  olderCount,
  hiddenCompanies,
  onUnhide,
}: {
  filters: Filters;
  setFilters: (p: Partial<Filters>) => void;
  ats: FacetOption[];
  olderCount: number;
  hiddenCompanies: string[];
  onUnhide: (company: string) => void;
}) {
  const extra = [filters.salaryOnly, filters.showOld, filters.showFailed, filters.showClosed, filters.showHidden, filters.olderIndex].filter(Boolean).length + filters.ats.length;
  return (
    <FacetMenu
      label={extra ? `More · ${extra}` : "More"}
      options={ats.length > 1 ? ats : []}
      optionsLabel="Hiring system"
      selected={filters.ats}
      onChange={(v) => setFilters({ ats: v })}
      footer={
        <div className="mt-1 border-t border-line pt-1">
          <MoreToggles filters={filters} setFilters={setFilters} olderCount={olderCount} />
          {hiddenCompanies.length > 0 && (
            <div className="mt-1 border-t border-line px-2 pt-2">
              <p className="mb-1 type-meta font-semibold text-muted">Hidden companies</p>
              <ul className="space-y-0.5">
                {hiddenCompanies.map((c) => (
                  <li key={c} className="flex items-center justify-between type-small">
                    <span className="truncate">{c}</span>
                    <button type="button" className="h-7 rounded-md px-1.5 type-meta font-medium text-accent-text hover:bg-inset" onClick={() => onUnhide(c)} aria-label={`Show ${c} again`}>
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
    <Dialog open onClose={onClose} labelledBy="filter-sheet-title" placement="bottom">
      <div className="flex max-h-[85dvh] flex-col rounded-t-md border border-line bg-raised shadow-l3 sm:rounded-md">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="filter-sheet-title" className="type-body font-semibold">
            Filters
          </h2>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onClear}>
              Clear all
            </Button>
            <IconButton label="Close" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
        <footer className="border-t border-line p-3">
          <Button variant="primary" className="w-full" onClick={onClose}>
            Show {count} {count === 1 ? "job" : "jobs"}
          </Button>
        </footer>
      </div>
    </Dialog>
  );
}

function SheetSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 type-meta font-semibold uppercase tracking-wide text-muted">{label}</h3>
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
  placeFilter,
  everywhere,
  onEverywhere,
  changed,
  onEdit,
  onReset,
  onSave,
}: {
  profile: Profile;
  /** The place filter your profile puts on the Radar ("Germany", "Remote"). */
  placeFilter: string[];
  /** "Show everywhere" is on: the place filter is off. */
  everywhere: boolean;
  onEverywhere: (on: boolean) => void;
  changed: boolean;
  onEdit: () => void;
  onReset: () => void;
  onSave?: () => Promise<string | null>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const regions = profile.locations.remote_ok.filter((r) => r !== "remote");
  // The places you actually picked ("Berlin"), not the countries we filter by.
  const yourPlaces = profile.locations.include.map(displayPlace);
  const parts = [
    profile.titles.include.slice(0, 3).join(", ") + (profile.titles.include.length > 3 ? ` +${profile.titles.include.length - 3}` : ""),
    yourPlaces.length ? yourPlaces.slice(0, 4).join(", ") + (yourPlaces.length > 4 ? ` +${yourPlaces.length - 4}` : "") : null,
    profile.locations.remote_ok.length ? (regions.length ? `Remote in ${regions.slice(0, 3).map((r) => (r.length <= 4 ? r.toUpperCase() : displayPlace(r))).join(", ")}` : "Remote") : null,
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
    <div className={cx("rounded-md border px-3 py-2.5 type-small", changed ? "border-warning/50 bg-warning-subtle/30" : "border-line bg-raised")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <UserRound className="size-4 shrink-0 text-muted" />
        <p className="min-w-0 flex-1">
          <span className="font-medium">Your profile:</span> <span className="text-muted">{parts.join(" · ")}</span>
        </p>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="size-3.5" /> Edit
        </Button>
      </div>
      {placeFilter.length > 0 && !changed && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-7 type-meta text-muted">
          {everywhere ? (
            <>
              <Globe className="size-3.5 shrink-0" /> Showing jobs everywhere.
              <button type="button" className="h-7 rounded-md px-1.5 font-medium text-accent-text hover:bg-inset" onClick={() => onEverywhere(false)}>
                Show only my places
              </button>
            </>
          ) : (
            <>
              <MapPin className="size-3.5 shrink-0" /> Showing your places: {placeFilter.map((c) => (c === REMOTE ? "Remote" : displayPlace(c))).join(", ")}.
              <button type="button" className="h-7 rounded-md px-1.5 font-medium text-accent-text hover:bg-inset" onClick={() => onEverywhere(true)}>
                Show everywhere
              </button>
            </>
          )}
        </p>
      )}
      {changed && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-warning/30 pt-2">
          <p className="min-w-0 flex-1 type-meta text-warning-text">
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
      {error && <p className="mt-1.5 type-meta text-danger-text">{error}</p>}
    </div>
  );
}
