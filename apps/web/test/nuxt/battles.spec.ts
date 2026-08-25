import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BattleRow } from 'battle-row'
import { createBattles } from '../../app/lib/battles'

/**
 * The real module against a PostgREST chain that records instead of asking.
 *
 * This is the one place the query layer itself is asserted. Everything else in
 * the suite reaches `battles` through the in-memory adapter in
 * `test/fakes/battles.ts`, so the rules that are security-shaped — the
 * `user_id` scope, spectated battles staying out, a write being read back —
 * have to be pinned here or they are pinned nowhere.
 */

/** One call as it reached PostgREST: the method and what it was given. */
type Call = [string, ...unknown[]]

const db = {
  rows: [] as Record<string, unknown>[],
  error: null as unknown,
  /** One entry per request, so paging and chunking are visible. */
  requests: [] as Call[][],
}

const USER = 'test-user'

function valueOf(calls: Call[], method: string, column: string): unknown {
  return calls.find(([name, key]) => name === method && key === column)?.[2]
}

/** The rows a request with these calls should answer with. */
function answer(calls: Call[]): Record<string, unknown>[] {
  const upserted = calls.find(([name]) => name === 'upsert')
  if (upserted) return [upserted[1] as Record<string, unknown>]

  const ids = valueOf(calls, 'in', 'replay_id') as string[] | undefined
  const replayId = valueOf(calls, 'eq', 'replay_id') as string | undefined
  const seriesId = valueOf(calls, 'eq', 'series_id') as string | undefined
  const from = valueOf(calls, 'gte', 'played_at') as string | undefined
  const to = valueOf(calls, 'lte', 'played_at') as string | undefined
  const noSpectators = calls.some(([name, column]) => name === 'not' && column === 'my_side')

  return db.rows.filter((row) => {
    if (ids && !ids.includes(row.replay_id as string)) return false
    if (replayId && row.replay_id !== replayId) return false
    if (seriesId && row.series_id !== seriesId) return false
    if (from && (row.played_at as string) < from) return false
    if (to && (row.played_at as string) > to) return false
    if (noSpectators && row.my_side === null) return false

    return true
  })
}

function builder() {
  const calls: Call[] = []

  function settle() {
    db.requests.push(calls)

    return db.error ? { data: null, error: db.error } : { data: answer(calls), error: null }
  }

  const record =
    (name: string) =>
    (...args: unknown[]) => (calls.push([name, ...args]), chain)

  const chain = {
    select: record('select'),
    eq: record('eq'),
    not: record('not'),
    gte: record('gte'),
    lte: record('lte'),
    in: record('in'),
    order: record('order'),
    upsert: record('upsert'),
    range: (from: number, to: number) => {
      calls.push(['range', from, to])
      const { data, error } = settle()

      return Promise.resolve({ data: data?.slice(from, to + 1) ?? null, error })
    },
    single: () => {
      calls.push(['single'])
      const { data, error } = settle()

      return Promise.resolve({ data: data?.[0] ?? null, error })
    },
    // Awaited directly wherever there is no cap to apply.
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(settle()).then(onFulfilled),
  }

  return chain
}

const client = { from: () => builder() } as unknown as SupabaseClient

function battles() {
  return createBattles(client, USER)
}

/** The calls of the one request that was made. */
function onlyRequest(): Call[] {
  expect(db.requests).toHaveLength(1)

  return db.requests[0]!
}

function stored(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    replay_id: 'ladder-1',
    played_at: '2026-08-01T10:00:00Z',
    format_id: 'gen9championsvgc2026regmb',
    series_id: null,
    my_side: 'p1',
    my_username: 'NotLittleStar',
    opponent_username: 'Somebody',
    result: 'win',
    rating: 1500,
    rating_delta: 12,
    end_reason: null,
    turn_count: 11,
    team_signature: 'a|b|c|d|e|f',
    bring_signature: 'a|b|c|d',
    bring_complete: true,
    details: { sides: { p1: { bringSignature: 'a|b|c|d' }, p2: { bringSignature: 'w|x|y|z' } } },
    parse_error: null,
    ...overrides,
  }
}

function bulk(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) =>
    stored({ replay_id: `bulk-${index}`, played_at: `2026-01-01T00:00:00Z` }),
  )
}

beforeEach(() => {
  db.rows = [stored()]
  db.error = null
  db.requests = []
})

describe('every read is this user’s', () => {
  it('scopes the battles read to the bound user', async () => {
    await battles().battlesOf({ from: null, to: null })

    // Redundant under RLS, and what puts the (user_id, played_at) index to
    // work. Bound at construction, so no caller can leave it off.
    expect(onlyRequest()).toContainEqual(['eq', 'user_id', USER])
  })

  it('scopes every other read to it too', async () => {
    const scoped = battles()

    await scoped.battleById('ladder-1')
    await scoped.gamesOfSeries('series-1')
    await scoped.detailsOf(['ladder-1'])
    await scoped.knownReplayIds(['ladder-1'])

    expect(db.requests).toHaveLength(4)
    for (const calls of db.requests) expect(calls).toContainEqual(['eq', 'user_id', USER])
  })
})

