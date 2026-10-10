import { INDUSTRY_BY_ID } from "@rawjobs/core/catalog/industries";
import { ArrowRight, ArrowUpDown, Building2, Check, Globe, LoaderCircle, MapPin, Pencil, Plus, Search, SlidersHorizontal, Star, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useOtherJobs, type DataMeta, type Job, type Profile } from "../../lib/data";
import {
  activeChips,
  applyFilters,
  DEFAULT_FILTERS,
  facetCounts,
  foldCompanies,
  fromQuery,
  groupJobs,
  INDEX_MAX_AGE_DAYS,
  hasNewTag,
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
  type FeedRow,
  type Filters,
  type JobGroup,
  type Sort,
} from "../../lib/filters";
import { offerWhat, ruleKey, ruleLabel, type HideRule } from "../../lib/notForMe";
import type { Prefs, SavedView } from "../../lib/prefs";
import type { FilterPicks } from "../../lib/profileSync";
import { displayPlace, postedOrSeen, timeAgo } from "../../lib/format";
import { useDensity, useMaxAge } from "../../lib/theme";
import { load, save } from "../../lib/storage";
import type { Status, UserState } from "../../lib/userState";
import { Dialog } from "../Dialog";
import { JobDetail } from "../JobDetail";
import { toast } from "../Toast";
import { Chip, IconButton, SearchField, Tabs } from "../primitives";
import { Button, Card, cx } from "../ui";
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
  /** Turn a Not interested rule ("Senior roles") off, or back on (Undo). */
  onSetRule: (rule: HideRule, on: boolean) => void;
  /** Is this job at one of your companies? Starred, nudged up in Best match, and in a strip on top. */
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
/** Your companies' freshest roles shown above the list in Best match. */
const STRIP = 3;
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

