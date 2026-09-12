// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ShowdownSyncError, credentialsOf, privateReplayRefs, statusOf } from '../server/showdown'
import { Secret } from '../server/utils/secret'

const NAME = 'NotLittleStar'
const USER_ID = 'notlittlestar'
const PASSWORD = 'hunter2'

/** What the spike measured: three parts, comma separated, encoded in the cookie. */
const SID = `${USER_ID},1234,abcdef`

const PLAY = 'https://play.pokemonshowdown.com'
const REPLAY = 'https://replay.pokemonshowdown.com'

interface Call {
  url: string
  fields: Record<string, string>
}

interface Row {
  id: string
  password: string | null
}

function listing(row: Row) {
  return {
    uploadtime: 1786863388,
    id: row.id,
    format: '[Gen 9 Champions] VGC 2026 Reg M-B',
    players: [NAME, 'someone'],
    rating: 1586,
    private: 1,
    password: row.password,
  }
}

/**
 * Showdown as the spike measured it: every action answers 200, every body
 * carries the `]` prefix, and a refusal is a body rather than a status.
 */
function showdown(
  options: {
    pages?: Row[][]
    loginError?: string
    searchError?: string
    onSearch?: (page: number) => Response | undefined
  } = {},
) {
  const calls: Call[] = []

  const body = (value: unknown, init?: ResponseInit) =>
    new Response(`]${JSON.stringify(value)}`, init)

  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const fields = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')))
    calls.push({ url, fields })

    if (url === `${PLAY}/api/login`) {
      if (options.loginError) return body({ actionerror: options.loginError })

      return body(
        {
          actionsuccess: true,
          // Measured: an error string, because no challstr was exchanged. The
          // login still succeeds and the sid still works.
          assertion: ';;This server is requesting an invalid login key.',
          curuser: { loggedin: true, username: NAME, userid: USER_ID },
        },
        { headers: { 'set-cookie': `sid=${encodeURIComponent(SID)}; Path=/; HttpOnly; Secure` } },
      )
    }

    if (url === `${REPLAY}/api/replays/searchprivate`) {
      const page = Number(fields.page)
      const answer = options.onSearch?.(page)
      if (answer) return answer

      if (options.searchError) return body({ actionerror: options.searchError })

      return body((options.pages?.[page - 1] ?? []).map(listing))
    }

    if (url === `${PLAY}/api/logout`) return body({ actionsuccess: true })

    throw new Error(`the test fetcher was not taught ${url}`)
  }

  return { calls, fetcher: fetcher as unknown as typeof fetch }
}

function sync(options: Parameters<typeof showdown>[0] = {}) {
  const { calls, fetcher } = showdown(options)

  return {
    calls,
    result: privateReplayRefs({ name: NAME, password: new Secret(PASSWORD), fetch: fetcher }),
  }
}

/** 51 rows, which is a full page and therefore means "ask for another". */
function fullPage(prefix: string): Row[] {
  return Array.from({ length: 51 }, (_, index) => ({
    id: `${prefix}-${index}`,
    password: `pw${index}`,
  }))
}

describe('the round trip', () => {
  it('logs in at play, searches at replay, logs out at play', async () => {
    const { calls, result } = sync({ pages: [[{ id: 'battle-1', password: 'abc' }]] })
    await result

    expect(calls.map((call) => call.url)).toEqual([
      `${PLAY}/api/login`,
      `${REPLAY}/api/replays/searchprivate`,
      `${PLAY}/api/logout`,
    ])
  })

  it('sends the sid decoded, which is the one step the body path does not do', async () => {
    const { calls, result } = sync({ pages: [[]] })
    await result

    const search = calls.find((call) => call.url.includes('searchprivate'))

    expect(search?.fields.sid).toBe(SID)
    expect(search?.fields.username).toBe(USER_ID)
  })

  it('normalises the name the way the app does', async () => {
    const { calls, fetcher } = showdown({ pages: [[]] })
    await privateReplayRefs({
      name: '  Not Little Star ',
      password: new Secret(PASSWORD),
      fetch: fetcher,
    })

    expect(calls.find((call) => call.url.includes('searchprivate'))?.fields.username).toBe(USER_ID)
  })

  it('never puts a credential in a URL', async () => {
    // A query string is in every access log along the way.
    const { calls, result } = sync({ pages: [[]] })
    await result

    for (const call of calls) {
      expect(call.url).not.toContain('?')
      expect(call.url).not.toContain(PASSWORD)
      expect(call.url).not.toContain(USER_ID)
    }
  })

  it('sends the password, exposed exactly once, as a form field', async () => {
    const { calls, result } = sync({ pages: [[]] })
    await result

    expect(calls[0]?.fields).toEqual({ name: USER_ID, pass: PASSWORD })
  })

  it('logs out with the userid the sid names', async () => {
    const { calls, result } = sync({ pages: [[]] })
    await result

    expect(calls.at(-1)?.fields).toEqual({ userid: USER_ID, sid: SID })
  })
})

