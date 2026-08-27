import { PARSER_VERSION } from 'replay-parser'
import type { ParsedBattle, ReplayMeta } from 'replay-parser'
import { attributionOf } from './attribution.ts'
import type { Attribution } from './attribution.ts'

// Re-attribution's entry point lives here too: it is the same derivation the
// importer runs, and having one door is the point (#64).
export { attributionOf } from './attribution.ts'
export type { Attribution } from './attribution.ts'

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

/**
 * A `battles` row, in the database's own column names.
 *
 * Extends `Attribution` rather than restating its columns: the spread in
 * `battleRowOf` then covers them by construction, and a column added to the
 * attribution is a column added here.
 */
export interface BattleRow extends Attribution {
  user_id: string
  replay_id: string
  played_at: string
  format_id: string
  rated: boolean | null
  game_type: string | null
  series_id: string | null
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

export function battleRowOf(battle: ParsedBattle, owner: RowOwner): BattleRow {
  // Everything the perspectives that are not designed yet will want — and
  // everything re-attribution reads, which is why it is built first.
  const details = { winner: battle.winner, sides: { p1: battle.p1, p2: battle.p2 } }
  const attribution = attributionOf(details, owner.aliases)
  // Unreachable from here: `details` was just built out of a typed
  // `ParsedBattle`. The shape check guards rows read back from jsonb.
  if (!attribution) throw new Error(`could not attribute ${battle.replayId}`)

  return {
    user_id: owner.userId,
    replay_id: battle.replayId,
    played_at: battle.playedAt,
    format_id: battle.formatId,
    // A game carrying no rating on either side is one nobody laddered:
    // `|player|` simply has no rating field in a tournament game.
    rated: battle.p1.ratingBefore !== null || battle.p2.ratingBefore !== null,
    game_type: battle.gameType,
    series_id: battle.seriesId,
    ...attribution,
    turn_count: battle.turnCount,
    end_reason: battle.endReason,
    details,
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
