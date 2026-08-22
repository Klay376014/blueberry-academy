/**
 * The Wilson score interval's lower bound — the sort key for every grouping in
 * the dashboard.
 *
 * Raw win rate cannot be used for ranking: a team played three times and won
 * three times sits at 100% and would top the table forever, above the team
 * that went 14–20 over a season. The Wilson lower bound asks "how low could
 * the true rate plausibly be, given this many games", so three games buy very
 * little confidence and that team drops below the twenty-game one on its own,
 * without a minimum-sample rule that would make a user's team disappear.
 *
 * See docs/specs/2026-08-16-replay-analytics-design.md §7 and CONTEXT.md,
 * 「Wilson score 下界」.
 */

/**
 * z for a 95% interval. Written out rather than rounded to 1.96 so that the
 * numbers in tests are the ones a statistics table gives.
 */
export const WILSON_Z = 1.959963984540054

/**
 * The lower bound, in `0..1`.
 *
 * Zero games returns 0 rather than throwing or returning NaN: a grouping with
 * no games is a real thing to sort — it just sorts last — and a NaN would
 * quietly scramble the whole comparison instead of putting one row at the
 * bottom.
 *
 * `wins` is clamped into `0..games`, so a caller that counts ties into the
 * denominator only (which is what this dashboard does) cannot produce a bound
 * above 1.
 */
export function wilsonLowerBound(wins: number, games: number, z: number = WILSON_Z): number {
  if (games <= 0) return 0

  const won = Math.min(Math.max(wins, 0), games)
  const rate = won / games

  const zz = z * z
  const denominator = 1 + zz / games
  const centre = rate + zz / (2 * games)
  const margin = z * Math.sqrt((rate * (1 - rate)) / games + zz / (4 * games * games))

  // Clamped at zero: with a wide z and a single loss the arithmetic can land a
  // hair below it, and a negative "how low could it plausibly be" is not a
  // number to show or sort by.
  return Math.max((centre - margin) / denominator, 0)
}
