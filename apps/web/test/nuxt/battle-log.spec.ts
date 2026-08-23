import { beforeEach, describe, expect, it, vi } from 'vitest'
import supabasePlugin from '../../app/plugins/supabase.client'
import { signIn, signOut } from '../helpers'
import ladder from '../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

// Only Supabase is faked, and only its Storage half: what is under test is the
// round trip from a stored object back to the log string `parseTimeline` reads,
// so the gzip really is gzip and the browser really unpacks it.
const { storage, createClient } = vi.hoisted(() => {
  const downloads: string[] = []
  const result = { data: null as Blob | null, error: null as unknown }

  return {
    storage: {
      downloads,
      result,
      from: vi.fn((_bucket: string) => ({
        download: (path: string) => {
          downloads.push(path)
          return Promise.resolve(result)
        },
      })),
    },
    createClient: vi.fn(),
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

createClient.mockImplementation(() => ({
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn(),
  },
  storage: { from: storage.from },
}))

/** Runs the plugin the way Nuxt would, so that $supabase is there to use. */
async function bootPlugin() {
  const nuxtApp = useNuxtApp()
  const result = (await (
    supabasePlugin as unknown as (app: typeof nuxtApp) => Promise<{
      provide: { supabase: unknown }
    }>
  )(nuxtApp)) as { provide: { supabase: unknown } }

  if (!nuxtApp.$supabase) nuxtApp.provide('supabase', result.provide.supabase)
}

/** A stored object, gzipped the way the import gzips one. */
async function stored(record: unknown): Promise<Blob> {
  const stream = new Response(JSON.stringify(record)).body!
  return await new Response(stream.pipeThrough(new CompressionStream('gzip'))).blob()
}

beforeEach(async () => {
  await bootPlugin()
  signIn()

  storage.downloads.length = 0
  storage.result.data = await stored(ladder)
  storage.result.error = null
  storage.from.mockClear()

  // The cache is session state, and one test's log must not answer the next
  // test's question.
  useBattleLogs().value = new Map()
})

describe('reading a stored raw log', () => {
  it('hands back the log the import stored, from under the signed-in user id', async () => {
    const log = await useBattleLog().loadLog(ladder.id)

    expect(storage.from).toHaveBeenCalledWith('replay-logs')
    // The bucket policy admits a path whose first segment is the owner's id
    // and no other, so the path is the isolation.
    expect(storage.downloads).toEqual([`test-user/${ladder.id}.json.gz`])
    expect(log).toBe(ladder.log)
  })

  it('reads the same game twice without asking Storage twice', async () => {
    const { loadLog } = useBattleLog()

    await loadLog(ladder.id)
    await loadLog(ladder.id)

    expect(storage.downloads).toHaveLength(1)
  })

  it('collapses two openings of one game that overlap into one download', async () => {
    const { loadLog } = useBattleLog()

    const [first, second] = await Promise.all([loadLog(ladder.id), loadLog(ladder.id)])

    expect(storage.downloads).toHaveLength(1)
    expect(first).toBe(second)
  })

  it('is loading while the download is in flight and not after it', async () => {
    const { loading, loadLog } = useBattleLog()

    expect(loading.value).toBe(false)

    const reading = loadLog(ladder.id)
    expect(loading.value).toBe(true)

    await reading
    expect(loading.value).toBe(false)
  })

  it('refuses to read a log with nobody signed in', async () => {
    signOut()

    await expect(useBattleLog().loadLog(ladder.id)).rejects.toThrow(/signed-in user/)
  })
})

describe('when the log cannot be read', () => {
  it('reports why Storage would not hand it over, and stops loading', async () => {
    storage.result.data = null
    storage.result.error = new Error('Object not found')

    const { loading, error, loadLog } = useBattleLog()
    const log = await loadLog(ladder.id)

    expect(log).toBeNull()
    // A drawer stuck on a spinner is the failure this guards against.
    expect(loading.value).toBe(false)
    expect(error.value).toMatchObject({ reason: 'download-failed' })
    expect(error.value?.message).toContain('Object not found')
  })

  it('reports an object that is not the replay it should be', async () => {
    storage.result.data = await stored({ id: ladder.id })

    const { error, loadLog } = useBattleLog()

    expect(await loadLog(ladder.id)).toBeNull()
    expect(error.value).toMatchObject({ reason: 'unreadable' })
  })

  it('reports an object that is not gzip at all', async () => {
    storage.result.data = new Blob(['not gzip'])

    const { error, loadLog } = useBattleLog()

    expect(await loadLog(ladder.id)).toBeNull()
    expect(error.value).toMatchObject({ reason: 'unreadable' })
  })

  it('remembers nothing about a failure, so opening the game again retries', async () => {
    storage.result.error = new Error('Object not found')
    storage.result.data = null

    const { error, loadLog } = useBattleLog()
    await loadLog(ladder.id)

    storage.result.error = null
    storage.result.data = await stored(ladder)

    expect(await loadLog(ladder.id)).toBe(ladder.log)
    expect(storage.downloads).toHaveLength(2)
    // Cleared on the next attempt, so a stale reason cannot sit under a log
    // that arrived.
    expect(error.value).toBeNull()
  })
})
