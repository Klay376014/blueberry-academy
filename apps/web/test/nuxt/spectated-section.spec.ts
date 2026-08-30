import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { reactive } from 'vue'
import Home from '../../app/pages/index.vue'
import { fakeBattles } from '../fakes/battles'
import type { FakeBattles, StoredBattle } from '../fakes/battles'
import { STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'

/**
 * The home page's spectated section: the battles this account imported but
 * neither player of which is the reader.
 *
 * An app-level test rather than a feature's, because what it is about is where
 * the section sits: outside the dashboard, so the dashboard's "nothing here
 * yet" branch cannot swallow it, and beside the drawer it opens (#66).
 */

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

function fake(): FakeBattles {
  return battles.value as FakeBattles
}

/** A battle between two people, neither of whom is the reader. */
function watched(replayId: string, playedAt: string, winner: string | null = 'p1'): StoredBattle {
  return {
    replay_id: replayId,
    played_at: playedAt,
    format_id: 'gen9championsvgc2026regmb',
    series_id: null,
    my_side: null,
    my_username: null,
    opponent_username: null,
    result: null,
    rating: null,
    rating_delta: null,
    team_signature: null,
    bring_signature: null,
    bring_complete: false,
    turn_count: 17,
    details: {
      winner,
      sides: {
        p1: {
          username: 'Alice',
          bringSignature: 'pikachu|eevee',
          teamSignature: 'blastoise|eevee|pikachu',
        },
        p2: {
          username: 'Bob',
          bringSignature: 'snorlax|gengar',
          teamSignature: 'gengar|meowth|snorlax',
        },
      },
    },
  }
}

/** The stats fixture with the columns the recent list reads filled in. */
function played(row: StoredBattle): StoredBattle {
  return {
    my_side: 'p1',
    opponent_username: `opponent-${row.replay_id}`,
    turn_count: 12,
    details: { sides: { p1: { bringSignature: 'a|b' }, p2: { bringSignature: 'c|d' } } },
    ...row,
  }
}

const { route, push } = vi.hoisted(() => ({
  route: { value: null as unknown },
  push: vi.fn(),
}))

route.value = reactive({
  query: {} as Record<string, string>,
  params: {},
  path: '/',
  fullPath: '/',
})

mockNuxtImport('useRoute', () => () => route.value as never)

const hook = () => () => {}

mockNuxtImport(
  'useRouter',
  () => () =>
    ({
      push,
      replace: push,
      afterEach: hook,
      beforeEach: hook,
      beforeResolve: hook,
      onError: hook,
      resolve: (to: unknown) => to,
      getRoutes: () => [],
      get currentRoute() {
        return route
      },
    }) as never,
)

function goTo(query: Record<string, string>) {
  const current = route.value as { query: Record<string, string> }

  for (const key of Object.keys(current.query)) delete current.query[key]
  Object.assign(current.query, query)
}

push.mockImplementation((to: unknown) => {
  const asked = to as { query?: Record<string, string> } | undefined

  if (asked?.query) goTo(asked.query)

  return Promise.resolve()
})

let mounted: Awaited<ReturnType<typeof mountSuspended>> | null = null

async function mountHome() {
  mounted?.unmount()
  mounted = await mountSuspended(Home)
  await new Promise((resolve) => setTimeout(resolve, 0))

  return mounted
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

beforeEach(() => {
  const nuxtApp = useNuxtApp()

  if (!nuxtApp.$supabase) {
    nuxtApp.provide('supabase', {
      storage: { from: () => ({ download: async () => ({ data: null, error: new Error('no') }) }) },
    })
  }

  signIn()
  battles.value = fakeBattles([
    ...STATS_ROWS.map(played),
    watched('watched-1', '2026-08-20T10:00:00Z'),
  ])

  useStatsFilters().value = defaultStatsFilters()
  useState('stats-rows').value = null
  useState('recent-battle-extras').value = new Map()
  useState('spectated-rows').value = null
  useState('spectated-shown').value = null
  useState('spectated-error').value = null
  useState('spectated-reading').value = null
  useState('spectated-query').value = ''
  useState('drawer-battle').value = null
  useState('drawer-reading').value = null
  goTo({})
})

function section(page: Awaited<ReturnType<typeof mountSuspended>>) {
  return page.find('[data-testid="spectated"]')
}

function rows(page: Awaited<ReturnType<typeof mountSuspended>>) {
  return page.findAll('[data-testid="spectated-battle"]')
}

describe('the spectated section', () => {
  it('lists the battles the dashboard is not allowed to show', async () => {
    const page = await mountHome()

    expect(section(page).exists()).toBe(true)
    expect(rows(page)).toHaveLength(1)

    const first = rows(page)[0]!.text()
    expect(first).toContain('Alice')
    expect(first).toContain('Bob')
    expect(first).toContain(new Date('2026-08-20T10:00:00Z').toLocaleDateString())
    // Format and turn count, the way the recent list carries them.
    expect(first).toContain('BO1')
    expect(first).toContain('17')
  })

  it('draws each player’s registered six, marking who never appeared', async () => {
    // Nobody here is "me", so both sides are read the same way — and learning
    // how a strong player picks four is the reason to keep their battles.
    const page = await mountHome()

    const parties = rows(page)[0]!
      .findAll('span[role="img"]')
      .map((party: { attributes: (name: string) => string | undefined }) =>
        party.attributes('aria-label'),
      )

    expect(parties[0]).toContain('Blastoise (did not appear)')
    expect(parties[1]).toContain('Meowth (did not appear)')
  })

  it('draws both brings, and marks the side the log said won', async () => {
    const page = await mountHome()

    const parties = rows(page)[0]!
      .findAll('span[role="img"]')
      .map((party: { attributes: (name: string) => string | undefined }) =>
        party.attributes('aria-label'),
      )

    expect(parties).toHaveLength(2)
    expect(parties[0]).toContain('Pikachu')
    expect(parties[1]).toContain('Snorlax')

    const marked = rows(page)[0]!
      .findAll('span[role="img"], [data-testid="side-won"]')
      .map(
        (el: { attributes: (name: string) => string | undefined }) =>
          el.attributes('data-testid') ?? 'party',
      )

    expect(marked).toEqual(['party', 'side-won', 'party'])
  })

  it('says nothing about a winner the log never declared', async () => {
    fake().rows = [watched('watched-1', '2026-08-20T10:00:00Z', null)]

    const page = await mountHome()

    expect(rows(page)[0]!.find('[data-testid="side-won"]').exists()).toBe(false)
  })

  it('newest first', async () => {
    fake().rows = [
      watched('older', '2026-08-01T10:00:00Z'),
      watched('newer', '2026-08-30T10:00:00Z'),
    ]

    const page = await mountHome()

    expect(rows(page)).toHaveLength(2)
    expect(rows(page)[0]!.text()).toContain(new Date('2026-08-30T10:00:00Z').toLocaleDateString())
  })

  it('is still there for an account that has watched battles and played none', async () => {
    // The dashboard collapses to "nothing here yet" and takes its own sections
    // with it. This one is outside that branch, which is the whole point.
    fake().rows = [watched('watched-1', '2026-08-20T10:00:00Z')]

    const page = await mountHome()

    expect(page.text()).toContain('No battles match these filters yet.')
    expect(section(page).exists()).toBe(true)
    expect(rows(page)).toHaveLength(1)
  })

  it('takes up no room at all when there are none', async () => {
    fake().rows = STATS_ROWS.map(played)

    const page = await mountHome()

    expect(section(page).exists()).toBe(false)
  })

  it('says out loud that the filters above do not reach it', async () => {
    const page = await mountHome()

    expect(section(page).find('[data-testid="spectated-note"]').exists()).toBe(true)
  })

  it('does not move when a filter does', async () => {
    const page = await mountHome()
    const before = rows(page).length

    useStatsFilters().value = { ...useStatsFilters().value, from: '2026-01-01', to: '2026-01-02' }
    await new Promise((resolve) => setTimeout(resolve, 0))
    await page.vm.$nextTick()

    expect(rows(page)).toHaveLength(before)
  })

  it('opens the drawer on the battle that was clicked', async () => {
    const page = await mountHome()

    await rows(page)[0]!.trigger('click')

    expect(push).toHaveBeenCalledWith(expect.objectContaining({ query: { battle: 'watched-1' } }))
  })

  it('draws a screenful and hands over the rest on request', async () => {
    fake().rows = Array.from({ length: 23 }, (_, index) =>
      watched(`w${index}`, `2026-08-${String(index + 1).padStart(2, '0')}T10:00:00Z`),
    )

    const page = await mountHome()

    expect(rows(page)).toHaveLength(20)

    await page.find('[data-testid="spectated-more"]').trigger('click')

    expect(rows(page)).toHaveLength(23)
    expect(page.find('[data-testid="spectated-more"]').exists()).toBe(false)
  })

  it('offers nothing to load when one screenful is all of them', async () => {
    const page = await mountHome()

    expect(page.find('[data-testid="spectated-more"]').exists()).toBe(false)
  })
})

describe('searching the spectated section by player', () => {
  /** Two watched battles, one of them under a name worth searching for. */
  function twoWatched() {
    return [
      watched('watched-1', '2026-08-20T10:00:00Z'),
      {
        ...watched('watched-2', '2026-08-21T10:00:00Z'),
        details: {
          winner: 'p1',
          sides: {
            p1: { username: 'Blue Berry', bringSignature: 'pikachu|eevee' },
            p2: { username: 'Carol', bringSignature: 'snorlax|gengar' },
          },
        },
      },
    ]
  }

  async function search(page: Awaited<ReturnType<typeof mountSuspended>>, text: string) {
    await page.find('[data-testid="spectated-search"]').setValue(text)
    await page.vm.$nextTick()
  }

  it('narrows the list to the battles that player is in', async () => {
    fake().rows = twoWatched()
    const page = await mountHome()
    expect(rows(page)).toHaveLength(2)

    await search(page, 'blueberry')

    expect(rows(page)).toHaveLength(1)
    expect(rows(page)[0]!.text()).toContain('Blue Berry')
  })

  it('finds a name however it was spaced and capitalised', async () => {
    fake().rows = twoWatched()
    const page = await mountHome()

    await search(page, 'BLUE-berry')

    expect(rows(page)).toHaveLength(1)
  })

  it('finds a name by the middle of it', async () => {
    fake().rows = twoWatched()
    const page = await mountHome()

    await search(page, 'ue Ber')

    expect(rows(page)).toHaveLength(1)
  })

  it('says a search found nothing, in words that are not "you have watched none"', async () => {
    fake().rows = twoWatched()
    const page = await mountHome()

    await search(page, 'nobody')

    expect(rows(page)).toHaveLength(0)
    const empty = page.find('[data-testid="spectated-no-matches"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('nobody')
    // The box stays, or there is no way back from a search that found nothing.
    expect(page.find('[data-testid="spectated-search"]').exists()).toBe(true)
  })

  it('says so for a search no Showdown name could match, rather than ignoring it', async () => {
    // `toID` keeps `[a-z0-9]` only, so a search written in Chinese normalises
    // away. Showing the whole list would read as a box that does nothing.
    fake().rows = twoWatched()
    const page = await mountHome()

    await search(page, '小藍莓')

    expect(rows(page)).toHaveLength(0)
    expect(page.find('[data-testid="spectated-no-matches"]').text()).toContain('小藍莓')
  })

  it('draws no empty list frame over a search that found nothing', async () => {
    fake().rows = twoWatched()
    const page = await mountHome()

    expect(page.find('[data-testid="spectated-list"]').exists()).toBe(true)

    await search(page, 'nobody')

    expect(page.find('[data-testid="spectated-list"]').exists()).toBe(false)
  })

  it('gives them all back when the box is emptied', async () => {
    fake().rows = twoWatched()
    const page = await mountHome()

    await search(page, 'blueberry')
    await search(page, '')

    expect(rows(page)).toHaveLength(2)
  })

  it('keeps the search out of the address bar', async () => {
    // A link to one battle is worth sharing; half a name is not.
    fake().rows = twoWatched()
    const page = await mountHome()
    push.mockClear()

    await search(page, 'blueberry')

    expect(push).not.toHaveBeenCalled()
  })

  it('leaves the rest of the page alone', async () => {
    fake().rows = [...STATS_ROWS.map(played), ...twoWatched()]
    const page = await mountHome()
    const before = page.findAll('[data-testid="recent-battle"]').length
    expect(before).toBeGreaterThan(0)

    await search(page, 'blueberry')

    expect(page.findAll('[data-testid="recent-battle"]')).toHaveLength(before)
  })
})
