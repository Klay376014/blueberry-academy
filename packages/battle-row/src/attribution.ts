import { toID } from 'replay-parser'
import type { ParsedBattle, SideId } from 'replay-parser'

/** The `details` column: one battle, described neutrally, as jsonb holds it. */
interface BattleDetails {
  winner: ParsedBattle['winner']
  sides: { p1: AttributableSide; p2: AttributableSide }
}

/** The part of a stored `ParsedSide` that attribution reads. */
interface AttributableSide {
  username: string
  userId: string
  teamSignature: string | null
  bringSignature: string | null
  bringComplete: boolean
  ratingAfter: number | null
  ratingDelta: number | null
}

/** The columns of a `battles` row that are a function of the alias list. */
export interface Attribution {
  my_side: SideId | null
  my_username: string | null
  opponent_username: string | null
  result: 'win' | 'loss' | 'tie' | null
  team_signature: string | null
  bring_signature: string | null
  bring_complete: boolean
  rating: number | null
  rating_delta: number | null
}

/**
 * The `details` shape, checked by hand.
 *
 * `details` is jsonb, so nothing about what comes back is known at compile
 * time, and a stored row may predate the current parser or be the `{}` a
 * failed parse left behind. Narrow on purpose — only the fields attribution
 * reads — so an older row stays attributable, and a malformed one is reported
 * rather than taking a whole backfill down (#64).
 */
function detailsOf(details: unknown): BattleDetails | null {
  if (!isRecord(details) || !isRecord(details.sides)) return null

  const p1 = sideOf(details.sides.p1)
  const p2 = sideOf(details.sides.p2)
  if (!p1 || !p2) return null

  const { winner } = details
  if (winner !== null && winner !== 'tie' && winner !== 'p1' && winner !== 'p2') return null

  return { winner, sides: { p1, p2 } }
}

function sideOf(side: unknown): AttributableSide | null {
  if (!isRecord(side)) return null

  const { username, userId, teamSignature, bringSignature } = side
  const { bringComplete, ratingAfter, ratingDelta } = side
  if (typeof username !== 'string' || typeof userId !== 'string') return null

  // Absent is fine — a side of an older row simply has none of these. Present
  // but of the wrong type is not: it would be written straight into a column.
  // Either side failing rejects the battle, because a row this malformed is
  // one to report, not one to half-read.
  if (!isOptional(teamSignature, 'string') || !isOptional(bringSignature, 'string')) return null
  if (!isOptional(bringComplete, 'boolean')) return null
  if (!isOptional(ratingAfter, 'number') || !isOptional(ratingDelta, 'number')) return null

  return {
    username,
    userId,
    teamSignature: teamSignature ?? null,
    bringSignature: bringSignature ?? null,
    bringComplete: bringComplete ?? false,
    ratingAfter: ratingAfter ?? null,
    ratingDelta: ratingDelta ?? null,
  }
}

interface OptionalTypes {
  string: string
  number: number
  boolean: boolean
}

function isOptional<K extends keyof OptionalTypes>(
  value: unknown,
  type: K,
): value is OptionalTypes[K] | null | undefined {
  return value === undefined || value === null || typeof value === type
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Which side is "me", if either. A battle matching neither is spectated. */
function sideOfMine(details: BattleDetails, aliases: string[]): SideId | null {
  const mine = new Set(aliases.map(toID).filter(Boolean))

  // p1 first, so a user who has both players bound gets one answer rather
  // than an arbitrary one.
  if (mine.has(details.sides.p1.userId)) return 'p1'
  if (mine.has(details.sides.p2.userId)) return 'p2'

  return null
}

/** Win, loss or tie from my side, or null when the log declared no winner. */
function resultFor(side: SideId, winner: BattleDetails['winner']): Attribution['result'] {
  if (winner === null) return null
  if (winner === 'tie') return 'tie'

  return winner === side ? 'win' : 'loss'
}

/**
 * The attribution columns an alias list gives one stored battle.
 *
 * Pure, and reads nothing but `details`: re-attributing an existing row never
 * needs Storage or a re-parse, because both sides and the winner are already
 * there. Null means the row cannot be attributed at all and the caller should
 * skip it — distinct from a spectated battle, which is attributed to nobody.
 */
export function attributionOf(details: unknown, aliases: string[]): Attribution | null {
  const battle = detailsOf(details)
  if (!battle) return null

  const side = sideOfMine(battle, aliases)
  const mine = side ? battle.sides[side] : null
  const theirs = side ? battle.sides[side === 'p1' ? 'p2' : 'p1'] : null

  return {
    my_side: side,
    my_username: mine?.username ?? null,
    opponent_username: theirs?.username ?? null,
    result: side ? resultFor(side, battle.winner) : null,
    // The signatures are mine, so a spectated battle has none. Both sides
    // are in `details` either way.
    team_signature: mine?.teamSignature ?? null,
    bring_signature: mine?.bringSignature ?? null,
    bring_complete: mine?.bringComplete ?? false,
    // My own rating, from my own side. The replay metadata carries one too,
    // but it is the loser's whichever side that is, so it belongs to neither.
    rating: mine?.ratingAfter ?? null,
    rating_delta: mine?.ratingDelta ?? null,
  }
}
