import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { fakeBattles } from '../../../../test/fakes/battles'
import { FORMATS, STATS_ROWS } from '../../../../test/fixtures/stats-rows'
import { signIn, signOut } from '../../../../test/helpers'

/**
 * The extra columns the recent list fetches for the rows it is about to show.
 *
 * The stats read leaves `details` out on purpose — it is per-row JSON and a
 * heavy account is thousands of rows — so the list asks for it by id, once,
 * and keeps what comes back for the session.
 */

const { fake } = vi.hoisted(() => ({ fake: { value: null as unknown } }))

fake.value = fakeBattles()

mockNuxtImport('useBattles', () => () => fake.value as never)

function battles() {
  return fake.value as ReturnType<typeof fakeBattles>
}

async function settle() {
  for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** The fixture rows with the columns only this list reads filled in. */
const WITH_DETAILS = STATS_ROWS.map((row) => ({
  ...row,
  my_side: 'p1' as const,
  opponent_username: `opponent-${row.replay_id}`,
  turn_count: 12,
  details: { sides: { p1: { bringSignature: 'a|b' }, p2: { bringSignature: 'c|d' } } },
}))

beforeEach(async () => {
  signIn()
  useState('stats-rows').value = null
  useState('stats-reading').value = null
  useState('stats-read-key').value = null
  useState('recent-battle-extras').value = new Map()
  useState('recent-battles-error').value = null
  useStatsFilters().value = defaultStatsFilters()

  await settle()

  battles().rows = WITH_DETAILS
  battles().reads = []
  battles().error = null
})

describe('the columns the stats read leaves out', () => {
  it('asks for them once, and for the rows on screen', async () => {
    const stats = useStats()
    await stats.whenLoaded()

    const list = useRecentBattles()
    await list.hydrate()

    const asked = battles().reads.filter((read) => read.method === 'detailsOf')
    expect(asked).toHaveLength(1)
    // The ladder games under the chosen name, and nothing else in the table.
    expect(asked[0]!.argument).toEqual(stats.battles.value.map((row) => row.replay_id).toReversed())
    expect(list.recent.value[0]?.opponentUsername).toBe('opponent-ladder-6')
  })

  it('does not ask again for a row it already has', async () => {
    const stats = useStats()
    await stats.whenLoaded()

    const list = useRecentBattles()
    await list.hydrate()
    battles().reads = []

    await list.hydrate()

    expect(battles().reads).toHaveLength(0)
  })

  it('says so rather than leaving the list looking finished', async () => {
    const stats = useStats()
    await stats.whenLoaded()

    battles().error = new Error('nope')
    const list = useRecentBattles()
    await list.hydrate()

    expect(list.error.value?.message).toBe('nope')
    expect(list.loading.value).toBe(false)
  })

  it('asks for nothing with nobody signed in', async () => {
    const stats = useStats()
    await stats.whenLoaded()

    signOut()
    await useRecentBattles().hydrate()

    expect(battles().reads.filter((read) => read.method === 'detailsOf')).toHaveLength(0)

    signIn()
  })

  it('does not fill in the next account’s list with what it fetched for the last', async () => {
    const stats = useStats()
    stats.filters.value = { ...stats.filters.value, formatId: FORMATS.LADDER }
    await stats.whenLoaded()

    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    const answer = battles().detailsOf.bind(battles())
    battles().detailsOf = (ids) => {
      battles().detailsOf = answer
      const asked = answer(ids)

      return held.then(() => asked)
    }

    const list = useRecentBattles()
    const inFlight = list.hydrate()

    // Somebody else signs in, and the plugin empties the map this would have
    // gone back into.
    signOut()
    useState('recent-battle-extras').value = new Map()

    release()
    await inFlight

    expect(useState<Map<string, unknown>>('recent-battle-extras').value.size).toBe(0)

    signIn()
  })

  it('does not put the last account’s failure on the next account’s screen', async () => {
    const stats = useStats()
    await stats.whenLoaded()

    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    battles().detailsOf = () => held.then(() => Promise.reject(new Error('nope')))

    const list = useRecentBattles()
    const inFlight = list.hydrate()

    signOut()

    release()
    await inFlight

    expect(list.error.value).toBeNull()

    signIn()
  })
})