describe('what comes back', () => {
  it('turns the listings into refs, password and all', async () => {
    const { result } = await sync({
      pages: [
        [
          { id: 'battle-1', password: 'abc' },
          { id: 'battle-2', password: 'def' },
        ],
      ],
    })

    expect((await result).refs).toEqual([
      { id: 'battle-1', password: 'abc' },
      { id: 'battle-2', password: 'def' },
    ])
  })

  it('strips the ] prefix rather than failing to parse', async () => {
    const { result } = sync({ pages: [[{ id: 'battle-1', password: 'abc' }]] })

    expect((await result).refs).toHaveLength(1)
  })

  it('says it is not truncated when the pages ran out', async () => {
    const { result } = sync({ pages: [[{ id: 'battle-1', password: 'abc' }]] })

    expect((await result).truncated).toBe(false)
  })
})

describe('paging', () => {
  it('asks for another page while one comes back full', async () => {
    const { calls, result } = sync({ pages: [fullPage('a'), [{ id: 'b-1', password: 'x' }]] })
    await result

    const searches = calls.filter((call) => call.url.includes('searchprivate'))

    expect(searches.map((call) => call.fields.page)).toEqual(['1', '2'])
  })

  it('stops on the first page short of a full one', async () => {
    const { calls, result } = sync({ pages: [[{ id: 'a-1', password: 'x' }], fullPage('b')] })
    await result

    expect(calls.filter((call) => call.url.includes('searchprivate'))).toHaveLength(1)
  })

  it('keeps one copy of the row adjacent pages share', async () => {
    const first = fullPage('a')
    const shared = first.at(-1)!
    const { result } = sync({ pages: [first, [shared, { id: 'b-1', password: 'x' }]] })

    const ids = (await result).refs.map((ref) => ref.id)

    expect(ids).toHaveLength(52)
    expect(ids.filter((id) => id === shared.id)).toHaveLength(1)
  })

  it('keeps the first position of a row it sees twice', async () => {
    const first = fullPage('a')
    const shared = first.at(-1)!
    const { result } = sync({ pages: [first, [shared, { id: 'b-1', password: 'x' }]] })

    expect((await result).refs[50]).toEqual({ id: shared.id, password: shared.password })
  })

  it('stops at the subrequest budget and says it was truncated', async () => {
    // The Workers free plan allows 50 subrequests per invocation, and login
    // and logout are two of them.
    const { calls, result } = sync({
      pages: Array.from({ length: 60 }, (_, index) => fullPage(`p${index}`)),
    })

    expect((await result).truncated).toBe(true)
    expect(calls.length).toBeLessThanOrEqual(50)
  })
})

