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
  for (const [level, cues] of CUES) if (matchesAny(title, cues)) return level;
  return "mid";
}
