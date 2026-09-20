import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { reactive } from 'vue'
import Dashboard from '../../app/pages/index.vue'
import { fakeBattles } from '../fakes/battles'
import type { StoredBattle } from '../fakes/battles'
import { STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'
import ladder from '../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

/**
 * The drawer and the timeline's half of the class contract in
 * docs/specs/2026-09-18-responsive-baseline.md. §6 of that document says what
 * this cannot see: jsdom lays nothing out, so nothing here may claim a row
 * fitted, wrapped, or stopped scrolling sideways at 320 — that is read by hand
 * at the six widths and written back onto issue #217.
 *
 * What it holds is the decision each class was written for. The event row was
 * a four-column grid whose first three columns were fixed pixels, so a row
 * with nothing to put in them still paid for them; what replaced it is the
 * shape #215 arrived at for the battle rows — leading marks sized by their
 * own content, one body that may shrink, and the groups inside it allowed to
 * break. Asserting that shape is what stops the grid coming back.
 *
 * Over the real drawer rather than over each component, because the panel is
 * where the rows, the field bar and the header have to agree, and because the
 * rows asserted here are the ones the parser actually produces.
 */

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

/** The columns the stats read leaves out, which the drawer is a reader of. */
function withExtras(row: StoredBattle): StoredBattle {
  return {
    my_side: 'p1',
    opponent_username: `opponent-${row.replay_id}`,
    turn_count: 12,
    details: {
      winner: 'p1',
      sides: {
        p1: { username: 'NotLittleStar', bringSignature: 'a|b', teamSignature: 'a|b|c' },
        p2: { username: 'Somebody', bringSignature: 'x|y', teamSignature: 'x|y|z' },
      },
    },
    ...row,
  }
}

/**
 * The same battle with every alias that claimed it unbound, which is the only
 * shape whose header marks a winner: a battle of mine has a result badge doing
 * that job, and a spectated one has the mark and nothing else.
 */
const WATCHED: StoredBattle = {
  replay_id: 'watched-1',
  played_at: '2026-08-20T10:00:00Z',
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
    winner: 'p1',
    sides: {
      p1: { username: 'Alice', bringSignature: 'pikachu|eevee', teamSignature: 'eevee|pikachu' },
      p2: { username: 'Bob', bringSignature: 'snorlax|gengar', teamSignature: 'gengar|snorlax' },
    },
  },
}

/**
 * One doubles turn written to crowd every part of the panel at once: a move
 * that hit the same target twice, a Pokémon that stopped the spread it was
 * never a target of, a tick of chip damage the log named a source for, and a
 * field standing under a room, a weather, an aura and a screen.
 *
 * Written rather than taken from a replay because what is being asserted is
 * the shape of the busiest row, and no one fixture reliably holds all of it.
 */
const crowdedLog = [
  '|gametype|doubles',
  '|player|p1|Alice|benga|1444',
  '|player|p2|Bob|gentleman|1534',
  '|start',
  '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
  '|switch|p1b: Incineroar|Incineroar, L50, M|100/100',
  '|switch|p2a: Suicune|Suicune, L50|100/100',
  '|switch|p2b: Whimsicott|Whimsicott, L50, M|100/100',
  '|turn|1',
  '|-fieldstart|move: Trick Room|[of] p2b: Whimsicott',
  '|-weather|RainDance|[from] ability: Drizzle|[of] p2a: Suicune',
  '|-sidestart|p1: Alice|move: Reflect',
  '|-ability|p2b: Whimsicott|Fairy Aura',
  '|move|p2b: Whimsicott|Protect|p2b: Whimsicott',
  '|-singleturn|p2b: Whimsicott|Protect',
  '|move|p1a: Scrafty|Rock Slide|p2a: Suicune|[spread] p2a',
  '|-crit|p2a: Suicune',
  '|-damage|p2a: Suicune|62/100',
  '|-damage|p2a: Suicune|31/100',
  '|-activate|p2b: Whimsicott|move: Protect',
  '|-status|p2a: Suicune|brn',
  '|-boost|p2a: Suicune|atk|2',
  '|-unboost|p2a: Suicune|spe|1',
  '|-start|p2a: Suicune|confusion',
  '|-terastallize|p2a: Suicune|Water',
  '|-damage|p1a: Scrafty|88/100|[from] item: Life Orb',
  '|turn|2',
  '|move|p1a: Scrafty|Fake Out|p2a: Suicune',
  '|-damage|p2a: Suicune|20/100',
].join('\n')

