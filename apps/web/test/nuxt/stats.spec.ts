import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { fakeBattles } from '../fakes/battles'
import type { FakeBattles } from '../fakes/battles'
import { FORMATS, SIGNATURES, STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'

/**
 * What the dashboard's numbers do, over the in-memory `Battles` adapter.
 *
 * The query itself is not faked here and is not asserted here: the columns,
 * the paging, the `user_id` scope and the date boundary belong to
 * `battles.spec.ts`, which runs the real module. What is left is this
 * composable's own job — which filters cost a request and which are settled in
 * the browser, and what the numbers are when they are.
 */

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

function fake(): FakeBattles {
  return battles.value as FakeBattles
}

beforeEach(() => {
  battles.value = fakeBattles(STATS_ROWS)

  signIn()
  useStatsFilters().value = defaultStatsFilters()
  useState('stats-rows').value = null
})

describe('reading the battles the dashboard stands on', () => {
  it('refuses to read without a signed-in user', async () => {
    const { load } = useStats()
    useCurrentUser().value = null

    await expect(load()).rejects.toThrow(/signed-in user/)
    expect(fake().reads).toHaveLength(0)
  })

  it('clears the numbers when the read fails', async () => {
    fake().error = new Error('nope')

    const { load, error, loaded, battles: rows } = useStats()
    await load()

    // Numbers from the previous filter set, left standing under the new one,
    // would be read as an answer.
    expect(loaded.value).toBe(false)
    expect(rows.value).toEqual([])
    expect(error.value?.message).toBe('nope')
  })
})

describe('the global filters', () => {
  it('is the dates, and only the dates, that the server is asked for', async () => {
    const { filters, load } = useStats()
    filters.value = { ...filters.value, from: '2026-08-01', to: '2026-08-31' }

    await load()

    expect(fake().reads).toEqual([
      { method: 'battlesOf', argument: { from: '2026-08-01', to: '2026-08-31' } },
    ])
  })

  it('settles the format in the browser, so the picker can offer every format', async () => {
    // Asked of the database, one format would come back and the picker would
    // then be able to offer only the format already chosen.
    const { filters, load, battles: rows, formatOptions } = useStats()
    await load()

    // Most played first: the first entry is also the one a page opens on.
    expect(formatOptions.value).toEqual([FORMATS.LADDER, FORMATS.EVENT])

    filters.value = { ...filters.value, formatId: FORMATS.EVENT }

    expect(rows.value.every((row) => row.format_id === FORMATS.EVENT)).toBe(true)
    expect(formatOptions.value).toEqual([FORMATS.LADDER, FORMATS.EVENT])
    expect(fake().reads).toHaveLength(1)
  })

  it('offers each Showdown name once, in the spelling the replays carried', async () => {
    const { load, identityOptions } = useStats()
    await load()

    // notlittlestar is the same person as NotLittleStar, so it is not a
    // second option; SomeAlt is a different one.
    expect(identityOptions.value).toEqual(['NotLittleStar', 'SomeAlt'])
  })

  it('matches a Showdown identity through toID, not by spelling', async () => {
    const { filters, load, battles: rows } = useStats()
    await load()

    filters.value = { ...filters.value, identity: 'NotLittleStar' }

    const names = rows.value.map((row) => row.my_username)

    // notlittlestar is the same person; SomeAlt is not.
    expect(names).toContain('notlittlestar')
    expect(names).not.toContain('SomeAlt')
    // Settled on the fetched rows, so no second read.
    expect(fake().reads).toHaveLength(1)
  })

  it('re-counts without re-reading when the aggregation is switched', async () => {
    const { filters, load, overall } = useStats()
    await load()

    // The Bo3 event, which is where the series are: three games of one series
    // and two of another.
    filters.value = { ...filters.value, formatId: FORMATS.EVENT }
    expect(overall.value).toMatchObject({ games: 5, wins: 3, losses: 2 })

    filters.value = { ...filters.value, aggregate: 'series' }

    // The 2-1 is one win; the series held in part is a tie.
    expect(overall.value).toMatchObject({ games: 2, wins: 1, ties: 1 })
    expect(fake().reads).toHaveLength(1)
  })

  it('moves the bring floor without re-reading either', async () => {
    const { filters, load, teams } = useStats()
    await load()

    // The ladder registration of team A, which is where the forfeit is.
    const bringsOf = () =>
      teams.value.find(
        (entry) => entry.signature === SIGNATURES.TEAM_A && entry.formatId === FORMATS.LADDER,
      )!.brings.length

    expect(bringsOf()).toBe(1)

    filters.value = { ...filters.value, includeIncompleteBrings: true }

    expect(bringsOf()).toBe(2)
    expect(fake().reads).toHaveLength(1)
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
