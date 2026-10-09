import { BellRing, Check, LoaderCircle, RefreshCw, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { telegramStatus, type TelegramStatus } from "../lib/automation";
import type { ScanState } from "../lib/scan";
import { Dialog } from "./Dialog";
import { TelegramAlerts } from "./TelegramAlerts";
import { Button, Card, IconButton } from "./ui";

/** Settings › Telegram alerts. */
const toTelegramSettings = () => {
  location.hash = "settings?section=alerts";
};

/**
 * During an "All companies" scan (minutes with the job feed, up to 2 hours without): offer a Telegram message when it's done. Set up
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
    if (result === "sent")
      return (
        <Card className="px-4 py-2.5 text-sm text-good">
          <p className="flex items-center gap-2" role="status">
            <Send className="size-4" /> Sent you a Telegram message with the results ({bot}).
          </p>
        </Card>
      );
    const reason = result.replace(/^failed: /, "");
    return (
      <Card className="px-4 py-2.5 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1" role="alert">
          <X className="size-4 shrink-0 text-bad" />
          <span className="min-w-0 flex-1">
            <span className="text-bad">Couldn't send the Telegram message.</span>{" "}
            <span className="text-muted">
              {result === "off" ? "Telegram isn't connected yet." : "Check that Telegram is still connected and send a test message."} Your results are on the Radar either way.
            </span>
          </span>
          <Button size="sm" onClick={toTelegramSettings}>
            {result === "off" ? "Set up Telegram" : "Open Telegram settings"}
          </Button>
        </p>
        {result !== "off" && (
          <details className="mt-1 text-xs text-muted">
            <summary className="cursor-pointer">Technical details</summary>
            <p className="mt-1 whitespace-pre-wrap font-mono">{reason}</p>
          </details>
        )}
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
        <p className="flex items-center gap-2 text-sm text-good" role="status">
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
          {failed && (
            <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs" role="alert">
              <span className="text-bad">Couldn't set up the message.</span>
              <span className="text-muted">The scan may have just finished, or it was started from another tab or by a schedule. Messages can only be set up for a scan started on this page.</span>
              <Button size="sm" variant="ghost" onClick={() => void ask()} disabled={busy}>
                <RefreshCw className="size-3.5" /> Try again
              </Button>
            </span>
          )}
        </div>
      )}

      <Dialog open={setup} onClose={() => setSetup(false)} labelledBy="tg-setup-title" placement="bottom">
        <Card className="relative max-h-[90vh] overflow-y-auto p-5 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="tg-setup-title" className="text-lg font-semibold">
                Get a Telegram message when it's done
              </h2>
              <p className="mt-0.5 text-sm text-muted">Two quick steps, once. Your scan keeps running meanwhile.</p>
            </div>
            <IconButton label="Close" className="-mr-2 -mt-1" onClick={() => setSetup(false)}>
              <X className="size-4" />
            </IconButton>
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
      </Dialog>
    </Card>
  );
}
