import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import supabasePlugin from '../../../plugins/supabase.client'
import { signIn } from '../../../../test/helpers'
import ladder from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

const TOKEN = 'a.jwt.value'
const NAME = 'NotLittleStar'
const PASSWORD = 'hunter2'
const ROUTE = '/api/showdown/sync-private'

// Supabase is faked the way `ingest.spec.ts` fakes it, with one difference:
// there is a session here, because the private route is the first thing in
// the app that needs the reader's access token.
const { table, storage, session, createClient } = vi.hoisted(() => {
  const rows: Record<string, unknown>[] = []
  const uploads: { path: string; body: Blob }[] = []
  const session = { value: { access_token: 'a.jwt.value' } as { access_token: string } | null }

  const table = {
    rows,
    from: vi.fn((_name: string) => ({
      upsert: (values: Record<string, unknown>) => {
        rows.push(values)

        return {
          select: () => ({ single: () => Promise.resolve({ data: values, error: null }) }),
        }
      },
      // The batch asks which replay ids are already in. Nothing is, here.
      select: (_columns: string) => ({
        eq: (_column: string, _value: unknown) => ({
          in: (_target: string, _ids: string[]) => Promise.resolve({ data: [], error: null }),
        }),
      }),
    })),
  }

  const storage = {
    uploads,
    from: vi.fn((_bucket: string) => ({
      upload: (path: string, body: Blob) => {
        uploads.push({ path, body })

        return Promise.resolve({ data: { path }, error: null })
      },
    })),
  }

  return {
    table,
    storage,
    session,
    createClient: vi.fn(() => ({
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: session.value } })),
        onAuthStateChange: vi.fn(),
      },
      from: table.from,
      storage: { from: storage.from },
    })),
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

interface Call {
  url: string
  init: RequestInit | undefined
}

let calls: Call[]
/** What the private route answers with, per test. */
let route: () => { ok: boolean; status: number; text: () => Promise<string> }

function json(body: unknown) {
  return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) }
}

function failing(status: number) {
  return { ok: false, status, text: () => Promise.resolve('') }
}

async function bootPlugin() {
  const nuxtApp = useNuxtApp()
  const result = (await (
    supabasePlugin as unknown as (app: typeof nuxtApp) => Promise<{
      provide: { supabase: unknown }
    }>
  )(nuxtApp)) as { provide: { supabase: unknown } }

  if (!nuxtApp.$supabase) nuxtApp.provide('supabase', result.provide.supabase)
}

function routeCall() {
  return calls.find((call) => call.url === ROUTE)
}

beforeEach(async () => {
  await bootPlugin()
  signIn()
  useShowdownAliases().value = [NAME]

  session.value = { access_token: TOKEN }
  calls = []
  route = () => json({ refs: [{ id: 'battle-1', password: 'abc' }], truncated: false })

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init })

      if (url === ROUTE) return Promise.resolve(route())

      // Anything else is Showdown answering for a replay.
      return Promise.resolve(json(ladder))
    }),
  )

  table.rows.length = 0
  storage.uploads.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('asking our own Worker for the private list', () => {
  it('posts the name and password as JSON, with the access token', async () => {
    await useIngest().syncPrivate(NAME, PASSWORD)

    const call = routeCall()

    expect(call?.init?.method).toBe('POST')
    expect(new Headers(call?.init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(String(call?.init?.body))).toEqual({ name: NAME, password: PASSWORD })
  })

  it('never puts the password in the URL', async () => {
    await useIngest().syncPrivate(NAME, PASSWORD)

    for (const call of calls) expect(call.url).not.toContain(PASSWORD)
  })

  it('does not ask at all when nobody is signed in', async () => {
    session.value = null

    const outcome = await useIngest().syncPrivate(NAME, PASSWORD)

    expect(outcome).toMatchObject({ status: 'failed', reason: 'signed-out' })
    expect(routeCall()).toBeUndefined()
  })
})

describe('what comes back goes through the existing pipeline', () => {
  it('imports the refs the route listed, password and all', async () => {
    // `fetchReplay` builds `<id>-<password>pw.json` from the ref, which is
    // the whole reason the import side needed no change (§3.4).
    const outcome = await useIngest().syncPrivate(NAME, PASSWORD)

    expect(outcome.status).toBe('listed')
    expect(calls.some((call) => call.url.includes('battle-1-abcpw.json'))).toBe(true)
    expect(table.rows).toHaveLength(1)
  })

  it('reports progress the way an account sync does', async () => {
    const totals: number[] = []
    const results: unknown[] = []

    await useIngest().syncPrivate(NAME, PASSWORD, {
      onTotal: (total) => totals.push(total),
      onResult: (item) => results.push(item),
    })

    expect(totals).toEqual([1])
    expect(results).toHaveLength(1)
  })

  it('passes truncated on rather than swallowing it', async () => {
    route = () => json({ refs: [{ id: 'battle-1', password: 'abc' }], truncated: true })

    const outcome = await useIngest().syncPrivate(NAME, PASSWORD)

    expect(outcome).toMatchObject({ status: 'listed', truncated: true })
  })

  it('is a finished sync of nothing when the account has no private replays', async () => {
    route = () => json({ refs: [], truncated: false })

    const outcome = await useIngest().syncPrivate(NAME, PASSWORD)

    expect(outcome).toMatchObject({ status: 'listed' })
    expect(table.rows).toHaveLength(0)
  })
})

describe('when the route says no', () => {
  it('reads 401 as a session of ours that has gone', async () => {
    route = () => failing(401)

    expect(await useIngest().syncPrivate(NAME, PASSWORD)).toMatchObject({
      status: 'failed',
      reason: 'signed-out',
    })
  })

  it('reads 422 as Showdown rejecting the name and password', async () => {
    // The one status that must not be confused with 401: it is the Showdown
    // password that was wrong, not our session.
    route = () => failing(422)

    expect(await useIngest().syncPrivate(NAME, PASSWORD)).toMatchObject({
      status: 'failed',
      reason: 'rejected',
    })
  })

  it('does not blame the Showdown password for a request Showdown never saw', async () => {
    // 400 is the route refusing the body — an empty password, or a name that
    // normalises to nothing. Reading it as `rejected` would tell the reader
    // to re-check a password that was never sent anywhere.
    route = () => failing(400)

    expect(await useIngest().syncPrivate(NAME, PASSWORD)).toMatchObject({
      status: 'failed',
      reason: 'malformed',
    })
  })

  it('reads a gateway failure as Showdown being unreachable', async () => {
    route = () => failing(502)

    expect(await useIngest().syncPrivate(NAME, PASSWORD)).toMatchObject({
      status: 'failed',
      reason: 'unavailable',
    })
  })

  it('reads our own Supabase being down as unavailable too', async () => {
    route = () => failing(503)

    expect(await useIngest().syncPrivate(NAME, PASSWORD)).toMatchObject({
      status: 'failed',
      reason: 'unavailable',
    })
  })

  it('survives the route not being reachable at all', async () => {
    route = () => {
      throw new Error('the socket went away')
    }

    expect(await useIngest().syncPrivate(NAME, PASSWORD)).toMatchObject({
      status: 'failed',
      reason: 'unavailable',
    })
  })

  it('survives an answer that is not the list', async () => {
    route = () => json({ nope: true })

    expect(await useIngest().syncPrivate(NAME, PASSWORD)).toMatchObject({
      status: 'failed',
      reason: 'malformed',
    })
  })

  it('imports nothing when the listing failed', async () => {
    route = () => failing(422)

    await useIngest().syncPrivate(NAME, PASSWORD)

    expect(table.rows).toHaveLength(0)
  })
})
