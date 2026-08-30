import { describe, expect, it } from 'vitest'
import { groupIntoSeries, intoBlocks } from '../utils/seriesGroups'
import type { RecentBattle } from '../composables/useRecentBattles'

/**
 * A game in the recent list, newest-first order supplied by the caller.
 *
 * `playedAt` is the only field the grouping reads for ordering, so the fixtures
 * spell out an hour each rather than a full timestamp's worth of noise.
 */
function game(over: Partial<RecentBattle> & { replayId: string }): RecentBattle {
  return {
    playedAt: '2026-08-18T12:00:00Z',
    formatId: 'gen9vgc2026regmbbo3',
    seriesId: null,
    result: 'win',
    ratingDelta: null,
    myBring: 'a|b|c|d',
    opponentUsername: 'XwingVGC',
    turnCount: 12,
    opponentBring: 'e|f|g|h',
    ...over,
  }
}

/** Three games of one series, newest first — the order the list hands over. */
const SERIES = [
  game({ replayId: 'g3', seriesId: 's1', playedAt: '2026-08-18T14:00:00Z', result: 'loss' }),
  game({ replayId: 'g2', seriesId: 's1', playedAt: '2026-08-18T13:00:00Z', result: 'win' }),
  game({ replayId: 'g1', seriesId: 's1', playedAt: '2026-08-18T12:00:00Z', result: 'win' }),
]

describe('groupIntoSeries', () => {
  it('collects games of one series into a single group', () => {
    const [group, ...rest] = groupIntoSeries(SERIES)

    expect(rest).toEqual([])
    expect(group?.games.map((entry) => entry.replayId)).toEqual(['g1', 'g2', 'g3'])
  })

  it('orders a group oldest first, so game 1 is the game played first', () => {
    // The drawer's series switcher numbers `gamesOfSeries()` — played_at
    // ascending — the same way. Both have to call the same game "game 1".
    const [group] = groupIntoSeries(SERIES)

    expect(group?.games[0]?.replayId).toBe('g1')
  })

  it('leaves games with no series id apart, even against one opponent on one day', () => {
    // The case the whole feature exists for: three ladder Bo1s against the same
    // player look exactly like a Bo3 until this rule separates them.
    const ladder = [
      game({ replayId: 'l3', playedAt: '2026-08-18T14:00:00Z' }),
      game({ replayId: 'l2', playedAt: '2026-08-18T13:00:00Z' }),
      game({ replayId: 'l1', playedAt: '2026-08-18T12:00:00Z' }),
    ]

    expect(groupIntoSeries(ladder).map((group) => group.games.length)).toEqual([1, 1, 1])
  })

  it('does not reorder the list to pull a split series back together', () => {
    const split = [
      game({ replayId: 'g2', seriesId: 's1', playedAt: '2026-08-18T15:00:00Z' }),
      game({ replayId: 'other', playedAt: '2026-08-18T14:00:00Z' }),
      game({ replayId: 'g1', seriesId: 's1', playedAt: '2026-08-18T13:00:00Z' }),
    ]

    expect(groupIntoSeries(split).map((group) => group.games.map((one) => one.replayId))).toEqual([
      ['g2'],
      ['other'],
      ['g1'],
    ])
  })

  it('keeps the groups in the order the list gave them', () => {
    const mixed = [game({ replayId: 'newer' }), ...SERIES]

    expect(groupIntoSeries(mixed).map((group) => group.key)).toEqual(['newer', 's1'])
  })

  it('gives a lone game no series header', () => {
    // A one-game card would put a heading and a row that say the same thing
    // beside each other, and imply the series has one game — which is not known.
    const [group] = groupIntoSeries([game({ replayId: 'only', seriesId: 's1' })])

    expect(group?.series).toBeNull()
  })

  describe('the series header', () => {
    it('counts the games it can see as a score', () => {
      expect(groupIntoSeries(SERIES)[0]?.series).toMatchObject({ wins: 2, losses: 1 })
    })

    it('counts neither a tie nor an undecided game to either side', () => {
      const partial = [
        game({ replayId: 'g3', seriesId: 's1', playedAt: '2026-08-18T14:00Z', result: null }),
        game({ replayId: 'g2', seriesId: 's1', playedAt: '2026-08-18T13:00Z', result: 'tie' }),
        game({ replayId: 'g1', seriesId: 's1', playedAt: '2026-08-18T12:00Z', result: 'win' }),
      ]

      expect(groupIntoSeries(partial)[0]?.series).toMatchObject({ wins: 1, losses: 0 })
    })

    it('dates the series by its first game', () => {
      expect(groupIntoSeries(SERIES)[0]?.series?.playedAt).toBe('2026-08-18T12:00:00Z')
    })

    it('adds up the rating changes it has', () => {
      // Showdown appears to report a Bo3's rating change on the deciding game
      // only, so this is usually one number plus two nulls — but a sum is right
      // either way, which is why it is a sum.
      const rated = SERIES.map((one, index) =>
        index === 0 ? { ...one, ratingDelta: 26 } : { ...one, ratingDelta: null },
      )

      expect(groupIntoSeries(rated)[0]?.series?.ratingDelta).toBe(26)
    })

    it('reports no rating change at all when no game carries one', () => {
      // Tournament games have no rating. Zero would read as "no change", which
      // is a different thing from "not rated".
      expect(groupIntoSeries(SERIES)[0]?.series?.ratingDelta).toBeNull()
    })

    it('names the opponent, and admits when no game knows it', () => {
      const unknown = SERIES.map((one) => ({ ...one, opponentUsername: null }))

      expect(groupIntoSeries(SERIES)[0]?.series?.opponentUsername).toBe('XwingVGC')
      expect(groupIntoSeries(unknown)[0]?.series?.opponentUsername).toBeNull()
    })
  })
})

describe('intoBlocks', () => {
  it('keeps consecutive lone games in one bordered run', () => {
    // Without this an account that plays no Bo3 would get twenty separate
    // boxes where it has one list today.
    const blocks = intoBlocks(groupIntoSeries([game({ replayId: 'a' }), game({ replayId: 'b' })]))

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'games' })
  })

  it('breaks the run where a series starts and picks it up after', () => {
    const blocks = intoBlocks(
      groupIntoSeries([
        game({ replayId: 'newer' }),
        ...SERIES,
        game({ replayId: 'older', playedAt: '2026-08-17T12:00:00Z' }),
      ]),
    )

    expect(blocks.map((block) => block.kind)).toEqual(['games', 'series', 'games'])
  })

  it('gives every block a key of its own', () => {
    const blocks = intoBlocks(groupIntoSeries([game({ replayId: 'newer' }), ...SERIES]))

    expect(new Set(blocks.map((block) => block.key)).size).toBe(blocks.length)
  })
})
