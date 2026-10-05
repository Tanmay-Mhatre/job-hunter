import { citiesIn, countriesIn } from "./catalog/places";
import { seniorityOf } from "./catalog/seniority";
import type { DashboardJob, Job } from "./schema";

/**
 * The dashboard's view of a job: no description (that's in descriptions.json), plus countries,
 * seniority and a duplicate group. Pure, so the browser can convert an older jobs.json too.
 */
export function toDashboardJob(job: Job): DashboardJob {
  const { description, missedRuns: _missed, ...rest } = job;
  return {
    ...rest,
    countries: countriesIn(job.location, job.country),
    cities: citiesIn(job.location),
    seniority: seniorityOf(job.title),
    group: `${job.company}|${job.title.toLowerCase().replace(/\s+/g, " ").trim()}`,
    hasDescription: !!description,
  };
}
