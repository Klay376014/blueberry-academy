import { wilsonLowerBound } from './wilson'

/**
 * The arithmetic behind both dashboard sections, as pure functions over rows
 * that have already been fetched.
 *
 * See docs/specs/2026-08-16-replay-analytics-design.md §7 and CONTEXT.md.
 */

export type BattleResult = 'win' | 'loss' | 'tie'

/** A `battles` row as the stats layer reads it, in the database's own names. */
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
   * The format the team is registered in. Part of its identity, not a label:
   * a Bo1 team and its Bo3 counterpart are different teams whose averages
   * must not be pooled (CONTEXT.md, 「隊伍的同一性」).
   */
  formatId: string

  /**
   * The bring combinations played with this team. Always counted by game: a
   * Bo3 brings a different four each game, so there is no series-level bring.
   */
  brings: SignatureStats[]
}

/** A game, or a whole series, depending on the aggregation. */
export interface ResultUnit {
  key: string
  /** The earliest game in it, so a series sits on the date it started. */
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
 * Rows with a result, oldest first.
 *
 * A null `result` is a battle the log declared no winner for — not a spectated
 * one, which the query never returns — so it belongs in no denominator.
 */
function decided(rows: StatsRow[]): (StatsRow & { result: BattleResult })[] {
  return rows
    .filter((row): row is StatsRow & { result: BattleResult } => row.result !== null)
    .toSorted((a, b) => a.played_at.localeCompare(b.played_at))
}

function asGames(rows: StatsRow[]): ResultUnit[] {
  return decided(rows).map((row) => ({
    key: row.replay_id,
    playedAt: row.played_at,
    formatId: row.format_id,
    result: row.result,
    teamSignature: row.team_signature,
  }))
}

/**
 * Each Bo3 series folded into one result, decided by how many of its games
 * each side took.
 *
 * Judged on the games actually held: a user holding two of a three-game series
 * has a 1–1, and gets a tie rather than a winner invented from the game that
 * is missing. A row with no `series_id` is its own unit, so a ladder Bo1 is a
 * series of one and no branch is needed downstream.
 */
function asSeries(rows: StatsRow[]): ResultUnit[] {
  const groups = new Map<string, (StatsRow & { result: BattleResult })[]>()

  for (const row of decided(rows)) {
    // A battle id cannot collide with a parent battle's id.
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
      playedAt: games.reduce((a, b) => (a.played_at <= b.played_at ? a : b)).played_at,
      formatId: games[0]!.format_id,
      result: wins > losses ? 'win' : losses > wins ? 'loss' : 'tie',
      // The registered six are the same in every game of a series.
      teamSignature: games[0]!.team_signature,
    } satisfies ResultUnit
  })
}

/** The rows as result units, under the given aggregation. */
export function resultUnits(rows: StatsRow[], aggregate: Aggregate): ResultUnit[] {
  return aggregate === 'series' ? asSeries(rows) : asGames(rows)
}

/** Everything in one number set, before any grouping. */
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

/** The key a team is grouped under: its whole identity, format included. */
function teamKeyOf(row: StatsRow): string | null {
  return row.team_signature === null ? null : `${row.format_id}~${row.team_signature}`
}

function groupBySignature(
  rows: StatsRow[],
  keyOf: (row: StatsRow) => string | null,
): Map<string, StatsRow[]> {
  const groups = new Map<string, StatsRow[]>()

  for (const row of rows) {
    const key = keyOf(row)

    // No signature means an unparsed import waiting for scripts/reparse.ts. It
    // still counts in the overall tally; it just has no team to be filed under.
    if (!key) continue

    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  return groups
}

export interface TeamStatsOptions {
  aggregate: Aggregate

  /**
   * Whether bring groupings admit games where fewer Pokémon appeared than
   * `|teamsize|` says were picked.
   *
   * Off by default: a game forfeited on turn four leaves the fourth pick
   * having never shown up, so its `bring_signature` is a three-Pokémon version
   * of a four-Pokémon bring, and counted in it scatters one bring across
   * several false groupings. Forfeits are common on the ladder.
   *
   * The team level keeps the game either way — the registered six are known
   * whatever happened — so the two levels have different denominators.
   */
  includeIncompleteBrings?: boolean
}

/**
 * One entry per registered team, each carrying its bring combinations.
 *
 * Every grouping is returned, low sample included, with its sample size:
 * hiding one leaves a user asking where their team went.
 */
export function teamStats(rows: StatsRow[], options: TeamStatsOptions): TeamStats[] {
  const { aggregate, includeIncompleteBrings = false } = options

  const teams = [...groupBySignature(rows, teamKeyOf)].map(([, teamRows]) => {
    const bringRows = includeIncompleteBrings
      ? teamRows
      : teamRows.filter((row) => row.bring_complete)

    const brings = [...groupBySignature(bringRows, (row) => row.bring_signature)]
      .map(([bringSignature, group]) => ({
        signature: bringSignature,
        tally: tallyOf(resultUnits(group, 'game').map((unit) => unit.result)),
      }))
      .toSorted(byScore)

    const first = teamRows[0]!

    return {
      formatId: first.format_id,
      signature: first.team_signature!,
      tally: tallyOf(resultUnits(teamRows, aggregate).map((unit) => unit.result)),
      brings,
    }
  })

  return teams.toSorted(byScore)
}
