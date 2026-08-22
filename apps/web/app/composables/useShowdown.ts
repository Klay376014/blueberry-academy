import { toID } from 'replay-parser'

/**
 * Everything the app does against replay.pokemonshowdown.com: list a player's
 * public replays, and fetch one replay with its log.
 *
 * The browser talks to Showdown directly — its replay API answers with
 * `access-control-allow-origin` for any origin, and the browser has neither
 * the 50-subrequest nor the 10ms CPU limit that makes the Workers free plan
 * unable to do an import at all (design document §2 and §3).
 *
 * Nothing here parses a log or writes to a database: it hands back Showdown's
 * own JSON under Showdown's own field names, so the shapes in a fixture are
 * the shapes in production.
 */

const ORIGIN = 'https://replay.pokemonshowdown.com'

/**
 * How many rows `search.json` answers with. The offset is `50 * (page - 1)`
 * but 51 rows come back, so adjacent pages always share one row.
 */
const PAGE_SIZE = 51

/**
 * Showdown answers any page above this with `[]`, whatever the query — about
 * 5001 replays per search. Reaching it means narrowing by format.
 */
const LAST_PAGE = 100

/**
 * Requests in the air at once. Workers allows six outbound connections on
 * either plan, and this is somebody else's free service.
 */
const MAX_IN_FLIGHT = 5

/** Attempts per request, the first one included. */
const MAX_ATTEMPTS = 4

/** First backoff, doubled per attempt: 500ms, 1s, 2s. */
const BACKOFF_MS = 500

/**
 * A connection accepted and then never answered is the one way a slot would
 * be held for good, which with the cap at five stalls an entire import.
 * Generous, because a replay log runs to hundreds of KB.
 */
const REQUEST_TIMEOUT_MS = 20_000

/** Why a request to Showdown did not produce a replay. */
export type ShowdownFailure =
  /** Showdown has no such replay: 404, with an empty body. */
  | 'not-found'
  /** Reached, but not answering: a network error or a 5xx that outlasted the retries. */
  | 'unavailable'
  /** Answered with something that is not JSON. */
  | 'malformed'

/**
 * A failure the import layer can report per replay rather than an exception
 * from whatever broke first: a batch import never fails as a batch, so every
 * failure needs a reason worth showing (design document §8).
 */
export class ShowdownError extends Error {
  constructor(
    readonly reason: ShowdownFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ShowdownError'
  }
}

/** One row of `search.json`, under Showdown's own field names. */
export interface ReplayListing {
  id: string
  /**
   * A display name — `[Gen 9 Champions] VGC 2026 Reg M-B` — and not a format
   * id. `battles.format_id` can only be filled from a single replay's
   * `formatid`, which means after fetchReplay.
   */
  format: string
  players: string[]
  uploadtime: number
  rating: number | null
  /** 0 public / 1 private with a password / 2 private without one / 3 deleted. */
  private: number
  password: string | null
}

/** A single replay: everything a listing has, plus the format id and the log. */
export interface ReplayRecord extends ReplayListing {
  formatid: string
  log: string
  views?: string
}

/** Which replay to fetch. A private one is only served with its password. */
export interface ReplayRef {
  id: string
  password?: string | null
}

export interface ReplayList {
  replays: ReplayListing[]
  /**
   * Whether the search ran out of pages before it ran out of replays: there
   * is more of this player's history than the list shows.
   */
  truncated: boolean
}

/**
 * Showdown answering 200 with JSON is not the same as answering with what was
 * asked for. Without these, a body of `null` or `{"error":…}` surfaces as a
 * TypeError downstream, outside the ShowdownFailure vocabulary.
 */
function asListings(value: unknown): ReplayListing[] | null {
  const rows = Array.isArray(value) ? value : null

  return rows?.every((row) => typeof (row as ReplayListing | null)?.id === 'string')
    ? (rows as ReplayListing[])
    : null
}

function asRecord(value: unknown): ReplayRecord | null {
  const record = value as ReplayRecord | null

  return typeof record?.id === 'string' &&
    typeof record.formatid === 'string' &&
    typeof record.log === 'string'
    ? record
    : null
}

/**
 * Requests in flight, and who is waiting. Module scope on purpose: the cap is
 * on what this browser does to Showdown, so it holds across every caller
 * rather than per useShowdown().
 */
