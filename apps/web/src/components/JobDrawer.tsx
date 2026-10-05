import { useEffect, useRef } from "react";
import { JobDetail, type JobDetailProps } from "./JobDetail";

/** JobDetail as a full-height overlay: phones (Radar) and the Pipeline. */
export function JobDrawer(props: JobDetailProps & { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, [props.job.id]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={props.job.title}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={props.onClose} />
      <div ref={panelRef} tabIndex={-1} className="relative h-full w-full border-l border-line bg-surface shadow-2xl outline-none sm:max-w-xl">
        <JobDetail {...props} />
      </div>
    </div>
  );
}
