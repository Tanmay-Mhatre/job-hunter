import { parseAiAnswer, type ParsedAnswer } from "@jobhunter/core/resume-parse";
import { Check, ClipboardCopy, ExternalLink, FileText, Files, LoaderCircle, SkipForward, Sparkles, Upload, Wand2 } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Chip, cx } from "../components/ui";
import { copyText } from "../lib/clipboard";
import { canRunLocally } from "../lib/data";
import { extractResumeText } from "../lib/extract";
import type { Draft } from "../lib/setup";
import { buildSuggestions, prefillDraft } from "../lib/suggest";
import { MASTER_RESUME_PROMPT } from "./prompt";

type Mode = "single" | "ai" | null;

type Props = {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  resumeText: string;
  saveResume: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Skip ahead to the manual steps (wizard only). */
  onSkip?: () => void;
  onNext?: () => void;
  /** In Settings there's nowhere to skip to. */
  hideSkip?: boolean;
};

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function ResumeStep({ draft, update, resumeText, saveResume, onSkip, onNext, hideSkip }: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [replacing, setReplacing] = useState(false);
  const hasResume = !!resumeText && !replacing;

  return (
    <div className="space-y-6">
      {hasResume ? (
        <SavedResume
          text={resumeText}
          draft={draft}
          update={update}
          onReplace={() => {
            setReplacing(true);
            setMode(null);
          }}
          onNext={onNext}
        />
      ) : (
        <>
          <div className={cx("grid gap-3", hideSkip ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
            <ModeCard
              active={mode === "single"}
              icon={<FileText className="size-5" />}
              title="I have one resume"
              body="Upload a PDF or Word file, or paste the text."
              onClick={() => setMode("single")}
            />
            <ModeCard
              active={mode === "ai"}
              icon={<Files className="size-5" />}
              title="I have several resumes"
              body="Merge them into one master resume with Claude or ChatGPT."
              onClick={() => setMode("ai")}
            />
            {!hideSkip && onSkip && (
              <ModeCard
                active={false}
                icon={<SkipForward className="size-5" />}
                title="Skip for now"
                body="Fill in your roles and places yourself."
                onClick={onSkip}
              />
            )}
          </div>
          {mode === "single" && (
            <SinglePath
              initial={resumeText}
              onSaved={async (text) => {
                const res = await saveResume(text);
                if (res.ok) {
                  update({ aiProfile: undefined });
                  setReplacing(false);
                }
                return res;
              }}
            />
          )}
          {mode === "ai" && (
            <AiPath
              onSaved={async (parsed) => {
                const res = await saveResume(parsed.resume);
                if (res.ok) {
                  update({ aiProfile: parsed.profile });
                  setReplacing(false);
                }
                return res;
              }}
            />
          )}
          {resumeText && replacing && (
            <button type="button" className="text-sm font-medium text-accent" onClick={() => setReplacing(false)}>
              Keep my saved resume instead
            </button>
          )}
        </>
      )}
      <p className="text-xs text-muted">
        {canRunLocally
          ? "Your resume is saved on this computer only (profile/resume.md). It's never committed to git or sent anywhere."
          : "This dashboard is hosted, so your resume is kept in this browser only."}
      </p>
    </div>
  );
}

function ModeCard({ active, icon, title, body, onClick }: { active: boolean; icon: ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
        active ? "border-accent bg-accent-soft/40" : "border-line hover:bg-surface-2",
      )}
    >
      <span className={cx("flex size-9 items-center justify-center rounded-lg", active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}>{icon}</span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-muted">{body}</span>
    </button>
  );
}

type SaveFn<T> = (value: T) => Promise<{ ok: true } | { ok: false; error: string }>;

function useSaving() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, run };
}

