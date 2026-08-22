import { beforeEach, describe, expect, it } from 'vitest'
import type { StatsRow } from '../../app/utils/battleStats'
import { FORMATS, SIGNATURES, STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'

/** One filter as it reached PostgREST: the method and what it was given. */
type Filter = [string, ...unknown[]]

/**
 * A PostgREST query builder that records instead of asking, and answers from
 * `db.rows`. Faked at the client, so the composable's own chain — the columns,
 * the filters, the paging — is the thing under test.
 */
const db = {
  rows: [] as StatsRow[],
  error: null as unknown,
  /** One entry per request, so paging is visible. */
  requests: [] as { filters: Filter[]; range: [number, number] }[],
}

function builder() {
  const filters: Filter[] = []

  const chain = {
    select: (...args: unknown[]) => (filters.push(['select', ...args]), chain),
    eq: (...args: unknown[]) => (filters.push(['eq', ...args]), chain),
    not: (...args: unknown[]) => (filters.push(['not', ...args]), chain),
    gte: (...args: unknown[]) => (filters.push(['gte', ...args]), chain),
    lte: (...args: unknown[]) => (filters.push(['lte', ...args]), chain),
    or: (...args: unknown[]) => (filters.push(['or', ...args]), chain),
    order: (...args: unknown[]) => (filters.push(['order', ...args]), chain),
    range: (from: number, to: number) => {
      db.requests.push({ filters, range: [from, to] })

      return Promise.resolve(
        db.error
          ? { data: null, error: db.error }
          : { data: db.rows.slice(from, to + 1), error: null },
      )
    },
  }

  return chain
}

/** The filters of the one request that was made. */
function onlyRequest() {
  expect(db.requests).toHaveLength(1)
  return db.requests[0]!.filters
}

function synthetic(count: number): StatsRow[] {
  return Array.from({ length: count }, (_, index) => ({
    replay_id: `bulk-${index}`,
    played_at: `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}Z`,
    format_id: FORMATS.LADDER,
    series_id: null,
    my_username: 'NotLittleStar',
    result: 'win' as const,
    rating: null,
    rating_delta: null,
    team_signature: SIGNATURES.TEAM_A,
    bring_signature: SIGNATURES.BRING_A1,
    bring_complete: true,
  }))
}

beforeEach(() => {
  const nuxtApp = useNuxtApp()
  if (!nuxtApp.$supabase) {
    nuxtApp.provide('supabase', { from: () => builder() })
  }

  signIn()

  db.rows = STATS_ROWS
  db.error = null
  db.requests = []

  useStatsFilters().value = defaultStatsFilters()
})

describe('reading the battles the dashboard stands on', () => {
  it('refuses to read without a signed-in user', async () => {
    const { load } = useStats()
    useCurrentUser().value = null

    await expect(load()).rejects.toThrow(/signed-in user/)
    expect(db.requests).toHaveLength(0)
  })

  it('excludes spectated battles, and not on request', async () => {
    // A battle where neither player is the user has no result to count. It is
    // not a filter the caller can turn back on.
    await useStats().load()

    expect(onlyRequest()).toContainEqual(['not', 'my_side', 'is', null])
  })

  it('asks for the columns it slices on and no jsonb', async () => {
    await useStats().load()

    const select = onlyRequest().find(([method]) => method === 'select')?.[1] as string

    expect(select).toContain('bring_complete')
    expect(select).not.toContain('details')
  })

  it('reads newest last, so a curve can be drawn straight off it', async () => {
    await useStats().load()

    expect(onlyRequest()).toContainEqual(['order', 'played_at', { ascending: true }])
  })

  it('pages until a short page says that was all of them', async () => {
    // PostgREST caps a response at a thousand rows on its own. A win rate over
    // the first thousand games of an account, shown as the whole of it, is
    // worse than an error.
    db.rows = synthetic(1001)

    const { battles, load } = useStats()
    await load()

    expect(db.requests.map((request) => request.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(battles.value).toHaveLength(1001)
  })

  it('clears the numbers when the read fails', async () => {
    db.error = new Error('nope')

    const { load, error, loaded, battles } = useStats()
    await load()

    // Numbers from the previous filter set, left standing under the new one,
    // would be read as an answer.
    expect(loaded.value).toBe(false)
    expect(battles.value).toEqual([])
    expect(error.value?.message).toBe('nope')
  })
})

describe('the global filters', () => {
  it('asks the database for the format and the dates', async () => {
    const { filters, load } = useStats()
    filters.value = {
      ...filters.value,
      formatId: FORMATS.EVENT,
      from: '2026-08-01',
      to: '2026-08-31',
    }

    await load()
    const applied = onlyRequest()

    expect(applied).toContainEqual(['eq', 'format_id', FORMATS.EVENT])
    expect(applied).toContainEqual(['gte', 'played_at', '2026-08-01'])
    // The day the user named, all of it — not its first instant.
    expect(applied).toContainEqual(['lte', 'played_at', '2026-08-31T23:59:59.999Z'])
  })

  it('separates ladder Bo1 from best-of series by the format suffix', async () => {
    const { filters, load } = useStats()

    filters.value = { ...filters.value, bestOf: 'bo3' }
    await load()
    expect(onlyRequest()).toContainEqual(['or', 'format_id.like.*bo2,format_id.like.*bo3'])

    db.requests = []
    filters.value = { ...filters.value, bestOf: 'bo1' }
    await load()
    const applied = onlyRequest()

    // ANDed, which is what "neither suffix" means. Bo2 is a series too.
    expect(applied).toContainEqual(['not', 'format_id', 'like', '%bo2'])
    expect(applied).toContainEqual(['not', 'format_id', 'like', '%bo3'])
  })

  it('matches a Showdown identity through toID, not by spelling', async () => {
    const { filters, load, battles } = useStats()
    await load()

    filters.value = { ...filters.value, identity: 'NotLittleStar' }

    const names = battles.value.map((row) => row.my_username)

    // notlittlestar is the same person; SomeAlt is not.
    expect(names).toContain('notlittlestar')
    expect(names).not.toContain('SomeAlt')
    // Settled on the fetched rows, so no second read.
    expect(db.requests).toHaveLength(1)
  })

  it('re-counts without re-reading when the aggregation is switched', async () => {
    const { filters, load, overall } = useStats()
    await load()

    expect(overall.value).toMatchObject({ games: 11, wins: 7 })

    filters.value = { ...filters.value, aggregate: 'series' }

    expect(overall.value).toMatchObject({ games: 8, wins: 5, ties: 1 })
    expect(db.requests).toHaveLength(1)
  })

  it('moves the bring floor without re-reading either', async () => {
    const { filters, load, teams } = useStats()
    await load()

    const bringsOf = () =>
      teams.value.find((entry) => entry.signature === SIGNATURES.TEAM_A)!.brings.length

    expect(bringsOf()).toBe(3)

    filters.value = { ...filters.value, includeIncompleteBrings: true }

    expect(bringsOf()).toBe(4)
    expect(db.requests).toHaveLength(1)
  })

  it('shares one set of filters between both sections', async () => {
    // Two sections, one filter bar: splitting them would make a user set the
    // same format and date range twice.
    const first = useStats()
    const second = useStats()

    await first.load()
    first.filters.value = { ...first.filters.value, aggregate: 'series' }

    expect(second.filters.value.aggregate).toBe('series')
    expect(second.overall.value).toEqual(first.overall.value)
    expect(second.battles.value).toHaveLength(first.battles.value.length)
  })
})
