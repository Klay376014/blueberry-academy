import { describe, expect, it } from 'vitest'
import { overallTally, resultUnits, tallyOf, teamStats } from '../../app/utils/battleStats'
import type { StatsRow } from '../../app/utils/battleStats'
import { SIGNATURES, STATS_ROWS } from '../fixtures/stats-rows'

function team(rows: StatsRow[], signature: string, includeIncompleteBrings = false) {
  const found = teamStats(rows, { aggregate: 'game', includeIncompleteBrings }).find(
    (entry) => entry.signature === signature,
  )

  if (!found) throw new Error(`No stats for ${signature}.`)

  return found
}

describe('counting results', () => {
  it('keeps ties in the denominator and out of the wins', () => {
    expect(tallyOf(['win', 'win', 'loss', 'tie'])).toMatchObject({
      games: 4,
      wins: 2,
      losses: 1,
      ties: 1,
      winRate: 0.5,
    })
  })

  it('leaves a battle with no declared winner out of every count', () => {
    // `ladder-5` has a null result. Eleven of the twelve rows are decided.
    expect(overallTally(STATS_ROWS, 'game').games).toBe(11)
  })
})

describe('folding a series into one result', () => {
  it('counts games one each until asked for series', () => {
    expect(resultUnits(STATS_ROWS, 'game')).toHaveLength(11)
    // Six ladder games stay one each; the two Bo3s become one unit apiece.
    expect(resultUnits(STATS_ROWS, 'series')).toHaveLength(8)
  })

  it('changes what a Bo3 is worth, and so the win rate with it', () => {
    const byGame = overallTally(STATS_ROWS, 'game')
    const bySeries = overallTally(STATS_ROWS, 'series')

    // Per game: 7 of 11. The 2-1 series contributes two wins and a loss, the
    // 1-1 one a win and a loss.
    expect(byGame).toMatchObject({ games: 11, wins: 7, losses: 4, ties: 0 })
    // Per series: the 2-1 is one win, the 1-1 is one tie.
    expect(bySeries).toMatchObject({ games: 8, wins: 5, losses: 2, ties: 1 })
    expect(bySeries.winRate).not.toBe(byGame.winRate)
  })

  it('calls a series held only in part a tie rather than guessing a winner', () => {
    // `series-2` is 1-1 of the two games that were imported. Claiming a
    // winner would mean inventing the game that is missing.
    const folded = resultUnits(STATS_ROWS, 'series').find((unit) => unit.key === 'series-2')

    expect(folded?.result).toBe('tie')
  })

  it('dates a series from its first game', () => {
    const folded = resultUnits(STATS_ROWS, 'series').find((unit) => unit.key === 'series-1')

    expect(folded?.playedAt).toBe('2026-08-08T10:00:00Z')
  })

  it('leaves a ladder game as a series of one', () => {
    const folded = resultUnits(STATS_ROWS, 'series').map((unit) => unit.key)

    expect(folded).toContain('game:ladder-1')
  })
})

describe('grouping by team and by bring', () => {
  it('drops an incomplete bring from the bring level', () => {
    // `ladder-3` was forfeited: three of the four picks ever appeared, so its
    // signature is a broken version of a bring that is really four.
    const brings = team(STATS_ROWS, SIGNATURES.TEAM_A).brings.map((entry) => entry.signature)

    expect(brings).not.toContain('calyrexshadow|incineroar|urshifu')
  })

  it('still counts that battle at the team level, so the denominators differ', () => {
    const teamA = team(STATS_ROWS, SIGNATURES.TEAM_A)
    const acrossBrings = teamA.brings.reduce((sum, entry) => sum + entry.tally.games, 0)

    // The registered six are known whatever happened in the game, so the team
    // keeps all eight of its decided battles...
    expect(teamA.tally.games).toBe(8)
    // ...while the brings account for seven. The missing one is the forfeit.
    expect(acrossBrings).toBe(7)
    expect(teamA.tally.games).toBeGreaterThan(acrossBrings)
  })

  it('admits the incomplete bring when asked, as its own grouping', () => {
    const teamA = team(STATS_ROWS, SIGNATURES.TEAM_A, true)
    const acrossBrings = teamA.brings.reduce((sum, entry) => sum + entry.tally.games, 0)

    expect(acrossBrings).toBe(8)
    expect(teamA.brings.map((entry) => entry.signature)).toContain(
      'calyrexshadow|incineroar|urshifu',
    )
  })

  it('counts brings by game even when the teams are counted by series', () => {
    // A Bo3 brings a different four each game, so there is no series-level
    // bring to count.
    const [teamB] = teamStats(STATS_ROWS, { aggregate: 'series' }).filter(
      (entry) => entry.signature === SIGNATURES.TEAM_B,
    )

    // Two series: the ladder win and the 1-1 that folded to a tie.
    expect(teamB?.tally).toMatchObject({ games: 2, wins: 1, ties: 1 })
    // Three games, all with a complete bring.
    expect(teamB?.brings.reduce((sum, entry) => sum + entry.tally.games, 0)).toBe(3)
  })

  it('ranks by the Wilson bound, not by win rate', () => {
    const brings = team(STATS_ROWS, SIGNATURES.TEAM_A).brings

    // Two from two beats two from four, and one from nothing-won sorts last.
    expect(brings.map((entry) => entry.signature)).toEqual([
      SIGNATURES.BRING_A2,
      SIGNATURES.BRING_A1,
      SIGNATURES.BRING_A3,
    ])
  })

  it('shows every grouping, low sample included, with its sample size', () => {
    // Hiding a small grouping only leaves a user asking where their team went.
    const a3 = team(STATS_ROWS, SIGNATURES.TEAM_A).brings.find(
      (entry) => entry.signature === SIGNATURES.BRING_A3,
    )

    expect(a3?.tally).toMatchObject({ games: 1, wins: 0 })
  })

  it('counts a battle whose parse produced no signature overall but files it nowhere', () => {
    const unparsed: StatsRow = {
      replay_id: 'unparsed-1',
      played_at: '2026-08-10T10:00:00Z',
      format_id: 'gen9championsvgc2026regmb',
      series_id: null,
      my_username: 'NotLittleStar',
      result: 'win',
      rating: null,
      rating_delta: null,
      team_signature: null,
      bring_signature: null,
      bring_complete: false,
    }
    const rows = [...STATS_ROWS, unparsed]

    expect(overallTally(rows, 'game').games).toBe(12)
    expect(teamStats(rows, { aggregate: 'game' })).toHaveLength(2)
  })
})
