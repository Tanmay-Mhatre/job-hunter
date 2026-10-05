import { ArrowRight, Building2, Keyboard, KanbanSquare, LoaderCircle, Moon, Radar as RadarIcon, RefreshCw, Settings as SettingsIcon, Sun, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompaniesTab } from "./components/CompaniesTab";
import { EmptyState, SetupBanner } from "./components/EmptyState";
import { checklistItems, ConfigProblemCard, FailingBanner, FirstScanCard, NoMatches, ScanningBar, SetupChecklist, SetupHero } from "./components/Guidance";
import { ApplyPrompt } from "./components/ApplyPrompt";
import { JobDrawer } from "./components/JobDrawer";
import { Pipeline } from "./components/Pipeline";
import { RadarPage } from "./components/radar/RadarPage";
import { Settings } from "./components/Settings";
import { Button, Card, cx, IconButton, Kbd } from "./components/ui";
import { canRunLocally, useData, useOtherJobs, type Job } from "./lib/data";
import { usePrefs } from "./lib/prefs";
import { useScan } from "./lib/scan";
import { useResume } from "./lib/resume";
import { profileFromPicks, type FilterPicks } from "./lib/profileSync";
import { draftFromConfig, draftToConfig, emptyDraft, saveConfig, setupProgress, STEP, STEP_COUNT, useSetupStatus, type Draft } from "./lib/setup";
import { buildSuggestions } from "./lib/suggest";
import { load, save } from "./lib/storage";
import { timeAgo } from "./lib/format";
import { useUserState, useVisitCutoff, type Status } from "./lib/userState";
import { Wizard } from "./setup/Wizard";

