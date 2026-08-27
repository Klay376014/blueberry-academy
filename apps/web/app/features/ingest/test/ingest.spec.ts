import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import supabasePlugin from '../../../plugins/supabase.client'
import { signIn } from '../../../../test/helpers'
import ladder from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

// The two things outside the app are faked and nothing else is: Showdown
// answers through the global fetch that useShowdown really calls, Supabase
// through the client the real plugin really provides. Everything between them
// -- the fetch layer, the parser, the identity rules, the row that is written
// -- is the code that ships.
const { table, storage, createClient } = vi.hoisted(() => {
  const uploads: { path: string; body: Blob; options: unknown }[] = []
  const rows: Record<string, unknown>[] = []
  const uploadResult = { data: { path: '' }, error: null as unknown }
  const upsertResult = { data: null as Record<string, unknown> | null, error: null as unknown }

  const table = {
    rows,
    upsertResult,
    from: vi.fn((_name: string) => ({
      upsert: (values: Record<string, unknown>, _options: unknown) => {
        rows.push(values)
        return {
          select: (_columns?: string) => ({
            // The row is read back, so the screen shows what the database
            // stored rather than what the browser hoped it would.
            single: () =>
              Promise.resolve({ data: upsertResult.data ?? values, error: upsertResult.error }),
          }),
        }
      },
    })),
  }

  const storage = {
    uploads,
    uploadResult,
    from: vi.fn((_bucket: string) => ({
      upload: (path: string, body: Blob, options: unknown) => {
        uploads.push({ path, body, options })
        return Promise.resolve(uploadResult)
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

// The parser is the real one, reached through a spy: one test needs a parse to
// fail, and nothing in a valid fixture can be bent into failing without
// pretending a broken log is what broke.
const { parseReplayMock } = vi.hoisted(() => ({ parseReplayMock: vi.fn() }))

vi.mock('replay-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('replay-parser')>()

  return { ...actual, parseReplay: (...args: unknown[]) => parseReplayMock(...args) }
})

const actualParser = await vi.importActual<typeof import('replay-parser')>('replay-parser')

let fetchMock: ReturnType<typeof vi.fn>

/** What happened, in the order it happened. The order is the design. */
let sequence: string[]

function json(body: unknown) {
  return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) }
}

function notFound() {
  return { ok: false, status: 404, text: () => Promise.resolve('') }
}

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

/** The text that was uploaded, read back out of the gzip it was stored as. */
async function uncompress(body: Blob) {
  const stream = new Response(await body.arrayBuffer()).body!
  return await new Response(stream.pipeThrough(new DecompressionStream('gzip'))).text()
}

beforeEach(async () => {
  await bootPlugin()
  signIn()
  useShowdownAliases().value = ['DavoPro1214']

  sequence = []
  fetchMock = vi.fn(() => {
    sequence.push('fetch')
    return Promise.resolve(json(ladder))
  })
  vi.stubGlobal('fetch', fetchMock)

  parseReplayMock
    .mockReset()
    .mockImplementation((...args: Parameters<typeof actualParser.parseReplay>) => {
      sequence.push('parse')
      return actualParser.parseReplay(...args)
    })

  table.rows.length = 0
  table.upsertResult.data = null
  table.upsertResult.error = null
  table.from.mockClear()
  storage.uploads.length = 0
  storage.uploadResult.data = { path: '' }
  storage.uploadResult.error = null
  storage.from.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The one row the import wrote, whatever it wrote into it. */
function writtenRow() {
  expect(table.rows).toHaveLength(1)
  return table.rows[0]!
}

describe('importing one replay', () => {
  it('stores the raw log before it parses a line of it', async () => {
    // The fuse of the whole design: a parser that falls over has already left
    // the log behind, so the fix is a re-parse rather than another trip to
    // somebody else's free service.
    await useIngest().importReplay({ id: ladder.id })

    expect(sequence.indexOf('fetch')).toBeLessThan(sequence.indexOf('parse'))
    expect(storage.uploads).toHaveLength(1)
    expect(table.rows).toHaveLength(1)
  })

  it('stores the replay gzipped, under the signed-in user id', async () => {
    await useIngest().importReplay({ id: ladder.id })

    const upload = storage.uploads[0]!
    expect(storage.from).toHaveBeenCalledWith('replay-logs')
    // The bucket policy admits a path whose first segment is the owner's id
    // and no other, so the path is the isolation.
    expect(upload.path).toBe(`test-user/${ladder.id}.json.gz`)

    // The whole replay JSON, untouched: a re-parse needs the format id and the
    // upload time as much as it needs the log.
    expect(await uncompress(upload.body)).toBe(JSON.stringify(ladder))
  })

  it('writes what the parser found, from the point of view of the alias list', async () => {
    const outcome = await useIngest().importReplay({ id: ladder.id })

    expect(outcome.status).toBe('imported')
    expect(writtenRow()).toMatchObject({
      user_id: 'test-user',
      replay_id: 'gen9championsvgc2026regmb-2667169457',
      format_id: 'gen9championsvgc2026regmb',
      played_at: '2026-08-19T09:19:18.000Z',
      game_type: 'doubles',
      rated: true,
      my_side: 'p1',
      my_username: 'DavoPro1214',
      opponent_username: 'Bibas Rozkurwiator',
      result: 'loss',
      rating: 1429,
      rating_delta: -15,
      series_id: null,
      team_signature: 'garchomp|gholdengo|ninetalesalola|raichu|scrafty|toxapex',
      bring_signature: 'garchomp|ninetalesalola|scrafty|toxapex',
      bring_complete: true,
      turn_count: 15,
      log_path: `test-user/${ladder.id}.json.gz`,
      parser_version: actualParser.PARSER_VERSION,
      parse_error: null,
    })
  })

  it('reads the win from whichever side the alias is on', async () => {
    useShowdownAliases().value = ['bibasrozkurwiator']

    await useIngest().importReplay({ id: ladder.id })

    expect(writtenRow()).toMatchObject({
      my_side: 'p2',
      my_username: 'Bibas Rozkurwiator',
      opponent_username: 'DavoPro1214',
      result: 'win',
      rating: 1549,
      rating_delta: 15,
    })
  })

  it('keeps the opponent’s side in details, where the views that do not exist yet will find it', async () => {
    await useIngest().importReplay({ id: ladder.id })

    expect(writtenRow().details).toMatchObject({
      sides: {
        p2: { teamSignature: 'gholdengo|glimmora|incineroar|staraptor|whimsicott|zoroarkhisui' },
      },
    })
  })

  it('marks a battle neither of whose players is me as spectated', async () => {
    useShowdownAliases().value = ['SomeoneElse']

    const outcome = await useIngest().importReplay({ id: ladder.id })

    expect(outcome.status).toBe('imported')
    // Not a failure and not a win: it happened, it is stored, and it counts
    // towards nothing personal.
    expect(writtenRow()).toMatchObject({
      my_side: null,
      my_username: null,
      opponent_username: null,
      result: null,
      team_signature: null,
      bring_signature: null,
      bring_complete: false,
      rating: null,
      rating_delta: null,
    })
  })

  it('asks Showdown for a private replay with its password', async () => {
    await useIngest().importReplay({ id: ladder.id, password: 'b1cd2ef' })

    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `https://replay.pokemonshowdown.com/${ladder.id}-b1cd2efpw.json`,
    )
  })

  it('keeps the stored log and records why the parse failed', async () => {
    parseReplayMock.mockImplementation(() => {
      throw new Error('the log said something nobody has taught it yet')
    })

    const outcome = await useIngest().importReplay({ id: ladder.id })

    expect(outcome.status).toBe('unparsed')
    expect(storage.uploads).toHaveLength(1)

    // Enough of a row to find it again and re-parse it, and nothing derived
    // that would be a guess.
    expect(writtenRow()).toMatchObject({
      replay_id: ladder.id,
      format_id: ladder.formatid,
      played_at: '2026-08-19T09:19:18.000Z',
      log_path: `test-user/${ladder.id}.json.gz`,
      parse_error: 'the log said something nobody has taught it yet',
      my_side: null,
      result: null,
      bring_complete: false,
    })
  })

  it('reports a replay Showdown has never heard of, and writes nothing', async () => {
    fetchMock.mockResolvedValue(notFound())

    const outcome = await useIngest().importReplay({ id: 'gen9ou-1' })

    expect(outcome).toMatchObject({ status: 'failed', reason: 'not-found' })
    expect(storage.uploads).toHaveLength(0)
    expect(table.rows).toHaveLength(0)
  })

  it('writes no row when the log could not be stored', async () => {
    storage.uploadResult.error = new Error('the bucket said no')

    const outcome = await useIngest().importReplay({ id: ladder.id })

    // A row whose log_path points at nothing is worse than no row: it would
    // be skipped as already imported, and it could never be re-parsed.
    expect(outcome).toMatchObject({ status: 'failed', reason: 'store-failed' })
    expect(table.rows).toHaveLength(0)
  })

  it('reports a write the database refused', async () => {
    table.upsertResult.error = new Error('row level security said no')

    const outcome = await useIngest().importReplay({ id: ladder.id })

    expect(outcome).toMatchObject({ status: 'failed', reason: 'write-failed' })
  })
})
