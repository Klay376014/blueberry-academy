import { tallyOf } from './battleStats'
import type { ResultUnit, StatsRow } from './battleStats'

/**
 * The two curves behind "how have I been doing lately", as pure functions over
 * units and rows that have already been fetched and filtered.
 *
 * Both are plotted against the calendar rather than against a game number:
 * a two-month break shows up as a gap, and a slump that follows one is a real
 * signal a game index would flatten away.
 *
 * Both carry **one point per calendar day**. The axis is a calendar, so that
 * is the resolution it can show: measured on a real account, nine games in one
 * day put nine points inside thirty pixels, and a rating that moved 240 points
 * across them drew as a vertical spike rather than as a day of laddering.
 *
 * See docs/specs/2026-08-16-replay-analytics-design.md §7 and decision Q21.
 */

/** Epoch milliseconds — the chart's x scale is time, and time wants a number. */
type Timestamp = number

export interface TrendPoint {
  date: Timestamp
  /** The window's win rate. Ties are in the denominator only. */
  rate: number
  /** How many units that rate is over — the window, or everything before it. */
  games: number
}

export interface RatingPoint {
  date: Timestamp
  /**
   * `undefined`, never `null`, where the battle carried no rating.
   *
   * Unovis breaks a line at `undefined` and plots `null` as zero
   * (unovis.dev/docs/xy-charts/Line, "Dealing with missing data"), so the
   * distinction is the whole of decision Q21's "no interpolation".
   */
  rating: number | undefined
}

/**
 * A series as the chart takes it: one shape for both curves, so the chart
 * component needs no branch and no generic.
 */
export interface SeriesPoint {
  date: Timestamp
  /** `undefined`, never `null`, where there is no reading — see `RatingPoint`. */
  value: number | undefined
}

export interface Streak {
  kind: 'win' | 'loss' | 'none'
  length: number
}

/**
 * The calendar day a timestamp falls on, in the reader's own timezone —
 * the same day the axis labels name.
 */
function dayOf(playedAt: string): string {
  const when = new Date(playedAt)

  return `${when.getFullYear()}-${when.getMonth()}-${when.getDate()}`
}

/** Oldest first, whatever order the caller had them in. */
function inPlayedOrder(units: ResultUnit[]): ResultUnit[] {
  return units.toSorted((a, b) => a.playedAt.localeCompare(b.playedAt))
}

/**
 * A trailing win rate per unit played, over the last `window` units.
 *
 * The window widens up to its size rather than the curve starting late: a
 * user with twelve games would otherwise be shown an empty chart. Each point
 * carries the sample it was computed over, so an early point can be labelled
 * for what it is instead of passing as a full window.
 */
export function slidingWinRate(units: ResultUnit[], window: number): TrendPoint[] {
  const size = Math.max(1, Math.floor(window))
  const played = inPlayedOrder(units)
  const byDay = new Map<string, TrendPoint>()

  played.forEach((unit, index) => {
    const slice = played.slice(Math.max(0, index - size + 1), index + 1)
    const tally = tallyOf(slice.map((each) => each.result))

    // Last write wins, so a day is left holding the rate it ended on. A Map
    // keeps the position of the first write, which is the day's own place in
    // the order.
    byDay.set(dayOf(unit.playedAt), {
      date: Date.parse(unit.playedAt),
      rate: tally.winRate,
      games: tally.games,
    })
  })

  return [...byDay.values()]
}

/**
 * Where the last unit played leaves a run of wins or of losses.
 *
 * A tie ends a run and starts nothing: it is neither the outcome a win streak
 * is made of nor the one a losing streak is.
 */
export function currentStreak(units: ResultUnit[]): Streak {
  const played = inPlayedOrder(units)
  const last = played.at(-1)

  if (!last || last.result === 'tie') return { kind: 'none', length: 0 }

  let length = 0
  for (let index = played.length - 1; index >= 0; index -= 1) {
    if (played[index]!.result !== last.result) break
    length += 1
  }

  return { kind: last.result, length }
}

/**
 * Ladder rating over time: where each day closed.
 *
 * The day's last *rated* battle, because only some ladder games get a replay
 * uploaded — the ladder keeps moving between the ones that did, so no reading
 * between two stored battles is ours to draw. A closing price is a number that
 * was really true at a moment; a daily average never was.
 *
 * Read per game rather than per unit whatever the aggregation: a rating is
 * something the ladder did to a single battle, and a series has none. Games
 * with no declared winner are kept — the tallies leave them out because there
 * is no result to count, but the rating they carry still happened.
 */
export function ratingSeries(rows: StatsRow[]): RatingPoint[] {
  const byDay = new Map<string, RatingPoint>()
  const played = rows.toSorted((a, b) => a.played_at.localeCompare(b.played_at))

  for (const row of played) {
    const day = dayOf(row.played_at)

    // A day of nothing but unrated battles keeps its `undefined` and breaks
    // the line; one rated battle in it is what the day closed at.
    if (row.rating === null && byDay.has(day)) continue

    byDay.set(day, { date: Date.parse(row.played_at), rating: row.rating ?? undefined })
  }

  return [...byDay.values()]
}
