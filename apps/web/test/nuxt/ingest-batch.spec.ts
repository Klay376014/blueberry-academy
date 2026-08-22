import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import supabasePlugin from '../../app/plugins/supabase.client'
import { signIn } from '../helpers'
import ladder from '../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

// Same shape as ingest.spec.ts: Showdown answers through the global fetch the
// real fetch layer calls, Supabase through the client the real plugin
// provides. What is asserted here is what a batch does that a single import
// does not -- skipping, reporting, and never failing as a whole.
const { table, storage, createClient } = vi.hoisted(() => {
  const uploads: string[] = []
  const rows: Record<string, unknown>[] = []
  /** The replay ids the database is pretending to hold already. */
  const known = new Set<string>()
  /** Every `.in('replay_id', [...])` this batch asked, in order. */
  const lookups: string[][] = []

  const table = {
    rows,
    known,
    lookups,
    from: vi.fn((_name: string) => ({
      upsert: (values: Record<string, unknown>, _options: unknown) => {
        rows.push(values)
        return {
          select: (_columns?: string) => ({
            single: () => Promise.resolve({ data: values, error: null }),
          }),
        }
      },
      select: (_columns: string) => ({
        eq: (_column: string, _value: unknown) => ({
          in: (_target: string, ids: string[]) => {
            lookups.push(ids)
            return Promise.resolve({
              data: ids.filter((id) => known.has(id)).map((id) => ({ replay_id: id })),
              error: null,
            })
          },
        }),
      }),
    })),
  }

  const storage = {
    uploads,
    from: vi.fn((_bucket: string) => ({
      upload: (path: string, _body: Blob, _options: unknown) => {
        uploads.push(path)
        return Promise.resolve({ data: { path }, error: null })
      },
    })),
  }

  return {
    table,
    storage,
    createClient: vi.fn(() => ({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn(),
      },
      from: table.from,
      storage: { from: storage.from },
    })),
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

let fetchMock: ReturnType<typeof vi.fn>

/** The replay ids Showdown was actually asked for. */
function fetched() {
  return fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => !url.includes('search.json'))
    .map((url) => url.split('/').at(-1)!.replace('.json', ''))
}

function json(body: unknown) {
  return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) }
}

function notFound() {
  return { ok: false, status: 404, text: () => Promise.resolve('') }
}

/** The fixture replay, re-labelled so a batch can hold more than one. */
function replayNamed(id: string) {
  return { ...ladder, id }
}

