import { battleRowOf, unparsedRowOf } from 'battle-row'
import type { BattleRow } from 'battle-row'
import { parseReplay } from 'replay-parser'
import { ShowdownError } from './useShowdown'
import type { ReplayRecord, ReplayRef, ShowdownFailure } from './useShowdown'

/**
 * One replay, all the way in: fetch it from Showdown, store the raw log,
 * parse it, work out which side is "me", and write the row.
 *
 * The order is the design. The raw log is stored **before** anything is
 * parsed, so a parser bug costs a re-parse rather than another pass over
 * somebody else's free service; the stored log is the only source of truth and
 * every column written here is derived data `scripts/reparse.ts` can rebuild —
 * from the same `battle-row` mapping this uses, so the two cannot disagree.
 *
 * Nothing in here throws for a replay that could not be imported: a batch
 * import must never fail as a batch (design document §8).
 */

/** The bucket the raw logs live in, isolated by a `{user_id}/` path prefix. */
const BUCKET = 'replay-logs'

/**
 * Replays being imported at once. The fetch layer already holds requests to
 * Showdown at five, and more workers would only queue up inside it while
 * holding a few hundred KB of log each.
 */
const CONCURRENCY = 5

/**
 * Replay ids per "which of these do I already have" lookup. PostgREST puts the
 * list in the query string, and a heavy account is thousands of ids.
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

// Re-exported because the row is what this composable hands back, and its
// callers should not have to know which package spells it out.
export type { BattleRow } from 'battle-row'

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

/** What a caller watching a batch go by wants to hear about. */
export interface ImportOptions {
  /**
   * How many replays this batch will actually work through, once the
   * duplicates in the list are gone. Fires once, before the first fetch — a
   * progress bar needs its denominator up front.
   */
  onTotal?: (total: number) => void
  /** One replay, the moment it is done. */
  onResult?: (item: BatchItem) => void
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
   * An empty alias list and a list that was never read look alike from here
   * and mean opposite things: importing against the second would file every
   * one of the user's own battles as somebody else's.
   */
  function requireAliases() {
    if (stored.value === null) {
      throw new Error('The alias list has not been read yet, so identity cannot be resolved.')
    }
    return stored.value
  }

  /** The whole replay JSON, gzipped, at `{user_id}/{replay_id}.json.gz`. */
  async function storeLog(userId: string, record: ReplayRecord): Promise<string> {
    const path = `${userId}/${record.id}.json.gz`

    // The JSON rather than the log alone: a re-parse needs the format id and
    // the upload time as much as it needs the log.
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
   * Fetch, store, parse, resolve, write. Returns what became of it rather than
   * throwing, except for the two programming errors: no signed-in user, and an
   * alias list that was never read.
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

    const meta = {
      replayId: record.id,
      formatId: record.formatid,
      uploadTime: record.uploadtime,
    }

    let row: BattleRow
    let parseError: string | null = null
    try {
      row = battleRowOf(parseReplay(record.log, meta), { userId, aliases, logPath })
    } catch (error) {
      parseError = messageOf(error)
      row = unparsedRowOf(meta, { userId, logPath, message: parseError })
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
   * Which of these replays this user already has. Asked once for the whole
   * batch and before anything is fetched: the request never made to Showdown
   * is the point. Duplicate rows are impossible anyway — `unique(user_id,
   * replay_id)` and an upsert see to that — so this is politeness and speed.
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
   * A batch of replays, none of which can take the batch down with it: every
   * replay is its own attempt and its own line in the report (design document
   * §8). Resuming needs no cursor — each success is written the moment it
   * happens, so pressing sync again skips everything that made it.
   *
   * `onTotal` then `onResult` per replay is what a progress display reads.
   */
  async function importMany(refs: ReplayRef[], options: ImportOptions = {}): Promise<ImportReport> {
    // First spelling of each id wins. A pasted list is typed by a human, and a
    // listing that was paged through shares one row between adjacent pages.
    const unique = [...new Map(refs.map((ref) => [ref.id, ref])).values()]
    const known = await knownReplayIds(unique.map((ref) => ref.id))

    options.onTotal?.(unique.length)

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
   * the ones already imported. Private replays are not in a search and come in
   * by their link instead.
   */
  async function syncAccount(username: string, options: ImportOptions = {}): Promise<SyncOutcome> {
    let listed: Awaited<ReturnType<typeof listReplays>>
    try {
      listed = await listReplays(username)
    } catch (error) {
      // A name that normalises to nothing is a caller's mistake rather than an
      // answer from Showdown, and not one of the reasons a report can show.
      if (!(error instanceof ShowdownError)) throw error

      return { status: 'failed', reason: error.reason, message: error.message }
    }

    return {
      status: 'listed',
      report: await importMany(
        listed.replays.map(({ id }) => ({ id })),
        options,
      ),
      // Passed on rather than swallowed: silence would read as "that was all".
      truncated: listed.truncated,
    }
  }

  return { importReplay, importMany, syncAccount }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
