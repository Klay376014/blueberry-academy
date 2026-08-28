import { toID } from 'replay-parser'
import type { BattleRecord } from '~/shared/api/battles'

/**
 * The watched battles one of whose players the reader is looking for.
 *
 * Settled in the browser rather than asked of the database, for the reason
 * every identity comparison in the app is: names are compared as `toID()`
 * forms (CONTEXT.md, 身分), which lowercases and drops every non-alphanumeric
 * character, and PostgREST's `ilike` has no such normalisation — `Blue Berry`
 * and `blueberry` would be two different people to it. The rows are all in
 * memory anyway, because the section reads them all (#66).
 *
 * A substring rather than a prefix: what somebody remembers about a name they
 * saw once is a piece of it, not its first letters.
 *
 * Only the two players. The format is deliberately not searched: this section
 * does not take the format filter either, and a box that quietly matched more
 * than it says would make "what am I searching" unanswerable (#68).
 */
export function battlesMatching(battles: BattleRecord[], query: string): BattleRecord[] {
  // Every string contains the empty one, so an empty box has to be decided
  // before the comparison rather than by it.
  if (!query.trim()) return battles

  const wanted = toID(query)

  // Typed, but nothing survives `toID` — a search written entirely in Chinese
  // or Japanese, say. No Showdown name can match it, because a name written
  // that way normalises away as well. Handing back the whole list would read
  // as a search box that does nothing; the empty answer is the true one, and
  // the section says so in the reader's own words.
  if (!wanted) return []

  return battles.filter((battle) =>
    (['p1', 'p2'] as const).some((side) =>
      toID(battle.sides[side].username ?? '').includes(wanted),
    ),
  )
}
