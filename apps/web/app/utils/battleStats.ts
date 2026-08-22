import { wilsonLowerBound } from './wilson'

/**
 * The arithmetic behind both dashboard sections, as pure functions over rows
 * that have already been fetched.
 *
 * It is deliberately separate from the query: the sliding-window win rate
 * curve needs the individual games anyway (a window is over games, and the
 * x-axis is calendar dates), so one filtered fetch feeds both perspectives and
 * everything below is derived in the browser. That also makes every rule here
 * — series folding, the `bring_complete` floor, the sort key — testable
 * without a database.
 *
 * See docs/specs/2026-08-16-replay-analytics-design.md §7 and CONTEXT.md.
 */

export type BattleResult = 'win' | 'loss' | 'tie'

/**
 * A `battles` row as the stats layer reads it — the columns it slices on and
 * nothing else. Snake case, because these are the database's own names and a
 * rename in the middle would only be one more thing to keep in step.
 */
export interface StatsRow {
  replay_id: string
  played_at: string
  format_id: string
  series_id: string | null
  my_username: string | null
  result: BattleResult | null
  rating: number | null
  rating_delta: number | null
  team_signature: string | null
  bring_signature: string | null
  bring_complete: boolean
}

/** Counting by game, or by folding each Bo3 series into one result. */
export type Aggregate = 'game' | 'series'

export interface Tally {
  games: number
  wins: number
  losses: number
  ties: number
  /** `wins / games`. Ties are in the denominator only. */
  winRate: number
  /** The Wilson lower bound of that rate — the sort key, not the rate itself. */
  score: number
}

export interface SignatureStats {
  signature: string
  tally: Tally
}

export interface TeamStats extends SignatureStats {
  /**
   * The bring combinations played with this team, as the drill-down beneath
   * it. Always counted by game: a Bo3 series brings a different four each
   * game, so there is no series-level bring to count.
   */
  brings: SignatureStats[]
}

/**
 * One unit of "a result", which is a game or a whole series depending on the
 * aggregation. `playedAt` is the earliest game in it, so a series sorts by
 * when it started.
 */
export interface ResultUnit {
  key: string
  playedAt: string
  formatId: string
  result: BattleResult
  teamSignature: string | null
}

export function tallyOf(results: BattleResult[]): Tally {
  let wins = 0
  let losses = 0
  let ties = 0

  for (const result of results) {
    if (result === 'win') wins += 1
    else if (result === 'loss') losses += 1
    else ties += 1
  }

  const games = results.length

  return {
    games,
    wins,
    losses,
    ties,
    winRate: games === 0 ? 0 : wins / games,
    score: wilsonLowerBound(wins, games),
  }
}

/**
 * Rows with a result, in the order they were played.
 *
 * A row whose `result` is null is one the log declared no winner for. It is
 * not spectated — the query never returns those — but it has no outcome to
 * count, so it stays out of every denominator rather than being scored as
 * half a game.
 */
function decided(rows: StatsRow[]): StatsRow[] {
  return rows
    .filter((row): row is StatsRow & { result: BattleResult } => row.result !== null)
    .toSorted((a, b) => a.played_at.localeCompare(b.played_at))
}

/**
 * Games as they are, one unit each.
 *
 * The system always stores games, never series — a series result can be
 * derived from its games but not the other way round (CONTEXT.md, Series).
 */
function asGames(rows: StatsRow[]): ResultUnit[] {
  return decided(rows).map((row) => ({
    key: row.replay_id,
    playedAt: row.played_at,
    formatId: row.format_id,
    result: row.result as BattleResult,
    teamSignature: row.team_signature,
  }))
}

/**
 * Each Bo3 series folded into one result, decided by how many of its games
 * each side took.
 *
 * **Judged on the games actually held, not on what Showdown's parent battle
 * says.** A user who imported two of a three-game series has a 1–1 in the
 * database and gets a tie here; claiming a winner would mean inventing the
 * game that is missing.
 *
 * A row with no `series_id` is its own unit: a ladder Bo1 is a series of one,
 * so no branch is needed anywhere downstream.
 */
