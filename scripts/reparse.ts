/**
 * Rebuilds every derived column in `battles` from the raw logs in Storage.
 *
 * This is what makes "the raw log is the only source of truth" true rather
 * than aspirational: after a parser change, nothing has to be fetched from
 * Showdown again (design document §6 版本控管, decisions Q16/Q19).
 *
 * Deliberately a local Node script and deliberately not deployed. An online
 * admin endpoint and running this in the browser were both rejected: the
 * service_role key bypasses RLS, so it lives in a local environment variable
 * and nowhere near `apps/web/`.
 *
 * The row mapping is `battle-row`, the same module the importer writes with —
 * a second copy here would drift, and the symptom would be statistics that
 * changed with nobody able to say why.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm reparse [flags]
 *
 *   --stale        only rows whose parser_version is not the current one
 *   --user <id>    only one user's rows
 *   --dry-run      report what would change, write nothing
 */
import { gunzipSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { battleRowOf, unparsedRowOf } from 'battle-row'
import type { BattleRow } from 'battle-row'
import { PARSER_VERSION, parseReplay } from 'replay-parser'

const BUCKET = 'replay-logs'

/** Rows per page out of PostgREST, which caps a single response anyway. */
const PAGE = 500

/**
 * Rows rebuilt at once. Storage is the slow part and it is our own, so this is
 * higher than the import's cap on requests to Showdown — but a log is a few
 * hundred KB in memory, so it is not unbounded either.
 */
const CONCURRENCY = 10

/** Every column this script writes, which is every column it may compare. */
const COLUMNS = [
  'played_at',
  'format_id',
  'rated',
  'game_type',
  'rating',
  'rating_delta',
  'series_id',
  'my_side',
  'my_username',
  'opponent_username',
  'result',
  'team_signature',
  'bring_signature',
  'bring_complete',
  'turn_count',
  'end_reason',
  'details',
  'log_path',
  'parser_version',
  'parse_error',
] as const satisfies readonly (keyof BattleRow)[]

export interface Options {
  stale: boolean
  dryRun: boolean
  user: string | null
}

/** The replay JSON as Showdown served it and the import stored it. */
export interface StoredReplay {
  id: string
  formatid: string
  uploadtime: number
  log: string
}

/** The part of a stored row this script needs to rebuild it. */
export interface StoredRow {
  user_id: string
  replay_id: string
  log_path: string
}

/**
 * Refuses anything it was not taught. A misspelt `--dry-run` that ran anyway
 * would rewrite a whole table.
 */
export function optionsOf(argv: string[]): Options {
  const options: Options = { stale: false, dryRun: false, user: null }

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]

    if (flag === '--stale') options.stale = true
    else if (flag === '--dry-run') options.dryRun = true
    else if (flag === '--user') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--user needs a user id after it.')

      options.user = value
      index += 1
    } else throw new Error(`Unknown flag ${flag}. Known: --stale, --user <id>, --dry-run.`)
  }

  return options
}

/** One stored object, back to the replay JSON the import gzipped. */
export function recordOf(gzipped: Uint8Array): StoredReplay {
  const value = JSON.parse(gunzipSync(gzipped).toString('utf8')) as Partial<StoredReplay>

  if (
    typeof value.id !== 'string' ||
    typeof value.formatid !== 'string' ||
    typeof value.log !== 'string' ||
    typeof value.uploadtime !== 'number'
  ) {
    throw new Error('The stored object is not a replay: it has no log, format id or upload time.')
  }

  return value as StoredReplay
}

/**
 * The row this log produces now. A log the parser can no longer read keeps its
 * row and gets a `parse_error` rather than being left at its old values: a
 * regression that silently preserved yesterday's numbers is the one thing a
 * re-parse must not do.
 */
export function rowFrom(stored: StoredRow, record: StoredReplay, aliases: string[]): BattleRow {
  const meta = {
    replayId: record.id,
    formatId: record.formatid,
    uploadTime: record.uploadtime,
  }
  const owner = { userId: stored.user_id, logPath: stored.log_path }

  try {
    return battleRowOf(parseReplay(record.log, meta), { ...owner, aliases })
  } catch (error) {
    return unparsedRowOf(meta, { ...owner, message: messageOf(error) })
  }
}

/**
 * The same value with its object keys in a fixed order, so two spellings of
 * one value compare equal.
 *
 * Measured against the local Supabase: jsonb stores keys sorted by length then
 * bytewise, so the `details` written as `{ winner, sides }` comes back as
 * `{ sides, winner }`. Comparing the serialisations as they arrive would report
 * every row on the table as changed.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, nested]) => [key, canonical(nested)]),
  )
}

/**
 * The columns that would move, by value rather than by spelling. Also measured:
 * `played_at` comes back out of PostgREST as `2026-08-19T09:19:18+00:00` where
 * the parser produced `...T09:19:18.000Z` — the same moment, and not the same
 * string.
 */
