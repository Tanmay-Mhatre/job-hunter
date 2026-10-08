import { BellRing, Check, LoaderCircle, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { telegramStatus, type TelegramStatus } from "../lib/automation";
import type { ScanState } from "../lib/scan";
import { TelegramAlerts } from "./TelegramAlerts";
import { Button, Card, cx } from "./ui";

/**
 * During an "All companies" scan (about 2 hours): offer a Telegram message when it's done. Set up
 * already: one click. Not yet: the Telegram setup opens, and the message is switched on once it's
 * connected. Then it says what will happen, and finally what did.
 */
export function NotifyWhenDone({ scan, onNotify, onSaved }: { scan: ScanState; onNotify: () => Promise<boolean>; onSaved: () => Promise<void> }) {
  const [tg, setTg] = useState<TelegramStatus | null>(null);
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const longScan = scan.scope === "all";

  useEffect(() => {
    if (longScan) void telegramStatus().then(setTg);
  }, [longScan]);

  if (!longScan) return null;
  const connected = !!tg?.token && tg.connected;
  const bot = tg?.bot ?? "your Telegram bot";

  // After the scan: what happened to the message.
  if (scan.phase !== "running") {
    const result = scan.notify?.result;
    if (!scan.notify?.asked || !result) return null;
    return (
      <Card className={cx("flex items-center gap-2 px-4 py-2.5 text-sm", result === "sent" ? "text-good" : "text-bad")}>
        {result === "sent" ? <Send className="size-4" /> : <X className="size-4" />}
        {result === "sent" ? `Sent you a Telegram message with the results (${bot}).` : result === "off" ? "Couldn't send the Telegram message: Telegram isn't connected." : `Couldn't send the Telegram message: ${result.replace(/^failed: /, "")}`}
      </Card>
    );
  }

  const ask = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await onNotify();
    setFailed(!ok);
    setBusy(false);
  };

  return (
    <Card className="px-4 py-2.5">
      {scan.notify?.asked ? (
        <p className="flex items-center gap-2 text-sm text-good">
          <Check className="size-4" /> We'll send you a Telegram message ({bot}) when this scan finishes, with any new jobs it found.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <BellRing className="size-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">This scan takes a while. Get a Telegram message when it's done, so you don't have to keep checking.</span>
          {!tg ? (
            <LoaderCircle className="size-4 animate-spin text-muted" />
          ) : (
            <Button size="sm" variant="primary" onClick={() => (connected ? void ask() : setSetup(true))} disabled={busy}>
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {connected ? "Notify me on Telegram" : "Set up Telegram & notify me"}
            </Button>
          )}
          {failed && <span className="w-full text-xs text-bad">The scan already finished, or isn't running from this page.</span>}
        </div>
      )}

      {setup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="tg-setup-title">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSetup(false)} />
          <Card className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="tg-setup-title" className="text-lg font-semibold">
                  Get a Telegram message when it's done
                </h2>
                <p className="mt-0.5 text-sm text-muted">Two quick steps, once. Your scan keeps running meanwhile.</p>
              </div>
              <button type="button" aria-label="Close" className="rounded p-1 text-muted hover:text-fg" onClick={() => setSetup(false)}>
                <X className="size-4" />
              </button>
            </div>
            <TelegramAlerts
              footnote="Once it's connected, we'll message you when this scan finishes. Scheduled scans can then send you new jobs too."
              onChanged={onSaved}
              onConnected={() => {
                void telegramStatus().then(setTg);
                void ask();
                setSetup(false);
              }}
            />
          </Card>
        </div>
      )}
    </Card>
  );
}
