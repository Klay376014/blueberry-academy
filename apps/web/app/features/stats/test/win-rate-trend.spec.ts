import { describe, expect, it } from 'vitest'
import { resultUnits } from '../utils/battleStats'
import type { ResultUnit } from '../utils/battleStats'
import type { BattleResult, StatsRow } from '~/shared/api/battles'
import { currentStreak, ratingSeries, slidingWinRate } from '../utils/winRateTrend'
import { STATS_ROWS } from '../../../../test/fixtures/stats-rows'

const DAY = 86_400_000

/** Units a day apart, so the calendar axis and the play order agree. */
function units(results: BattleResult[]): ResultUnit[] {
  return results.map((result, index) => ({
    key: `unit-${index}`,
    playedAt: new Date(Date.UTC(2026, 0, 1) + index * DAY).toISOString(),
    formatId: 'gen9championsvgc2026regmb',
    result,
    teamSignature: null,
  }))
}

function rates(points: { rate: number }[]): number[] {
  return points.map((point) => Math.round(point.rate * 100))
}

describe('the sliding window', () => {
  it('counts only the last N units once there are N of them', () => {
    // Five losses then five wins, over a window of five: the rate walks from
    // 0% to 100% one unit at a time and the early losses fall out of it.
    const results: BattleResult[] = [
      'loss',
      'loss',
      'loss',
      'loss',
      'loss',
      'win',
      'win',
      'win',
      'win',
      'win',
    ]

    expect(rates(slidingWinRate(units(results), 5))).toEqual([0, 0, 0, 0, 0, 20, 40, 60, 80, 100])
  })

  it('widens up to the window rather than starting the curve late', () => {
    const points = slidingWinRate(units(['win', 'loss', 'win', 'win']), 20)

    // Four games is not a twenty-game window, and the sample size says so.
    expect(points.map((point) => point.games)).toEqual([1, 2, 3, 4])
    expect(rates(points)).toEqual([100, 50, 67, 75])
  })

  it('keeps a tie in the denominator and out of the wins', () => {
    expect(rates(slidingWinRate(units(['win', 'tie']), 20))).toEqual([100, 50])
  })

  it('puts each point on the calendar date its unit was played', () => {
    const played = units(['win', 'loss'])
    const points = slidingWinRate(played, 20)

    expect(points.map((point) => point.date)).toEqual(
      played.map((unit) => Date.parse(unit.playedAt)),
    )
  })

  it('orders by date rather than trusting the order it was handed', () => {
    const played = units(['win', 'loss', 'loss']).toReversed()

    expect(rates(slidingWinRate(played, 20))).toEqual([100, 50, 33])
  })

  it('draws nothing from nothing', () => {
    expect(slidingWinRate([], 20)).toEqual([])
  })

  it('leaves a day holding the rate it ended on', () => {
    const sameDay: ResultUnit[] = ['win', 'win', 'loss'].map((result, index) => ({
      key: `unit-${index}`,
      playedAt: `2026-01-01T0${index + 4}:00:00Z`,
      formatId: 'gen9championsvgc2026regmb',
      result: result as BattleResult,
      teamSignature: null,
    }))

    // One point, not three, and it is the 2-1 the day finished on.
    expect(slidingWinRate(sameDay, 20)).toEqual([
      { date: Date.parse('2026-01-01T06:00:00Z'), rate: 2 / 3, games: 3 },
    ])
  })
})

describe('the current streak', () => {
  it('counts back from the last unit played', () => {
    expect(currentStreak(units(['win', 'loss', 'loss', 'loss']))).toEqual({
      kind: 'loss',
      length: 3,
    })
  })

  it('is broken by a tie, which is neither a win nor a loss to extend', () => {
    expect(currentStreak(units(['win', 'win', 'tie']))).toEqual({ kind: 'none', length: 0 })
  })

  it('has nothing to report before the first game', () => {
    expect(currentStreak([])).toEqual({ kind: 'none', length: 0 })
  })

  it('reads the last unit by date, not by position', () => {
    expect(currentStreak(units(['loss', 'win', 'win']).toReversed())).toEqual({
      kind: 'win',
      length: 2,
    })
  })
})