export function changedColumns(before: Partial<BattleRow>, after: BattleRow): string[] {
  return COLUMNS.filter((column) => {
    const [was, is] = [before[column] ?? null, after[column] ?? null]

    if (column === 'played_at') {
      return Date.parse(String(was)) !== Date.parse(String(is))
    }

    return JSON.stringify(canonical(was)) !== JSON.stringify(canonical(is))
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set. This script needs it to reach Supabase.`)

  return value
}

/** Every user's alias list, read once: identity is resolved per battle. */
async function aliasesByUser(supabase: SupabaseClient): Promise<Map<string, string[]>> {
  const { data, error } = await supabase.from('profiles').select('id, showdown_usernames')
  if (error) throw error

  return new Map(
    (data as { id: string; showdown_usernames: string[] }[]).map((profile) => [
      profile.id,
      profile.showdown_usernames,
    ]),
  )
}

/**
 * The rows to rebuild, paged. Rows with no `log_path` are not among them:
 * there is nothing to rebuild them from, and they are reported rather than
 * quietly counted as done.
 */
async function* storedRows(supabase: SupabaseClient, options: Options) {
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('battles')
      // Every column: the comparison needs the ones this script writes, and
      // `details` is the bulk of the row whether it is asked for or not.
      .select('*')
      // Ordered so paging is stable while the script writes to the same table.
      .order('id')
      .range(from, from + PAGE - 1)

    if (options.user) query = query.eq('user_id', options.user)
    if (options.stale)
      query = query.or(`parser_version.neq.${PARSER_VERSION},parser_version.is.null`)

    const { data, error } = await query
    if (error) throw error

    const page = data as unknown as (StoredRow & Partial<BattleRow> & { log_path: string | null })[]
    if (!page.length) return

    yield* page
    if (page.length < PAGE) return
  }
}

type Tally = Record<'rebuilt' | 'unchanged' | 'unparsed' | 'no-log' | 'failed', number>

async function main() {
  const options = optionsOf(process.argv.slice(2))

  // Created here rather than at module scope so importing this file for its
  // pure parts -- the tests do -- needs no credentials.
  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false },
    },
  )

  const aliases = await aliasesByUser(supabase)
  const tally: Tally = { rebuilt: 0, unchanged: 0, unparsed: 0, 'no-log': 0, failed: 0 }

  async function rebuild(stored: StoredRow & Partial<BattleRow> & { log_path: string | null }) {
    if (!stored.log_path) {
      tally['no-log'] += 1
      console.error(`  no stored log  ${stored.replay_id}`)
      return
    }

    const path = stored.log_path

    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(path)
      if (error) throw error

      const record = recordOf(new Uint8Array(await data.arrayBuffer()))
      const row = rowFrom({ ...stored, log_path: path }, record, aliases.get(stored.user_id) ?? [])
      const moved = changedColumns(stored, row)

      if (row.parse_error !== null) tally.unparsed += 1

      // Nothing to write when nothing moved, which is also what proves an
      // unchanged parser rebuilds an unchanged table.
      if (!moved.length) {
        tally.unchanged += 1
        return
      }

      if (!options.dryRun) {
        const { error: writeError } = await supabase
          .from('battles')
          .upsert(row, { onConflict: 'user_id,replay_id' })

        if (writeError) throw writeError
      }

      tally.rebuilt += 1
      console.log(
        `  ${options.dryRun ? 'would rebuild' : 'rebuilt'}  ${row.replay_id}  ${moved.join(', ')}`,
      )
    } catch (error) {
      // One unreadable log is not a reason to leave the rest of the table on
      // an old parser version.
      tally.failed += 1
      console.error(`  failed  ${stored.replay_id}  ${messageOf(error)}`)
    }
  }

  const queue: Promise<void>[] = []

  for await (const stored of storedRows(supabase, options)) {
    const work = rebuild(stored).finally(() => {
      queue.splice(queue.indexOf(work), 1)
    })

    queue.push(work)
    if (queue.length >= CONCURRENCY) await Promise.race(queue)
  }

  await Promise.all(queue)

  console.log(
    `\nparser ${PARSER_VERSION}${options.dryRun ? ' (dry run, nothing written)' : ''}: ` +
      `${tally.rebuilt} rebuilt, ${tally.unchanged} unchanged, ${tally.unparsed} still unreadable, ` +
      `${tally['no-log']} without a stored log, ${tally.failed} failed`,
  )

  if (tally.failed) process.exitCode = 1
}

// Only when run, so the tests can import the pure parts above.
if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    // A missing key or a misspelt flag is a message, not a stack trace: this
    // is run by a person at a terminal.
    console.error(`reparse: ${messageOf(error)}`)
    process.exitCode = 1
  }
}
