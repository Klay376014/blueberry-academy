import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { reactive } from 'vue'
import Dashboard from '../../app/pages/index.vue'
import { fakeBattles } from '../fakes/battles'
import type { FakeBattles, StoredBattle } from '../fakes/battles'
import { FORMATS, STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'
import ladder from '../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

/**
 * The recent battles list and the battle drawer, over the in-memory `Battles`
 * adapter and the real timeline parser, with Storage faked.
 *
 * An app-level test rather than a feature's: the list is `features/stats`, the
 * drawer is `features/timeline`, and `pages/index.vue` is where the two meet
 * (issue #61).
 *
 * What is asserted is what a reader is shown and what the address bar says: the
 * drawer state lives in `?battle=`, so the link is shareable and the back
 * button closes it (design document §4, decision T1).
 */

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

function fake(): FakeBattles {
  return battles.value as FakeBattles
}

/**
 * The columns the stats read leaves out, which the list and the drawer are the
 * only readers of. Recognisable per row, so "this is game 3's header" is
 * something a test can read off the screen.
 */
function withExtras(row: StoredBattle): StoredBattle {
  return {
    my_side: 'p1',
    opponent_username: `opponent-${row.replay_id}`,
    turn_count: 12,
    details: {
      sides: {
        // The row's own columns, so `details` and the attribution agree the way
        // a real row's do — the drawer reads my bring off the column and my six
        // off `details`, and a fixture that disagreed with itself would draw a
        // side of ten.
        p1: { bringSignature: row.bring_signature, teamSignature: row.team_signature },
        // Theirs is only ever in `details`: four registered, two seen.
        p2: { bringSignature: 'c|d', teamSignature: 'c|d|w|x' },
      },
    },
    ...row,
  }
}

/** Rewrites one stored row, for the tests about what a single battle shows. */
function amend(replayId: string, overrides: Partial<StoredBattle>) {
  fake().rows = fake().rows.map((row) =>
    row.replay_id === replayId ? { ...row, ...overrides } : row,
  )
}

/** A two-turn doubles log, for telling one game's timeline from another's. */
const shortLog = [
  '|gametype|doubles',
  '|player|p1|Alice|benga|1444',
  '|player|p2|Bob|gentleman|1534',
  '|start',
  '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
  '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
  '|turn|1',
  '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
  '|-damage|p2a: Whimsicott|41/100',
].join('\n')

/** A game that ended at team preview: leads, and no `|turn|` line at all. */
const leadOnlyLog = [
  '|gametype|doubles',
  '|player|p1|Alice|benga|1444',
  '|player|p2|Bob|gentleman|1534',
  '|start',
  '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
  '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
].join('\n')

/** A Pokémon returning to the field poisoned, which only the HP field says. */
const switchWithStatusLog = [
  '|gametype|doubles',
  '|player|p1|Alice|benga|1444',
  '|player|p2|Bob|gentleman|1534',
  '|start',
  '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
  '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
  '|turn|1',
  '|switch|p1a: Toxapex|Toxapex, L50, M|97/100 tox',
].join('\n')

const storage = {
  downloads: [] as string[],
  fail: false,
  /** The stored object, or null to answer with the real fixture. */
  object: null as Blob | null,
  /** Per path, for the tests that need two games to answer differently. */
  objects: new Map<string, Blob>(),
  /** Paths whose download waits until `release` is called. */
  held: new Map<string, () => void>(),
}

/** The replay JSON, gzipped the way the importer stored it. */
async function storedLog(replay: unknown = ladder): Promise<Blob> {
  const stream = new Response(JSON.stringify(replay)).body!
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

/** The battle the drawer has actually settled on. */
function openedBattle(): { replayId: string } | null {
  return useState<{ replayId: string } | null>('drawer-battle').value ?? null
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
      storage: {
        from: () => ({
          download: async (path: string) => {
            storage.downloads.push(path)
            if (storage.fail) return { data: null, error: new Error('Object not found') }

            if (storage.held.has(path)) {
              await new Promise<void>((resolve) => storage.held.set(path, resolve))
            }

            const object = storage.objects.get(path) ?? storage.object ?? (await storedLog())

            return { data: object, error: null }
          },
        }),
      },
    })
  }

  signIn()
  battles.value = fakeBattles(STATS_ROWS.map(withExtras))
  storage.downloads = []
  storage.fail = false
  storage.object = null
  storage.objects = new Map()
  storage.held = new Map()

  useStatsFilters().value = defaultStatsFilters()
  useState('stats-rows').value = null
  useState('battle-logs').value = new Map()
  // Session state, and each test is its own session.
  useState('drawer-battle').value = null
  useState('drawer-series').value = []
  useState('drawer-timeline').value = null
  useState('drawer-failure').value = null
  // A test that ends mid-read leaves the battle it was reading behind, and the
  // next read of the same battle would be taken for that one asking twice.
  useState('drawer-reading').value = null
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

  it('shows what each Pokémon is carrying as the turn begins', async () => {
    await openDrawer()

    // Scrafty is burnt from turn 2 onwards, and the chip is how that is read
    // off a timeline rather than accumulated in the reader's head.
    // `brn` as Showdown spells it — the uppercase on screen is styling, and
    // the identifier is what is in the markup.
    const bars = [...drawer().querySelectorAll('[data-testid="field-bar"]')]

    expect(bars.some((bar) => bar.textContent?.includes('brn'))).toBe(true)
  })

  it('draws the field a turn began on, not the field it left behind', async () => {
    await openDrawer()

    // The log burns Scrafty during turn 2, so turn 2 is read on a field that
    // has no burn on it yet and turn 3 is the first one that opens with one.
    // Backwards, and the reader is told the outcome before the move that
    // caused it (#92).
    const turns = [...drawer().querySelectorAll('[data-testid="timeline-turn"]')]
    const carries = (turn: number) =>
      turns[turn]?.querySelector('[data-testid="field-bar"]')?.textContent?.includes('brn')

    expect(carries(2)).toBe(false)
    expect(carries(3)).toBe(true)
  })

  it('says which turn the field it draws is the opening of', async () => {
    await openDrawer()

    const bar = drawer().querySelector('[data-testid="field-bar"]')

    expect(bar?.textContent).toContain('Entering this turn')
  })

  it('draws no field on the lead, which has no turn before it to open on', async () => {
    await openDrawer()

    const turns = [...drawer().querySelectorAll('[data-testid="timeline-turn"]')]

    expect(turns[0]?.querySelector('[data-testid="field-bar"]')).toBeNull()
    // One per turn, less the lead: the 15-turn fixture, plus the lead, is 16.
    // The one at the foot of the timeline is the game's own and not a turn's.
    expect(
      drawer().querySelectorAll('[data-testid="timeline-turn"] [data-testid="field-bar"]'),
    ).toHaveLength(15)
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

  it('keeps the game the reader asked for last when two are opened at once', async () => {
    // A Bo3 reader clicking Game 1 then Game 2: game 1's log arrives second and
    // must not end up under game 2's header.
    const short = { ...ladder, log: shortLog }
    storage.objects.set('test-user/series-1-g1.json.gz', await storedLog(short))
    storage.held.set('test-user/series-1-g1.json.gz', () => {})

    goTo({ battle: 'series-1-g1' })
    await mountDashboard()
    await settle()

    goTo({ battle: 'series-1-g3' })
    await settle()

    // Now let the superseded read finish.
    storage.held.get('test-user/series-1-g1.json.gz')!()
    await waitFor(
      () => !useState('drawer-loading').value && useState('drawer-timeline').value !== null,
      'the drawer to settle on game 3',
    )
    await settle()

    expect(drawer().textContent).toContain('opponent-series-1-g3')
    // The 15-turn fixture, not the two-turn log that arrived late.
    expect(drawer().querySelectorAll('[data-testid="timeline-turn"]')).toHaveLength(16)
  })

  it('reads a battle once, however many things are watching the address', async () => {
    // Both the list and the drawer use the composable; only one of them may
    // turn the address into a read.
    await openDrawer()

    const reads = fake().reads.filter(
      (read) => read.method === 'battleById' && read.argument === 'ladder-6',
    )

    expect(reads).toHaveLength(1)
  })

  it('still shows the timeline when only the series switcher could not be read', async () => {
    // Its own attempt: the switcher is a convenience, and losing it is no
    // reason to withhold a timeline that reads perfectly well.
    fake().gamesOfSeries = () => Promise.reject(new Error('the series read failed'))
    await openDrawer('series-1-g2')

    expect(drawer().querySelector('[data-testid="timeline-error"]')).toBeNull()
    expect(drawer().querySelectorAll('[data-testid="timeline-turn"]').length).toBeGreaterThan(0)
    expect(drawer().querySelectorAll('[data-testid="series-game"]')).toHaveLength(0)
  })

  it('draws a switch as who left and who came in', async () => {
    await openDrawer()

    // Turn 3 of the fixture: Scrafty-Mega goes out, Toxapex comes in.
    const rows = [...drawer().querySelectorAll('[data-testid="timeline-row"]')]
    const trade = rows.find((row) =>
      [...row.querySelectorAll('[role="img"]')]
        .map((icon) => icon.getAttribute('aria-label'))
        .join(' → ')
        .includes('Scrafty-Mega → Toxapex'),
    )

    expect(trade).toBeDefined()
    // The words are for a screen reader; the icons are the sentence.
    expect(trade?.querySelector('.sr-only')?.textContent).toContain('Toxapex')
  })

  it('shows the condition a Pokémon comes back on the field with', async () => {
    // The `|switch|` HP field is the only line that says so, and "came in" on
    // its own would drop it.
    storage.object = await storedLog({ ...ladder, log: switchWithStatusLog })
    await openDrawer()

    // On the event row, not only in the turn's field bar: the row is where the
    // reader is told, at the moment it happened.
    const rows = [...drawer().querySelectorAll('[data-testid="timeline-row"]')]

    expect(rows.some((row) => row.textContent?.includes('tox'))).toBe(true)
  })

  it('opens each game of a series with its own turns collapsed', async () => {
    await openDrawer('series-1-g1')

    const toggle = () => drawer().querySelector<HTMLElement>('[data-testid="turn-details"]')!

    toggle().click()
    await settle()
    expect(toggle().getAttribute('aria-expanded')).toBe('true')

    drawer().querySelectorAll<HTMLElement>('[data-testid="series-game"]')[2]!.click()
    await waitFor(
      () =>
        openedBattle()?.replayId === 'series-1-g3' &&
        useState('drawer-timeline').value !== null &&
        drawer().querySelector('[data-testid="turn-details"]') !== null,
      'game 3 to be drawn',
    )
    await settle()

    // The turns of a different game, numbered the same: the switch that was
    // opened belonged to game 1's turn, not to this one.
    expect(toggle().getAttribute('aria-expanded')).toBe('false')

    // And the fields are this game's, one turn behind their turn: a snapshot
    // list left over from game 1 would pair a turn with somebody else's field.
    const turns = drawer().querySelectorAll('[data-testid="timeline-turn"]').length
    expect(
      drawer().querySelectorAll('[data-testid="timeline-turn"] [data-testid="field-bar"]'),
    ).toHaveLength(turns - 1)
  })

  it('closes the timeline with how the battle ended and what it cost', async () => {
    // Without it the last turn simply stops, and a game that ended in a
    // forfeit looks like a log that was cut off.
    amend('ladder-6', {
      end_reason: 'forfeit',
      rating: 1429,
      rating_delta: -15,
      result: 'loss',
    })

    await openDrawer()

    const outcome = drawer().querySelector('[data-testid="battle-outcome"]')
    expect(outcome).not.toBeNull()
    expect(outcome?.textContent).toContain('1444')
    expect(outcome?.textContent).toContain('1429')
    expect(outcome?.textContent).toContain('15')
  })

  it('draws the field the game finished on, between the last turn and the outcome', async () => {
    // The turns draw the field they opened on (#92), so the last turn's own
    // result belongs to nobody. Here is where it goes, in the order it was
    // played: the last turn's events, what they left, then how it ended.
    await openDrawer()

    const closing = [...drawer().querySelectorAll('[data-testid="field-bar"]')].at(-1)
    const outcome = drawer().querySelector('[data-testid="battle-outcome"]')

    expect(closing?.closest('[data-testid="timeline-turn"]')).toBeNull()
    expect(closing?.textContent).toContain('As the game ended')
    // Turn 15 knocks out Toxapex and Gholdengo, and this is the only field
    // that has either of them down.
    expect(closing?.textContent).toContain('KO')
    expect(
      closing &&
        outcome &&
        closing.compareDocumentPosition(outcome) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('draws the closing field for a game that never reached a turn', async () => {
    // A forfeit at team preview is one turn — the lead — which draws no field
    // of its own. Without this the reader is shown no field at all (#93).
    storage.object = await storedLog({ ...ladder, log: leadOnlyLog })
    await openDrawer()

    const bars = [...drawer().querySelectorAll('[data-testid="field-bar"]')]

    expect(bars).toHaveLength(1)
    expect(bars[0]?.textContent).toContain('As the game ended')
    // The icons are the only thing naming them, and the label is what they say.
    expect(bars[0]?.querySelector('[aria-label="Scrafty"]')).not.toBeNull()
  })

  it('says nothing about a rating a best-of series never had', async () => {
    // A Bo3 game is not played on the ladder, so there is no number to show —
    // and a zero would be a claim (design document, rating gaps).
    amend('series-1-g2', { rating: null, rating_delta: null })

    await openDrawer('series-1-g2')

    const outcome = drawer().querySelector('[data-testid="battle-outcome"]')
    expect(outcome).not.toBeNull()
    expect(outcome?.querySelector('[data-testid="rating-change"]')).toBeNull()
  })

  it('says the log could not be read rather than spinning for good', async () => {
    storage.fail = true
    await openDrawer()

    expect(drawer().querySelector('[data-testid="timeline-error"]')).not.toBeNull()
    expect(drawer().querySelector('[data-testid="timeline-loading"]')).toBeNull()
  })

  it('says so when the battle itself is not there', async () => {
    await openDrawer('never-imported')

    expect(drawer().querySelector('[data-testid="battle-missing"]')).not.toBeNull()
  })

  it('shows a battle of mine as me against the opponent, and marks no side', async () => {
    // The other half of the spectated tests below: an attributed battle keeps
    // exactly the header it had, result badge and all (#63).
    await openDrawer()

    const header = drawer().querySelector('header')!

    expect(header.textContent).toContain('notlittlestar')
    expect(header.textContent).toContain('opponent-ladder-6')
    expect(header.querySelector('[data-testid="side-won"]')).toBeNull()
  })

  it('names the reader when the row has no name for me, the way it always has', async () => {
    amend('ladder-6', { my_username: null })

    await openDrawer()

    expect(drawer().querySelector('header')?.textContent).toContain('You')
  })

  /** The same row once no alias of the reader's claims either player. */
  function spectate(replayId: string, winner: 'p1' | 'p2' | 'tie' | null = 'p2') {
    amend(replayId, {
      my_side: null,
      my_username: null,
      opponent_username: null,
      result: null,
      rating: null,
      rating_delta: null,
      bring_signature: null,
      details: {
        winner,
        sides: {
          p1: { username: 'Alice', bringSignature: 'pikachu|eevee' },
          p2: { username: 'Bob', bringSignature: 'snorlax|gengar' },
        },
      },
    })
  }

  it('reads a spectated battle as p1 against p2, with both brings drawn', async () => {
    spectate('ladder-6')

    await openDrawer()

    const header = drawer().querySelector('header')!

    expect(header.textContent).toContain('Alice')
    expect(header.textContent).toContain('Bob')
    // Neither of the words that assume a "me" in the battle.
    expect(header.textContent).not.toContain('You')
    expect(header.textContent).not.toContain('Unknown opponent')

    const parties = [...header.querySelectorAll('span[role="img"]')].map((party) =>
      party.getAttribute('aria-label'),
    )

    expect(parties).toHaveLength(2)
    expect(parties[0]).toContain('Pikachu')
    expect(parties[1]).toContain('Snorlax')

    // And the reason the drawer is open at all: the turns are drawn for a
    // battle with no side of mine the same as for one with.
    expect(drawer().querySelectorAll('[data-testid="timeline-turn"]')).toHaveLength(16)
  })

  /**
   * The two parties and the winner's mark, in the order the header draws them.
   * Which side is marked is the whole point, so the assertion is positional
   * rather than "a mark exists somewhere".
   */
  function markedOrder(): string[] {
    const header = drawer().querySelector('header')!

    return [...header.querySelectorAll('span[role="img"], [data-testid="side-won"]')].map(
      (element) => element.getAttribute('data-testid') ?? 'party',
    )
  }

  it('marks p2 as the winner when the log says p2 won', async () => {
    spectate('ladder-6', 'p2')

    await openDrawer()

    expect(markedOrder()).toEqual(['party', 'party', 'side-won'])

    const mark = drawer().querySelector('[data-testid="side-won"]')
    // Neutral wording: win and loss are relative to a "me" this battle has none of.
    expect(mark?.textContent).not.toMatch(/Win|Loss/)
  })

  it('marks p1 instead when the log says p1 won', async () => {
    spectate('ladder-6', 'p1')

    await openDrawer()

    expect(markedOrder()).toEqual(['party', 'side-won', 'party'])
  })

  it('marks no side when the log declared no winner', async () => {
    spectate('ladder-6', null)

    await openDrawer()

    expect(drawer().querySelector('[data-testid="side-won"]')).toBeNull()
  })

  it('says a spectated draw was a draw', async () => {
    spectate('ladder-6', 'tie')

    await openDrawer()

    const header = drawer().querySelector('header')!

    expect(header.querySelector('[data-testid="side-won"]')).toBeNull()
    expect(header.textContent).toContain('Tie')
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
    amend('ladder-6', {
      opponent_username: 'Somebody',
      turn_count: 3,
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

    // The format is on the row for a lone game and on the card's header for a
    // series, since a series says it once for its three games.
    const after = [...page.element.querySelectorAll('[data-testid="recent-battle"]')].map(
      (row: Element) => (row.closest('[data-testid="series-card"]') ?? row).textContent ?? '',
    )

    expect(after.length).not.toBe(before)
    expect(after.every((text: string) => text.includes('BO3'))).toBe(true)
  })
})

describe('a Bo3 in the list', () => {
  /** The dashboard with the Bo3 format chosen, which is where series exist. */
  async function series() {
    useStatsFilters().value = { ...useStatsFilters().value, formatId: FORMATS.EVENT }
    const page = await mountDashboard()
    await settle()

    return page
  }

  function cards(page: Awaited<ReturnType<typeof mountDashboard>>) {
    return [...page.element.querySelectorAll('[data-testid="series-card"]')]
  }

  it('draws the games of one series under one header', async () => {
    const page = await series()

    // series-1 has three games and series-2 two of a Bo3; both are cards.
    const games = cards(page).map(
      (card) => card.querySelectorAll('[data-testid="recent-battle"]').length,
    )

    expect(games).toEqual([2, 3])
  })

  it('says the opponent once for the whole series, not once per game', async () => {
    const page = await series()
    const card = cards(page).at(-1)!

    // Every game of the fixture series has its own opponent-<replay id>, so a
    // header that repeated them would show three names rather than one.
    expect([...card.textContent!.matchAll(/opponent-series-1/g)]).toHaveLength(1)
  })

  it('scores the series by the games it can see, without calling a winner', async () => {
    const page = await series()

    // series-1 is 2-1 and series-2 is 1-1: what is held, never "you won it".
    expect(cards(page).map((card) => card.textContent!.match(/\d–\d/)?.[0])).toEqual(['1–1', '2–1'])
  })

  it('numbers the games from the one played first', async () => {
    const page = await series()
    const rows = [...cards(page).at(-1)!.querySelectorAll('[data-testid="recent-battle"]')]

    expect(rows.map((row) => row.textContent!.includes('Game 1'))).toEqual([true, false, false])

    // Game 1 is the game played first — the drawer's switcher, which reads
    // `gamesOfSeries()` in played_at order, calls the same game by the same
    // number. The row itself no longer carries a name to check, so the game it
    // opens is what says which one it is.
    rows[0]!.dispatchEvent(new Event('click', { bubbles: true }))
    await settle()

    expect(push).toHaveBeenCalledWith(expect.objectContaining({ query: { battle: 'series-1-g1' } }))
  })

  it('opens the game that was clicked, not the series', async () => {
    const page = await series()
    const second = cards(page).at(-1)!.querySelectorAll('[data-testid="recent-battle"]')[1]!

    second.dispatchEvent(new Event('click', { bubbles: true }))
    await settle()

    expect(push).toHaveBeenCalledWith(expect.objectContaining({ query: { battle: 'series-1-g2' } }))
  })

  it('counts the series beside the heading, not the games in them', async () => {
    const page = await series()

    // Two series in the fixture, of three games and two. A Bo3 format is
    // counted per series everywhere else on the page.
    expect(page.get('[data-testid="recent-count"]').text()).toBe('2')
    expect(page.findAll('[data-testid="recent-battle"]')).toHaveLength(5)
  })

  it('leaves a game that is on its own as a plain row', async () => {
    // The ladder format has no series at all, so nothing there is a card.
    const page = await mountDashboard()
    await settle()

    expect(cards(page)).toHaveLength(0)
    expect(page.findAll('[data-testid="recent-battle"]').length).toBeGreaterThan(1)
  })
})

describe('the registered six on a row', () => {
  /** Every Pokémon a party drew, and whether it was marked as absent. */
  function party(element: Element, index: number) {
    const parties = [...element.querySelectorAll('span[role="img"]')]
    const chosen = parties[index]!

    return {
      label: chosen.getAttribute('aria-label') ?? '',
      drawn: chosen.querySelectorAll('span[title]').length,
      absent: chosen.querySelectorAll('[data-absent]').length,
    }
  }

  it('draws the whole of each side, with the ones that never appeared marked', async () => {
    const page = await mountDashboard()
    await settle()

    const row = page.element.querySelector('[data-testid="recent-battle"]')!

    // Mine comes from the `team_signature` column — the fixture registers six
    // and brought four. Theirs comes from `details`, where the fixture keeps a
    // four-strong team that brought two. Two absent on each side either way.
    expect(party(row, 0)).toMatchObject({ drawn: 6, absent: 2 })
    expect(party(row, 1)).toMatchObject({ drawn: 4, absent: 2 })
  })

  it('says which ones did not appear in words, not only by fading them', async () => {
    // Fading is a visual signal and cannot be the only one.
    const page = await mountDashboard()
    await settle()

    const row = page.element.querySelector('[data-testid="recent-battle"]')!

    expect(party(row, 0).label).toContain('did not appear')
  })

  it('draws the bring alone on a row whose details predate the six', async () => {
    // jsonb: an older row simply has less in it. The opponent then reads as it
    // did before this existed, rather than as a side with nobody on it.
    fake().rows = fake().rows.map((row) => ({
      ...row,
      details: { sides: { p1: { bringSignature: 'a|b' }, p2: { bringSignature: 'c|d' } } },
    }))

    const page = await mountDashboard()
    await settle()

    const row = page.element.querySelector('[data-testid="recent-battle"]')!

    expect(party(row, 1)).toMatchObject({ drawn: 2, absent: 0 })
  })

  it('draws both sides in the drawer header too', async () => {
    goTo({ battle: 'ladder-6' })
    await mountDashboard()
    await waitFor(() => !useState('drawer-loading').value, 'the drawer to settle')
    await settle()

    const header = document.body.querySelector('[data-testid="battle-drawer"] header')!

    // Mine: the fixture's six, four of them seen. Theirs: four registered,
    // two seen.
    expect(party(header, 0)).toMatchObject({ drawn: 6, absent: 2 })
    expect(party(header, 1)).toMatchObject({ drawn: 4, absent: 2 })
  })
})