describe('when Showdown says no', () => {
  it('reports a refused login as a refusal, not as an empty list', async () => {
    const { result } = sync({ loginError: 'Wrong password.' })

    await expect(result).rejects.toThrow(ShowdownSyncError)
    await expect(result).rejects.toMatchObject({ reason: 'refused' })
  })

  it('does not go looking for replays after a refused login', async () => {
    const { calls, result } = sync({ loginError: 'Wrong password.' })
    await result.catch(() => {})

    expect(calls.map((call) => call.url)).toEqual([`${PLAY}/api/login`])
  })

  it('treats an actionerror from the search as a failure, not as no replays', async () => {
    // It arrives as a 200, so anything that only reads the status reports a
    // rejected sid as an account with nothing in it.
    const { result } = sync({ searchError: 'Access denied: You must be logged in.' })

    await expect(result).rejects.toMatchObject({ reason: 'refused' })
  })

  it('reports a 5xx as unavailable', async () => {
    const { result } = sync({ onSearch: () => new Response('nope', { status: 502 }) })

    await expect(result).rejects.toMatchObject({ reason: 'unavailable' })
  })

  it('reports a body that is not JSON as malformed', async () => {
    const { result } = sync({ onSearch: () => new Response('<html>hello</html>') })

    await expect(result).rejects.toMatchObject({ reason: 'malformed' })
  })

  it('reports rows that are not listings as malformed', async () => {
    const { result } = sync({ onSearch: () => new Response('][{"nope":true}]') })

    await expect(result).rejects.toMatchObject({ reason: 'malformed' })
  })

  it('says so when the login answers without a sid', async () => {
    const { fetcher } = showdown({ pages: [[]] })
    // The same answer with the Set-Cookie dropped.
    const withoutCookie = (async (input: string | URL | Request, init?: RequestInit) => {
      const answer = await fetcher(input, init)

      return String(input).endsWith('/api/login') ? new Response(await answer.text()) : answer
    }) as unknown as typeof fetch

    await expect(
      privateReplayRefs({ name: NAME, password: new Secret(PASSWORD), fetch: withoutCookie }),
    ).rejects.toMatchObject({ reason: 'malformed' })
  })
})

describe('the door is always closed behind us', () => {
  it('logs out after a search that failed', async () => {
    const { calls, result } = sync({ searchError: 'Access denied: You must be logged in.' })
    await result.catch(() => {})

    expect(calls.map((call) => call.url)).toContain(`${PLAY}/api/logout`)
  })

  it('logs out after a search that threw', async () => {
    const { calls, result } = sync({
      onSearch: () => {
        throw new Error('the socket went away')
      },
    })
    await result.catch(() => {})

    expect(calls.map((call) => call.url)).toContain(`${PLAY}/api/logout`)
  })

  it('keeps the original failure when the logout fails too', async () => {
    const { fetcher } = showdown({ searchError: 'Access denied: You must be logged in.' })
    const brokenLogout = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/logout')) throw new Error('and now the logout too')

      return await fetcher(input, init)
    }) as unknown as typeof fetch

    await expect(
      privateReplayRefs({ name: NAME, password: new Secret(PASSWORD), fetch: brokenLogout }),
    ).rejects.toMatchObject({ reason: 'refused' })
  })
})

describe('the password cannot be printed by accident', () => {
  it('never lets the value reach a thrown message', async () => {
    const { result } = sync({ loginError: 'Wrong password.' })
    const error = await result.catch((cause: unknown) => cause)

    // Whatever a caller logs of this — message, cause chain, the whole object
    // — the password is not in it.
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(PASSWORD)
  })
})

describe('what the route makes of a request body', () => {
  it('takes a name and a password', () => {
    const credentials = credentialsOf({ name: NAME, password: PASSWORD })

    expect(credentials?.name).toBe(NAME)
    expect(credentials?.password.expose()).toBe(PASSWORD)
  })

  it('wraps the password before it is anywhere but the body', () => {
    expect(String(credentialsOf({ name: NAME, password: PASSWORD })?.password)).toBe('[redacted]')
  })

  it('refuses a body missing either half', () => {
    expect(credentialsOf({ name: NAME })).toBeNull()
    expect(credentialsOf({ password: PASSWORD })).toBeNull()
    expect(credentialsOf({ name: '', password: PASSWORD })).toBeNull()
    expect(credentialsOf({ name: NAME, password: '' })).toBeNull()
  })

  it('refuses a body that is not one', () => {
    expect(credentialsOf(null)).toBeNull()
    expect(credentialsOf('name=x&password=y')).toBeNull()
    expect(credentialsOf({ name: 1, password: 2 })).toBeNull()
  })
})

