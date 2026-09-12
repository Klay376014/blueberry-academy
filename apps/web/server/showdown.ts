import { toID } from 'replay-parser'
import { Secret } from './utils/secret'
import type { ReplayListing, ReplayRef } from '../app/shared/api/showdown'

/**
 * Listing a reader's **private** replays, which is the one thing the browser
 * cannot do: `replays/searchprivate` answers our origin with no
 * `access-control-*` headers at all, so it needs a server in the middle
 * (design document §2.1 and §3.1).
 *
 * The trip is login → searchprivate → logout, and it holds nothing: the sid
 * lives in one call stack and the session is closed before this function
 * returns, whatever happened. Everything else — fetching a replay, parsing it,
 * writing a row — stays in the browser (§4, decision D4).
 *
 * Measured against a real account rather than read out of Showdown's source:
 * docs/specs/2026-09-11-private-replay-sync-spike.md.
 */

/** Where the login actions live. */
const PLAY_ORIGIN = 'https://play.pokemonshowdown.com'

/** Where the replay actions answer. Measured; `play.` knows them too. */
const REPLAY_ORIGIN = 'https://replay.pokemonshowdown.com'

/**
 * Rows in a full page. Showdown's offset moves by 50 while 51 come back, so
 * adjacent pages always share one — the same arithmetic as `search.json`.
 *
 * Not measured: the spike's account had 32 private replays and could not
 * reach a second page (spike note, "分頁那項為什麼是空的").
 */
const PAGE_SIZE = 51

/**
 * Pages at most — about a thousand private replays, reported as `truncated`
 * rather than as an error when it runs out.
 *
 * Two budgets bound this and **neither has been measured on this path**. The
 * 50 subrequests per invocation of the free plan would allow 48 pages (the
 * login and the logout are two). The 10ms of CPU would not: every page is a
 * body to decode and a JSON.parse of 51 rows, and that limit is the reason
 * §2/§3 keep importing in the browser at all. Overrunning it is a kill, not a
 * `truncated` — no response, and the logout in the `finally` never runs.
 *
 * So this is deliberately well under the subrequest ceiling. Raising it means
 * measuring the CPU first.
 */
const MAX_PAGES = 20

/** Per request. Generous, but far below what an invocation is allowed to take. */
const REQUEST_TIMEOUT_MS = 10_000

/** Why a sync produced no list. */
export type ShowdownSyncFailure =
  /** Showdown said no: a wrong password, or a sid it will not accept. */
  | 'refused'
  /** Reached, but not answering: a network error or a 5xx. */
  | 'unavailable'
  /** Answered with something this does not recognise. */
  | 'malformed'

/**
 * Carries no `cause`. The chain under a fetch failure can hold the request
 * that caused it, and that request has the reader's password in its body —
 * `Secret` keeps the value out of a log (§5.2), and an error object is the
 * way around it.
 */
export class ShowdownSyncError extends Error {
  constructor(
    readonly reason: ShowdownSyncFailure,
    message: string,
  ) {
    super(message)
    this.name = 'ShowdownSyncError'
  }
}

export interface PrivateReplayList {
  refs: ReplayRef[]
  /** Whether the subrequest budget ran out before the replays did. */
  truncated: boolean
}

export interface PrivateSyncRequest {
  name: string
  password: Secret
  /** Injected by the tests, which answer with fixtures rather than call Showdown. */
  fetch?: typeof globalThis.fetch
}

interface Answer {
  response: Response
  value: unknown
}

/**
 * One action. Credentials go in the body and never in the query string, which
 * is in every access log along the way (§5.4).
 */
