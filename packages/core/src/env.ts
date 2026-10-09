/** A RAWJOBS_<name> setting, or JOBHUNTER_<name> from before the rename to RawJobs. */
export const envSetting = (name: string): string | undefined => process.env[`RAWJOBS_${name}`] ?? process.env[`JOBHUNTER_${name}`];
