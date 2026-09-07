import type { SideId } from 'replay-parser'

/**
 * Which of the drawer's two slots a side occupies, and what to call it.
 *
 * One place rather than one per component: asking `row.side === mySide` is
 * wrong in the same way wherever it is written, and it was written in three
 * places (#143).
 */

/**
 * A row's place in the drawer.
 *
 * `first` is the reader's own side when there is one and p1 when there is not.
 * `neutral` is whatever belongs to no side: weather, a room, the field itself.
 *
 * Named for the slot rather than for ownership on purpose: `own` / `other`
 * would be a lie about a spectated battle, where neither player is the
 * reader's and the slots are still two.
 */
export type SideSlot = 'first' | 'second' | 'neutral'

/** Which slot a side occupies, given whichever side is the reader's. */
export function sideSlot(side: SideId | null, mySide: SideId | null): SideSlot {
  if (side === null) return 'neutral'

  if (mySide === null) return side === 'p1' ? 'first' : 'second'

  return side === mySide ? 'first' : 'second'
}

/**
 * The key a side is named under, or null when it has no name but its own.
 *
 * Null rather than a string, so this holds no `t()` — which fallback to use is
 * the caller's decision, the same split `drawerSides` makes for a player's
 * name. There is only one fallback to make: `P1` / `P2` is what the log calls
 * the sides, and it stays as Showdown spells it (ADR-0016).
 */
export function sideLabelKey(side: SideId, mySide: SideId | null): 'you' | 'opponent' | null {
  if (mySide === null) return null

  return side === mySide ? 'you' : 'opponent'
}

/**
 * The two sides in the order the drawer draws them: the first slot first.
 *
 * Derived from `sideSlot` rather than comparing `mySide` again, so the module
 * holds one definition of which side leads and the bar cannot draw them in an
 * order its own tones disagree with.
 */
export function orderedSides(mySide: SideId | null): [SideId, SideId] {
  return sideSlot('p1', mySide) === 'first' ? ['p1', 'p2'] : ['p2', 'p1']
}