async function post(
  fetcher: typeof globalThis.fetch,
  origin: string,
  act: string,
  fields: Record<string, string>,
): Promise<Answer> {
  let response: Response
  try {
    response = await fetcher(`${origin}/api/${act}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      // A connection accepted and then never answered would otherwise hold
      // the invocation until the platform kills it — and a killed invocation
      // never reaches the logout.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    // Deliberately not rethrowing the original: see ShowdownSyncError.
    throw new ShowdownSyncError('unavailable', `Could not reach Showdown for ${act}.`)
  }

  if (!response.ok) {
    throw new ShowdownSyncError('unavailable', `Showdown answered ${response.status} for ${act}.`)
  }

  const text = await response.text()

  let value: unknown
  try {
    // Every action response is prefixed with `]` against JSON hijacking.
    value = JSON.parse(text.startsWith(']') ? text.slice(1) : text)
  } catch {
    throw new ShowdownSyncError(
      'malformed',
      `Showdown answered ${act} with something that is not JSON.`,
    )
  }

  // A refusal is a 200 with a body, so the status alone would read a wrong
  // password as a successful sync of an empty account.
  const refusal = (value as { actionerror?: unknown } | null)?.actionerror
  if (typeof refusal === 'string') {
    throw new ShowdownSyncError('refused', `Showdown refused ${act}: ${refusal}`)
  }

  return { response, value }
}

/** The `sid=` cookie's value, as Showdown wrote it. */
function sidCookieOf(response: Response): string | null {
  const header = response.headers
    .getSetCookie()
    .find((cookie) => cookie.trimStart().startsWith('sid='))

  return header ? (header.trimStart().slice('sid='.length).split(';')[0] ?? '') : null
}

/**
 * The cookie value decoded, which is what `body.sid` needs. The cookie holds
 * `encodeURIComponent(name,sessionId,sidhash)`; the cookie path decodes it on
 * the way back in and the `body.sid` path does not (§2.2.2). The one step of
 * this that is easy to get wrong.
 *
 * Null rather than a throw when it will not decode, and null rather than the
 * raw value: what the search needs is the decoded form, and sending the
 * encoded one instead would ask Showdown a question we know the wrong spelling
 * of. The logout is the one caller that would still rather send something.
 */
function decodedSid(cookie: string): string | null {
  try {
    return decodeURIComponent(cookie)
  } catch {
    return null
  }
}

function asListings(value: unknown): ReplayListing[] | null {
  if (!Array.isArray(value)) return null

  return value.every((row) => typeof (row as ReplayListing | null)?.id === 'string')
    ? (value as ReplayListing[])
    : null
}

/** Every page, deduplicated by id, in Showdown's order. */
async function listPrivate(
  fetcher: typeof globalThis.fetch,
  sid: string,
  username: string,
): Promise<PrivateReplayList> {
  const byId = new Map<string, ReplayRef>()

  // From 1: page 0 does not answer with JSON at all.
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { value } = await post(fetcher, REPLAY_ORIGIN, 'replays/searchprivate', {
      username,
      sid,
      page: String(page),
    })

    const rows = asListings(value)
    if (!rows) {
      throw new ShowdownSyncError('malformed', 'Showdown answered the search with something else.')
    }

    // First seen wins, so the row adjacent pages share keeps its earlier
    // position and the order stays Showdown's.
    for (const row of rows) {
      if (!byId.has(row.id)) byId.set(row.id, { id: row.id, password: row.password })
    }

    if (rows.length < PAGE_SIZE) return { refs: [...byId.values()], truncated: false }
  }

  return { refs: [...byId.values()], truncated: true }
}

export async function privateReplayRefs({
  name,
  password,
  fetch = globalThis.fetch,
}: PrivateSyncRequest): Promise<PrivateReplayList> {
  // The same normalisation the browser applies (useShowdown.listReplays).
  // `credentialsOf` has already refused a name that normalises to nothing, so
  // this is the second line of the same defence rather than the first.
  const username = toID(name)
  if (!username) {
    throw new ShowdownSyncError(
      'malformed',
      'That is not a Showdown name: it normalises to nothing.',
    )
  }

  // `expose()` appears once in this repo, and this is the line. Everywhere
  // else the password is a Secret and prints as [redacted] (§5.2).
  const login = await post(fetch, PLAY_ORIGIN, 'login', { name: username, pass: password.expose() })

  // `assertion` is deliberately not read: it is an error string unless a
  // challstr was exchanged, so treating it as the verdict fails every
  // ordinary login (spike note). `actionsuccess` is the verdict — and a
  // refusal that arrives this way rather than as an `actionerror` is a
  // refusal all the same, not a Showdown we failed to understand.
  if ((login.value as { actionsuccess?: unknown } | null)?.actionsuccess !== true) {
    throw new ShowdownSyncError('refused', 'Showdown did not accept that name and password.')
  }

  const cookie = sidCookieOf(login.response)
  if (!cookie) {
    throw new ShowdownSyncError('malformed', 'Showdown logged us in without a session.')
  }

  try {
    const sid = decodedSid(cookie)

    if (sid === null || sid.split(',').length !== 3) {
      throw new ShowdownSyncError(
        'malformed',
        'Showdown issued a session in a shape we do not know.',
      )
    }

    return await listPrivate(fetch, sid, username)
  } finally {
    // We came, and we closed the door behind us (§5.1) — on the way out of a
    // failure too. Inside the `try` because the cookie is proof a session
    // exists: anything thrown between here and there, the unreadable sid
    // included, would otherwise leave one live that nobody holds a reference
    // to. Its own failure is swallowed: it must not replace the reason we are
    // leaving.
    await post(fetch, PLAY_ORIGIN, 'logout', {
      userid: username,
      sid: decodedSid(cookie) ?? cookie,
    }).catch(() => undefined)
  }
}

/**
 * The credentials out of a request body, or null if it does not carry a pair.
 * The password is wrapped here, at the edge, so that no later line of this
 * app holds it as a plain string (§5.2).
 */
export function credentialsOf(body: unknown): { name: string; password: Secret } | null {
  const { name, password } = (body ?? {}) as { name?: unknown; password?: unknown }

  if (typeof name !== 'string' || typeof password !== 'string' || !password) return null

  // A name that normalises to nothing is a bad request, not a rejected
  // password: answering 401 would send the reader off to change a password
  // that was fine.
  if (!toID(name)) return null

  return { name, password: new Secret(password) }
}

/**
 * What the route answers with. An unrecognised failure is 500 rather than
 * 401: telling a reader their password was rejected when something else broke
 * sends them to change a password that was fine.
 */
export function statusOf(error: unknown): number {
  if (!(error instanceof ShowdownSyncError)) return 500

  return error.reason === 'refused' ? 401 : 502
}