let inFlight = 0
const waiting: (() => void)[] = []

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve))

  inFlight += 1
  try {
    return await work()
  } finally {
    inFlight -= 1
    waiting.shift()?.()
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** One attempt: a slot, a request, and the thing asked for or a reason it is not. */
async function attempt<T>(
  url: string,
  subject: string,
  accept: (value: unknown) => T | null,
): Promise<T> {
  const response = await withSlot(async () => {
    try {
      const result = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

      // The body is read inside the slot too, so a slow download is not
      // counted as a finished request.
      return { status: result.status, ok: result.ok, body: await result.text() }
    } catch (cause) {
      // One catch around both halves: a log of a few hundred KB is likelier to
      // die part-way through the body than before the headers.
      throw new ShowdownError('unavailable', `Could not reach Showdown for ${subject}.`, { cause })
    }
  })

  // An unknown id is a 404 with nothing in the body, not a JSON error object.
  if (response.status === 404) {
    throw new ShowdownError('not-found', `Showdown has no ${subject}.`)
  }

  if (!response.ok) {
    throw new ShowdownError('unavailable', `Showdown answered ${response.status} for ${subject}.`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(response.body)
  } catch {
    throw new ShowdownError(
      'malformed',
      `Showdown answered ${subject} with something that is not JSON.`,
    )
  }

  const accepted = accept(parsed)
  if (accepted === null) {
    throw new ShowdownError(
      'malformed',
      `Showdown answered ${subject} with something else entirely.`,
    )
  }

  return accepted
}

/** Retries what is worth retrying, backing off further each time. */
async function request<T>(
  url: string,
  subject: string,
  accept: (value: unknown) => T | null,
): Promise<T> {
  for (let tries = 1; ; tries += 1) {
    try {
      return await attempt<T>(url, subject, accept)
    } catch (error) {
      const reason = error instanceof ShowdownError ? error.reason : null

      // 'not-found' and 'malformed' are answers, not failures: asking again
      // produces the same one.
      if (reason !== 'unavailable' || tries >= MAX_ATTEMPTS) throw error

      await sleep(BACKOFF_MS * 2 ** (tries - 1))
    }
  }
}

export function useShowdown() {
  /**
   * Every public replay Showdown will admit to for this player. Paging stops
   * on the first page short of 51 rows, and rows are deduplicated by id
   * because adjacent pages always share one.
   */
  async function listReplays(
    username: string,
    options: { formatId?: string } = {},
  ): Promise<ReplayList> {
    const userId = toID(username)

    // Showdown answers an empty `user=` with the site-wide recent replays
    // rather than an error, which would file thousands of strangers' battles
    // under this user.
    if (!userId) {
      throw new Error(`"${username}" is not a Showdown name: it normalises to nothing.`)
    }

    const byId = new Map<string, ReplayListing>()

    // From 1, never 0: page 0 does not answer with JSON at all.
    for (let page = 1; page <= LAST_PAGE; page += 1) {
      const query = new URLSearchParams({ user: userId, page: String(page) })
      if (options.formatId) query.set('format', options.formatId)

      const rows = await request(
        `${ORIGIN}/search.json?${query}`,
        // Named for what was asked for, so a 404 here does not report itself
        // as a missing replay.
        `page ${page} of the replays of ${userId}`,
        asListings,
      )

      // First seen wins, so the shared row keeps its earlier position and the
      // order stays Showdown's.
      for (const row of rows) if (!byId.has(row.id)) byId.set(row.id, row)

      if (rows.length < PAGE_SIZE) return { replays: [...byId.values()], truncated: false }
    }

    return { replays: [...byId.values()], truncated: true }
  }

  /**
   * One replay, with its log and its `formatid`.
   *
   * The password goes in here rather than into a ref the caller assembles: a
   * private replay is served as `<id>-<password>pw.json` and not without the
   * suffix, so nothing outside this function can leave it off.
   */
  async function fetchReplay({ id, password }: ReplayRef): Promise<ReplayRecord> {
    const ref = password ? `${id}-${password}pw` : id

    return await request(`${ORIGIN}/${ref}.json`, `replay ${ref}`, asRecord)
  }

  return { listReplays, fetchReplay }
}
