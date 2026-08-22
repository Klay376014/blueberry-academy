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

/**
 * Replays being imported at once. The fetch layer already holds requests to
 * Showdown at five, so matching it here keeps at most that many imports
 * mid-flight -- more workers would only queue up inside the fetch layer while
 * holding a few hundred KB of log each.
 */
const CONCURRENCY = 5

/**
 * Replay ids per "which of these do I already have" lookup. PostgREST puts
 * the list in the query string, and a heavy account is thousands of ids --
 * one URL out of all of them is a URL nothing will accept.
 */
const LOOKUP_CHUNK = 200

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

/** What became of one replay in a batch, `skipped` included. */
export type BatchOutcome = IngestOutcome | { status: 'skipped' }

export interface BatchItem {
  ref: ReplayRef
  outcome: BatchOutcome
}

export interface ImportReport {
  /** One entry per replay, in the order they were handed over. */
  items: BatchItem[]
  counts: Record<BatchOutcome['status'], number>
}

export type SyncOutcome =
  | { status: 'listed'; report: ImportReport; truncated: boolean }
  /** The listing itself failed, so there is nothing to report per replay. */
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
  const { fetchReplay, listReplays } = useShowdown()

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

  /**
   * Which of these replays this user already has.
   *
   * Asked once for the whole batch rather than once per replay, and asked
   * before anything is fetched: the request that is never made to Showdown is
   * the point. Duplicate rows are impossible anyway -- `unique(user_id,
   * replay_id)` and an upsert see to that -- so this is politeness and speed,
   * not correctness.
   *
   * Throws rather than answering "none of them": treating an unreachable
   * database as an empty one would re-fetch an entire account.
   */
  async function knownReplayIds(ids: string[]): Promise<Set<string>> {
    const userId = requireUserId()
    const known = new Set<string>()

    for (let start = 0; start < ids.length; start += LOOKUP_CHUNK) {
      const { data, error } = await $supabase
        .from('battles')
        .select('replay_id')
        .eq('user_id', userId)
        .in('replay_id', ids.slice(start, start + LOOKUP_CHUNK))

      if (error) throw error

      for (const row of (data as { replay_id: string }[] | null) ?? []) known.add(row.replay_id)
    }

    return known
  }

  function countsOf(items: BatchItem[]): ImportReport['counts'] {
    const counts = { imported: 0, unparsed: 0, skipped: 0, failed: 0 }

    for (const item of items) counts[item.outcome.status] += 1

    return counts
  }

  /**
   * A batch of replays, none of which can take the batch down with it.
   *
   * Every replay is its own attempt and its own line in the report, so the
   * user is told why the twelve that failed failed (design document §8).
   * Resuming needs no cursor: each success is written the moment it happens,
   * so pressing sync again skips everything that made it and picks up the
   * rest.
   *
   * `onResult` fires as each replay finishes rather than at the end, which is
   * what a progress display reads.
   */
  async function importMany(
    refs: ReplayRef[],
    options: { onResult?: (item: BatchItem) => void } = {},
  ): Promise<ImportReport> {
    // First spelling of each id wins. A pasted list is typed by a human, and
    // a listing that was paged through shares one row between adjacent pages.
    const unique = [...new Map(refs.map((ref) => [ref.id, ref])).values()]
    const known = await knownReplayIds(unique.map((ref) => ref.id))

    const items: BatchItem[] = []
    let next = 0

    async function worker() {
      for (let index = next; index < unique.length; index = next) {
        next += 1
        const ref = unique[index]!

        const outcome: BatchOutcome = known.has(ref.id)
          ? { status: 'skipped' }
          : await importReplay(ref)

        // By index, so the report stays in the order the replays were given
        // however the workers interleave.
        const item = { ref, outcome }
        items[index] = item
        options.onResult?.(item)
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker))

    return { items, counts: countsOf(items) }
  }

  /**
   * Every public replay Showdown will admit to for this Showdown name, minus
   * the ones already imported.
   *
   * Private replays are not in a search: Showdown does not list them, and
   * without the password there would be nothing to fetch. They come in by
   * their link instead.
   */
  async function syncAccount(
    username: string,
    options: { onResult?: (item: BatchItem) => void } = {},
  ): Promise<SyncOutcome> {
    let listed: Awaited<ReturnType<typeof listReplays>>
    try {
      listed = await listReplays(username)
    } catch (error) {
      // A name that normalises to nothing is a caller's mistake rather than
      // an answer from Showdown, and it is not one of the reasons a report
      // can show.
      if (!(error instanceof ShowdownError)) throw error

      return { status: 'failed', reason: error.reason, message: error.message }
    }

    return {
      status: 'listed',
      report: await importMany(
        listed.replays.map(({ id }) => ({ id })),
        options,
      ),
      // Passed on rather than swallowed: there is more history than one
      // search can reach, and silence would read as "that was all of it".
      truncated: listed.truncated,
    }
  }

  return { importReplay, importMany, syncAccount }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
