import { describe, expect, it } from 'vitest'
import { battlesMatching } from '../utils/playerSearch'
import type { BattleRecord } from '~/shared/api/battles'

/**
 * Finding one watched battle again by part of a player's name (#68).
 */

function battle(replayId: string, p1: string | null, p2: string | null): BattleRecord {
  return {
    replayId,
    playedAt: '2026-08-01T10:00:00Z',
    formatId: 'gen9championsvgc2026regmb',
    seriesId: null,
    result: null,
    rating: null,
    ratingDelta: null,
    endReason: null,
    mySide: null,
    myUsername: null,
    opponentUsername: null,
    turnCount: 12,
    myBring: null,
    opponentBring: null,
    sides: {
      p1: { username: p1, bring: null },
      p2: { username: p2, bring: null },
    },
    winner: null,
    parseError: null,
  }
}

const WATCHED = [
  battle('a', 'Blue Berry', 'Somebody'),
  battle('b', 'NotLittleStar', 'blueberry'),
  battle('c', 'Alice', 'Bob'),
]

const idsOf = (battles: BattleRecord[]) => battles.map((found) => found.replayId)

describe('searching the watched battles by player', () => {
  it('hands everything back when nothing has been typed', () => {
    expect(idsOf(battlesMatching(WATCHED, ''))).toEqual(['a', 'b', 'c'])
  })

  it('finds a player on either side', () => {
    expect(idsOf(battlesMatching(WATCHED, 'blueberry'))).toEqual(['a', 'b'])
  })

  it('reads a name and a search the way identity comparison does', () => {
    // `toID()` throughout (CONTEXT.md, 身分): case and every non-alphanumeric
    // character are not part of a Showdown name. `ilike` cannot do this, which
    // is why the search is settled in the browser.
    expect(idsOf(battlesMatching(WATCHED, 'BLUE berry'))).toEqual(['a', 'b'])
    expect(idsOf(battlesMatching(WATCHED, 'Blue-Berry!'))).toEqual(['a', 'b'])
  })

  it('matches the middle of a name, not only the start of it', () => {
    // What a reader remembers is a piece of the name, not its first letters.
    expect(idsOf(battlesMatching(WATCHED, 'ttleSt'))).toEqual(['b'])
  })

  it('answers with nothing when nothing matches', () => {
    expect(battlesMatching(WATCHED, 'nobody')).toEqual([])
  })

  it('treats an empty box as no search', () => {
    // `toID('  ')` is the empty string, and everything contains that, so this
    // has to be decided before the comparison rather than by it.
    expect(idsOf(battlesMatching(WATCHED, '   '))).toEqual(['a', 'b', 'c'])
  })

  it('finds nothing for a search no Showdown name could ever match', () => {
    // `toID` keeps `[a-z0-9]` and nothing else, so a name written entirely in
    // Chinese or Japanese normalises away — and so does a search written that
    // way. Answering "here is everything" would read as a broken search box;
    // this way the reader is told, in their own words, that there is no such
    // player.
    expect(battlesMatching(WATCHED, '小藍莓')).toEqual([])
    expect(battlesMatching(WATCHED, '···')).toEqual([])
  })

  it('passes over a side that has no name rather than failing on it', () => {
    const nameless = [battle('d', null, null), ...WATCHED]

    expect(idsOf(battlesMatching(nameless, 'blueberry'))).toEqual(['a', 'b'])
  })
})
