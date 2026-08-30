import type { SideId } from 'replay-parser'
import type { DrawerBattle } from '../composables/useBattleDrawer'

/**
 * The two players of the drawer's header, in the order it draws them.
 *
 * One header for both kinds of battle rather than two components: an
 * attributed battle and a spectated one differ in what the left-hand column is
 * called and in nothing else — the Bo3 switcher, the rating and the turn count
 * are the same — so splitting them would make everything they share two copies
 * (#63).
 *
 * `null` for a name rather than a fallback string: which fallback to use is
 * the header's decision and needs `t()`, which this has no business holding.
 */
export interface DrawerSide {
  name: string | null
  /** The Pokémon that appeared, as a bring signature. */
  bring: string | null
  /**
   * The registered six this side chose from, or null on a row stored before
   * both sides were kept. Read off `sides` either way: the attribution columns
   * carry my bring but not my six, and `details` carries both players'.
   */
  team: string | null
  /** This side won, and the header marks it. */
  won: boolean
}

export interface DrawerSides {
  /**
   * Whether one of these sides is the reader's. False is a spectated battle:
   * both players are somebody else, and neither column is "you".
   */
  attributed: boolean
  left: DrawerSide
  right: DrawerSide
  /** The log declared a draw, so there is no side to mark. */
  tie: boolean
}

/**
 * Which two players go on which side of the header.
 *
 * An attributed battle keeps its existing shape exactly: me on the left,
 * the opponent on the right, and no winner marked — the result badge beside
 * them already says win, loss or tie, and marking it twice would say it in two
 * voices. A spectated battle has neither of those, so it reads p1 against p2
 * and the winning side carries the mark.
 */
export function drawerSides(battle: DrawerBattle): DrawerSides {
  // `parseError` alongside `my_side`, because an unparsed row has neither: it
  // is stored with `my_side` null and an empty `details` (`unparsedRowOf`), so
  // reading it neutrally would announce a battle between two identified
  // strangers where there is no parse at all. The body says what actually
  // happened; the header keeps the shape it had before this existed.
  if (battle.mySide !== null || battle.parseError !== null) {
    const theirs = battle.mySide === 'p2' ? 'p1' : 'p2'

    return {
      attributed: true,
      left: {
        name: battle.myUsername,
        bring: battle.myBring,
        team: battle.mySide ? battle.sides[battle.mySide].team : null,
        won: false,
      },
      right: {
        name: battle.opponentUsername,
        bring: battle.opponentBring,
        team: battle.sides[theirs].team,
        won: false,
      },
      tie: false,
    }
  }

  const { winner } = battle
  const neutral = (side: SideId): DrawerSide => ({
    // `username` there, `name` here: the row calls it what the log calls it,
    // and the header has a column of its own to label.
    name: battle.sides[side].username,
    bring: battle.sides[side].bring,
    team: battle.sides[side].team,
    won: winner === side,
  })

  return {
    attributed: false,
    left: neutral('p1'),
    right: neutral('p2'),
    tie: winner === 'tie',
  }
}