function asSeries(rows: StatsRow[]): ResultUnit[] {
  const groups = new Map<string, (StatsRow & { result: BattleResult })[]>()

  for (const row of decided(rows) as (StatsRow & { result: BattleResult })[]) {
    // Keyed on the replay id when there is no series, which cannot collide
    // with a series id: one is a battle id, the other its parent's.
    const key = row.series_id ?? `game:${row.replay_id}`
    const group = groups.get(key)

    if (group) group.push(row)
    else groups.set(key, [row])
  }

  return [...groups].map(([key, games]) => {
    const wins = games.filter((game) => game.result === 'win').length
    const losses = games.filter((game) => game.result === 'loss').length

    return {
      key,
      // Earliest, so a series sits on the date it started rather than moving
      // as its later games come in.
      playedAt: games.reduce((a, b) => (a.played_at <= b.played_at ? a : b)).played_at,
      formatId: games[0]!.format_id,
      result: wins > losses ? 'win' : losses > wins ? 'loss' : 'tie',
      // The registered six are the same in every game of a series, so the
      // first game's signature is the series'.
      teamSignature: games[0]!.team_signature,
    } satisfies ResultUnit
  })
}

/** The rows as result units, under the given aggregation. */
export function resultUnits(rows: StatsRow[], aggregate: Aggregate): ResultUnit[] {
  return aggregate === 'series' ? asSeries(rows) : asGames(rows)
}

/** Everything in one number set: "how am I doing lately", before any grouping. */
export function overallTally(rows: StatsRow[], aggregate: Aggregate): Tally {
  return tallyOf(resultUnits(rows, aggregate).map((unit) => unit.result))
}

/** Best first: Wilson bound, then the larger sample, then the name. */
function byScore(a: SignatureStats, b: SignatureStats): number {
  return (
    b.tally.score - a.tally.score ||
    b.tally.games - a.tally.games ||
    a.signature.localeCompare(b.signature)
  )
}

function groupBySignature(
  rows: StatsRow[],
  signatureOf: (row: StatsRow) => string | null,
): Map<string, StatsRow[]> {
  const groups = new Map<string, StatsRow[]>()

  for (const row of rows) {
    const signature = signatureOf(row)

    // A row with no signature is one whose parse produced none — an unparsed
    // import, waiting for `scripts/reparse.ts`. It still counts in the overall
    // tally; it just has no team to be filed under.
    if (!signature) continue

    const group = groups.get(signature)
    if (group) group.push(row)
    else groups.set(signature, [row])
  }

  return groups
}

export interface TeamStatsOptions {
  aggregate: Aggregate
  /**
   * Whether bring groupings admit games where fewer Pokémon appeared than
   * `|teamsize|` says were picked.
   *
   * Off by default, and that default is the whole point. A game the opponent
   * forfeited on turn four leaves the fourth pick having never shown up, so
   * its `bring_signature` is a three-Pokémon version of a four-Pokémon bring
   * — counted in, the same bring scatters across several false groupings.
   * Forfeits are common on the ladder, not an edge case.
   *
   * The same game still counts in full at the team level: the registered six
   * are known whatever happened in the game. So the two levels have different
   * denominators on purpose (design document §7).
   */
  includeIncompleteBrings?: boolean
}

/**
 * One entry per registered team, each carrying its bring combinations.
 *
 * Every grouping is returned, low sample included — hiding them would leave a
 * user asking where their team went — so the sample size travels with each
 * row for the UI to show.
 */
export function teamStats(rows: StatsRow[], options: TeamStatsOptions): TeamStats[] {
  const { aggregate, includeIncompleteBrings = false } = options

  const teams = [...groupBySignature(rows, (row) => row.team_signature)].map(
    ([signature, teamRows]) => {
      const bringRows = includeIncompleteBrings
        ? teamRows
        : teamRows.filter((row) => row.bring_complete)

      const brings = [...groupBySignature(bringRows, (row) => row.bring_signature)]
        .map(([bringSignature, group]) => ({
          signature: bringSignature,
          // By game always: see TeamStats.brings.
          tally: tallyOf(resultUnits(group, 'game').map((unit) => unit.result)),
        }))
        .toSorted(byScore)

      return {
        signature,
        tally: tallyOf(resultUnits(teamRows, aggregate).map((unit) => unit.result)),
        brings,
      }
    },
  )

  return teams.toSorted(byScore)
}
