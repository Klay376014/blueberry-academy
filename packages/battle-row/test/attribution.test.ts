import { describe, expect, it } from 'vite-plus/test'
import { parseReplay } from 'replay-parser'
import type { ParsedBattle } from 'replay-parser'
import { attributionOf } from '../src/index.ts'
import ladder from '../../replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

/** A stored replay, parsed with the metadata its own JSON carries. */
function parsed(replay: {
  log: string
  id: string
  formatid: string
  uploadtime: number
}): ParsedBattle {
  return parseReplay(replay.log, {
    replayId: replay.id,
    formatId: replay.formatid,
    uploadTime: replay.uploadtime,
  })
}

/** What the `details` column holds for a battle, as jsonb comes back. */
function detailsOf(battle: ParsedBattle): unknown {
  return JSON.parse(
    JSON.stringify({ winner: battle.winner, sides: { p1: battle.p1, p2: battle.p2 } }),
  )
}

describe('the attribution an alias list gives a stored battle', () => {
  it('resolves which side is mine, and what follows from it', () => {
    const attribution = attributionOf(detailsOf(parsed(ladder)), ['DavoPro1214'])

    expect(attribution).toMatchObject({
      my_side: 'p1',
      my_username: 'DavoPro1214',
      opponent_username: 'Bibas Rozkurwiator',
      result: 'loss',
    })
  })
})

describe('the signatures and rating attribution carries', () => {
  it('takes them from my own side, never from the other one', () => {
    const battle = parsed(ladder)
    const attribution = attributionOf(detailsOf(battle), ['DavoPro1214'])

    expect(attribution).toMatchObject({
      team_signature: battle.p1.teamSignature,
      bring_signature: battle.p1.bringSignature,
      bring_complete: battle.p1.bringComplete,
      // The replay metadata carries a rating too, but it is the loser's
      // whichever side that is, so it belongs to neither.
      rating: battle.p1.ratingAfter,
      rating_delta: battle.p1.ratingDelta,
    })
  })
})

describe('the attribution a battle nobody on the list played gets', () => {
  it('is spectated — an answer, not a failure', () => {
    const attribution = attributionOf(detailsOf(parsed(ladder)), ['SomebodyElse'])

    // Not null: null is reserved for "this row cannot be attributed at all",
    // which the caller skips. A spectated battle is attributed, to nobody.
    expect(attribution).toEqual({
      my_side: null,
      my_username: null,
      opponent_username: null,
      result: null,
      team_signature: null,
      bring_signature: null,
      bring_complete: false,
      rating: null,
      rating_delta: null,
    })
  })
})

describe('an alias list holding both players', () => {
  it('gets one fixed answer rather than an arbitrary one', () => {
    const battle = parsed(ladder)
    const both = [battle.p2.username, battle.p1.username]

    // Order of the alias list must not decide it: re-binding the same two
    // names in the other order would otherwise silently flip a battle's
    // result, and re-attribution (#67) would never settle.
    expect(attributionOf(detailsOf(battle), both)?.my_side).toBe('p1')
    expect(attributionOf(detailsOf(battle), [...both].reverse())?.my_side).toBe('p1')
  })
})

describe('details whose shape it does not recognise', () => {
  // `details` is jsonb: TypeScript knows nothing about what comes back, and
  // it may predate the current parser or be the empty object a failed parse
  // left behind. One bad row must not take a whole backfill down with it.
  const unusable = {
    'the empty object a failed parse leaves': {},
    'no details at all': null,
    'a side that is missing': { winner: 'p1', sides: { p1: { username: 'a', userId: 'a' } } },
    'a side that is not an object': { winner: null, sides: { p1: 'a', p2: 'b' } },
    'a userId that is not a string': {
      winner: null,
      sides: { p1: { username: 'a', userId: 1 }, p2: { username: 'b', userId: 'b' } },
    },
    'a signature that is not a string': {
      winner: null,
      sides: {
        p1: { username: 'a', userId: 'a', teamSignature: ['x'] },
        p2: { username: 'b', userId: 'b' },
      },
    },
    'a winner naming nothing that played': {
      winner: 'p3',
      sides: { p1: { username: 'a', userId: 'a' }, p2: { username: 'b', userId: 'b' } },
    },
  }

  for (const [what, details] of Object.entries(unusable)) {
    it(`reports ${what} as unattributable rather than throwing`, () => {
      expect(attributionOf(details, ['a'])).toBeNull()
    })
  }

  it('accepts a side carrying only what attribution reads', () => {
    // Narrow on purpose: a row written by an older parser is still perfectly
    // attributable, and rejecting it would strand it forever.
    const details = {
      winner: 'p2',
      sides: {
        p1: { username: 'Me', userId: 'me' },
        p2: { username: 'Them', userId: 'them' },
      },
    }

    expect(attributionOf(details, ['me'])).toMatchObject({
      my_side: 'p1',
      result: 'loss',
      team_signature: null,
      bring_complete: false,
      rating: null,
    })
  })
})
