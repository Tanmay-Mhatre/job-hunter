import { Dialog } from "./Dialog";
import { JobDetail, type JobDetailProps } from "./JobDetail";

/** JobDetail as a full-height side drawer: phones (Radar) and the Pipeline. Focus is trapped and returns on close. */
export function JobDrawer(props: JobDetailProps & { onClose: () => void }) {
  return (
    <Dialog open onClose={props.onClose} label={props.job.title} placement="right" className="sm:max-w-xl">
      <div className="h-full w-full border-l border-line bg-surface shadow-2xl">
        <JobDetail {...props} />
      </div>
    </Dialog>
  );
}
