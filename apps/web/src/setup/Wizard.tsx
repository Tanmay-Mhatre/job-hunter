import { INDUSTRY_BY_ID } from "@jobhunter/core/catalog/industries";
import { configToYaml } from "@jobhunter/core/yaml-writer";
import { ArrowLeft, ArrowRight, Building2, CircleAlert, Download, FileText, Radar as RadarIcon, ScanSearch, Sparkles, Target } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ScanProgress } from "../components/ScanProgress";
import { Button, Card, cx } from "../components/ui";
import { canRunLocally } from "../lib/data";
import type { ScanState } from "../lib/scan";
import { draftToConfig, saveBlockers, saveConfig, STEP, STEP_COUNT, stepBlocker, STEPS, usableCompanies, type Draft, type SetupProgress } from "../lib/setup";
import { buildSuggestions } from "../lib/suggest";
import { CompaniesStep } from "./CompaniesStep";
import { ResumeStep } from "./ResumeStep";
import { IndustriesStep, KeywordsStep, LocationsStep, RolesStep, ThresholdPicker } from "./steps";

type Props = {
  step: number;
  goStep: (n: number) => void;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  /** A personal config already exists (re-running setup). */
  existing: boolean;
  configErrors?: string;
  scan: ScanState;
  startScan: () => Promise<void>;
  onSaved: () => Promise<void>;
  onFinish: () => void;
  /** Leave setup for the app; the draft is kept. */
  onExit: () => void;
  /** Welcome's primary button (marks the welcome as seen). */
  onStart: () => void;
  onStartOver: () => void;
  progress: SetupProgress;
  resumeText: string;
  saveResume: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const COPY: Record<number, { title: string; intro: string }> = {
  [STEP.resume]: {
    title: "Start with your resume",
    intro: "We'll use it to suggest your roles, places and topics, so you only review instead of typing. Optional: you can skip it.",
  },
  [STEP.roles]: { title: "What roles are you looking for?", intro: "We only show jobs whose title matches. Search the catalogue or browse by job family." },
  [STEP.locations]: { title: "Where do you want to work?", intro: "Jobs outside these places are hidden. Remote roles can count too." },
  [STEP.industries]: {
    title: "Which industries are you in?",
    intro: "Pick the industries you've worked in or want to move into. You can narrow your Radar to them. This never hides a job on its own.",
  },
  [STEP.keywords]: { title: "What topics matter to you?", intro: "These don't hide jobs. They rank the ones that mention your topics higher." },
  [STEP.companies]: {
    title: "Pick companies you'd love to work at",
    intro: "Picked from your roles, places, industries and past employers. We check the ones you add on every scan and put their jobs first. Optional.",
  },
  [STEP.review]: { title: "Review and save", intro: "Check everything reads right, then save. We'll find matching jobs across thousands of companies right away." },
};

export function Wizard(props: Props) {
  const { step, goStep, draft, update, existing, configErrors, scan, startScan, onSaved, onFinish, onExit, onStart, onStartOver, progress, resumeText, saveResume } =
    props;
  const suggest = useMemo(() => buildSuggestions(resumeText, draft.aiProfile), [resumeText, draft.aiProfile]);

  if (step <= 0) {
    return (
      <Welcome existing={existing} configErrors={configErrors} progress={progress} onStart={onStart} onStartOver={onStartOver} onExit={onExit} />
    );
  }

  const blocker = stepBlocker(step, draft);
  const optionalEmpty =
    (step === STEP.resume && !resumeText) ||
    (step === STEP.industries && draft.industries.length === 0) ||
    (step === STEP.keywords && Object.keys(draft.keywords).length === 0) ||
    (step === STEP.companies && draft.companies.length === 0);
  return (
    <div className="mx-auto max-w-2xl">
      <Progress step={step} goStep={goStep} draft={draft} />
      <Card className="mt-4 p-5 sm:p-7">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{COPY[step]?.title}</h1>
        <p className="mt-1 text-sm text-muted">{COPY[step]?.intro}</p>
        <div className="mt-6">
          {step === STEP.resume && (
            <ResumeStep
              draft={draft}
              update={update}
              resumeText={resumeText}
              saveResume={saveResume}
              onSkip={() => goStep(STEP.roles)}
              onNext={() => goStep(STEP.roles)}
            />
          )}
          {step === STEP.roles && <RolesStep draft={draft} update={update} suggest={suggest} />}
          {step === STEP.locations && <LocationsStep draft={draft} update={update} suggest={suggest} />}
          {step === STEP.industries && <IndustriesStep draft={draft} update={update} suggest={suggest} />}
          {step === STEP.keywords && <KeywordsStep draft={draft} update={update} suggest={suggest} resumeText={resumeText} />}
          {step === STEP.companies && <CompaniesStep draft={draft} update={update} />}
          {step === STEP.review && (
            <Review
              draft={draft}
              update={update}
              goStep={goStep}
              scan={scan}
              startScan={startScan}
              onSaved={onSaved}
              onFinish={onFinish}
              hasResume={!!resumeText}
            />
          )}
        </div>
        {step < STEP.review && (
          <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" className="h-11 sm:h-9" onClick={() => goStep(step - 1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              {blocker && <span className="text-center text-xs text-muted sm:text-right">{blocker}</span>}
              <Button variant="primary" className="h-11 px-5 sm:h-10" onClick={() => goStep(step + 1)} disabled={!!blocker}>
                {optionalEmpty ? "Skip for now" : "Continue"} <ArrowRight className="size-4" />
              </Button>
            </div>
          </footer>
        )}
      </Card>
    </div>
  );
}

function Progress({ step, goStep, draft }: { step: number; goStep: (n: number) => void; draft: Draft }) {
  // A step is reachable once every step before it is complete.
  const reachable = (n: number) => STEPS.filter((s) => s.id < n).every((s) => !stepBlocker(s.id, draft));
  return (
    <nav aria-label="Setup progress">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goStep(step - 1)}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg"
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <p className="text-xs font-medium text-muted">
          Step {step} of {STEP_COUNT}
        </p>
      </div>
      <ol className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}>
        {STEPS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              disabled={!reachable(s.id)}
              onClick={() => goStep(s.id)}
              aria-current={s.id === step ? "step" : undefined}
              aria-label={`Step ${s.id}: ${s.label}`}
              className="group w-full text-left disabled:cursor-not-allowed"
            >
              <span className={cx("block h-1.5 rounded-full transition-colors", s.id <= step ? "bg-accent" : "bg-line group-enabled:group-hover:bg-muted/40")} />
              <span className={cx("mt-1.5 hidden text-xs sm:block", s.id === step ? "font-semibold text-fg" : "text-muted")}>{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Welcome({
  existing,
  configErrors,
  progress,
  onStart,
  onStartOver,
  onExit,
}: {
  existing: boolean;
  configErrors?: string;
  progress: SetupProgress;
  onStart: () => void;
  onStartOver: () => void;
  onExit: () => void;
}) {
  const steps: [ReactNode, string, string][] = [
    [<Target className="size-5" />, "Tell us what you want", "Roles, places and the topics you care about."],
    [<ScanSearch className="size-5" />, "We find and score every matching job", "Across thousands of companies' hiring systems, often before LinkedIn."],
    [<Building2 className="size-5" />, "Pick companies you'd love to join", "Optional: their jobs always go to the top, checked every scan."],
  ];
  const resuming = !existing && progress.started;
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="p-6 sm:p-9">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-fg">
          <RadarIcon className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          {existing ? "Review your setup" : resuming ? "Welcome back" : "Let's set up your job radar"}
        </h1>
        <p className="mt-2 text-muted">
          {existing
            ? "Walk through each step to change anything, then save and rescan. Your current settings are filled in."
            : resuming
            ? "Your answers so far are saved. Pick up where you left off."
            : "Job Hunter finds openings that fit you on thousands of companies' careers pages and ranks each one against what you're looking for. Setup takes about 3 minutes, and you can skip it and come back any time."}
        </p>
        {configErrors && (
          <div className="mt-5 rounded-xl border border-warn/40 bg-warn-soft/50 p-3 text-sm">
            <p className="font-medium text-warn">Your config file has problems, so we've loaded what we could.</p>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted">{configErrors}</pre>
          </div>
        )}
        <ol className="mt-7 space-y-4">
          {steps.map(([icon, title, body], i) => (
            <li key={title} className="flex gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
              <div>
                <p className="font-semibold">
                  <span className="text-muted">{i + 1}.</span> {title}
                </p>
                <p className="text-sm text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Button variant="primary" className="h-11 px-5 text-base" onClick={onStart}>
            {existing ? "Review my setup" : resuming ? `Continue setup · step ${progress.nextStep} of ${STEP_COUNT}` : "Start setup"} <ArrowRight className="size-4" />
          </Button>
          {resuming && (
            <Button variant="ghost" className="h-11" onClick={onStartOver}>
              Start over
            </Button>
          )}
          <Button variant="ghost" className="h-11 sm:ml-auto" onClick={onExit}>
            {existing ? "Back to Radar" : "Skip for now"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Review({
  draft,
  update,
  goStep,
  scan,
  startScan,
  onSaved,
  onFinish,
  hasResume,
}: {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  goStep: (n: number) => void;
  scan: ScanState;
  startScan: () => Promise<void>;
  onSaved: () => Promise<void>;
  onFinish: () => void;
  hasResume: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const blockers = saveBlockers(draft);
  const companies = usableCompanies(draft);
  const topKeywords = Object.entries(draft.keywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);

  useEffect(() => setError(null), [draft]);

  const saveAndScan = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await saveConfig(draftToConfig(draft));
      if (!res.ok) {
        setError(res.errors);
        return;
      }
      await onSaved();
      // No companies needed: the scan finds jobs for you across the company directory.
      setStarted(true);
      await startScan();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    const blob = new Blob([configToYaml(draftToConfig(draft))], { type: "text/yaml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jobhunter.config.yaml";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (started) {
    return (
      <div className="space-y-5">
        <ScanProgress scan={scan} />
        {scan.phase === "done" || scan.phase === "error" ? (
          <div className="flex flex-wrap gap-2">
            {scan.phase === "error" && (
              <Button className="h-11 px-5 text-base" onClick={() => void startScan()}>
                Try again
              </Button>
            )}
            <Button variant="primary" className="h-11 px-5 text-base" onClick={onFinish}>
              <Sparkles className="size-4" /> {scan.summary?.matches ? "See my matches" : "Go to my radar"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">This takes a few minutes. We wait a moment between requests to be polite to each company's site.</p>
        )}
      </div>
    );
  }

  const lines: [number, ReactNode][] = [
    [
      STEP.resume,
      hasResume ? (
        <>
          <FileText className="mr-1 inline size-4 text-accent" />
          Use your <b>master resume</b> for suggestions{draft.aiProfile ? " (with AI profile)" : ""}.
        </>
      ) : (
        <span className="text-muted">No resume added (optional).</span>
      ),
    ],
    [
      STEP.roles,
      <>
        Look for <b>{draft.include.slice(0, 4).join(", ")}</b>
        {draft.include.length > 4 && ` +${draft.include.length - 4} more`} roles
        {draft.seniority.length > 0 && <>, ranking {draft.seniority.slice(0, 3).join(" / ")} higher</>}
        {draft.exclude.length > 0 && <>, never {draft.exclude.slice(0, 3).join(", ")}</>}.
      </>,
    ],
    [
      STEP.locations,
      <>
        {draft.places.length > 0 ? (
          <>
            In <b>{draft.places.slice(0, 4).join(", ")}</b>
            {draft.places.length > 4 && ` +${draft.places.length - 4} more`}
          </>
        ) : (
          "Remote only"
        )}
        {draft.remote && draft.remoteOk.length > 0 && (
          <>
            {draft.places.length > 0 ? " or " : ", "}
            <b>remote ({draft.remoteOk.slice(0, 3).join(", ")})</b>
          </>
        )}
        .
      </>,
    ],
    [
      STEP.industries,
      draft.industries.length ? (
        <>
          Interested in <b>{draft.industries.map((id) => INDUSTRY_BY_ID.get(id)?.label ?? id).join(", ")}</b>.
        </>
      ) : (
        <span className="text-muted">No industries picked (optional).</span>
      ),
    ],
    [
      STEP.keywords,
      topKeywords.length ? (
        <>
          Rank higher when they mention <b>{topKeywords.join(", ")}</b>
          {Object.keys(draft.keywords).length > 6 && ` +${Object.keys(draft.keywords).length - 6} more`}.
        </>
      ) : (
        <span className="text-muted">No topic keywords (jobs won't be ranked by topic).</span>
      ),
    ],
    [
      STEP.companies,
      companies.length ? (
        <>
          Watch <b>{companies.slice(0, 4).map((c) => c.name).join(", ")}</b>
          {companies.length > 4 && ` +${companies.length - 4} more`}: checked every scan, their jobs listed first.
        </>
      ) : (
        <span className="text-muted">No companies picked (optional). You can add them later in the Companies tab.</span>
      ),
    ],
  ];

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {lines.map(([n, text]) => (
          <li key={n} className="flex items-start gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1 leading-6">{text}</span>
            <Button size="sm" variant="ghost" onClick={() => goStep(n)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>

      <div>
        <h3 className="text-sm font-semibold">Which jobs count as strong matches?</h3>
        <p className="mb-2 mt-0.5 text-sm text-muted">They get a star on your radar, and alerts once those arrive.</p>
        <ThresholdPicker draft={draft} update={update} />
      </div>

      {blockers.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn-soft/40 p-3 text-sm">
          <p className="font-medium">A few things are needed before we can save:</p>
          <ul className="mt-2 space-y-1.5">
            {blockers.map((b) => (
              <li key={b.step} className="flex items-center gap-2">
                <CircleAlert className="size-4 shrink-0 text-warn" />
                <span className="flex-1">{b.message}</span>
                <Button size="sm" variant="ghost" onClick={() => goStep(b.step)}>
                  Fix
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <pre className="whitespace-pre-wrap rounded-xl bg-bad-soft/50 p-3 font-mono text-xs text-bad">{error}</pre>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <Button variant="ghost" onClick={() => goStep(STEP.keywords)}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          {!canRunLocally && (
            <Button onClick={download}>
              <Download className="size-4" /> Download config file
            </Button>
          )}
          {canRunLocally && (
            <Button variant="primary" className="h-11 px-5 text-base" onClick={() => void saveAndScan()} disabled={saving || blockers.length > 0}>
              {saving ? "Saving…" : "Save & find my jobs"} <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {!canRunLocally && (
        <p className="text-sm text-muted">
          This dashboard is hosted, so it can't save files. Download the config and commit it to your repository as{" "}
          <code className="font-mono text-xs">jobhunter.config.yaml</code>.
        </p>
      )}
    </div>
  );
}
