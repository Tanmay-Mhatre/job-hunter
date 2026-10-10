import { useCallback, useEffect, useState } from "react";
import { canRunLocally } from "./data";
import { load, save } from "./storage";

const LOCAL_KEY = "rawjobs.resume";

export type ResumeState = { text: string; updatedAt?: string; loaded: boolean };

/**
 * The master resume. Locally it's profile/resume.md (gitignored) via the dev API;
 * on a hosted dashboard it can only live in this browser.
 */
export function useResume() {
  const [resume, setResume] = useState<ResumeState>({ text: "", loaded: false });

  const refresh = useCallback(async () => {
    if (!canRunLocally) {
      const stored = load<{ text: string; updatedAt: string } | null>(LOCAL_KEY, null);
      setResume({ text: stored?.text ?? "", updatedAt: stored?.updatedAt, loaded: true });
      return;
    }
    try {
      const res = await fetch("/api/setup/resume", { cache: "no-store" });
      const body = (await res.json()) as { text: string | null; updatedAt?: string };
      setResume({ text: body.text ?? "", updatedAt: body.updatedAt, loaded: true });
    } catch {
      setResume({ text: "", loaded: true });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveResume = useCallback(async (text: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    const updatedAt = new Date().toISOString();
    if (!canRunLocally) {
      save(LOCAL_KEY, { text, updatedAt });
      setResume({ text, updatedAt, loaded: true });
      return { ok: true };
    }
    const res = await fetch("/api/setup/resume", { method: "POST", body: JSON.stringify({ text }) });
    const body = (await res.json()) as { ok: boolean; error?: string; errors?: string };
    if (!body.ok) return { ok: false, error: body.error ?? body.errors ?? "Couldn't save the resume." };
    setResume({ text: text.trim(), updatedAt, loaded: true });
    return { ok: true };
  }, []);

  /** Delete the saved resume (this computer, or this browser when hosted). */
  const removeResume = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (canRunLocally) {
      try {
        const res = await fetch("/api/setup/resume", { method: "DELETE" });
        const body = (await res.json()) as { ok: boolean; errors?: string };
        if (!body.ok) return { ok: false, error: body.errors ?? "Couldn't remove the resume." };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    } else save(LOCAL_KEY, null);
    setResume({ text: "", loaded: true });
    return { ok: true };
  }, []);

  return { resume, saveResume, removeResume, refresh };
}