function SinglePath({ initial, onSaved }: { initial: string; onSaved: SaveFn<string> }) {
  const [text, setText] = useState(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const { saving, error, run } = useSaving();
  const [file, setFile] = useState<{ state: "idle" | "reading" | "done" | "error"; name?: string; message?: string }>({ state: "idle" });

  const onFile = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setFile({ state: "reading", name: f.name });
    try {
      const { text: extracted, note } = await extractResumeText(f);
      setText(extracted);
      setFile({ state: "done", name: f.name, message: note });
    } catch (err) {
      setFile({ state: "error", name: f.name, message: (err as Error).message });
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Paste your resume</p>
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={file.state === "reading"}>
          {file.state === "reading" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {file.state === "reading" ? "Reading…" : "Upload PDF, Word or text"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.md,.markdown,.txt,text/plain,text/markdown"
          className="hidden"
          aria-label="Upload resume file"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      <p className="text-xs text-muted">PDF, Word (.docx), Markdown or text. The file is read on this computer; nothing is uploaded anywhere.</p>
      {file.state === "error" && <p className="rounded-lg bg-warn-soft/50 p-2.5 text-sm text-warn">{file.message}</p>}
      {file.state === "done" && (
        <p className="rounded-lg bg-accent-soft/40 p-2.5 text-sm">
          <Check className="mr-1 inline size-4 text-accent" />
          Read <b>{file.name}</b>.{file.message ? ` ${file.message}` : " Check the text below, then save."}
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        aria-label="Your resume"
        placeholder={"Paste your full resume here, or upload a file above.\n\nPlain text or Markdown both work."}
        className="w-full resize-y rounded-lg border border-line bg-surface p-3 font-mono text-xs leading-5 outline-none placeholder:font-sans placeholder:text-sm placeholder:text-muted focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => void run(() => onSaved(text))} disabled={saving || words(text) < 30}>
          {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Save resume
        </Button>
        <span className="text-xs text-muted">{words(text) ? `${words(text)} words` : ""}</span>
        {error && <span className="text-sm text-bad">{error}</span>}
      </div>
    </div>
  );
}

function AiPath({ onSaved }: { onSaved: SaveFn<ParsedAnswer> }) {
  const [copied, setCopied] = useState<"no" | "yes" | "manual">("no");
  const [showPrompt, setShowPrompt] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [answer, setAnswer] = useState("");
  const { saving, error, run } = useSaving();
  const parsed = useMemo(() => (answer.trim().length > 50 ? parseAiAnswer(answer) : null), [answer]);

  const copy = async () => {
    if (await copyText(MASTER_RESUME_PROMPT)) {
      setCopied("yes");
      setTimeout(() => setCopied("no"), 2000);
      return;
    }
    // Clipboard blocked: show the prompt selected so Ctrl/Cmd+C works.
    setCopied("manual");
    setShowPrompt(true);
    setTimeout(() => {
      promptRef.current?.focus();
      promptRef.current?.select();
    }, 50);
  };

  return (
    <ol className="space-y-4 rounded-xl border border-line p-4">
      <Step n={1} title="Copy our prompt">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => void copy()}>
            {copied === "yes" ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
            {copied === "yes" ? "Copied" : "Copy prompt"}
          </Button>
          <button type="button" className="text-sm font-medium text-accent" onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt}>
            {showPrompt ? "Hide the prompt" : "See the prompt"}
          </button>
        </div>
        {copied === "manual" && (
          <p className="mt-2 text-sm text-warn">Your browser blocked copying. The prompt is selected below: press Ctrl+C (Cmd+C on Mac).</p>
        )}
        {showPrompt && (
          <textarea
            ref={promptRef}
            readOnly
            value={MASTER_RESUME_PROMPT}
            rows={10}
            aria-label="The prompt"
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full resize-y rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs leading-5 text-muted outline-none focus:border-accent"
          />
        )}
      </Step>
      <Step n={2} title="Run it in your own AI assistant">
        <p className="text-sm text-muted">Open one in a new tab, attach all your resumes (PDF and Word are fine), paste the prompt and send.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a href="https://claude.ai/new" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2">
            Open Claude <ExternalLink className="size-3.5" />
          </a>
          <a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2">
            Open ChatGPT <ExternalLink className="size-3.5" />
          </a>
        </div>
      </Step>
      <Step n={3} title="Paste the whole answer here">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={8}
          aria-label="The AI's answer"
          placeholder="Paste everything it wrote, including the JSON block at the end."
          className="w-full resize-y rounded-lg border border-line bg-surface p-3 font-mono text-xs leading-5 outline-none placeholder:font-sans placeholder:text-sm placeholder:text-muted focus:border-accent"
        />
        {parsed && (
          <div className="mt-2 rounded-lg bg-surface-2/60 p-3 text-sm">
            <p className="font-medium">
              <Wand2 className="mr-1 inline size-4 text-accent" />
              Found: master resume ({words(parsed.resume).toLocaleString()} words)
              {parsed.profile ? (
                <>
                  {" "}· {parsed.profile.target_titles.length} target titles · {parsed.profile.locations.length} places · {Object.keys(parsed.profile.keywords).length} topics
                </>
              ) : (
                " · no profile block (we'll suggest details from the text)"
              )}
            </p>
            {parsed.warnings.map((w) => (
              <p key={w} className="mt-1 text-xs text-warn">
                {w}
              </p>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => parsed && void run(() => onSaved(parsed))} disabled={!parsed || saving || words(parsed.resume) < 30}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Save master resume
          </Button>
          {error && <span className="text-sm text-bad">{error}</span>}
        </div>
      </Step>
    </ol>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-sm font-semibold">{title}</p>
        {children}
      </div>
    </li>
  );
}

function SavedResume({ text, draft, update, onReplace, onNext }: { text: string; draft: Draft; update: (p: Partial<Draft>) => void; onReplace: () => void; onNext?: () => void }) {
  const [applied, setApplied] = useState(false);
  const suggest = useMemo(() => buildSuggestions(text, draft.aiProfile), [text, draft.aiProfile]);
  const patch = useMemo(() => prefillDraft(draft, suggest), [draft, suggest]);
  const fills = Object.keys(patch).filter((k) => k !== "remoteExclude");
  const firstLine = text.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") ?? "Resume";

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-line p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{firstLine}</p>
          <p className="text-sm text-muted">
            Master resume saved · {words(text).toLocaleString()} words{draft.aiProfile ? " · with AI profile" : ""}
          </p>
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer font-medium text-accent">View</summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-xs leading-5 text-muted">{text}</pre>
          </details>
        </div>
        <Button size="sm" onClick={onReplace}>
          Replace
        </Button>
      </div>

      <div className="rounded-xl border border-accent/40 bg-accent-soft/30 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-accent" /> {suggest.source === "ai" ? "From your master resume" : "Suggested from your resume"}
        </p>
        <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[110px_1fr]">
          <Row label="Titles" items={suggest.titles} />
          <Row label="Places" items={suggest.places} />
          {suggest.remote && <Row label="Remote" items={suggest.remoteRegions} />}
          <Row label="Topics" items={suggest.keywords.map(([k]) => k)} />
        </dl>
        {applied ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-accent">
            <Check className="size-4" /> Added. You can review and change everything in the next steps.
          </p>
        ) : fills.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() => {
                update(patch);
                setApplied(true);
              }}
            >
              <Wand2 className="size-4" /> Use these to prefill the next steps
            </Button>
            <span className="text-xs text-muted">Only fills what's still empty. Nothing you chose is overwritten.</span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Your steps already have answers, so nothing is overwritten. The suggestions appear next to each step for you to add.
          </p>
        )}
      </div>
      {applied && onNext && (
        <Button variant="primary" onClick={onNext}>
          Review the roles
        </Button>
      )}
    </div>
  );
}

function Row({ label, items }: { label: string; items: string[] }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="flex flex-wrap gap-1">
        {items.length ? items.slice(0, 10).map((i) => <Chip key={i}>{i}</Chip>) : <span className="text-muted">none found</span>}
        {items.length > 10 && <Chip>+{items.length - 10}</Chip>}
      </dd>
    </>
  );
}