const storage = { object: null as Blob | null }

/** The replay JSON, gzipped the way the importer stored it. */
async function storedLog(log: string): Promise<Blob> {
  const stream = new Response(JSON.stringify({ ...ladder, log })).body!

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

/** Enough router to be installed into; see `battle-drawer.spec.ts` for why. */
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

/** Unpacking the stored log is real async work; wait for it rather than tick. */
async function waitFor(ready: () => boolean, what: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (ready()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error(`Gave up waiting for ${what}.`)
}

async function openDrawer(replayId = 'ladder-6') {
  mounted?.unmount()
  goTo({ battle: replayId })
  mounted = await mountSuspended(Dashboard)
  await waitFor(() => !useState('drawer-loading').value, `the drawer to settle on ${replayId}`)
  await new Promise((resolve) => setTimeout(resolve, 0))

  // The last one in the document: an unmounted dashboard takes its portalled
  // panel with it, but the exit animation can outlive the test.
  const element = [...document.body.querySelectorAll('[data-testid="battle-drawer"]')].at(-1)
  if (!element) throw new Error('The drawer is not open.')

  return element
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

beforeEach(async () => {
  const nuxtApp = useNuxtApp()

  if (!nuxtApp.$supabase) {
    nuxtApp.provide('supabase', {
      storage: { from: () => ({ download: async () => ({ data: storage.object, error: null }) }) },
    })
  }

  signIn()
  battles.value = fakeBattles([...STATS_ROWS.map(withExtras), WATCHED])
  storage.object = await storedLog(crowdedLog)

  useStatsFilters().value = defaultStatsFilters()
  useState('stats-rows').value = null
  useState('battle-logs').value = new Map()
  useState('drawer-battle').value = null
  useState('drawer-series').value = []
  useState('drawer-timeline').value = null
  useState('drawer-failure').value = null
  useState('drawer-reading').value = null
  useState('recent-battle-extras').value = new Map()
  goTo({})
})

const classesOf = (element: Element) => [...element.classList]

const all = (root: Element, testId: string) => [
  ...root.querySelectorAll(`[data-testid="${testId}"]`),
]

const one = (root: Element, testId: string) => {
  const found = root.querySelector(`[data-testid="${testId}"]`)

  expect(found, testId).toBeTruthy()

  return found!
}

describe('the event row’s four columns', () => {
  it('sizes the leading marks by their content rather than by a grid', async () => {
    // The three fixed columns were 30 + 14 + 40 CSS px before their own gaps
    // and the row's padding; at 375 that left the body about 210.
    const rows = all(await openDrawer(), 'timeline-row')

    expect(rows.length).toBeGreaterThan(3)
    for (const row of rows) {
      expect(classesOf(row)).toContain('flex')
      expect(classesOf(row).filter((name) => /^grid-cols-/.test(name))).toEqual([])
    }
  })

  it('charges a row nothing for a gutter it does not use', async () => {
    // The grid's empty cells were `<span v-else />` placeholders, and that is
    // the part that cost most on the rows with least to say. The turn's field
    // lines belong to no side, carry no glyph and name no Pokémon.
    const rows = all(await openDrawer(), 'timeline-row')
    const counts = rows.map((row) => row.children.length)

    expect(Math.min(...counts)).toBe(1)
    expect(Math.max(...counts)).toBeGreaterThan(1)
  })

  it('gives every row one body that may shrink, and marks that may not', async () => {
    for (const row of all(await openDrawer(), 'timeline-row')) {
      const children = [...row.children]
      const body = children.at(-1)!

      expect(body.getAttribute('data-testid')).toBe('row-body')
      expect(classesOf(body)).toContain('min-w-0')
      expect(classesOf(body)).toContain('flex-1')
      expect(classesOf(body)).toContain('flex-wrap')

      for (const mark of children.slice(0, -1)) expect(classesOf(mark)).toContain('shrink-0')
    }
  })

  it('lets every group inside a body break rather than push the row wide', async () => {
    // A target carries an icon, one line per hit and its notes; a bystander
    // carries an icon and a note. Either is most of a phone's body width, and
    // a group that cannot break takes all of it.
    const drawer = await openDrawer()
    const groups = all(drawer, 'row-body').flatMap((body) =>
      [...body.children].filter((child) => child.querySelector('[title]')),
    )

    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      expect(classesOf(group)).toContain('flex-wrap')
      expect(classesOf(group)).toContain('min-w-0')
    }
  })

  it('keeps one line per hit, which is what the body is widest for', async () => {
    // The row this file is written against: `multi-hit-rows.spec.ts` owns why
    // the hits are separate lines, this owns that they still are once the row
    // stopped being a grid.
    const hits = all(await openDrawer(), 'row-hit')

    expect(hits.length).toBeGreaterThan(1)
  })

  it('keeps the words beside the marks a sentence, which §5 floors at text-sm', async () => {
    // §2.5's density argument covers the marks. It does not cover the message.
    const bodies = all(await openDrawer(), 'row-body')

    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) expect(classesOf(body)).toContain('text-sm')
  })

  it('still says which side a row is in words, not in hue alone', async () => {
    // ADR-0017 §2: the mark exists because the hue fails in greyscale, so a
    // narrower row may not buy its width back by dropping it.
    const marks = all(await openDrawer(), 'side-mark')

    expect(marks.length).toBeGreaterThan(0)
    for (const mark of marks) {
      expect(mark.textContent?.trim()).toBeTruthy()
      expect(classesOf(mark)).not.toContain('sr-only')
      expect(classesOf(mark)).not.toContain('hidden')
    }
  })
})

describe('the health a row reports', () => {
  it('keeps both bars at their drawn width while the numbers give way', async () => {
    // The bar is a fixed-width decoration on a line that wraps; without this
    // it is what flex takes the width from, and a squeezed bar reads as full.
    const drawer = await openDrawer()

    for (const id of ['row-health', 'health-change']) {
      const drawn = all(drawer, id)

      expect(drawn.length, id).toBeGreaterThan(0)
      for (const change of drawn)
        expect(classesOf(change.firstElementChild!), id).toContain('shrink-0')
    }
  })

  it('lets the standalone change wrap, carrying a named source as it does', async () => {
    for (const change of all(await openDrawer(), 'health-change'))
      expect(classesOf(change)).toContain('flex-wrap')
  })
})

describe('the field bar', () => {
  it('keeps every line wrapping, which is how a row of chips answers a width', async () => {
    const lines = all(one(await openDrawer(), 'field-bar'), 'field-line')

    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(classesOf(line)).toContain('flex-wrap')
  })

  it('holds the side label at its own width instead of letting it be squeezed', async () => {
    // It is a fixed `w-8` column, and a flex item's width is a starting point:
    // squeezed, a two-word label becomes two lines of one word.
    for (const label of all(await openDrawer(), 'side-label'))
      expect(classesOf(label)).toContain('shrink-0')
  })

  it('lets one Pokémon’s state break away from its icon', async () => {
    // A condition, two stat stages, a volatile and a Tera type is five chips;
    // beside a 40px icon and an HP reading they are not one phone line.
    const groups = all(await openDrawer(), 'field-pokemon')

    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      expect(classesOf(group)).toContain('flex-wrap')
      expect(classesOf(group)).toContain('min-w-0')
    }
  })

  it('leaves the chips the size §2.5 argued for', async () => {
    // Not a claim that 9px is readable — §5 exempts a symbol from the sentence
    // floor, and ADR-0017 says the answer to an unreadable mark is its own
    // size rather than a blanket one. The guard is against the blanket.
    const chips = [...(await openDrawer()).querySelectorAll('[data-condition]')]

    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      expect(classesOf(chip)).toContain('font-mono')
      expect(classesOf(chip)).not.toContain('text-base')
    }
  })
})

