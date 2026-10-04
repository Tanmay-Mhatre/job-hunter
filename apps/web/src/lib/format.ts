import type { Job } from "./data";

const DAY = 86_400_000;

export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  if (ms < 60_000) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}

export function ageDays(iso: string | undefined, now = Date.now()): number {
  return iso ? (now - Date.parse(iso)) / DAY : Infinity;
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export function formatSalary(s: Job["salary"]): string | null {
  if (!s || (s.min == null && s.max == null)) return null;
  const range = s.min != null && s.max != null && s.min !== s.max ? `${compact.format(s.min)}–${compact.format(s.max)}` : compact.format((s.min ?? s.max)!);
  return `${s.currency ? `${s.currency} ` : ""}${range}${s.period ? ` / ${s.period}` : ""}`;
}

export type Band = "top" | "mid" | "low" | "none";

export function scoreBand(score: number, min: number): Band {
  if (score <= 0) return "none";
  if (score >= min) return "top";
  if (score >= min - 20) return "mid";
  return "low";
}

/** The date a job counts from: ATS posting date, else when we first saw it. */
export const postedOrSeen = (j: Job) => j.postedAt ?? j.firstSeen;