describe('the rating curve', () => {
  function row(overrides: Partial<StatsRow>): StatsRow {
    return {
      replay_id: 'r',
      played_at: '2026-08-01T10:00:00Z',
      format_id: 'gen9championsvgc2026regmb',
      series_id: null,
      my_username: 'NotLittleStar',
      result: 'win',
      rating: null,
      rating_delta: null,
      team_signature: null,
      bring_signature: null,
      bring_complete: true,
      ...overrides,
    }
  }

  it('leaves a missing rating undefined rather than null', () => {
    // Unovis breaks a line at `undefined` and plots `null` as zero
    // (unovis.dev/docs/xy-charts/Line, "Dealing with missing data"). A Bo3
    // game has no rating, and a curve that dives to zero there would be a
    // reading of the data that never happened.
    const points = ratingSeries([
      row({ replay_id: 'a', rating: 1500 }),
      row({ replay_id: 'b', played_at: '2026-08-02T10:00:00Z' }),
      row({ replay_id: 'c', played_at: '2026-08-03T10:00:00Z', rating: 1520 }),
    ])

    expect(points.map((point) => point.rating)).toEqual([1500, undefined, 1520])
    expect(points[1]!.rating).not.toBeNull()
  })

  it('keeps a game with no declared winner, which still had a rating', () => {
    // Unlike the tallies, the curve is about where the ladder put you, not
    // about who won.
    expect(ratingSeries([row({ result: null, rating: 1500 })])).toHaveLength(1)
  })

  it('gives a day one point however many games were played in it', () => {
    // Nine games in a day put nine points inside thirty pixels of a calendar
    // axis, and a rating that moved across them drew as a vertical spike.
    const points = ratingSeries([
      row({ replay_id: 'a', played_at: '2026-08-01T04:00:00Z', rating: 1307 }),
      row({ replay_id: 'b', played_at: '2026-08-01T09:00:00Z', rating: 1158 }),
      row({ replay_id: 'c', played_at: '2026-08-01T17:00:00Z', rating: 1396 }),
    ])

    // The day closed at 1396, and nothing claims it was ever a straight line
    // through the two before it.
    expect(points).toEqual([{ date: Date.parse('2026-08-01T17:00:00Z'), rating: 1396 }])
  })

  it('closes a day on its last rated battle, not its last battle', () => {
    const points = ratingSeries([
      row({ replay_id: 'a', played_at: '2026-08-01T04:00:00Z', rating: 1307 }),
      row({ replay_id: 'b', played_at: '2026-08-01T17:00:00Z' }),
    ])

    expect(points.map((point) => point.rating)).toEqual([1307])
  })

  it('breaks over a day whose battles all went unrated', () => {
    const points = ratingSeries([
      row({ replay_id: 'a', played_at: '2026-08-01T04:00:00Z', rating: 1307 }),
      row({ replay_id: 'b', played_at: '2026-08-02T04:00:00Z' }),
      row({ replay_id: 'c', played_at: '2026-08-03T04:00:00Z', rating: 1350 }),
    ])

    expect(points.map((point) => point.rating)).toEqual([1307, undefined, 1350])
  })

  it('reads the fixture as one point per day, in played order', () => {
    const points = ratingSeries(STATS_ROWS)

    // Nine days: seven ladder days, then the two the Bo3s were held on.
    expect(points).toHaveLength(9)
    expect(points.map((point) => point.date)).toEqual(
      [...points].toSorted((a, b) => a.date - b.date).map((point) => point.date),
    )
    // Those two days carried no rating at all, so the line breaks over them.
    expect(points.slice(-2).map((point) => point.rating)).toEqual([undefined, undefined])
  })
})

describe('against the fixture', () => {
  it('agrees with the overall win rate once the window covers everything', () => {
    const played = resultUnits(STATS_ROWS, 'game')
    const points = slidingWinRate(played, played.length)

    // Seven wins of eleven decided games — the same 64% the summary card shows.
    expect(rates(points).at(-1)).toBe(64)
  })

  it('moves the streak when the aggregation changes what a Bo3 is worth', () => {
    // The last thing played is `series-2`: two games, 1-1. As games that is a
    // loss at the end; folded into a series it is a tie, and a tie is no
    // streak at all.
    expect(currentStreak(resultUnits(STATS_ROWS, 'game'))).toEqual({ kind: 'loss', length: 1 })
    expect(currentStreak(resultUnits(STATS_ROWS, 'series'))).toEqual({ kind: 'none', length: 0 })
  })
})