/** Answers a replay request from `id`, and a search with `rows`. */
function showdownServing(replays: Record<string, unknown>, rows: unknown[] = []) {
  return vi.fn((url: string) => {
    if (String(url).includes('search.json')) return Promise.resolve(json(rows))

    const id = String(url).split('/').at(-1)!.replace('.json', '')
    const replay = replays[id]

    return Promise.resolve(replay ? json(replay) : notFound())
  })
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

const THREE = ['gen9ou-1', 'gen9ou-2', 'gen9ou-3']

/** Three importable replays, keyed by id. */
function threeReplays() {
  return Object.fromEntries(THREE.map((id) => [id, replayNamed(id)]))
}

beforeEach(async () => {
  await bootPlugin()
  signIn()
  useShowdownAliases().value = ['DavoPro1214']

  fetchMock = showdownServing(threeReplays())
  vi.stubGlobal('fetch', fetchMock)

  table.rows.length = 0
  table.known.clear()
  table.lookups.length = 0
  table.from.mockClear()
  storage.uploads.length = 0
  storage.from.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('importing a batch', () => {
  it('imports every replay it was given and counts what happened', async () => {
    const report = await useIngest().importMany(THREE.map((id) => ({ id })))

    expect(report.counts).toEqual({ imported: 3, unparsed: 0, skipped: 0, failed: 0 })
    expect(report.items.map((item) => item.ref.id)).toEqual(THREE)
    expect(table.rows).toHaveLength(3)
  })

  it('skips what the database already holds, without asking Showdown for it', async () => {
    table.known.add('gen9ou-2')

    const report = await useIngest().importMany(THREE.map((id) => ({ id })))

    // The point of the filter is the request that is never made: a full
    // account is thousands of replays on somebody else's free service.
    expect(fetched()).toEqual(['gen9ou-1', 'gen9ou-3'])
    expect(report.counts).toMatchObject({ imported: 2, skipped: 1 })
    expect(report.items[1]).toMatchObject({
      ref: { id: 'gen9ou-2' },
      outcome: { status: 'skipped' },
    })
  })

  it('resumes by skipping everything, when everything is already in', async () => {
    for (const id of THREE) table.known.add(id)

    const report = await useIngest().importMany(THREE.map((id) => ({ id })))

    // Pressing sync again after a stopped import costs one lookup and nothing
    // else. That is the whole resume mechanism -- there is no cursor.
    expect(fetched()).toEqual([])
    expect(table.rows).toHaveLength(0)
    expect(report.counts).toMatchObject({ skipped: 3, imported: 0 })
  })

  it('asks the database once rather than once per replay', async () => {
    await useIngest().importMany(THREE.map((id) => ({ id })))

    expect(table.lookups).toEqual([THREE])
  })

  it('carries on past a replay Showdown has never heard of', async () => {
    fetchMock = showdownServing({
      'gen9ou-1': replayNamed('gen9ou-1'),
      'gen9ou-3': replayNamed('gen9ou-3'),
    })
    vi.stubGlobal('fetch', fetchMock)

    const report = await useIngest().importMany(THREE.map((id) => ({ id })))

    // A batch never fails as a batch: the 404 is one row of the report, and
    // the other two are in.
    expect(report.counts).toMatchObject({ imported: 2, failed: 1 })
    expect(report.items[1]!.outcome).toMatchObject({ status: 'failed', reason: 'not-found' })
    expect(table.rows).toHaveLength(2)
  })

  it('imports a replay named twice only once', async () => {
    const report = await useIngest().importMany([{ id: 'gen9ou-1' }, { id: 'gen9ou-1' }])

    // A pasted list is typed by a human, and the unique key would refuse the
    // second one anyway -- better not to fetch it.
    expect(fetched()).toEqual(['gen9ou-1'])
    expect(report.items).toHaveLength(1)
  })

  it('reports each replay the moment it is done, rather than only at the end', async () => {
    const seen: string[] = []

    await useIngest().importMany(
      THREE.map((id) => ({ id })),
      {
        onResult: (item) => seen.push(item.ref.id),
      },
    )

    expect(seen.sort()).toEqual(THREE)
  })
})

describe('syncing a Showdown account', () => {
  it('imports every replay the account has', async () => {
    const rows = THREE.map((id) => ({ id, players: ['DavoPro1214', 'Someone'], format: 'x' }))
    fetchMock = showdownServing(threeReplays(), rows)
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await useIngest().syncAccount('DavoPro1214')

    expect(outcome).toMatchObject({ status: 'listed', truncated: false })
    expect(outcome.status === 'listed' && outcome.report.counts.imported).toBe(3)
  })

  it('says when Showdown ran out of pages before the account ran out of replays', async () => {
    // 100 pages of 51 is where a single search stops; the user has more
    // history than this sync could see, and silence would be a lie.
    fetchMock = vi.fn(() =>
      Promise.resolve(json(Array.from({ length: 51 }, (_, index) => ({ id: `gen9ou-${index}` })))),
    )
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await useIngest().syncAccount('DavoPro1214')

    expect(outcome).toMatchObject({ status: 'listed', truncated: true })
  })

  it('reports a listing that never came back, without pretending the account is empty', async () => {
    fetchMock = vi.fn(() => Promise.resolve(notFound()))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await useIngest().syncAccount('DavoPro1214')

    expect(outcome).toMatchObject({ status: 'failed', reason: 'not-found' })
  })

  it('takes the replays in the order Showdown listed them', async () => {
    fetchMock = showdownServing(
      threeReplays(),
      THREE.map((id) => ({ id })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await useIngest().syncAccount('DavoPro1214')

    expect(outcome.status === 'listed' && outcome.report.items.map((item) => item.ref.id)).toEqual(
      THREE,
    )
  })
})