describe('the drawer header', () => {
  it('keeps the winner’s mark off the title, which is the phone call it made', async () => {
    // The title truncates and two Showdown names already fill it, so the mark
    // would be the first thing the ellipsis ate — and on a spectated battle it
    // is the only thing on screen saying who won.
    const drawer = await openDrawer('watched-1')
    const won = one(drawer, 'side-won')

    expect(won.closest('[data-testid="drawer-meta"]')).toBeTruthy()
    expect(won.closest('[data-testid="side-name"]')).toBe(null)
  })

  it('keeps that row wrapping, and its trailing length off ml-auto on a phone', async () => {
    // The same call #215 made on the battle rows: below `sm` the line is
    // already wrapping, and an `ml-auto` there takes a line of its own.
    const drawer = await openDrawer()

    expect(classesOf(one(drawer, 'drawer-meta'))).toContain('flex-wrap')

    const length = classesOf(one(drawer, 'drawer-length'))

    expect(length).toContain('sm:ml-auto')
    expect(length).not.toContain('ml-auto')
  })

  describe('the controls in its top row', () => {
    it('holds the touch-target floor on the close button, an icon control', async () => {
      const close = classesOf(one(await openDrawer(), 'drawer-close'))

      expect(close).toContain('min-h-11')
      // §5: it has no text to widen it, so its width is written down too.
      expect(close).toContain('min-w-11')
    })

    it('holds it on the replay link without pinning a width it has words for', async () => {
      const link = classesOf(one(await openDrawer(), 'replay-link'))

      expect(link).toContain('min-h-11')
      expect(link).not.toContain('min-w-11')
    })
  })

  describe('the buttons that move between the games of a series', () => {
    it('holds the touch-target floor on every one of them', async () => {
      const buttons = all(await openDrawer('series-1-g2'), 'series-game')

      expect(buttons).toHaveLength(3)
      for (const button of buttons) {
        expect(classesOf(button)).toContain('min-h-11')
        // A text control: §5 says its width comes from the words in it.
        expect(classesOf(button)).not.toContain('min-w-11')
      }
    })

    it('keeps them the floor apart for adjacent targets, in both axes', async () => {
      // The group wraps, so a thumb meets the vertical gap as often as the
      // horizontal one.
      const group = classesOf(one(await openDrawer('series-1-g2'), 'series-games'))

      expect(group).toContain('gap-2')
      expect(group).toContain('flex-wrap')
    })
  })
})

describe('the rest of the panel', () => {
  it('holds the touch-target floor on a turn’s details toggle', async () => {
    const toggles = all(await openDrawer(), 'turn-details')

    expect(toggles.length).toBeGreaterThan(0)
    for (const toggle of toggles) expect(classesOf(toggle)).toContain('min-h-11')
  })

  it('gives the rating change its scan column from sm up, as the lists do', async () => {
    const rating = classesOf(one(one(await openDrawer(), 'battle-outcome'), 'rating-change'))

    expect(rating).toContain('sm:ml-auto')
    expect(rating).not.toContain('ml-auto')
  })

  it('spends less of a phone’s width on the panel’s own padding', async () => {
    const padding = classesOf(one(await openDrawer(), 'timeline-scroll')).filter((name) =>
      /(^|:)px-/.test(name),
    )

    // Mobile first: the unprefixed step is the phone's and the prefix only
    // adds. The 8px it gives back is 4% of the content column at 320.
    expect(padding).toContain('px-2')
    expect(padding.some((name) => /^(sm|md|lg):px-/.test(name))).toBe(true)
  })
})
