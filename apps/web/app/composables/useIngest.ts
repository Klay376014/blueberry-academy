import { PARSER_VERSION, parseReplay, toID } from 'replay-parser'
import type { ParsedBattle, ParsedSide, SideId } from 'replay-parser'
import { ShowdownError } from './useShowdown'
import type { ReplayRecord, ReplayRef, ShowdownFailure } from './useShowdown'

/**
 * One replay, all the way in: fetch it from Showdown, store the raw log,
 * parse it, work out which side is "me", and write the row.
 *
 * The order is the design, not an implementation detail. **The raw log is
 * stored before anything is parsed**, which is what makes a parser bug cost a
 * re-parse rather than another pass over somebody else's free service. The
 * stored log is the only source of truth; every column this writes is derived
 * data that `scripts/reparse.ts` can rebuild from it.
 *
 * **Identity is resolved here rather than in the parser.** A `ParsedBattle` is
 * perspective-neutral on purpose -- one parse can serve any user -- so the
 * alias list is applied at the point of writing. See CONTEXT.md, "身分".
 *
 * Nothing in here throws for a replay that could not be imported: a batch
 * import must never fail as a batch (design document §8), so every failure
 * comes back as an outcome with a reason worth showing.
 */

/** The bucket the raw logs live in, isolated by a `{user_id}/` path prefix. */
const BUCKET = 'replay-logs'

/** Why one replay did not make it in. */
export type IngestFailure =
  /** Showdown could not be reached, or would not answer with the replay. */
  | ShowdownFailure
  /** The raw log could not be stored, so nothing derived from it was written. */
  | 'store-failed'
  /** The row itself was refused. */
  | 'write-failed'

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

export type IngestOutcome =
  /** Parsed and written. */
  | { status: 'imported'; battle: BattleRow }
  /**
   * The log is stored and the row is there, but the parse failed and every
   * derived column is empty. A re-parse can fill them in without Showdown.
   */
  | { status: 'unparsed'; battle: BattleRow; message: string }
  /** Nothing was written. */
  | { status: 'failed'; reason: IngestFailure; message: string }

/** gzip, the way the browser does it, with no library in the way. */
async function gzip(text: string): Promise<Blob> {
  const stream = new Response(text).body

  // Response always has a body for a string, but the type does not say so and
  // a non-null assertion would be a claim rather than a check.
  if (!stream) throw new Error('This browser produced no stream to compress.')

  return await new Response(stream.pipeThrough(new CompressionStream('gzip'))).blob()
}