describe('what the route answers with', () => {
  it('keeps a Showdown refusal apart from an unauthenticated caller', () => {
    // 401 is "you are not signed in to this app", which the route now answers
    // on its own account. A rejected Showdown password is a well-formed
    // request the far end said no to; spelling both 401 would leave the form
    // unable to tell the reader which of the two happened.
    expect(
      statusOf(new ShowdownSyncError('refused', 'Showdown refused login: Wrong password.')),
    ).toBe(422)
  })

  it('reports Showdown being unreachable as a bad gateway', () => {
    expect(statusOf(new ShowdownSyncError('unavailable', 'nope'))).toBe(502)
    expect(statusOf(new ShowdownSyncError('malformed', 'nope'))).toBe(502)
  })

  it('does not dress an unknown failure up as Showdown saying no', () => {
    // A 401 would tell the reader to check a password that was fine.
    expect(statusOf(new Error('something else entirely'))).toBe(500)
  })
})

describe('a login that fails without saying actionerror', () => {
  it('reads actionsuccess, so a refusal is a refusal', async () => {
    // §2.2.3: the response shape is { actionsuccess, assertion, curuser }, so
    // `actionsuccess: false` is a real answer. The spike never measured what
    // a wrong password looks like — only `searchprivate` refusing a sid — so
    // this is guarded rather than assumed away.
    const { fetcher } = showdown({ pages: [[]] })
    const unsuccessful = (async (input: string | URL | Request, init?: RequestInit) => {
      const answer = await fetcher(input, init)

      return String(input).endsWith('/api/login')
        ? new Response(`]${JSON.stringify({ actionsuccess: false, assertion: ';;nope' })}`)
        : answer
    }) as unknown as typeof fetch

    await expect(
      privateReplayRefs({ name: NAME, password: new Secret(PASSWORD), fetch: unsuccessful }),
    ).rejects.toMatchObject({ reason: 'refused' })
  })
})

describe('a session we cannot read is still a session', () => {
  /** A login that answers with a sid cookie of the caller's choosing. */
  function withCookie(value: string) {
    const { calls, fetcher } = showdown({ pages: [[]] })
    const odd = (async (input: string | URL | Request, init?: RequestInit) => {
      const answer = await fetcher(input, init)

      return String(input).endsWith('/api/login')
        ? new Response(await answer.text(), { headers: { 'set-cookie': `sid=${value}; Path=/` } })
        : answer
    }) as unknown as typeof fetch

    return {
      calls,
      result: privateReplayRefs({ name: NAME, password: new Secret(PASSWORD), fetch: odd }),
    }
  }

  it('logs out even when the sid is not the shape we know', async () => {
    // The cookie is there, so Showdown made us a session. Failing to parse it
    // is no reason to walk away leaving the door open (§5.1).
    const { calls, result } = withCookie('two,parts')

    await expect(result).rejects.toMatchObject({ reason: 'malformed' })
    expect(calls.map((call) => call.url)).toContain(`${PLAY}/api/logout`)
  })

  it('logs out even when the sid will not decode', async () => {
    // `decodeURIComponent('%')` throws a URIError, which is not a
    // ShowdownSyncError and would leave as a 500.
    const { calls, result } = withCookie('%,1234,abcdef')

    await expect(result).rejects.toMatchObject({ reason: 'malformed' })
    expect(calls.map((call) => call.url)).toContain(`${PLAY}/api/logout`)
  })
})

describe('a name that is not a name', () => {
  it('is a bad request, not a rejected password', () => {
    // 401 would send the reader off to change a password that was fine.
    expect(credentialsOf({ name: '!!!', password: PASSWORD })).toBeNull()
    expect(credentialsOf({ name: '   ', password: PASSWORD })).toBeNull()
  })
})

describe('a Showdown that never answers', () => {
  it('gives every request a deadline', async () => {
    const signals: (AbortSignal | null | undefined)[] = []
    const { fetcher } = showdown({ pages: [[]] })
    const watched = (async (input: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal)

      return await fetcher(input, init)
    }) as unknown as typeof fetch

    await privateReplayRefs({ name: NAME, password: new Secret(PASSWORD), fetch: watched })

    // Without one, a Showdown that accepts and never answers holds the
    // invocation until the platform kills it — and then the logout in the
    // `finally` never runs.
    expect(signals.length).toBeGreaterThan(0)
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal)
  })
})
