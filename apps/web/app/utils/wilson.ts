/**
 * The Wilson score interval's lower bound — the sort key for every grouping in
 * the dashboard, in place of raw win rate, which would leave three games won
 * from three above a season of 14–20 forever.
 *
 * See docs/specs/2026-08-16-replay-analytics-design.md §7.
 */

/** z for a 95% interval. */
export const WILSON_Z = 1.959963984540054

/**
 * The lower bound, in `0..1`. Zero games returns 0 rather than NaN, so an
 * empty grouping sorts last instead of scrambling the comparison.
 */
export function wilsonLowerBound(wins: number, games: number, z: number = WILSON_Z): number {
  if (games <= 0) return 0

  const won = Math.min(Math.max(wins, 0), games)
  const rate = won / games

  const zz = z * z
  const denominator = 1 + zz / games
  const centre = rate + zz / (2 * games)
  const margin = z * Math.sqrt((rate * (1 - rate)) / games + zz / (4 * games * games))

  // With a single loss the arithmetic lands a hair either side of zero.
  return Math.max((centre - margin) / denominator, 0)
}
