import { useCallback, useRef, useState } from "react";
import type { CompanyHealth } from "./data";
import { runScan, type RunEvent } from "./setup";

export type ScanState = {
  phase: "idle" | "running" | "done" | "error";
  /** Company names in run order; health arrives as each finishes. */
  companies: string[];
  results: Record<string, CompanyHealth>;
  summary?: Extract<RunEvent, { type: "done" }>;
  error?: string;
};

const IDLE: ScanState = { phase: "idle", companies: [], results: {} };

/** One scan at a time, shared by the header button, the wizard and Radar cards. */
export function useScan(onFinished: () => void | Promise<void>) {
  const [scan, setScan] = useState<ScanState>(IDLE);
  const busy = useRef(false);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setScan({ ...IDLE, phase: "running" });
    let failed: string | undefined;
    try {
      await runScan((e) => {
        if (e.type === "start") setScan((s) => ({ ...s, companies: e.companies }));
        else if (e.type === "company") {
          const { type: _, ...h } = e;
          setScan((s) => ({ ...s, results: { ...s.results, [h.company]: h } }));
        } else if (e.type === "done") setScan((s) => ({ ...s, summary: e }));
        else if (e.type === "error") failed = e.message;
      });
    } catch (err) {
      failed = (err as Error).message;
    }
    await onFinished();
    setScan((s) => (failed && !s.summary ? { ...s, phase: "error", error: failed } : { ...s, phase: "done" }));
    busy.current = false;
  }, [onFinished]);

  const reset = useCallback(() => setScan(IDLE), []);
  return { scan, start, reset };
}
