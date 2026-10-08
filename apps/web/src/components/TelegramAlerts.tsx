import { Check, ExternalLink, LoaderCircle, Send } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { telegramAction, telegramStatus, type TelegramAction, type TelegramStatus } from "../lib/automation";
import { Button, cx, Toggle } from "./ui";

/**
 * Telegram alerts in three steps: make a bot, send it a message, done. Your bot token stays on this
 * computer (profile/secrets.json), never in your config.
 */
export function TelegramAlerts({
  onChanged,
  onConnected,
  footnote,
}: {
  onChanged: () => Promise<void>;
  /** Called once the bot is connected (the setup is done). */
  onConnected?: () => void;
  /** Replaces the footnote (what messages you'll get). */
  footnote?: string;
}) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<TelegramAction | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const refresh = useCallback(async () => setStatus(await telegramStatus()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (action: TelegramAction, body?: unknown, ok?: (r: { bot?: string; name?: string }) => string) => {
    setBusy(action);
    setNote(null);
    try {
      const r = await telegramAction(action, body);
      if (!r.ok) setNote({ tone: "bad", text: r.error ?? "Something went wrong." });
      else if (ok) setNote({ tone: "ok", text: ok(r) });
      await refresh();
      if (r.ok && (action === "connect" || action === "on" || action === "off" || action === "forget")) await onChanged();
      if (r.ok && action === "token") setToken("");
      if (r.ok && action === "connect") onConnected?.();
    } finally {
      setBusy(null);
    }
  };

  if (!status) return <p className="flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" /> Checking…</p>;
  if (status.error) return <p className="text-sm text-bad">{status.error}</p>;

  const spin = (a: TelegramAction) => busy === a && <LoaderCircle className="size-3.5 animate-spin" />;
  const botLink = status.bot ? `https://t.me/${status.bot.replace(/^@/, "")}` : undefined;
  const step = !status.token ? 1 : !status.connected ? 2 : 3;

  return (
    <div className="space-y-4">
      {step < 3 ? (
        <ol className="space-y-3">
          <Step n={1} done={step > 1} title="Make your own bot">
            {step === 1 ? (
              <>
                <p className="text-sm text-muted">
                  In Telegram, open{" "}
                  <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-medium text-accent">
                    @BotFather <ExternalLink className="inline size-3" />
                  </a>
                  , send <code className="rounded bg-surface-2 px-1">/newbot</code>, pick any name, and copy the token it gives you.
                </p>
                <form
                  className="mt-2 flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("token", { token }, (r) => `Found your bot ${r.bot}.`);
                  }}
                >
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="123456789:AAF…"
                    aria-label="Bot token from BotFather"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 font-mono text-sm outline-none focus:border-accent"
                  />
                  <Button type="submit" variant="primary" disabled={!token.trim() || !!busy}>
                    {spin("token")} Check token
                  </Button>
                </form>
              </>
            ) : (
              <p className="text-sm text-muted">
                Bot {status.bot ?? status.token} ·{" "}
                <button type="button" className="font-medium text-accent" onClick={() => void act("forget")}>
                  use another bot
                </button>
              </p>
            )}
          </Step>
          <Step n={2} done={false} title="Say hi to it" muted={step < 2}>
            {step === 2 && (
              <>
                <p className="text-sm text-muted">
                  Open{" "}
                  {botLink ? (
                    <a href={botLink} target="_blank" rel="noreferrer" className="font-medium text-accent">
                      {status.bot} <ExternalLink className="inline size-3" />
                    </a>
                  ) : (
                    "your bot"
                  )}{" "}
                  in Telegram and press <b>Start</b> (or send it any message). That tells us where to send your alerts.
                </p>
                <Button className="mt-2" variant="primary" onClick={() => void act("connect", undefined, (r) => `Connected. Check Telegram, ${r.name}: we sent a welcome message.`)} disabled={!!busy}>
                  {spin("connect")} I've sent it
                </Button>
              </>
            )}
          </Step>
        </ol>
      ) : (
        <div className="space-y-3">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
              <Check className="size-3.5" /> Connected
            </span>
            New jobs go to {status.bot ?? "your bot"} on Telegram.
          </p>
          <Toggle checked={status.enabled} onChange={(on) => void act(on ? "on" : "off")}>
            Send alerts after scheduled scans
          </Toggle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void act("test", undefined, () => "Sent. Check Telegram.")} disabled={!!busy}>
              {busy === "test" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send a test message
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void act("forget")} disabled={!!busy || status.fromEnv}>
              Disconnect
            </Button>
          </div>
        </div>
      )}
      {note && <p className={cx("text-sm", note.tone === "bad" ? "text-bad" : "text-good")}>{note.text}</p>}
      <p className="text-xs text-muted">
        {footnote ?? "One message per scheduled scan, only when there are new jobs for you (best first, up to 10). Scans you start yourself don't send one."} Your bot token is kept on this computer only.
      </p>
    </div>
  );
}

function Step({ n, title, done, muted, children }: { n: number; title: string; done: boolean; muted?: boolean; children?: ReactNode }) {
  return (
    <li className={cx("flex gap-3", muted && "opacity-50")}>
      <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", done ? "border-accent bg-accent text-accent-fg" : "border-line")}>
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {children && <div className="mt-1">{children}</div>}
      </div>
    </li>
  );
}
