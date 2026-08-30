import { describe, expect, it } from 'vitest'
import { drawerSides } from '../utils/drawerSides'
import type { DrawerBattle } from '../composables/useBattleDrawer'

/**
 * Which two players the drawer's header puts on which side, for a battle that
 * has a "me" in it and for one that does not (#63).
 */

function battle(overrides: Partial<DrawerBattle> = {}): DrawerBattle {
  return {
    replayId: 'ladder-1',
    playedAt: '2026-08-01T10:00:00Z',
    formatId: 'gen9championsvgc2026regmb',
    seriesId: null,
    result: 'win',
    rating: 1500,
    ratingDelta: 12,
    endReason: null,
    mySide: 'p1',
    myUsername: 'NotLittleStar',
    opponentUsername: 'Somebody',
    turnCount: 11,
    myBring: 'a|b|c|d',
    opponentBring: 'w|x|y|z',
    sides: {
      p1: { username: 'NotLittleStar', bring: 'a|b|c|d', team: 'a|b|c|d|e|f' },
      p2: { username: 'Somebody', bring: 'w|x|y|z', team: 'u|v|w|x|y|z' },
    },
    winner: 'p1',
    parseError: null,
    ...overrides,
  }
}

/** The same battle once every alias that claimed it has been unbound. */
function spectated(overrides: Partial<DrawerBattle> = {}): DrawerBattle {
  return battle({
    mySide: null,
    myUsername: null,
    opponentUsername: null,
    result: null,
    rating: null,
    ratingDelta: null,
    myBring: null,
    opponentBring: null,
    ...overrides,
  })
}

describe('a battle of mine', () => {
  it('puts me on the left and the opponent on the right', () => {
    const sides = drawerSides(battle())

    expect(sides.attributed).toBe(true)
    expect(sides.left).toEqual({
      name: 'NotLittleStar',
      bring: 'a|b|c|d',
      team: 'a|b|c|d|e|f',
      won: false,
    })
    expect(sides.right).toEqual({
      name: 'Somebody',
      bring: 'w|x|y|z',
      team: 'u|v|w|x|y|z',
      won: false,
    })
  })

  it('is still mine on the left when the side of mine is p2', () => {
    const sides = drawerSides(
      battle({ mySide: 'p2', myBring: 'w|x|y|z', opponentBring: 'a|b|c|d' }),
    )

    expect(sides.left.bring).toBe('w|x|y|z')
    expect(sides.right.bring).toBe('a|b|c|d')
  })

  it('marks no winner, because the result badge already says which way it went', () => {
    const sides = drawerSides(battle({ winner: 'p1' }))

    expect(sides.left.won).toBe(false)
    expect(sides.right.won).toBe(false)
    expect(sides.tie).toBe(false)
  })

  it('leaves a name null rather than inventing one, so the header can say "you"', () => {
    const sides = drawerSides(battle({ myUsername: null, opponentUsername: null }))

    expect(sides.left.name).toBeNull()
    expect(sides.right.name).toBeNull()
  })
})

describe('a spectated battle', () => {
  it('reads p1 against p2, from the parse rather than the attribution', () => {
    const sides = drawerSides(spectated())

    expect(sides.attributed).toBe(false)
    expect(sides.left).toEqual({
      name: 'NotLittleStar',
      bring: 'a|b|c|d',
      team: 'a|b|c|d|e|f',
      won: true,
    })
    expect(sides.right).toEqual({
      name: 'Somebody',
      bring: 'w|x|y|z',
      team: 'u|v|w|x|y|z',
      won: false,
    })
  })

  it('marks whichever side the log said won', () => {
    const sides = drawerSides(spectated({ winner: 'p2' }))

    expect(sides.left.won).toBe(false)
    expect(sides.right.won).toBe(true)
  })

  it('marks neither side when the log declared no winner', () => {
    const sides = drawerSides(spectated({ winner: null }))

    expect(sides.left.won).toBe(false)
    expect(sides.right.won).toBe(false)
    expect(sides.tie).toBe(false)
  })

  it('says a draw was a draw rather than marking a winner', () => {
    const sides = drawerSides(spectated({ winner: 'tie' }))

    expect(sides.tie).toBe(true)
    expect(sides.left.won).toBe(false)
    expect(sides.right.won).toBe(false)
  })

  it('is not what an unparsed row is, however side-less it looks', () => {
    // `unparsedRowOf` stores `my_side` null and an empty `details`. Reading it
    // as p1 against p2 would turn "this log could not be read" into a battle
    // between two identified strangers.
    const sides = drawerSides(
      spectated({
        parseError: 'unexpected end of log',
        sides: {
          p1: { username: null, bring: null, team: null },
          p2: { username: null, bring: null, team: null },
        },
      }),
    )

    expect(sides.attributed).toBe(true)
    expect(sides.left.name).toBeNull()
    expect(sides.right.name).toBeNull()
  })

  it('carries a nameless side through as nameless', () => {
    const sides = drawerSides(
      spectated({
        sides: {
          p1: { username: null, bring: null, team: null },
          p2: { username: null, bring: null, team: null },
        },
      }),
    )

    expect(sides.left.name).toBeNull()
    expect(sides.right.bring).toBeNull()
  })
})

describe('the registered six behind each side', () => {
  it('takes each side its own six, mine on the left', () => {
    // Six-into-four is read against the six, and the header is where a battle
    // is looked at closely enough to ask which two stayed home.
    const sides = drawerSides(battle())

    expect(sides.left.team).toBe('a|b|c|d|e|f')
    expect(sides.right.team).toBe('u|v|w|x|y|z')
  })

  it('follows the sides round when p2 is mine', () => {
    const sides = drawerSides(battle({ mySide: 'p2', myBring: 'w|x|y|z' }))

    expect(sides.left.team).toBe('u|v|w|x|y|z')
    expect(sides.right.team).toBe('a|b|c|d|e|f')
  })

  it('reads p1 and p2 in order for a battle with no side of mine', () => {
    const sides = drawerSides(spectated())

    expect(sides.left.team).toBe('a|b|c|d|e|f')
    expect(sides.right.team).toBe('u|v|w|x|y|z')
  })

  it('gives the opponent no six on a row that has no side of mine', () => {
    // A parse error puts a side-less row down the attributed branch, where
    // "theirs" would otherwise mean p2 by default — and p2's registered six is
    // not the opponent's when there is no me to be the opponent of. A failed
    // re-parse can leave `details` populated alongside the error, so this is
    // guarded rather than left to `unparsedRowOf` storing `details: {}`.
    const sides = drawerSides(spectated({ parseError: 'unexpected end of log' }))

    expect(sides.attributed).toBe(true)
    expect(sides.right.team).toBeNull()
    expect(sides.left.team).toBeNull()
  })

  it('leaves the six null on a row whose details predate it', () => {
    // Then the header draws the bring alone, exactly as it does today.
    const older = battle({
      sides: {
        p1: { username: 'NotLittleStar', bring: 'a|b|c|d', team: null },
        p2: { username: 'Somebody', bring: 'w|x|y|z', team: null },
      },
    })

    expect(drawerSides(older).left.team).toBeNull()
  })
})