/** The time freshness is worked out at, moved on every hour: often enough to stay right, never while you read. */
function useHourlyNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 3_600_000);
    return () => clearInterval(id);
  }, []);
  return now;
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
  const density = useDensity();
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
  // One clock for filters, tags and order, moved on every hour.
  const now = useHourlyNow();
  const maxAgeDays = useMaxAge();
  const ctx: Ctx = useMemo(
    () => {
      const places = profilePlaces(profile);
      return {
        firstScan,
        newSince,
        now,
        maxAgeDays,
        user: p.user,
        min,
        industriesOf: (c: string) => industriesByCompany.get(c) ?? [],
        hiddenCompanies: hidden,
        hideRules: p.prefs.hideRules,
        isYours: p.isYours,
        mine: { countries: new Set([...places.countries, ...(places.remote ? ["Remote"] : [])]), locations: new Set(places.locations), industries: new Set(profile.industries) },
      };
    },
    [p.user, min, industriesByCompany, hidden, p.prefs.hideRules, profileKey, p.isYours, firstScan, newSince, now, maxAgeDays], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // One list, in the order you picked: your companies are starred and nudged up in Best match, never pinned.
  const visible = useMemo(() => sortJobs(applyFilters(pool, filters, ctx), sort, p.isYours, now), [pool, filters, ctx, sort, p.isYours, now]);
  const groups = useMemo(() => groupJobs(visible), [visible]);
  // One company can't fill the page ("+N more at …"), except in Newest (a plain date order) and when you've
  // picked companies yourself.
  const [openCompanies, setOpenCompanies] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => setOpenCompanies(new Set()), [filters, sort]);
  const fold = sort !== "newest" && !filters.mine && !filters.companies.length;
  const rows: FeedRow[] = useMemo(() => (fold ? foldCompanies(groups, openCompanies) : groups.map((group) => ({ kind: "group" as const, group }))), [fold, groups, openCompanies]);
  /** The roles J/K steps through: the list's rows, folded ones left out. */
  const navGroups = useMemo(() => rows.flatMap((r) => (r.kind === "group" ? [r.group] : [])), [rows]);
  const counts = useMemo(() => facetCounts(pool, filters, ctx), [pool, filters, ctx]);
  const chips = activeChips(filters, ctx, base);
  // Postings past your age limit that the other filters would show: "Show older jobs (N)".
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
  // Best match: your companies' freshest roles, above the list (they're in it too, at their own rank).
  const strip = useMemo(
    () => (sort === "best" && !filters.mine ? groups.filter((g) => p.isYours(g.lead)).sort((a, b) => postedOrSeen(b.lead).localeCompare(postedOrSeen(a.lead))).slice(0, STRIP) : []),
    [sort, filters.mine, groups, p.isYours],
  );
  // The newest job in the list, said in the head when the list isn't sorted by date.
  const newest = useMemo(() => (sort === "newest" ? undefined : visible.reduce<string | undefined>((m, j) => (!m || postedOrSeen(j) > m ? postedOrSeen(j) : m), undefined)), [sort, visible]);
  const noCompaniesYet = filters.mine && p.companyCount === 0;

  // ----- list paging and selection -----
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [filters, sort]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedGroup = groups.find((g) => g.jobs.some((j) => j.id === selectedId)) ?? (wide ? navGroups[0] : undefined);
  const selected = selectedGroup?.jobs.find((j) => j.id === selectedId) ?? selectedGroup?.lead;
  const index = selectedGroup ? navGroups.indexOf(selectedGroup) : -1;
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const sentinel = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setLimit((l) => l + PAGE), { root: wide ? listRef.current : null, rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [wide, rows.length, limit]);

  const select = useCallback(
    (job: Job) => {
      setSelectedId(job.id);
      if (!wide) p.onOpenOverlay(job);
    },
    [wide, p],
  );
  /**
   * J/K move focus between rows (design/components/Feed): after the selection changes and the row is
   * rendered with aria-current, focus its title, so focus and the current row never disagree. Not while
   * the phone drawer is open: the list behind it is inert.
   */
  const focusPending = useRef<string | null>(null);
  useEffect(() => {
    const key = focusPending.current;
    if (!key || !selectedGroup || selectedGroup.key !== key) return;
    focusPending.current = null;
    const row = rowRefs.current.get(key);
    if (!(!wide && p.overlayOpen)) row?.querySelector<HTMLElement>("[data-job-link]")?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
  });
  const move = useCallback(
    (d: number) => {
      if (!navGroups.length) return;
      const next = Math.max(0, Math.min(navGroups.length - 1, (index < 0 ? -1 : index) + d));
      const g = navGroups[next]!;
      const row = rows.findIndex((r) => r.kind === "group" && r.group === g);
      if (row >= limit) setLimit(row + PAGE);
      setSelectedId(g.lead.id);
      if (!wide && p.overlayOpen) p.onOpenOverlay(g.lead);
      // Focus moves once the new row is rendered and marked current (the effect below).
      focusPending.current = g.key;
    },
    [navGroups, rows, index, limit, wide, p],
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
  const removeRule = (rule: HideRule) => {
    p.onSetRule(rule, false);
    toast({ message: <>Showing {offerWhat({ kind: "rule", rule })} again.</>, actionLabel: "Undo", onAction: () => p.onSetRule(rule, true) });
  };
  const deleteView = (view: SavedView) => {
    const index = p.prefs.views.findIndex((v) => v.id === view.id);
    p.onDeleteView(view.id);
    toast({ message: <>Deleted the view <b>{view.name}</b>.</>, actionLabel: "Undo", onAction: () => p.onRestoreView(view, index) });
  };

  const [sheet, setSheet] = useState(false);
  /** Laptops and up: the filter row under the search, opened with Filters. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const facet = (key: FacetKey) => counts[key];
  const relax = groups.length === 0 ? suggestRelax(pool, filters, ctx) : [];

  /** One role's row; only the list's rows (`listed`) are where J/K moves focus to. */
  const card = (g: JobGroup, listed: boolean) => (
    <JobCard
      key={listed ? g.key : `strip:${g.key}`}
      ref={
        listed
          ? (el) => {
              if (el) rowRefs.current.set(g.key, el);
              else rowRefs.current.delete(g.key);
            }
          : undefined
      }
      group={g}
      entry={p.user[g.lead.id]}
      min={min}
      isNew={hasNewTag(g.lead, ctx)}
      selected={!!selectedGroup && g.key === selectedGroup.key && (wide || p.overlayOpen)}
      onSelect={() => select(g.lead)}
      onStatus={(st) => p.onStatus(g.lead, st)}
      yours={p.isYours(g.lead)}
    />
  );

  // One list (design/components/Feed), paged; in Best match, your companies' strip above it.
  const shown = rows.slice(0, limit);

  const detailProps = selected && {
    job: selected,
    isNew: hasNewTag(selected, ctx),
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
    onNext: index < navGroups.length - 1 ? () => move(1) : undefined,
  };

  // Have the place or industry filters moved away from your profile?
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const changedFromProfile = !sameSet(filters.countries, base.countries) || !sameSet(filters.locations, base.locations);

  const profileBar = (
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
  );
  // Laptops and up: one row of views, search, sort and Filters, so the feed starts high and the job's
  // Apply stays in view. The filters, active chips and your profile line open under it on request.
  // Phones keep the profile line on top and the filter sheet. A profile that differs needs a decision,
  // so that line always shows.
  const profileOutside = !wide || changedFromProfile;

  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      {profileOutside && profileBar}

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:gap-3">
          <ViewsBar
            className="order-3 w-full lg:order-none lg:w-auto lg:min-w-0 lg:flex-1"
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
          <SearchField
            ref={searchRef}
            label="Search jobs"
            className="order-1 min-w-0 flex-1 basis-40 lg:order-none lg:w-48 lg:flex-none lg:basis-auto xl:w-64"
            value={filters.q}
            onChange={(e) => setFilters({ q: e.target.value })}
            onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), setFilters({ q: "" }))}
            placeholder="Search jobs"
          />
          {/* Phones sort in the filter sheet, so search and Filters share one row. */}
          <label className="relative hidden shrink-0 items-center lg:inline-flex">
            <ArrowUpDown className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="h-9 appearance-none rounded-md border border-line bg-raised pl-8 pr-3 type-small">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="order-2 shrink-0 lg:order-none"
            aria-expanded={wide ? filtersOpen : undefined}
            aria-controls={wide ? "radar-filters" : undefined}
            aria-pressed={chips.length > 0 || undefined}
            onClick={() => (wide ? setFiltersOpen((o) => !o) : setSheet(true))}
          >
            <SlidersHorizontal className="rj-icon" aria-hidden /> Filters{chips.length ? ` · ${chips.length}` : ""}
          </Button>
        </div>

        {wide && filtersOpen && (
          <div id="radar-filters" className="mt-3 space-y-2 border-t border-hairline pt-3">
            {!profileOutside && profileBar}
            <div className="flex flex-wrap items-center gap-1.5">
              <FacetMenu label="Date posted" single options={facet("posted")} selected={filters.posted ? [String(filters.posted)] : []} onChange={(v) => setFilters({ posted: (Number(v[0]) || 0) as Filters["posted"] })} />
              <FacetMenu label="Country" searchable options={facet("countries")} selected={filters.countries} onChange={(v) => setFilters({ countries: v })} />
              <FacetMenu label="Location" searchable options={facet("locations")} selected={filters.locations} onChange={(v) => setFilters({ locations: v })} />
              <FacetMenu label="Workplace" options={facet("workplace")} selected={filters.workplace} onChange={(v) => setFilters({ workplace: v as Filters["workplace"] })} />
              <FacetMenu label="Seniority" options={facet("seniority")} selected={filters.seniority} onChange={(v) => setFilters({ seniority: v as Filters["seniority"] })} />
              {facet("industries").length > 0 && <FacetMenu label="Industry" options={facet("industries")} selected={filters.industries} onChange={(v) => setFilters({ industries: v })} />}
              <FacetMenu label="Company" searchable options={facet("companies")} selected={filters.companies} onChange={(v) => setFilters({ companies: v })} />
              {facet("topics").length > 0 && <FacetMenu label="Keywords" searchable options={facet("topics")} selected={filters.topics} onChange={(v) => setFilters({ topics: v })} />}
              <FacetMenu label="Match" single options={facet("match")} selected={filters.match === "all" ? [] : [filters.match]} onChange={(v) => setFilters({ match: (v[0] as Filters["match"]) ?? "all" })} />
              <MoreMenu filters={filters} setFilters={setFilters} ats={facet("ats")} olderCount={olderCount} maxAgeDays={maxAgeDays} hiddenCompanies={p.prefs.hiddenCompanies} onUnhide={(c) => p.onHideCompany(c, false)} hideRules={p.prefs.hideRules} onRemoveRule={removeRule} />
            </div>
          </div>
        )}

        {(chips.length > 0 || olderCount > 0) && (wide ? filtersOpen : true) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2">
            {chips.map((c) => (
              // An active filter: pressed; pressing it turns it off.
              <Chip key={c.key} pressed onClick={() => setFilters(c.remove)} aria-label={`Filter: ${c.label}`} title="Remove this filter">
                {c.label} <X className="rj-icon" aria-hidden />
              </Chip>
            ))}
            {chips.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => replace(base, sort)}>
                Clear all
              </Button>
            )}
            {olderCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setFilters({ showOld: true })} title={`Postings older than ${ageLimit(maxAgeDays)} are hidden: they're usually filled. Change this in Settings › Job list.`}>
                Show older jobs ({olderCount})
              </Button>
            )}
          </div>
        )}
      </Card>

      {noCompaniesYet ? (
        <div className="rj-panel">
          <div className="rj-empty">
            <h2 className="rj-empty__title">No companies picked yet</h2>
            <p className="rj-empty__body">Add the companies you'd love to work at. They're checked every scan, starred in your list, and their newest jobs show on top.</p>
            <div className="rj-empty__actions">
              <Button variant="primary" onClick={p.onCompanies}>
                Pick my companies <ArrowRight className="rj-icon" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="rj-panel">
          <div className="rj-empty">
            <h2 className="rj-empty__title">{filters.match === "strong" ? "No strong matches yet" : "No jobs match these filters"}</h2>
            {filters.match === "strong" && (
              <p className="rj-empty__body">
                Strong matches need the right title and place, and a description that mentions your keywords.{" "}
                <button type="button" className="font-medium text-ink underline underline-offset-2" onClick={() => (location.hash = "settings?section=keywords")}>
                  {Object.keys(p.profile?.keywords ?? {}).length ? "Add more keywords" : "Add keywords"}
                </button>{" "}
                to find more.
              </p>
            )}
            {relax.length > 0 ? (
              <div className="rj-empty__actions">
                {relax.map((r) => (
                  <Button key={r.label} onClick={() => setFilters(r.remove)}>
                    Remove {r.label}: {r.count} job{r.count === 1 ? "" : "s"}
                  </Button>
                ))}
              </div>
            ) : filters.mine ? (
              <p className="rj-empty__body">None of your companies has a matching job right now. They're checked again every scan.</p>
            ) : (
              <div className="rj-empty__actions">
                <Button variant="primary" onClick={() => replace(base, sort)}>
                  Clear filters
                </Button>
                {olderCount > 0 && <Button onClick={() => setFilters({ showOld: true })}>Show older jobs ({olderCount})</Button>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-3">
          {/* design/components/Feed: an L1 panel, a summary line, then one list (in Best match, your companies' strip first). */}
          <section aria-label="Jobs for you" className="rj-panel rj-feed lg:flex lg:h-full lg:min-h-0 lg:flex-col" data-density={density}>
            <div className="rj-feed__head">
              <span>
                {groups.length} {groups.length === 1 ? "job" : "jobs"}
                {!firstScan && newCount > 0 && ` · ${newCount} new`}
                {newest && (
                  <>
                    {" · "}
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => setSort("newest")} title="Sort by newest">
                      newest {timeAgo(newest, now)}
                    </button>
                  </>
                )}
                {p.meta.runs[0] && ` · checked ${timeAgo(p.meta.runs[0].finishedAt)}`}
              </span>
              {/* Laptops show the sort control just above, and keep your profile line in the Filters panel:
                  this opens it, so what's being matched is one click away. Phones sort in the filter
                  sheet; this opens it. */}
              {wide && !profileOutside && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                  aria-expanded={filtersOpen}
                  aria-controls="radar-filters"
                  onClick={() => setFiltersOpen((o) => !o)}
                >
                  <UserRound className="size-3" aria-hidden /> Your profile
                </button>
              )}
              {!wide && (
                <button type="button" className="inline-flex items-center gap-1 underline-offset-2 hover:underline" onClick={() => setSheet(true)} aria-label={`Sorted by ${SORTS.find((x) => x.value === sort)?.label}. Change sort`}>
                  <ArrowUpDown className="size-3" aria-hidden />
                  {SORTS.find((x) => x.value === sort)?.label}
                </button>
              )}
            </div>
            <div ref={listRef} className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {strip.length > 0 && (
                <>
                  <h2 className="rj-feed__section" id="feed-mine">
                    Latest at my companies <span className="tabular font-normal">{yourGroups}</span>
                  </h2>
                  <ul className="rj-feed__list" aria-labelledby="feed-mine">
                    {strip.map((g) => card(g, false))}
                    {yourGroups > strip.length && (
                      <li className="px-4 py-2">
                        <Button variant="ghost" size="sm" onClick={() => setFilters({ mine: true })}>
                          See all {yourGroups} from my companies <ArrowRight className="rj-icon" aria-hidden />
                        </Button>
                      </li>
                    )}
                  </ul>
                  <h2 className="rj-feed__section sticky top-0 z-sticky" id="feed-all">
                    All jobs <span className="tabular font-normal">{groups.length}</span>
                  </h2>
                </>
              )}
              <ul className="rj-feed__list" aria-labelledby={strip.length ? "feed-all" : undefined} aria-label={strip.length ? undefined : "Jobs"}>
                {shown.map((r) =>
                  r.kind === "group" ? (
                    card(r.group, true)
                  ) : (
                    <li key={`more:${r.company}`} className="px-4 py-2">
                      <Button variant="ghost" size="sm" onClick={() => setOpenCompanies((s) => new Set([...s, r.company]))}>
                        +{r.groups.length} more at {r.company}
                      </Button>
                    </li>
                  ),
                )}
                {limit < rows.length && (
                  <li ref={sentinel} className="flex items-center gap-2 px-4 py-4 type-small text-muted">
                    <LoaderCircle className="rj-icon animate-spin" aria-hidden /> Loading more…
                  </li>
                )}
              </ul>
            </div>
          </section>
          {wide && (
            <Card className="hidden overflow-hidden lg:block lg:h-full lg:min-h-0">
              {detailProps ? <JobDetail {...detailProps} /> : <p className="p-6 type-small text-muted">Pick a job to see the details.</p>}
            </Card>
          )}
        </div>
      )}

      {sheet && !wide && (
        <FilterSheet onClose={() => setSheet(false)} count={groups.length} onClear={() => replace(base, sort)}>
          <SheetSection label="Sort by">
            <SortOptions sort={sort} onChange={setSort} />
          </SheetSection>
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
            <MoreToggles filters={filters} setFilters={setFilters} olderCount={olderCount} maxAgeDays={maxAgeDays} />
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

// ---------- views ----------

const BUILT_IN: { id: string; label: string; filters: Partial<Filters>; count: keyof ViewCounts }[] = [
  { id: "all", label: "All", filters: {}, count: "all" },
  { id: "mine", label: "My companies", filters: { mine: true }, count: "mine" },
  { id: "new", label: "New", filters: { status: "new" }, count: "new" },
  { id: "strong", label: "Strong", filters: { match: "strong" }, count: "strong" },
  { id: "saved", label: "Saved", filters: { status: "saved" }, count: "saved" },
  { id: "applied", label: "Applied", filters: { status: "applied" }, count: "all" },
];
type ViewCounts = { all: number; mine: number; new: number; strong: number; saved: number };

function ViewsBar(props: {
  className?: string;
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

  const builtIns = BUILT_IN.filter((b) => !(b.id === "new" && props.hideNew));
  const tabValue = builtInActive && !customActive ? builtInActive.id : "";
  return (
    <div className={cx("flex flex-wrap items-end gap-x-4 gap-y-2 lg:flex-nowrap", props.className)}>
      {/* design/components/Tabs: views of one list, ink underline. */}
      <Tabs
        label="Radar views"
        idPrefix="view"
        className="min-w-0 flex-1"
        value={tabValue}
        onChange={(id) => {
          const b = builtIns.find((x) => x.id === id);
          if (b) props.onPick({ ...props.base, ...b.filters }, props.sort);
        }}
        items={builtIns.map((b) => ({ id: b.id, label: b.label, count: b.id === "applied" ? undefined : props.counts[b.count] }))}
      />
      {(props.views.length > 0 || naming || !customActive) && (
        <div className="flex flex-wrap items-center gap-2 pb-1">
          {props.views.map((v) =>
            naming?.id === v.id ? (
              <NameInput key={v.id} value={naming.value} onChange={(value) => setNaming({ id: v.id, value })} onSubmit={submit} onCancel={() => setNaming(null)} />
            ) : (
              <span key={v.id} className="inline-flex items-center gap-0.5">
                <Chip pressed={customActive?.id === v.id} onClick={() => props.onPick(v.filters, v.sort)} onDoubleClick={() => setNaming({ id: v.id, value: v.name })}>
                  {v.name}
                </Chip>
                <IconButton label={`Rename view ${v.name}`} size="sm" onClick={() => setNaming({ id: v.id, value: v.name })}>
                  <Pencil className="rj-icon" aria-hidden />
                </IconButton>
                <IconButton label={`Delete view ${v.name}`} size="sm" onClick={() => props.onDelete(v)}>
                  <X className="rj-icon" aria-hidden />
                </IconButton>
              </span>
            ),
          )}
          {naming && !naming.id ? (
            <NameInput value={naming.value} onChange={(value) => setNaming({ value })} onSubmit={submit} onCancel={() => setNaming(null)} />
          ) : (
            !customActive &&
            (!builtInActive || props.sort !== "best") && (
              <Button size="sm" variant="ghost" onClick={() => setNaming({ value: "" })}>
                <Plus className="rj-icon" aria-hidden /> Save view
              </Button>
            )
          )}
        </div>
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
        className="h-8 w-40 rounded-md border border-control bg-raised px-2 type-small"
      />
      <IconButton label="Save view name" size="sm" onClick={onSubmit}>
        <Check className="rj-icon" aria-hidden />
      </IconButton>
    </span>
  );
}

// ---------- "More" filters ----------

/** "3 months", "1 month", "60 days". */
const ageLimit = (days: number) => (days % 30 === 0 ? (days === 30 ? "1 month" : `${days / 30} months`) : `${days} days`);

function MoreToggles({ filters, setFilters, olderCount, maxAgeDays }: { filters: Filters; setFilters: (p: Partial<Filters>) => void; olderCount: number; maxAgeDays: number }) {
  const rows: [keyof Filters, string][] = [
    ["salaryOnly", "Salary listed"],
    ...(maxAgeDays ? [["showOld", `Show older jobs${olderCount ? ` (${olderCount})` : ""}: posted over ${ageLimit(maxAgeDays)} ago`] as [keyof Filters, string]] : []),
    ["showFailed", "Include jobs that failed your filters"],
    ["showClosed", "Include closed jobs"],
    ["showHidden", "Include hidden jobs and companies"],
    ["olderIndex", `Include not-yet-scanned jobs older than ${INDEX_MAX_AGE_DAYS} days`],
  ];
  return (
    <div className="space-y-0.5">
      {rows.map(([k, label]) => (
        <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 type-small hover:bg-inset">
          <input type="checkbox" checked={filters[k] as boolean} onChange={(e) => setFilters({ [k]: e.target.checked })} className="size-4 accent-ink" />
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
  maxAgeDays,
  hiddenCompanies,
  onUnhide,
  hideRules,
  onRemoveRule,
}: {
  filters: Filters;
  setFilters: (p: Partial<Filters>) => void;
  ats: FacetOption[];
  olderCount: number;
  maxAgeDays: number;
  hiddenCompanies: string[];
  onUnhide: (company: string) => void;
  hideRules: HideRule[];
  onRemoveRule: (rule: HideRule) => void;
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
          <MoreToggles filters={filters} setFilters={setFilters} olderCount={olderCount} maxAgeDays={maxAgeDays} />
          {hiddenCompanies.length > 0 && (
            <div className="mt-1 border-t border-line px-2 pt-2">
              <p className="mb-1 type-label">Hidden companies</p>
              <ul className="space-y-0.5">
                {hiddenCompanies.map((c) => (
                  <li key={c} className="flex items-center justify-between type-small">
                    <span className="truncate">{c}</span>
                    <Button size="sm" variant="ghost" onClick={() => onUnhide(c)} aria-label={`Show ${c} again`}>
                      Show
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hideRules.length > 0 && (
            <div className="mt-1 border-t border-line px-2 pt-2">
              <p className="mb-1 type-label">Hidden by your Not interested rules</p>
              <ul className="space-y-0.5">
                {hideRules.map((r) => (
                  <li key={ruleKey(r)} className="flex items-center justify-between gap-2 type-small">
                    <span className="min-w-0 truncate">{ruleLabel(r)}</span>
                    <Button size="sm" variant="ghost" onClick={() => onRemoveRule(r)} aria-label={`Show ${offerWhat({ kind: "rule", rule: r })} again`}>
                      Show
                    </Button>
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

/** The sort choices in the phone filter sheet: one always picked, styled like the single-choice filters. */
function SortOptions({ sort, onChange }: { sort: Sort; onChange: (s: Sort) => void }) {
  return (
    <ul>
      {SORTS.map((s) => {
        const on = s.value === sort;
        return (
          <li key={s.value}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onChange(s.value)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left type-small hover:bg-inset"
            >
              <span className={cx("flex size-4 shrink-0 items-center justify-center rounded-dot border", on ? "border-ink bg-ink text-raised" : "border-control")}>
                {on && <Check className="size-3" />}
              </span>
              {s.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SheetSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 type-label">{label}</h3>
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

  const places = placeFilter.map((c) => (c === REMOTE ? "Remote" : displayPlace(c))).join(", ");
  return (
    <div className={cx("rounded-md border px-3 py-2 type-small", changed ? "border-warning bg-warning-subtle" : "border-line bg-raised")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <UserRound className="rj-icon hidden text-muted sm:block" aria-hidden />
        {/* One line: what your profile searches for, truncated; the full text is in Settings. On phones the
            buttons wrap below it. */}
        <p className="min-w-0 basis-full truncate sm:flex-1 sm:basis-0" title={parts.join(" · ")}>
          <span className="font-medium">Your profile:</span> <span className="text-muted">{parts.join(" · ")}</span>
        </p>
        {placeFilter.length > 0 && !changed && (
          <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onEverywhere(!everywhere)} title={everywhere ? "Showing jobs everywhere" : `Showing your places: ${places}`}>
            {everywhere ? <MapPin className="rj-icon" aria-hidden /> : <Globe className="rj-icon" aria-hidden />}
            {everywhere ? "Only my places" : "Show everywhere"}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="shrink-0" onClick={onEdit}>
          <Pencil className="rj-icon" aria-hidden /> Edit
        </Button>
      </div>
      {changed && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-hairline pt-2">
          <p className="min-w-0 flex-1 type-small text-ink">
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
      {error && <p className="mt-1.5 type-small text-danger-text">{error}</p>}
    </div>
  );
}
