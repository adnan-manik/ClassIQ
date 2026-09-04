/**
 * Small pure helpers shared by the dashboards (kept dependency-free so they
 * are trivially unit-testable with Vitest).
 */

/** Signed integer/float formatting: 3 → "+3", −2 → "-2", 0 → "0". */
export function signed(n: number, digits = 0): string {
  const v = digits > 0 ? n.toFixed(digits) : String(Math.round(n));
  return n > 0 ? `+${v}` : v;
}

/** Arithmetic mean rounded to one decimal, or null for an empty list. */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** Percentage share of `part` in `total`, rounded, 0 when total is 0. */
export function pctShare(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** Per-axis pole share for a list of signed FSLSM scores (matches the backend). */
export function poleShare(scores: number[]): { a: number; b: number } {
  const a = scores.filter((s) => s > 0).length;
  const b = scores.filter((s) => s < 0).length;
  const total = a + b;
  if (total === 0) return { a: 0, b: 0 };
  return { a: Math.round((a / total) * 100), b: Math.round((b / total) * 100) };
}

/** Delta between a scenario and a baseline score; null without a baseline. */
export function scoreDelta(baseline: number | null, scenario: number | null): number | null {
  if (baseline == null || scenario == null) return null;
  return scenario - baseline;
}