describe('reading the battles the dashboard stands on', () => {
  it('excludes spectated battles, and not on request', async () => {
    // A battle where neither player is the user has no result to count, and it
    // is not a filter a caller can turn back on.
    await battles().battlesOf({ from: null, to: null })

    expect(onlyRequest()).toContainEqual(['not', 'my_side', 'is', null])
  })

  it('asks for the columns the stats layer slices on and no jsonb', async () => {
    await battles().battlesOf({ from: null, to: null })

    const select = onlyRequest().find(([name]) => name === 'select')?.[1] as string

    expect(select).toContain('bring_complete')
    expect(select).not.toContain('details')
  })

  it('reads newest last, so a curve can be drawn straight off it', async () => {
    await battles().battlesOf({ from: null, to: null })

    expect(onlyRequest()).toContainEqual(['order', 'played_at', { ascending: true }])
  })

  it('pages until a short page says that was all of them', async () => {
    // PostgREST caps a response at a thousand rows on its own. A win rate over
    // the first thousand games of an account, shown as the whole of it, is
    // worse than an error.
    db.rows = bulk(1001)

    const rows = await battles().battlesOf({ from: null, to: null })

    expect(db.requests.map((calls) => calls.find(([name]) => name === 'range')?.slice(1))).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(rows).toHaveLength(1001)
  })

  it('stops after one request when the first page is a short one', async () => {
    db.rows = bulk(999)

    await battles().battlesOf({ from: null, to: null })

    expect(db.requests).toHaveLength(1)
  })

  it('gives a bare date its whole day', async () => {
    await battles().battlesOf({ from: '2026-08-01', to: '2026-08-31' })

    const applied = onlyRequest()

    expect(applied).toContainEqual(['gte', 'played_at', '2026-08-01'])
    // The day the user named, all of it — not its first instant.
    expect(applied).toContainEqual(['lte', 'played_at', '2026-08-31T23:59:59.999Z'])
  })

  it('passes an instant through untouched', async () => {
    await battles().battlesOf({ from: null, to: '2026-08-31T09:00:00Z' })

    expect(onlyRequest()).toContainEqual(['lte', 'played_at', '2026-08-31T09:00:00Z'])
  })

  it('throws rather than answering with what arrived before the failure', async () => {
    db.error = new Error('nope')

    await expect(battles().battlesOf({ from: null, to: null })).rejects.toThrow('nope')
  })
})

describe('one battle, and its series', () => {
  it('answers with null when this user has no such row', async () => {
    db.rows = []

    await expect(battles().battleById('nobody')).resolves.toBeNull()
  })

  it('works out the opponent’s bring from which side is mine', async () => {
    const record = await battles().battleById('ladder-1')

    expect(record?.myBring).toBe('a|b|c|d')
    expect(record?.opponentBring).toBe('w|x|y|z')
  })

  it('has no opponent for a battle with no side of mine', async () => {
    db.rows = [stored({ my_side: null })]

    const record = await battles().battleById('ladder-1')

    expect(record?.opponentBring).toBeNull()
  })

  it('reads a series oldest first', async () => {
    db.rows = [
      stored({ replay_id: 'g2', series_id: 's1', played_at: '2026-08-01T11:00:00Z' }),
      stored({ replay_id: 'g1', series_id: 's1', played_at: '2026-08-01T10:00:00Z' }),
    ]

    await battles().gamesOfSeries('s1')

    expect(onlyRequest()).toContainEqual(['order', 'played_at', { ascending: true }])
  })
})

describe('the lookups PostgREST puts in a query string', () => {
  it('chunks the details lookup rather than trusting the caller’s list to be short', async () => {
    // The caller happens to ask about twenty rows today. That is not a bound.
    const ids = Array.from({ length: 450 }, (_, index) => `bulk-${index}`)
    db.rows = bulk(450)

    const found = await battles().detailsOf(ids)

    const chunks = db.requests.map(
      (calls) => (valueOf(calls, 'in', 'replay_id') as string[]).length,
    )

    expect(chunks).toEqual([200, 200, 50])
    // And every one of them is in the answer, not just the first chunk's.
    expect(found.size).toBe(450)
  })

  it('chunks the already-imported lookup the same way', async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `bulk-${index}`)
    db.rows = bulk(201)

    const known = await battles().knownReplayIds(ids)

    expect(db.requests).toHaveLength(2)
    expect(known.size).toBe(201)
  })

  it('asks nothing at all for an empty list', async () => {
    await battles().knownReplayIds([])

    expect(db.requests).toHaveLength(0)
  })

  it('leaves out the ids the database had no row for', async () => {
    const found = await battles().detailsOf(['ladder-1', 'never-imported'])

    expect([...found.keys()]).toEqual(['ladder-1'])
  })
})

describe('writing a battle', () => {
  const row = { user_id: USER, replay_id: 'ladder-1' } as unknown as BattleRow

  it('reads the row back, so a write RLS matched nothing cannot pass for an import', async () => {
    await battles().putBattle(row)

    const calls = onlyRequest()

    expect(calls).toContainEqual(['upsert', row, { onConflict: 'user_id,replay_id' }])
    expect(calls.map(([name]) => name)).toContain('select')
    expect(calls.map(([name]) => name)).toContain('single')
  })

  it('answers with the row the database kept', async () => {
    await expect(battles().putBattle(row)).resolves.toMatchObject({ replay_id: 'ladder-1' })
  })

  it('throws when the write is refused', async () => {
    db.error = new Error('refused')

    await expect(battles().putBattle(row)).rejects.toThrow('refused')
  })
})
