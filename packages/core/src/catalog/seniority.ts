import { matchesAny } from "../text";

/** Seniority read from a job title. No AI: whole-word title cues, most senior first. */
export type Seniority = "leadership" | "principal" | "senior" | "mid" | "entry";

export const SENIORITY_LEVELS: { id: Seniority; label: string }[] = [
  { id: "leadership", label: "Head, Director & VP" },
  { id: "principal", label: "Principal, Staff & Lead" },
  { id: "senior", label: "Senior" },
  { id: "mid", label: "Mid-level" },
  { id: "entry", label: "Entry & Associate" },
];

const CUES: [Seniority, string[]][] = [
  ["leadership", ["head", "director", "vp", "vice president", "chief", "cpo", "cto", "ceo", "coo", "svp", "evp", "general manager", "managing director"]],
  ["principal", ["principal", "staff", "lead", "group product manager", "distinguished", "architect"]],
  ["senior", ["senior", "sr", "snr", "iii", "level 3"]],
  ["entry", ["junior", "jr", "associate", "entry", "graduate", "grad", "intern", "internship", "apprentice", "trainee"]],
];

export function seniorityOf(title: string): Seniority {
  return seniorityCue(title) ?? "mid";
}

/** The level a title or term names outright; undefined when it has no cue ("Product Manager", "group"). */
export function seniorityCue(text: string): Seniority | undefined {
  for (const [level, cues] of CUES) if (matchesAny(text, cues)) return level;
  return undefined;
}

/** Steps between two levels, in SENIORITY_LEVELS order: senior to mid is 1, senior to director is 2. */
export function seniorityGap(a: Seniority, b: Seniority): number {
  const at = (l: Seniority) => SENIORITY_LEVELS.findIndex((x) => x.id === l);
  return Math.abs(at(a) - at(b));
}
