import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { fakeBattles } from '../../../../test/fakes/battles'
import { FORMATS, SIGNATURES, STATS_ROWS } from '../../../../test/fixtures/stats-rows'
import { signIn, signOut } from '../../../../test/helpers'

/**
 * What the dashboard's numbers do, over the in-memory `Battles` adapter.
 *
 * The query itself is not faked here and is not asserted here: the columns,
 * the paging, the `user_id` scope and the date boundary belong to
 * `battles.spec.ts`, which runs the real module. What is left is this
 * composable's own job — when a read happens, how many happen, and what the
 * numbers are once one has.
 */

/**
 * One fake for the file rather than one per test. `useStats` registers its
 * watchers once per session and they hold on to whatever `useBattles()`
 * answered with first; a fresh fake per test would leave them talking to the
 * previous one.
 */
const { fake } = vi.hoisted(() => ({ fake: { value: null as unknown } }))

fake.value = fakeBattles()

mockNuxtImport('useBattles', () => () => fake.value as never)

function battles() {
  return fake.value as ReturnType<typeof fakeBattles>
}

/** Long enough for a read the fake resolves immediately to have landed. */
async function settle() {
  for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(async () => {
  signIn()
  useState('stats-rows').value = null
  useState('stats-reading').value = null
  useState('stats-read-key').value = null
  useStatsFilters().value = defaultStatsFilters()

  // Whatever the previous test left in the air is that test's read, and it
  // has to land before the counters below are zeroed.
  await settle()

  battles().rows = STATS_ROWS
  battles().reads = []
  battles().error = null
})

describe('when the battles are read', () => {
  it('reads once, and answers the second asker with the first read', async () => {
    const { whenLoaded, loaded } = useStats()

    await Promise.all([whenLoaded(), whenLoaded()])

    expect(loaded.value).toBe(true)
    expect(battles().reads).toHaveLength(1)
  })

  it('asks for nothing more once they are in', async () => {
    const stats = useStats()

    await stats.whenLoaded()
    await stats.whenLoaded()

    expect(battles().reads).toHaveLength(1)
  })

  it('reads nothing at all with nobody signed in', async () => {
    signOut()

    // Not a throw: setup runs before the route middleware has bounced a
    // signed-out visitor off the page.
    await expect(useStats().whenLoaded()).resolves.toBeUndefined()
    expect(battles().reads).toHaveLength(0)

    signIn()
  })

  it('reads as soon as somebody signs in', async () => {
    signOut()

    const { whenLoaded, loaded } = useStats()
    await whenLoaded()
    expect(loaded.value).toBe(false)

    signIn()
    await settle()

    expect(loaded.value).toBe(true)
  })

  it('re-reads once, not once per caller, when a server-side filter moves', async () => {
    // Three callers: both pages and the recent battles list. A watcher each
    // would turn one date change into three requests.
    const first = useStats()
    useStats()
    useStats()

    await first.whenLoaded()
    battles().reads = []

    first.filters.value = { ...first.filters.value, from: '2026-08-02' }
    await settle()

    expect(battles().reads).toHaveLength(1)
  })

  it('reads again when something the module cannot see has changed', async () => {
    // What `/import` calls: three hundred battles have just been written and
    // nothing in here could have known.
    const { whenLoaded, refresh, battles: rows } = useStats()

    battles().rows = STATS_ROWS.slice(0, 2)
    await whenLoaded()
    const before = rows.value.length

    battles().rows = STATS_ROWS
    await refresh()

    expect(rows.value.length).toBeGreaterThan(before)
  })

  it('reads again for the next person when the rows are emptied under it', async () => {
    // What the Supabase plugin does on a user switch: the rows in memory are
    // the last person's, so they go. This has to answer by reading rather
    // than by showing the next person an empty dashboard.
    const stats = useStats()
    await stats.whenLoaded()
    expect(stats.loaded.value).toBe(true)

    useState('stats-rows').value = null
    useCurrentUser().value = { id: 'somebody-else' } as never
    await settle()

    expect(stats.loaded.value).toBe(true)
    expect(battles().reads.length).toBeGreaterThan(1)
  })

  it('does not let one account’s read land after that account has gone', async () => {
    const stats = useStats()
    await stats.whenLoaded()

    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    const answer = battles().battlesOf.bind(battles())
    battles().battlesOf = (range) => {
      battles().battlesOf = answer
      const asked = answer(range)

      return held.then(() => asked)
    }

    battles().rows = STATS_ROWS.slice(0, 2)
    const inFlight = stats.refresh()

    // Signed out while it was in the air, and the plugin has emptied what was
    // read for whoever asked.
    signOut()
    useState('stats-rows').value = null

    release()
    await inFlight

    expect(useState('stats-rows').value).toBeNull()

    signIn()
  })

  it('clears the numbers when the read fails', async () => {
    battles().error = new Error('nope')

    const { whenLoaded, error, loaded, battles: rows } = useStats()
    await whenLoaded()

    // Numbers from the previous filter set, left standing under the new one,
    // would be read as an answer.
    expect(loaded.value).toBe(false)
    expect(rows.value).toEqual([])
    expect(error.value?.message).toBe('nope')
  })

  it('tries again when the dates move after a read that failed', async () => {
    // Before: a failure left nothing loaded, and a page moving the dates was
    // the obvious way to ask again.
    battles().error = new Error('nope')

    const stats = useStats()
    await stats.whenLoaded()
    expect(stats.loaded.value).toBe(false)

    battles().error = null
    stats.filters.value = { ...stats.filters.value, from: '2026-08-02' }
    await settle()

    expect(stats.loaded.value).toBe(true)
  })

  it('shows the newer read when two are in the air at once', async () => {
    // An import's refresh over a filter change's read: whichever started last
    // is the answer, whatever order they settle in.
    const { whenLoaded, refresh, battles: rows } = useStats()
    await whenLoaded()

    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    // The next read answers with the rows it saw when it started, but only
    // once it is let go — so the older read is the one that settles last.
    const answer = battles().battlesOf.bind(battles())
    battles().battlesOf = (range) => {
      battles().battlesOf = answer
      const asked = answer(range)

      return held.then(() => asked)
    }

    battles().rows = STATS_ROWS.slice(0, 2)
    const older = refresh()

    battles().rows = STATS_ROWS
    await refresh()

    release()
    await older

    // Six ladder games under the chosen name, not the two the superseded read
    // was still holding.
    expect(rows.value).toHaveLength(6)
  })

  it('lets the next asker try again after a read that failed', async () => {
    battles().error = new Error('nope')

    const stats = useStats()
    await stats.whenLoaded()

    battles().error = null
    await stats.whenLoaded()

    expect(stats.loaded.value).toBe(true)
  })
})

describe('the global filters', () => {
  it('is the dates, and only the dates, that the server is asked for', async () => {
    const { filters, whenLoaded } = useStats()
    filters.value = { ...filters.value, from: '2026-08-01', to: '2026-08-31' }

    await whenLoaded()

    expect(battles().reads).toEqual([
      { method: 'battlesOf', argument: { from: '2026-08-01', to: '2026-08-31' } },
    ])
  })

  it('settles the format in the browser, so the picker can offer every format', async () => {
    // Asked of the database, one format would come back and the picker would
    // then be able to offer only the format already chosen.
    const { filters, whenLoaded, battles: rows, formatOptions } = useStats()
    await whenLoaded()

    // Most played first: the first entry is also the one a page opens on.
    expect(formatOptions.value).toEqual([FORMATS.LADDER, FORMATS.EVENT])

    filters.value = { ...filters.value, formatId: FORMATS.EVENT }

    expect(rows.value.every((row) => row.format_id === FORMATS.EVENT)).toBe(true)
    expect(formatOptions.value).toEqual([FORMATS.LADDER, FORMATS.EVENT])
    expect(battles().reads).toHaveLength(1)
  })

  it('offers each Showdown name once, in the spelling the replays carried', async () => {
    const { whenLoaded, identityOptions } = useStats()
    await whenLoaded()

    // notlittlestar is the same person as NotLittleStar, so it is not a
    // second option; SomeAlt is a different one.
    expect(identityOptions.value).toEqual(['NotLittleStar', 'SomeAlt'])
  })

  it('matches a Showdown identity through toID, not by spelling', async () => {
    const { filters, whenLoaded, battles: rows } = useStats()
    await whenLoaded()

    filters.value = { ...filters.value, identity: 'NotLittleStar' }

    const names = rows.value.map((row) => row.my_username)

    // notlittlestar is the same person; SomeAlt is not.
    expect(names).toContain('notlittlestar')
    expect(names).not.toContain('SomeAlt')
    // Settled on the fetched rows, so no second read.
    expect(battles().reads).toHaveLength(1)
  })

  it('re-counts without re-reading when the format changes the unit', async () => {
    const { filters, whenLoaded, overall, aggregate } = useStats()
    await whenLoaded()

    // The ladder format is Bo1, so it is counted per game.
    filters.value = { ...filters.value, formatId: FORMATS.LADDER }
    expect(aggregate.value).toBe('game')

    // The Bo3 event, which is where the series are: three games of one series
    // and two of another. Choosing it is what switches the unit — there is no
    // separate control, because the format already answers the question.
    filters.value = { ...filters.value, formatId: FORMATS.EVENT }

    // The 2-1 is one win; the series held in part is a tie.
    expect(aggregate.value).toBe('series')
    expect(overall.value).toMatchObject({ games: 2, wins: 1, ties: 1 })
    expect(battles().reads).toHaveLength(1)
  })

  it('moves the bring floor without re-reading either', async () => {
    const { filters, whenLoaded, teams } = useStats()
    await whenLoaded()

    // The ladder registration of team A, which is where the forfeit is.
    const bringsOf = () =>
      teams.value.find(
        (entry) => entry.signature === SIGNATURES.TEAM_A && entry.formatId === FORMATS.LADDER,
      )!.brings.length

    expect(bringsOf()).toBe(1)

    filters.value = { ...filters.value, includeIncompleteBrings: true }

    expect(bringsOf()).toBe(2)
    expect(battles().reads).toHaveLength(1)
  })

  it('shares one set of filters between both sections', async () => {
    // Two sections, one filter bar: splitting them would make a user set the
    // same format and date range twice.
    const first = useStats()
    const second = useStats()

    await first.whenLoaded()
    first.filters.value = { ...first.filters.value, formatId: FORMATS.EVENT }

    expect(second.filters.value.formatId).toBe(FORMATS.EVENT)
    expect(second.overall.value).toEqual(first.overall.value)
    expect(second.battles.value).toHaveLength(first.battles.value.length)
  })
})

describe('the format the address is pointing at', () => {
  it('adopts a format the battles actually hold', async () => {
    const { whenLoaded, filters, focusTeam } = useStats()
    await whenLoaded()

    focusTeam({ formatId: FORMATS.EVENT, signature: SIGNATURES.TEAM_A })

    expect(filters.value.formatId).toBe(FORMATS.EVENT)
  })

  it('leaves the chosen one alone when the address names a format with no games', async () => {
    // Writing it in regardless would draw an empty screen with nothing on it
    // to say why.
    const { whenLoaded, filters, focusTeam } = useStats()
    await whenLoaded()

    focusTeam({ formatId: 'gen9neverplayedthis', signature: SIGNATURES.TEAM_A })

    expect(filters.value.formatId).toBe(FORMATS.LADDER)
  })
})
