import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { reactive } from 'vue'
import Dashboard from '../../app/pages/index.vue'
import type { StatsRow } from '../../app/utils/battleStats'
import { FORMATS, STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'
import ladder from '../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

/**
 * The recent battles list and the battle drawer, over the real query layer and
 * the real timeline parser, with only Supabase faked.
 *
 * What is asserted is what a reader is shown and what the address bar says: the
 * drawer state lives in `?battle=`, so the link is shareable and the back
 * button closes it (design document §4, decision T1).
 */

type Filter = [string, ...unknown[]]

/** Everything the fake database answers with, per test. */
const db = {
  rows: [] as StatsRow[],
  /** `replay_id` → the columns only the list and the drawer ask for. */
  extras: new Map<string, Record<string, unknown>>(),
  requests: [] as Filter[][],
  missing: false,
}

const storage = {
  downloads: [] as string[],
  fail: false,
  /** The stored object, or null to answer with the real fixture. */
  object: null as Blob | null,
}

function extrasFor(replayId: string): Record<string, unknown> {
  return (
    db.extras.get(replayId) ?? {
      replay_id: replayId,
      opponent_username: `opponent-${replayId}`,
      turn_count: 12,
      my_side: 'p1',
      details: { sides: { p1: { bringSignature: 'a|b' }, p2: { bringSignature: 'c|d' } } },
    }
  )
}

/** The rows a query with these filters should answer with. */
function answer(filters: Filter[]): Record<string, unknown>[] {
  const value = (method: string, column: string) =>
    filters.find(([name, key]) => name === method && key === column)?.[2]

  const ids = value('in', 'replay_id') as string[] | undefined
  const replayId = value('eq', 'replay_id') as string | undefined
  const seriesId = value('eq', 'series_id') as string | undefined

  if (ids) return ids.map((id) => ({ ...findRow(id), ...extrasFor(id) }))

  if (replayId) {
    if (db.missing) return []
    return [{ ...findRow(replayId), ...extrasFor(replayId) }]
  }

  if (seriesId) {
    return db.rows
      .filter((row) => row.series_id === seriesId)
      .map((row) => ({ ...row, ...extrasFor(row.replay_id) }))
  }

  return db.rows.map((row) => ({ ...row }))
}

function findRow(replayId: string): Partial<StatsRow> {
  return db.rows.find((row) => row.replay_id === replayId) ?? { replay_id: replayId }
}

function builder() {
  const filters: Filter[] = []

  const resolve = () => {
    db.requests.push(filters)
    return { data: answer(filters), error: null }
  }

  const chain = {
    select: (...args: unknown[]) => (filters.push(['select', ...args]), chain),
    eq: (...args: unknown[]) => (filters.push(['eq', ...args]), chain),
    in: (...args: unknown[]) => (filters.push(['in', ...args]), chain),
    not: (...args: unknown[]) => (filters.push(['not', ...args]), chain),
    gte: (...args: unknown[]) => (filters.push(['gte', ...args]), chain),
    lte: (...args: unknown[]) => (filters.push(['lte', ...args]), chain),
    or: (...args: unknown[]) => (filters.push(['or', ...args]), chain),
    order: (...args: unknown[]) => (filters.push(['order', ...args]), chain),
    range: (from: number, to: number) => {
      const { data } = resolve()
      return Promise.resolve({ data: data.slice(from, to + 1), error: null })
    },
    maybeSingle: () => {
      const { data } = resolve()
      return Promise.resolve({ data: data[0] ?? null, error: null })
    },
    // The builder is awaited directly wherever there is no cap to apply.
    then: (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled),
  }

  return chain
}

/** The replay JSON, gzipped the way the importer stored it. */
async function storedLog(): Promise<Blob> {
  const stream = new Response(JSON.stringify(ladder)).body!
  return await new Response(stream.pipeThrough(new CompressionStream('gzip'))).blob()
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
/**
 * Enough router to be installed into: @nuxt/test-utils hooks `afterEach` and
 * the i18n module hooks `beforeResolve`, and both throw rather than degrade.
 * `push` is what the assertions read — the address bar is the state under test.
 */
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

/**
 * Where the address bar is. One route object whose query is moved rather than a
 * new object each time, because that is what Vue Router does — a composable
 * reads `useRoute()` once and watches the query on it.
 *
 * A navigation carrying a query moves it, which makes "open the drawer, then
 * close it" a real round trip; anything else pushed while mounting (i18n, the
 * test harness) leaves it alone.
 */
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

/**
 * The dashboard, and never two of them: every mounted copy watches the same
 * route and the same session state, so one left behind answers for the next
 * test and does its work twice.
 */
let mounted: Awaited<ReturnType<typeof mountSuspended>> | null = null

async function mountDashboard() {
  mounted?.unmount()
  mounted = await mountSuspended(Dashboard)

  return mounted
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Waits for something to be true rather than for a couple of ticks: unpacking
 * the stored log goes through `DecompressionStream`, which is real async work
 * and takes as many turns of the loop as it takes.
 */
async function waitFor(ready: () => boolean, what: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (ready()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error(`Gave up waiting for ${what}.`)
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

beforeEach(async () => {
  const nuxtApp = useNuxtApp()

  if (!nuxtApp.$supabase) {
    nuxtApp.provide('supabase', {
      from: () => builder(),
      storage: {
        from: () => ({
          download: async (path: string) => {
            storage.downloads.push(path)
            if (storage.fail) return { data: null, error: new Error('Object not found') }
            return { data: storage.object ?? (await storedLog()), error: null }
          },
        }),
      },
    })
  }

  signIn()
  db.rows = STATS_ROWS
  db.extras = new Map()
  db.requests = []
  db.missing = false
  storage.downloads = []
  storage.fail = false
  storage.object = null

  useStatsFilters().value = defaultStatsFilters()
  useState('stats-rows').value = null
  useState('battle-logs').value = new Map()
  // Session state, and each test is its own session.
  useState('drawer-battle').value = null
  useState('drawer-series').value = []
  useState('drawer-timeline').value = null
  useState('drawer-failure').value = null
  useState('recent-battle-extras').value = new Map()
  goTo({})
})

describe('the recent battles list', () => {
  it('lists the newest game first, with what it takes to recognise it', async () => {
    const page = await mountDashboard()
    await settle()

    const rows = page.findAll('[data-testid="recent-battle"]')
    expect(rows.length).toBeGreaterThan(1)

    // Newest first. The ladder games run from 2026-08-01 upwards, and the
    // required format filter has settled on the format most of them are in.
    const first = rows[0]!.text()
    // The reader's own calendar, the same way the trend chart's axis reads.
    expect(first).toContain(new Date('2026-08-06T10:00:00Z').toLocaleDateString())
    expect(first).toContain('opponent-ladder-6')
    expect(first).toMatch(/12/)
  })

  it('opens the drawer and says so in the address bar', async () => {
    const page = await mountDashboard()
    await settle()

    await page.findAll('[data-testid="recent-battle"]')[0]!.trigger('click')
    await settle()

    expect(push).toHaveBeenCalledWith(expect.objectContaining({ query: { battle: 'ladder-6' } }))
    expect(document.body.querySelector('[data-testid="battle-drawer"]')).not.toBeNull()
  })
})

describe('the drawer', () => {
  async function openDrawer(replayId = 'ladder-6') {
    goTo({ battle: replayId })
    const page = await mountDashboard()
    await waitFor(() => !useState('drawer-loading').value, `the drawer to settle on ${replayId}`)
    await settle()

    return page
  }

  function drawer() {
    // The last one in the document: an unmounted dashboard takes its own
    // portalled panel with it, but the exit animation can outlive the test.
    const element = [...document.body.querySelectorAll('[data-testid="battle-drawer"]')].at(-1)
    if (!element) throw new Error('The drawer is not open.')

    return element
  }

  it('is already open when the address arrives with a battle in it', async () => {
    await openDrawer()

    expect(drawer().textContent).toContain('opponent-ladder-6')
    expect(storage.downloads).toEqual(['test-user/ladder-6.json.gz'])
  })

  it('lays the game out one turn at a time', async () => {
    await openDrawer()

    const turns = drawer().querySelectorAll('[data-testid="timeline-turn"]')
    // The fixture is a 15-turn game, plus the lead.
    expect(turns).toHaveLength(16)
  })

  it('keeps the damage off the line that names the move', async () => {
    // The whole point of decision T4: `|-damage|` carries no attribution, so a
    // move and the health that changed after it are two rows in time order.
    await openDrawer()

    const rows = [...drawer().querySelectorAll('[data-testid="timeline-row"]')]
    const move = rows.find((row) => row.textContent?.includes('Knock Off'))

    expect(move).toBeDefined()
    expect(move?.querySelector('[data-testid="health-change"]')).toBeNull()
    expect(drawer().querySelector('[data-testid="health-change"]')).not.toBeNull()
  })

  it('shows what each Pokémon is carrying at the end of a turn', async () => {
    await openDrawer()

    // Scrafty is burnt from turn 2 onwards, and the chip is how that is read
    // off a timeline rather than accumulated in the reader's head.
    // `brn` as Showdown spells it — the uppercase on screen is styling, and
    // the identifier is what is in the markup.
    const bars = [...drawer().querySelectorAll('[data-testid="field-bar"]')]

    expect(bars.some((bar) => bar.textContent?.includes('brn'))).toBe(true)
  })

  it('holds the rest of a turn behind a switch', async () => {
    await openDrawer()

    const before = drawer().querySelectorAll('[data-testid="timeline-row"]').length
    // The drawer's content is portalled out of the page, so it is reached
    // through the document rather than through the wrapper.
    const toggles = [...drawer().querySelectorAll<HTMLElement>('[data-testid="turn-details"]')]
    expect(toggles.length).toBeGreaterThan(0)

    toggles[1]!.click()
    await settle()

    expect(drawer().querySelectorAll('[data-testid="timeline-row"]').length).toBeGreaterThan(before)
  })

  it('links back to the replay it came from', async () => {
    await openDrawer()

    const link = drawer().querySelector('[data-testid="replay-link"]')
    expect(link?.getAttribute('href')).toBe('https://replay.pokemonshowdown.com/ladder-6')
    expect(link?.getAttribute('target')).toBe('_blank')
  })

  it('offers the other games of a series, and no switcher without one', async () => {
    await openDrawer('series-1-g2')
    expect(drawer().querySelectorAll('[data-testid="series-game"]')).toHaveLength(3)

    await openDrawer('ladder-6')
    expect(drawer().querySelectorAll('[data-testid="series-game"]')).toHaveLength(0)
  })

  it('says the log could not be read rather than spinning for good', async () => {
    storage.fail = true
    await openDrawer()

    expect(drawer().querySelector('[data-testid="timeline-error"]')).not.toBeNull()
    expect(drawer().querySelector('[data-testid="timeline-loading"]')).toBeNull()
  })

  it('says so when the battle itself is not there', async () => {
    db.missing = true
    await openDrawer('never-imported')

    expect(drawer().querySelector('[data-testid="battle-missing"]')).not.toBeNull()
  })

  it('closes when the address loses the battle, which is what the back button does', async () => {
    // The whole reason the state is a query parameter: going back takes the
    // parameter off and the drawer follows, rather than leaving the dashboard.
    await openDrawer()

    goTo({})
    await settle()

    expect(document.body.querySelector('[data-testid="battle-drawer"]')).toBeNull()
  })

  it('closes by taking the battle back out of the address', async () => {
    await openDrawer()

    drawer().querySelector<HTMLElement>('[data-testid="drawer-close"]')!.click()
    await settle()

    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ query: {} }))
  })
})

describe('a Pokémon the icon table has never heard of', () => {
  it('draws the fallback icon and says the id it could not name', async () => {
    // A new Pokémon is a table regeneration away; until then the drawer has to
    // hold its shape rather than break over it.
    db.extras.set('ladder-6', {
      replay_id: 'ladder-6',
      opponent_username: 'Somebody',
      turn_count: 3,
      my_side: 'p1',
      details: {
        sides: { p1: { bringSignature: 'urshifu' }, p2: { bringSignature: 'notapokemon' } },
      },
    })

    goTo({})
    const page = await mountDashboard()
    await settle()

    const first = page.findAll('[data-testid="recent-battle"]')[0]!

    expect(first.html()).toContain('notapokemon')
    expect(first.findAll('span[role="img"]').length).toBeGreaterThan(0)
  })
})

describe('the format filter', () => {
  it('lists only the battles the chosen format admits', async () => {
    const page = await mountDashboard()
    await settle()

    const before = page.findAll('[data-testid="recent-battle"]').length
    useStatsFilters().value = { ...useStatsFilters().value, formatId: FORMATS.EVENT }
    await settle()

    // Annotated because `mountSuspended` hands back an untyped wrapper here.
    const after = page
      .findAll('[data-testid="recent-battle"]')
      .map((row: { text: () => string }) => row.text())

    expect(after.length).not.toBe(before)
    expect(after.every((text: string) => text.includes('BO3'))).toBe(true)
  })
})