export function useIngest() {
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()
  const stored = useShowdownAliases()
  const { fetchReplay } = useShowdown()

  function requireUserId() {
    const id = user.value?.id
    if (!id) throw new Error('No signed-in user to import a replay for.')
    return id
  }

  /**
   * The alias list, or a refusal to import without it. An empty list and a
   * list that was never read look alike from here and mean opposite things:
   * importing against the second would file every one of the user's own
   * battles as somebody else's.
   */
  function requireAliases() {
    if (stored.value === null) {
      throw new Error('The alias list has not been read yet, so identity cannot be resolved.')
    }
    return stored.value
  }

  /**
   * Which side is "me", if either. Both sides are compared as `toID()`, so
   * `NotLittleStar` and `notlittlestar` are the same person; a battle that
   * matches neither is spectated.
   */
  function sideOfMine(battle: ParsedBattle, aliases: string[]): SideId | null {
    const mine = new Set(aliases.map(toID).filter(Boolean))

    // p1 first, so a user who has both players bound -- their own two
    // accounts, a game against themselves -- gets one answer rather than an
    // arbitrary one.
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

  function rowOf(battle: ParsedBattle, aliases: string[], logPath: string): BattleRow {
    const side = sideOfMine(battle, aliases)
    const mine: ParsedSide | null = side ? battle[side] : null
    const theirs = side ? battle[side === 'p1' ? 'p2' : 'p1'] : null

    return {
      user_id: requireUserId(),
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
      // Everything the perspectives that are not designed yet will want: the
      // opponent's registered six, both sides' ratings, who won in the
      // parser's own terms.
      details: { winner: battle.winner, sides: { p1: battle.p1, p2: battle.p2 } },
      log_path: logPath,
      parser_version: PARSER_VERSION,
      parse_error: null,
    }
  }

  /**
   * The row for a replay whose log is stored but could not be parsed. Only
   * what the replay's own metadata says, because everything else would be a
   * guess -- and `parse_error`, which is what a re-parse looks for.
   */
  function unparsedRowOf(record: ReplayRecord, logPath: string, message: string): BattleRow {
    return {
      user_id: requireUserId(),
      replay_id: record.id,
      played_at: new Date(record.uploadtime * 1000).toISOString(),
      format_id: record.formatid,
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
      // Not defaulted anywhere: the stats layer takes only `true`, so `false`
      // is the honest answer for a battle nothing is known about.
      bring_complete: false,
      turn_count: null,
      end_reason: null,
      details: {},
      log_path: logPath,
      // Which version failed, so a re-parse can tell "not tried since" from
      // "still fails".
      parser_version: PARSER_VERSION,
      parse_error: message,
    }
  }

  /** The whole replay JSON, gzipped, at `{user_id}/{replay_id}.json.gz`. */
  async function storeLog(userId: string, record: ReplayRecord): Promise<string> {
    const path = `${userId}/${record.id}.json.gz`

    // The JSON rather than the log alone: a re-parse needs the format id and
    // the upload time as much as it needs the log, and going back to Showdown
    // for them is exactly what storing this avoids.
    const { error } = await $supabase.storage
      .from(BUCKET)
      .upload(path, await gzip(JSON.stringify(record)), {
        contentType: 'application/gzip',
        // Importing the same replay twice is a re-import, not a conflict.
        upsert: true,
      })

    if (error) throw error

    return path
  }

  async function writeRow(row: BattleRow): Promise<BattleRow> {
    const { data, error } = await $supabase
      .from('battles')
      .upsert(row, { onConflict: 'user_id,replay_id' })
      .select()
      // Asked for back, so a write that RLS quietly matched nothing cannot
      // pass for an import.
      .single()

    if (error) throw error

    return (data as BattleRow | null) ?? row
  }

  /**
   * Fetch, store, parse, resolve, write. Returns what became of it rather
   * than throwing, except for the two things that are programming errors:
   * no signed-in user, and an alias list that was never read.
   */
  async function importReplay(ref: ReplayRef): Promise<IngestOutcome> {
    const userId = requireUserId()
    const aliases = requireAliases()

    let record: ReplayRecord
    try {
      record = await fetchReplay(ref)
    } catch (error) {
      const reason = error instanceof ShowdownError ? error.reason : 'unavailable'
      return { status: 'failed', reason, message: messageOf(error) }
    }

    let logPath: string
    try {
      logPath = await storeLog(userId, record)
    } catch (error) {
      // Deliberately no row: one whose log_path points at nothing would be
      // skipped as already imported and could never be re-parsed.
      return { status: 'failed', reason: 'store-failed', message: messageOf(error) }
    }

    let row: BattleRow
    let parseError: string | null = null
    try {
      row = rowOf(
        parseReplay(record.log, {
          replayId: record.id,
          formatId: record.formatid,
          uploadTime: record.uploadtime,
        }),
        aliases,
        logPath,
      )
    } catch (error) {
      parseError = messageOf(error)
      row = unparsedRowOf(record, logPath, parseError)
    }

    let written: BattleRow
    try {
      written = await writeRow(row)
    } catch (error) {
      return { status: 'failed', reason: 'write-failed', message: messageOf(error) }
    }

    return parseError === null
      ? { status: 'imported', battle: written }
      : { status: 'unparsed', battle: written, message: parseError }
  }

  return { importReplay }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
