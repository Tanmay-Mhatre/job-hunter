import type { Seniority } from "@rawjobs/core/catalog/seniority";
import type { Job } from "./data";

/** Why a job was marked Not interested. Optional, one tap, kept on the Entry. */
export const REASONS = [
  { id: "too-senior", label: "Too senior" },
  { id: "too-junior", label: "Too junior" },
  { id: "location", label: "Location" },
  { id: "pay", label: "Pay too low" },
  { id: "company", label: "Company" },
  { id: "field", label: "Not my field" },
  { id: "skills", label: "Skills don't fit" },
  { id: "other", label: "Other" },
] as const;
export type Reason = (typeof REASONS)[number]["id"];
export const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.id, r.label])) as Record<Reason, string>;
export const isReason = (v: unknown): v is Reason => typeof v === "string" && v in REASON_LABEL;

/**
 * A rule you confirmed after a reason: hides matching jobs from the Radar (like a hidden company).
 * Lives in Prefs, so it travels with the export. Hidden companies stay in Prefs.hiddenCompanies.
 */
export type HideRule =
  | { kind: "seniority"; level: Seniority }
  /** "Dubai, United Arab Emirates" (a city, as Job.cities names it) or "United Arab Emirates" (a country). */
  | { kind: "place"; place: string }
  /** Jobs whose top listed pay is at most `max`, in the same currency and period. */
  | { kind: "pay"; max: number; currency: string; period: string };

/** What a reason can offer to do: a rule, or hiding the company. */
export type Offer = { kind: "rule"; rule: HideRule } | { kind: "company"; company: string };

/** One key per rule; pay rules are one per currency and period (a new one replaces the old). */
export const ruleKey = (r: HideRule) => (r.kind === "seniority" ? `seniority:${r.level}` : r.kind === "place" ? `place:${r.place}` : `pay:${r.currency}:${r.period}`);

const LEVEL_WORDS: Record<Seniority, string> = {
  leadership: "head, director and VP",
  principal: "principal, staff and lead",
  senior: "senior",
  mid: "mid-level",
  entry: "entry-level and associate",
};
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
/** "Dubai, United Arab Emirates" -> "Dubai". */
const placeName = (place: string) => place.replace(/, [^,]+$/, "");
const payText = (r: Extract<HideRule, { kind: "pay" }>) => `${r.currency} ${compact.format(r.max)}${r.period ? ` / ${r.period}` : ""}`;

/** The jobs a rule or offer hides, as a phrase: "senior roles", "jobs in Dubai", "jobs at Acme". */
export function offerWhat(o: Offer): string {
  if (o.kind === "company") return `jobs at ${o.company}`;
  const r = o.rule;
  if (r.kind === "seniority") return `${LEVEL_WORDS[r.level]} roles`;
  if (r.kind === "place") return `jobs in ${placeName(r.place)}`;
  return `jobs paying ${payText(r)} or less`;
}

/** As a list item: "Senior roles". */
export const ruleLabel = (r: HideRule) => {
  const what = offerWhat({ kind: "rule", rule: r });
  return what.charAt(0).toUpperCase() + what.slice(1);
};

/** The question and the button for an offer. */
export function offerCopy(o: Offer): { question: string; button: string } {
  const what = offerWhat(o);
  if (o.kind === "company") return { question: `Hide all ${what}?`, button: "Hide company" };
  const r = o.rule;
  if (r.kind === "seniority") return { question: `Hide all ${what}?`, button: `Hide ${what}` };
  if (r.kind === "place") return { question: `Hide ${what}?`, button: `Hide ${what}` };
  return { question: `Hide ${what}?`, button: "Hide lower-paid jobs" };
}

const topPay = (s: Job["salary"]) => s?.max ?? s?.min;
const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

/** The one clear place a job names: its only city, else its only country. Remote jobs have none. */
export function clearPlace(j: Pick<Job, "cities" | "countries" | "workplace">): string | undefined {
  if (j.workplace === "remote") return undefined;
  if (j.cities.length === 1) return j.cities[0];
  if (!j.cities.length && j.countries.length === 1) return j.countries[0];
  return undefined;
}

/**
 * What a reason offers for this job, or a note saying why it offers nothing. Field, skills and
 * other never offer a rule: there's no honest one to make from them.
 */
export function offerFor(reason: Reason, j: Job): { offer: Offer } | { note: string } {
  const noted = "Noted. This helps tune your matches later.";
  switch (reason) {
    case "too-senior":
    case "too-junior":
      return { offer: { kind: "rule", rule: { kind: "seniority", level: j.seniority } } };
    case "company":
      return { offer: { kind: "company", company: j.company } };
    case "location": {
      const place = clearPlace(j);
      return place ? { offer: { kind: "rule", rule: { kind: "place", place } } } : { note: "Noted. This job doesn't name one clear place to hide." };
    }
    case "pay": {
      const max = topPay(j.salary);
      if (max == null || !j.salary?.currency) return { note: "Noted. This job doesn't list its pay, so there's nothing to compare others with." };
      return { offer: { kind: "rule", rule: { kind: "pay", max, currency: j.salary.currency.toUpperCase(), period: norm(j.salary.period) } } };
    }
    default:
      return { note: noted };
  }
}

/** Does this one rule hide the job? Unknown never fails: no salary, another currency, or no place is never hidden. */
export function ruleHides(r: HideRule, j: Job): boolean {
  if (r.kind === "seniority") return j.seniority === r.level;
  if (r.kind === "pay") {
    const top = topPay(j.salary);
    return top != null && norm(j.salary?.currency) === norm(r.currency) && norm(j.salary?.period) === r.period && top <= r.max;
  }
  return placesHidden(j, new Set([r.place]));
}

/**
 * A job is hidden by place only when every country it names is hidden: the country itself, or all of
 * the job's cities there. "London or Berlin" stays while only London is hidden.
 */
function placesHidden(j: Job, places: ReadonlySet<string>): boolean {
  if (!j.countries.length) return false;
  return j.countries.every((country) => {
    if (places.has(country)) return true;
    const cities = j.cities.filter((c) => c.endsWith(`, ${country}`));
    return cities.length > 0 && cities.every((c) => places.has(c));
  });
}

/** Do your rules hide this job? Place rules count together ("Dubai" + "Abu Dhabi" hides a job in both). */
export function hiddenByRules(j: Job, rules: readonly HideRule[] | undefined): boolean {
  if (!rules?.length) return false;
  const places = new Set<string>();
  for (const r of rules) {
    if (r.kind === "place") places.add(r.place);
    else if (ruleHides(r, j)) return true;
  }
  return places.size > 0 && placesHidden(j, places);
}
