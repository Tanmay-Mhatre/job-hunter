/**
 * How many boards exist that no source has seen yet? Incidence-based Chao2: each independent source
 * family is one sample; boards seen by exactly one family (Q1) vs exactly two (Q2) tell how much is
 * still unseen. Sources that copy from the same crawls make this a lower bound, not the truth.
 */
export type Chao2 = { observed: number; estimate: number; q1: number; q2: number; samples: number };

/** `incidence` = for each observed board, the number of families that list it (≥ 1). */
export function chao2(incidence: number[], samples: number): Chao2 {
  const observed = incidence.length;
  const q1 = incidence.filter((n) => n === 1).length;
  const q2 = incidence.filter((n) => n === 2).length;
  const m = Math.max(samples, 2);
  const factor = (m - 1) / m;
  // Bias-corrected form when no board is seen exactly twice.
  const unseen = q2 > 0 ? (factor * q1 * q1) / (2 * q2) : (factor * q1 * (q1 - 1)) / 2;
  return { observed, estimate: Math.round(observed + unseen), q1, q2, samples };
}
