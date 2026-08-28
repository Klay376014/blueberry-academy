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
      p1: { username: 'NotLittleStar', bring: 'a|b|c|d' },
      p2: { username: 'Somebody', bring: 'w|x|y|z' },
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
    expect(sides.left).toEqual({ name: 'NotLittleStar', bring: 'a|b|c|d', won: false })
    expect(sides.right).toEqual({ name: 'Somebody', bring: 'w|x|y|z', won: false })
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
    expect(sides.left).toEqual({ name: 'NotLittleStar', bring: 'a|b|c|d', won: true })
    expect(sides.right).toEqual({ name: 'Somebody', bring: 'w|x|y|z', won: false })
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
        sides: { p1: { username: null, bring: null }, p2: { username: null, bring: null } },
      }),
    )

    expect(sides.attributed).toBe(true)
    expect(sides.left.name).toBeNull()
    expect(sides.right.name).toBeNull()
  })

  it('carries a nameless side through as nameless', () => {
    const sides = drawerSides(
      spectated({
        sides: { p1: { username: null, bring: null }, p2: { username: null, bring: null } },
      }),
    )

    expect(sides.left.name).toBeNull()
    expect(sides.right.bring).toBeNull()
  })
})