const TABS = [
  { id: "radar", label: "Radar", icon: RadarIcon },
  { id: "pipeline", label: "Pipeline", icon: KanbanSquare },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;
type Tab = (typeof TABS)[number]["id"];
type Route = { tab: Tab } | { setup: number };

function parseHash(): Route {
  // "#radar?posted=7…" carries the Radar's filters after the tab name.
  const h = location.hash.slice(1).split("?")[0]!;
  const m = h.match(/^setup(?:\/(\d))?$/);
  if (m) return { setup: Math.min(STEP_COUNT, Number(m[1] ?? 0)) };
  return { tab: (TABS.some((t) => t.id === h) ? h : "radar") as Tab };
}

const DRAFT_KEY = "jobhunter.setupDraft.v1";
/** The first-visit Welcome has been answered (Start or Skip); never auto-open it again. */
const WELCOME_SEEN_KEY = "jobhunter.welcomeSeen";
const sameConfig = (a: Draft, b: Draft) => JSON.stringify(draftToConfig(a)) === JSON.stringify(draftToConfig(b));

export function App() {
  const { state, reload } = useData();
  const setup = useSetupStatus();
  const user = useUserState();
  const prefs = usePrefs();
  /** The job whose apply page was just opened, to ask "Did you apply?" on return. */
  const [applying, setApplying] = useState<Job | null>(null);
  const visit = useVisitCutoff();
  const [route, setRoute] = useState<Route>(parseHash);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [showKeys, setShowKeys] = useState(false);

  const status = setup.status;
  const meta = state.kind === "ready" ? state.meta : undefined;
  const personal = !!status?.isPersonal;
  /** none: no personal config yet · invalid: config file broken · configured (also the hosted build, which can't run setup). */
  const setupState = status === null ? "configured" : !status ? "loading" : !status.isPersonal ? "none" : !status.valid ? "invalid" : "configured";
  const notSetUp = setupState === "none";

  // ----- the saved setup, and the working copy the wizard / Settings edit -----
  const saved = useMemo<Draft>(() => {
    if (status?.config) return draftFromConfig(status.config);
    if (status?.raw) return draftFromConfig(status.raw);
    if (status === null && meta) return draftFromConfig({ profile: meta.profile, companies: meta.companies });
    return emptyDraft();
  }, [status, meta]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const appliedRef = useRef<string>("");
  useEffect(() => {
    if (status === undefined) return;
    const key = JSON.stringify(draftToConfig(saved));
    if (key === appliedRef.current) return;
    appliedRef.current = key;
    // First-time setup resumes an unfinished draft from this browser.
    const stored = !personal && status !== null ? load<Draft | null>(DRAFT_KEY, null) : null;
    setDraft(stored ? { ...emptyDraft(), ...stored } : saved);
  }, [saved, status, personal]);
  useEffect(() => {
    if (status && !status.isPersonal) save(DRAFT_KEY, draft);
  }, [draft, status]);
  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const dirty = !sameConfig(draft, saved);
  const { resume, saveResume } = useResume();
  const progress = setupProgress(draft, !!resume.text);
  const suggest = useMemo(() => buildSuggestions(resume.text, draft.aiProfile), [resume.text, draft.aiProfile]);

  const afterScan = useCallback(async () => {
    await Promise.all([reload(), setup.refresh()]);
  }, [reload, setup.refresh]);
  const { scan, start: startScan } = useScan(afterScan);
  const scanning = scan.phase === "running";

  /** Radar "Save to my profile": its place and industry picks become your profile, then a rescan. */
  const saveProfileFromRadar = useCallback(
    async (picks: FilterPicks): Promise<string | null> => {
      const result = profileFromPicks(saved, picks);
      if ("error" in result) return result.error;
      const res = await saveConfig(draftToConfig({ ...saved, ...result.patch }));
      if (!res.ok) return res.errors;
      await setup.refresh();
      save(DRAFT_KEY, null);
      void startScan();
      return null;
    },
    [saved, setup, startScan],
  );

  // ----- routing -----
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((r: Route) => {
    location.hash = "tab" in r ? r.tab : r.setup ? `setup/${r.setup}` : "setup";
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);
  const goStep = useCallback((n: number) => go(n > 0 ? { setup: n } : { setup: 0 }), [go]);

  // Only the very first visit opens the Welcome; after Start or Skip, setup is reached through CTAs.
  useEffect(() => {
    if (!status || status.isPersonal || "setup" in route) return;
    if (!load(WELCOME_SEEN_KEY, false)) go({ setup: 0 });
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember how far the wizard got, so "Continue setup" resumes there.
  const wizardStep = "setup" in route ? route.setup : 0;
  useEffect(() => {
    if (notSetUp && wizardStep > (draft.furthestStep ?? 0)) update({ furthestStep: wizardStep });
  }, [notSetUp, wizardStep, draft.furthestStep, update]);

  const exitSetup = useCallback(() => {
    save(WELCOME_SEEN_KEY, true);
    go({ tab: "radar" });
  }, [go]);
  const companyCount = status?.config?.companies.length ?? 0;
  const goCompanies = useCallback(() => go({ tab: "companies" }), [go]);
  /** Where a "set up" CTA should take the user right now. */
  const toSetup = useCallback(
    () => goStep(setupState === "invalid" ? 0 : progress.started ? progress.nextStep : STEP.resume),
    [goStep, setupState, progress],
  );

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("jobhunter.theme", next ? "dark" : "light");
    } catch {}
  };

  const jobs = state.kind === "ready" ? state.jobs : [];
  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const openJob = openId ? jobsById.get(openId) : undefined;
  const onStatus = useCallback((job: Job, s: Status) => user.toggleStatus(job, s), [user]);
  const onOpen = useCallback((job: Job) => setOpenId(job.id), []);
  const onApply = useCallback((job: Job) => setApplying(job), []);

  const inSetup = "setup" in route;
  const tab = "tab" in route ? route.tab : null;

  // Global keys: Esc closes, 1-4 switch tabs, ? shows shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        setOpenId(null);
        setShowKeys(false);
      } else if (e.key === "?") setShowKeys((v) => !v);
      else if (!openId && !inSetup && /^[1-4]$/.test(e.key)) go({ tab: TABS[Number(e.key) - 1]!.id });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, inSetup, go]);

  const lastRun = meta?.runs[0];
  const failing = lastRun?.health.filter((h) => !h.ok && !h.unsupported).length ?? 0;
  const matched = jobs.filter((j) => !j.why.gate && j.status === "open").length;
  // "Why no matches?" needs the jobs that failed the filters too; fetched only then.
  const otherJobs = useOtherJobs(state.kind === "ready" && !!lastRun && matched === 0);
  const items = checklistItems(notSetUp ? draftToConfig(draft) : status?.config, meta, !!resume.text);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <a href="#radar" onClick={() => go({ tab: "radar" })} className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <RadarIcon className="size-4" />
            </span>
            <span className={cx(inSetup ? "inline" : "hidden sm:inline")}>Job Hunter</span>
          </a>
          {inSetup ? (
            <span className="text-sm text-muted">· Setup</span>
          ) : (
            <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Sections">
              {TABS.map((t) => (
                <TabLink key={t.id} tab={t} active={tab === t.id} onClick={() => go({ tab: t.id })} />
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {inSetup ? (
              <Button size="sm" variant="ghost" onClick={exitSetup}>
                <X className="size-4" /> Exit setup
              </Button>
            ) : (
              <>
                {lastRun && (
                  <span className="hidden text-xs text-muted lg:inline" title={lastRun.startedAt}>
                    Last scan {timeAgo(lastRun.startedAt)}
                  </span>
                )}
                {canRunLocally && (setupState === "none" || setupState === "invalid") && (
                  <Button size="sm" variant="primary" onClick={toSetup}>
                    {setupState === "invalid" ? "Fix setup" : progress.started ? "Finish setup" : "Set up radar"} <ArrowRight className="size-3.5" />
                  </Button>
                )}
                {canRunLocally && setupState === "configured" && personal && companyCount === 0 && (
                  <Button size="sm" variant="primary" onClick={goCompanies}>
                    Add companies <ArrowRight className="size-3.5" />
                  </Button>
                )}
                {canRunLocally && setupState === "configured" && (!personal || companyCount > 0) && (
                  <Button size="sm" onClick={() => void startScan()} disabled={scanning} title="Scan your companies now">
                    {scanning ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    {scanning ? "Scanning…" : "Scan now"}
                  </Button>
                )}
                <span className="hidden sm:contents">
                  <IconButton label="Keyboard shortcuts (?)" onClick={() => setShowKeys((v) => !v)}>
                    <Keyboard className="size-4" />
                  </IconButton>
                </span>
              </>
            )}
            <IconButton label={dark ? "Light theme" : "Dark theme"} onClick={toggleTheme}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </IconButton>
          </div>
        </div>
      </header>

      <main className={cx("mx-auto max-w-6xl px-4 pt-5", inSetup ? "pb-10" : "pb-24 md:pb-10")}>
        {status === undefined || state.kind === "loading" ? (
          <p className="py-20 text-center text-sm text-muted">Loading…</p>
        ) : inSetup ? (
          <Wizard
            step={(route as { setup: number }).setup}
            goStep={goStep}
            draft={draft}
            update={update}
            existing={personal}
            configErrors={status?.valid === false ? status.errors : undefined}
            scan={scan}
            startScan={startScan}
            onSaved={async () => {
              await setup.refresh();
              save(DRAFT_KEY, null);
              save(WELCOME_SEEN_KEY, true);
            }}
            onFinish={() => go({ tab: "radar" })}
            onExit={exitSetup}
            progress={progress}
            resumeText={resume.text}
            saveResume={saveResume}
            onStart={() => {
              save(WELCOME_SEEN_KEY, true);
              goStep(!personal && progress.started ? progress.nextStep : STEP.resume);
            }}
            onStartOver={() => {
              save(WELCOME_SEEN_KEY, true);
              setDraft(emptyDraft());
              goStep(STEP.resume);
            }}
          />
        ) : (
          <div className="space-y-4">
            {state.kind === "error" && <ErrorState message={state.message} />}

            {tab === "radar" && (
              <>
                {notSetUp && <SetupHero items={items} started={progress.started} nextStep={progress.nextStep} onStep={goStep} onCompanies={goCompanies} />}
                {setupState === "invalid" && <ConfigProblemCard errors={status?.errors} onFix={() => goStep(0)} />}
                {setupState === "configured" && personal && (
                  <SetupChecklist items={items} onStep={goStep} onScan={companyCount ? () => void startScan() : goCompanies} onCompanies={goCompanies} />
                )}
                {setupState === "configured" && personal && companyCount === 0 && (
                  <EmptyState
                    icon={<Building2 className="size-6" />}
                    title="Next: add the companies you'd like to work at"
                    actions={
                      <Button variant="primary" onClick={goCompanies}>
                        See companies hiring for you <ArrowRight className="size-4" />
                      </Button>
                    }
                  >
                    Your profile is saved. We've picked companies that are hiring for your roles and places right now: add the ones you like, and we'll scan them and rank every opening for you.
                  </EmptyState>
                )}
                {state.kind === "ready" && <ScanningBar scan={scan} />}
                {setupState === "configured" && personal && companyCount > 0 && state.kind === "empty" && <FirstScanCard scan={scan} onScan={() => void startScan()} />}
                {state.kind === "ready" && failing > 0 && <FailingBanner count={failing} onOpen={() => go({ tab: "companies" })} />}
                {state.kind === "ready" && lastRun && matched === 0 && <NoMatches jobs={otherJobs ? [...jobs, ...otherJobs] : jobs} onStep={goStep} onCompanies={goCompanies} />}
                {state.kind === "ready" && (matched > 0 || !lastRun) && (
                  <RadarPage
                    jobs={state.jobs}
                    meta={state.meta}
                    user={user.state}
                    cutoff={visit.cutoff}
                    prefs={prefs.prefs}
                    onMarkAllSeen={visit.markAllSeen}
                    onOpenOverlay={onOpen}
                    overlayOpen={!!openJob}
                    onStatus={onStatus}
                    onUpdate={(job, patch) => user.update(job, patch)}
                    onApply={onApply}
                    onSaveView={prefs.saveView}
                    onRenameView={prefs.renameView}
                    onDeleteView={prefs.deleteView}
                    onHideCompany={prefs.setCompanyHidden}
                    profile={status?.config?.profile}
                    onEditProfile={() => go({ tab: "settings" })}
                    onSaveProfile={canRunLocally && personal && setupState === "configured" ? saveProfileFromRadar : undefined}
                  />
                )}
              </>
            )}
            {tab === "pipeline" && (
              <Pipeline
                user={user.state}
                jobsById={jobsById}
                min={meta?.profile.min_score ?? 70}
                onOpen={onOpen}
                onMove={(id, entry, s) => user.update({ id, ...entry.snapshot, ...pick(jobsById.get(id)) }, { status: s })}
                onSetup={notSetUp ? toSetup : undefined}
                goRadar={() => go({ tab: "radar" })}
              />
            )}
            {tab === "companies" && (
              <CompaniesTab
                configured={setupState === "configured" && personal}
                meta={meta}
                draft={draft}
                saved={saved}
                update={update}
                onSaved={async () => {
                  await setup.refresh();
                }}
                onScan={() => {
                  go({ tab: "radar" });
                  void startScan();
                }}
                scanning={scanning}
                toSetup={toSetup}
              />
            )}
            {tab === "settings" && notSetUp && (
              <SetupBanner
                action={
                  <Button variant="primary" size="sm" onClick={toSetup}>
                    {progress.started ? "Continue setup" : "Start setup"} <ArrowRight className="size-3.5" />
                  </Button>
                }
              >
                <b>You haven't finished setup.</b> <span className="text-muted">The guided setup is the quickest way, or fill in the sections below.</span>
              </SetupBanner>
            )}
            {tab === "settings" && setupState === "invalid" && <ConfigProblemCard errors={status?.errors} onFix={() => goStep(0)} />}
            {tab === "settings" && (
              <Settings
                toCompanies={goCompanies}
                draft={draft}
                update={update}
                revert={() => setDraft(saved)}
                dirty={dirty}
                onSaved={async () => {
                  await setup.refresh();
                  save(DRAFT_KEY, null);
                }}
                onScan={() => {
                  go({ tab: "radar" });
                  void startScan();
                }}
                scanning={scanning}
                user={user.state}
                prefs={prefs.prefs}
                onImport={(state, p) => {
                  user.replaceAll(state);
                  if (p) prefs.replacePrefs(p);
                }}
                suggest={suggest}
                resumeText={resume.text}
                saveResume={saveResume}
              />
            )}
          </div>
        )}
      </main>

      {!inSetup && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 backdrop-blur md:hidden" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => go({ tab: t.id })}
              className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", tab === t.id ? "text-accent" : "text-muted")}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <t.icon className="size-5" />
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {openJob && meta && (
        <JobDrawer
          job={openJob}
          entry={user.state[openJob.id]}
          profile={meta.profile}
          postings={jobs.filter((j) => j.group === openJob.group)}
          industries={meta.companies.find((c) => c.name === openJob.company)?.industries}
          onClose={() => setOpenId(null)}
          onUpdate={(patch) => user.update(openJob, patch)}
          onApply={onApply}
          onOpenJob={(j) => setOpenId(j.id)}
        />
      )}

      <ApplyPrompt
        job={applying}
        onAnswer={(applied) => {
          if (applied && applying) user.update(applying, { status: "applied" });
          setApplying(null);
        }}
      />

      {showKeys && <ShortcutHelp onClose={() => setShowKeys(false)} />}
    </div>
  );
}

const pick = (j: Job | undefined) => (j ? { title: j.title, company: j.company, url: j.url, location: j.location, score: j.score } : {});

function TabLink({ tab, active, onClick }: { tab: (typeof TABS)[number]; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
        active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
      )}
    >
      <tab.icon className="size-4" />
      {tab.label}
    </button>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold">Couldn't load the radar data</h1>
      <p className="mt-1 font-mono text-xs text-muted">{message}</p>
    </Card>
  );
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const rows: [string[], string][] = [
    [["j", "k"], "Next / previous job"],
    [["Enter"], "Open job"],
    [["s"], "Save"],
    [["a"], "Mark applied"],
    [["x"], "Not interested"],
    [["/"], "Search"],
    [["1", "4"], "Switch section"],
    [["Esc"], "Close"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <Card className="relative w-full max-w-sm p-5 shadow-2xl">
        <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map(([keys, label]) => (
            <li key={label} className="flex items-center justify-between">
              <span className="text-muted">{label}</span>
              <span className="flex items-center gap-1">
                {keys.map((k, i) => (
                  <span key={k} className="flex items-center gap-1">
                    {i > 0 && <span className="text-xs text-muted">{k === "4" ? "–" : "/"}</span>}
                    <Kbd>{k}</Kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
