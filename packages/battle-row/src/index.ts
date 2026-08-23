import { PARSER_VERSION, toID } from 'replay-parser'
import type { ParsedBattle, ParsedSide, ReplayMeta, SideId } from 'replay-parser'

/**
 * One parsed battle, as the row the database stores.
 *
 * Split out of the importer because a re-parse has to produce the same row
 * from the same log: `scripts/reparse.ts` rebuilds every derived column from
 * Storage, and a second copy of this mapping would drift silently — the
 * statistics would change and nothing would say why.
 *
 * Identity lives here rather than in the parser, so one perspective-neutral
 * parse can serve any user (CONTEXT.md, 身分).
 */

/** A `battles` row, in the database's own column names. */
export interface BattleRow {
  user_id: string
  replay_id: string
  played_at: string
  format_id: string
  rated: boolean | null
  game_type: string | null
  rating: number | null
  rating_delta: number | null
  series_id: string | null
  my_side: SideId | null
  my_username: string | null
  opponent_username: string | null
  result: 'win' | 'loss' | 'tie' | null
  team_signature: string | null
  bring_signature: string | null
  bring_complete: boolean
  turn_count: number | null
  end_reason: string | null
  details: Record<string, unknown>
  log_path: string
  parser_version: string
  parse_error: string | null
}

/** Whose row this is, and where the log it came from is kept. */
export interface RowOwner {
  userId: string
  /** Showdown names that are all the same "me" (`profiles.showdown_usernames`). */
  aliases: string[]
  /** Path in the `replay-logs` bucket. */
  logPath: string
}

/** Which side is "me", if either. A battle matching neither is spectated. */
function sideOfMine(battle: ParsedBattle, aliases: string[]): SideId | null {
  const mine = new Set(aliases.map(toID).filter(Boolean))

  // p1 first, so a user who has both players bound gets one answer rather
  // than an arbitrary one.
  if (mine.has(battle.p1.userId)) return 'p1'
  if (mine.has(battle.p2.userId)) return 'p2'

  return null
}

/** Win, loss or tie from my side, or null when the log declared no winner. */
function resultFor(side: SideId, winner: ParsedBattle['winner']): BattleRow['result'] {
  if (winner === null) return null
  if (winner === 'tie') return 'tie'

  return winner === side ? 'win' : 'loss'
}

export function battleRowOf(battle: ParsedBattle, owner: RowOwner): BattleRow {
  const side = sideOfMine(battle, owner.aliases)
  const mine: ParsedSide | null = side ? battle[side] : null
  const theirs = side ? battle[side === 'p1' ? 'p2' : 'p1'] : null

  return {
    user_id: owner.userId,
    replay_id: battle.replayId,
    played_at: battle.playedAt,
    format_id: battle.formatId,
    // A game carrying no rating on either side is one nobody laddered:
    // `|player|` simply has no rating field in a tournament game.
    rated: battle.p1.ratingBefore !== null || battle.p2.ratingBefore !== null,
    game_type: battle.gameType,
    // My own rating, from my own side. The replay metadata carries one too,
    // but it is the loser's whichever side that is, so it belongs to neither.
    rating: mine?.ratingAfter ?? null,
    rating_delta: mine?.ratingDelta ?? null,
    series_id: battle.seriesId,
    my_side: side,
    my_username: mine?.username ?? null,
    opponent_username: theirs?.username ?? null,
    result: side ? resultFor(side, battle.winner) : null,
    // The signatures are mine, so a spectated battle has none. Both sides
    // are in `details` either way.
    team_signature: mine?.teamSignature ?? null,
    bring_signature: mine?.bringSignature ?? null,
    bring_complete: mine?.bringComplete ?? false,
    turn_count: battle.turnCount,
    end_reason: battle.endReason,
    // Everything the perspectives that are not designed yet will want.
    details: { winner: battle.winner, sides: { p1: battle.p1, p2: battle.p2 } },
    log_path: owner.logPath,
    parser_version: PARSER_VERSION,
    parse_error: null,
  }
}

/**
 * The row for a replay whose log is stored but could not be parsed: only what
 * the replay's own metadata says, plus the `parse_error` a re-parse looks for.
 */
export function unparsedRowOf(
  meta: ReplayMeta,
  owner: Omit<RowOwner, 'aliases'> & { message: string },
): BattleRow {
  return {
    user_id: owner.userId,
    replay_id: meta.replayId,
    played_at: new Date(meta.uploadTime * 1000).toISOString(),
    format_id: meta.formatId,
    rated: null,
    game_type: null,
    rating: null,
    rating_delta: null,
    series_id: null,
    my_side: null,
    my_username: null,
    opponent_username: null,
    result: null,
    team_signature: null,
    bring_signature: null,
    // The stats layer takes only `true`, so `false` is the honest answer for
    // a battle nothing is known about.
    bring_complete: false,
    turn_count: null,
    end_reason: null,
    details: {},
    log_path: owner.logPath,
    // Which version failed, so a re-parse can tell "not tried since" from
    // "still fails".
    parser_version: PARSER_VERSION,
    parse_error: owner.message,
  }
}
