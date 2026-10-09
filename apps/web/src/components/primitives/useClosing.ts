import { useEffect, useState } from "react";

/**
 * Keep something mounted while it plays its exit animation (design/README.md, Motion: set
 * data-state="closing" and remove on animationend). `done` is called from onAnimationEnd; a timer
 * covers browsers or tests where the animation never runs.
 */
export function useClosing(open: boolean, fallbackMs = 250) {
  const [mounted, setMounted] = useState(open);
  const closing = mounted && !open;

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => setMounted(false), fallbackMs);
    return () => clearTimeout(t);
  }, [closing, fallbackMs]);

  return {
    mounted: mounted || open,
    state: closing ? ("closing" as const) : undefined,
    done: () => closing && setMounted(false),
  };
}
