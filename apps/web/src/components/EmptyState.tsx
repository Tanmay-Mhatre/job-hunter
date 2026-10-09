import type { ReactNode } from "react";
import { Card, cx } from "./ui";

type Props = {
  title: string;
  children: ReactNode;
  /** Buttons; the first should be the primary action. */
  actions?: ReactNode;
  className?: string;
};

/** One look for every "nothing here yet" screen (the kit's `rj-empty`): what this page is for, what to do next. */
export function EmptyState({ title, children, actions, className }: Props) {
  return (
    <Card className={cx("p-0", className)}>
      <div className="rj-empty">
        <h2 className="rj-empty__title">{title}</h2>
        <div className="rj-empty__body">{children}</div>
        {actions && <div className="rj-empty__actions">{actions}</div>}
      </div>
    </Card>
  );
}

/** Slim inline prompt for pages that still work without setup (e.g. Settings). */
export function SetupBanner({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-inset px-4 py-3 type-small">
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}
