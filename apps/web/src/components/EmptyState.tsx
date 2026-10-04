import type { ReactNode } from "react";
import { Card, cx } from "./ui";

type Props = {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  /** Buttons; the first should be the primary action. */
  actions?: ReactNode;
  className?: string;
};

/** One look for every "nothing here yet" screen: icon, what this page is for, what to do next. */
export function EmptyState({ icon, title, children, actions, className }: Props) {
  return (
    <Card className={cx("px-6 py-12 text-center sm:py-14", className)}>
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </Card>
  );
}

/** Slim inline prompt for pages that still work without setup (e.g. Settings). */
export function SetupBanner({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}
