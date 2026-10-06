import { CloudDownload, Database, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { canRunLocally } from "../lib/data";
import { timeAgo } from "../lib/format";
import { Button, cx } from "./ui";

type Status = {
  local?: { version: string; companies: number; updated_at: string };
  present: boolean;
  outbox: number;
  sharing: boolean;
  age_days: number | null;
};

/**
 * Where the company directory comes from and how fresh it is, with "Update now". The shared
 * directory is rebuilt weekly online (public lists plus companies users add) and downloaded here.
 */
export function DirectoryBar({ onUpdated }: { onUpdated: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!canRunLocally) return;
    try {
      const res = await fetch("/api/directory", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {
      // The bar just stays hidden.
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!canRunLocally || !status) return null;

  const update = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/directory/update", { method: "POST" });
      const body = (await res.json()) as { updated?: boolean; message?: string; errors?: string };
      setMessage({ tone: body.errors ? "bad" : "ok", text: body.message ?? body.errors ?? "Done." });
      if (body.updated) onUpdated();
      await load();
    } catch (err) {
      setMessage({ tone: "bad", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const text = status.local
    ? `${status.local.companies.toLocaleString()} companies · shared directory, downloaded ${timeAgo(status.local.updated_at)}`
    : status.present
      ? "Built on this computer · switch to the shared directory to get everyone's additions"
      : "Not downloaded yet";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
      <Database className="size-4 shrink-0 text-muted" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Company directory:</span> <span className="text-muted">{text}</span>
        {status.outbox > 0 && <span className="text-muted"> · {status.outbox} of your additions waiting to be shared</span>}
      </p>
      <Button size="sm" variant={status.present ? "ghost" : "primary"} onClick={() => void update()} disabled={busy}>
        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <CloudDownload className="size-3.5" />}
        {busy ? "Updating…" : status.present ? "Update now" : "Download directory"}
      </Button>
      {message && <p className={cx("w-full text-xs", message.tone === "bad" ? "text-bad" : "text-muted")}>{message.text}</p>}
    </div>
  );
}
