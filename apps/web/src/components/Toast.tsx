import { X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * App-wide toasts with an optional action (usually "Undo"). Call `toast({...})` from anywhere; <Toaster /> is
 * mounted once in App. Toasts auto-dismiss after `duration`, but the timer pauses while hovered or focused so
 * keyboard and screen-reader users can reach the action (WCAG 2.2.1).
 */
export type ToastInput = {
  message: ReactNode;
  /** e.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  /** ms; default 7000. */
  duration?: number;
  tone?: "plain" | "bad";
};
type ToastItem = ToastInput & { id: number };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: ToastInput): number {
  const id = nextId++;
  // Keep at most three on screen; the newest goes last (closest to the user's eye at the bottom).
  items = [...items.slice(-2), { ...t, id }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const snapshot = () => items;

export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
      {list.map((t) => (
        <ToastRow key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastRow({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(item.duration ?? 7000);
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismissToast(item.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [paused, item.id]);

  return (
    <div
      className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm shadow-xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={item.tone === "bad" ? "text-bad" : undefined}>{item.message}</span>
      {item.actionLabel && item.onAction && (
        <button
          type="button"
          className="min-h-8 shrink-0 rounded-md px-1 font-medium text-accent hover:underline"
          onClick={() => {
            item.onAction!();
            dismissToast(item.id);
          }}
        >
          {item.actionLabel}
        </button>
      )}
      <button type="button" aria-label="Dismiss" className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" onClick={() => dismissToast(item.id)}>
        <X className="size-4" />
      </button>
    </div>
  );
}
