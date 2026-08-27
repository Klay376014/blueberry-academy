/**
 * The raw log of one game, back out of Storage and unpacked.
 *
 * Read on demand rather than kept in a column: the timeline is derived data
 * that is parsed when the drawer opens, so a parser change takes effect
 * without a re-parse and the 500MB database allowance is untouched (decision
 * T2, docs/specs/2026-08-20-battle-timeline-design.md §4).
 */

/** The bucket the raw logs live in, isolated by a `{user_id}/` path prefix. */
const BUCKET = 'replay-logs'

/** Why one game's log could not be read. */
export type BattleLogFailure =
  /** Storage would not hand the object over: gone, or not this user's to read. */
  | 'download-failed'
  /** It arrived and is not a gzipped replay JSON with a log in it. */
  | 'unreadable'

/** A reason worth showing in the drawer instead of a spinner that never stops. */
export class BattleLogError extends Error {
  constructor(
    readonly reason: BattleLogFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'BattleLogError'
  }
}

/**
 * The logs read this session, by replay id, as the promises that read them —
 * so a second opening of one game waits on the first read rather than starting
 * another. A read that failed is removed, leaving the next opening free to
 * retry.
 */
export function useBattleLogs() {
  return useState<Map<string, Promise<string>>>('battle-logs', () => new Map())
}

export function useBattleLog() {
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()
  const cache = useBattleLogs()

  const loading = useState('battle-log-loading', () => false)
  const error = useState<BattleLogError | null>('battle-log-error', () => null)

  function requireUserId() {
    const id = user.value?.id
    if (!id) throw new Error('No signed-in user to read a battle log for.')
    return id
  }

  /** gunzip, the way the browser does it, with no library in the way. */
  async function unpack(object: Blob): Promise<string> {
    const stream = new Response(await object.arrayBuffer()).body

    if (!stream) throw new Error('This browser produced no stream to decompress.')

    return await new Response(stream.pipeThrough(new DecompressionStream('gzip'))).text()
  }

  async function download(path: string): Promise<string> {
    const { data, error: failed } = await $supabase.storage.from(BUCKET).download(path)

    if (failed || !data) {
      throw new BattleLogError(
        'download-failed',
        failed?.message ?? `Storage had nothing at ${path}.`,
        { cause: failed },
      )
    }

    let record: unknown
    try {
      record = JSON.parse(await unpack(data))
    } catch (cause) {
      throw new BattleLogError('unreadable', messageOf(cause), { cause })
    }

    // The import stores the whole replay JSON, of which the timeline needs
    // only the log.
    const log = (record as { log?: unknown } | null)?.log

    if (typeof log !== 'string') {
      throw new BattleLogError('unreadable', `The object at ${path} has no replay log in it.`)
    }

    return log
  }

  /**
   * One game's raw log, or `null` with `error` saying why. Throws only for the
   * programming error of asking with nobody signed in.
   */
  async function loadLog(replayId: string): Promise<string | null> {
    const userId = requireUserId()

    error.value = null

    const cached = cache.value.get(replayId)
    if (cached) return await cached

    const reading = download(`${userId}/${replayId}.json.gz`)
    cache.value.set(replayId, reading)
    loading.value = true

    try {
      return await reading
    } catch (cause) {
      // Not cached: a failed read is not an answer, and the next opening of
      // this game should try again.
      cache.value.delete(replayId)
      error.value =
        cause instanceof BattleLogError
          ? cause
          : new BattleLogError('unreadable', messageOf(cause), { cause })

      return null
    } finally {
      loading.value = false
    }
  }

  return { loading, error, loadLog }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
