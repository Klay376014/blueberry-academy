import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import Home from '../../app/pages/index.vue'
import { fakeBattles } from '../fakes/battles'
import type { StoredBattle } from '../fakes/battles'
import { FORMATS, STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'

/**
 * The class contract of the three lists that draw a game as a row — the recent
 * list, the games of a series card, and the spectated section — for
 * docs/specs/2026-09-18-responsive-baseline.md. §6 of that document is what
 * says why this asserts classes and not widths: jsdom lays nothing out, so
 * nothing here may claim a row fitted, wrapped, or stopped scrolling sideways.
 * That is read by hand at 320 / 375 / 414 and written back onto issue #215.
 *
 * What it can see is that the three still agree. They were three copies of one
 * row that each grew their own trailing column, and the value of this file is
 * that the fourth copy cannot be written without noticing the other three.
 */

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

/** The stats fixture with the columns the row reads filled in. */
function played(row: StoredBattle): StoredBattle {
  return {
    my_side: 'p1',
    opponent_username: `opponent-${row.replay_id}`,
    turn_count: 12,
    details: { sides: { p1: { bringSignature: 'a|b' }, p2: { bringSignature: 'c|d' } } },
    ...row,
    // On every row, so the rating change is drawn wherever the row puts it.
    rating_delta: 12,
  }
}

/**
 * A Bo3 game belonging to no series, so the chosen format holds a series card
 * and a lone row at once — the two rows this file compares.
 */
const LONE: StoredBattle = {
  replay_id: 'event-lone',
  played_at: '2026-08-10T10:00:00Z',
  format_id: FORMATS.EVENT,
  series_id: null,
  my_username: 'NotLittleStar',
  result: 'win',
  rating: null,
  rating_delta: null,
  team_signature: 'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu',
  bring_signature: 'calyrexshadow|incineroar|ironhands|urshifu',
  bring_complete: true,
}

/** A battle between two people, neither of whom is the reader. */
function watched(replayId: string, playedAt: string): StoredBattle {
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
      winner: 'p1',
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

type Page = Awaited<ReturnType<typeof mountSuspended>>

let mounted: Page | null = null

async function mountHome() {
  mounted?.unmount()
  mounted = await mountSuspended(Home)
  // The spectated read is started in setup and deliberately not awaited.
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
    ...[...STATS_ROWS, LONE].map(played),
    watched('watched-1', '2026-08-20T10:00:00Z'),
  ])

  // The Bo3 format, because a series card only exists under one — and the
  // lone game above keeps a plain row on screen beside it.
  useStatsFilters().value = { ...defaultStatsFilters(), formatId: FORMATS.EVENT }
  useState('stats-rows').value = null
  useState('recent-battle-extras').value = new Map()
  useState('spectated-rows').value = null
  useState('spectated-shown').value = null
  useState('spectated-error').value = null
  useState('spectated-reading').value = null
  useState('spectated-query').value = ''
})

const classesOf = (element: Element) => [...element.classList]

/** One row of each of the three lists, which is what "the same row" is about. */
function rows(page: Page) {
  const all = [...page.element.querySelectorAll('[data-testid="recent-battle"]')]
  const inSeries = all.find((row) => row.closest('[data-testid="series-card"]'))
  const lone = all.find((row) => !row.closest('[data-testid="series-card"]'))
  const spectated = page.element.querySelector('[data-testid="spectated-battle"]')

  expect(lone, 'a recent list row').toBeTruthy()
  expect(inSeries, 'a series card game row').toBeTruthy()
  expect(spectated, 'a spectated row').toBeTruthy()

  return {
    recent: lone as Element,
    series: inSeries as Element,
    spectated: spectated as Element,
  }
}

describe('the three lists that draw a game as a row', () => {
  it('draws one row skeleton in all three', async () => {
    for (const [name, row] of Object.entries(rows(await mountHome()))) {
      const classes = classesOf(row)

      expect(classes, name).toContain('flex')
      expect(classes, name).toContain('w-full')
      expect(classes, name).toContain('items-center')
      // §5: the whole row is the target, and it is the row that has to hold
      // the floor — the mark and the party inside it are not separately
      // pressable.
      expect(classes, name).toContain('min-h-11')
      expect(classes, name).toContain('gap-2')
    }
  })

  it('gives every row one body that may shrink, and nothing trailing it', async () => {
    // The overflow was three `shrink-0` columns bracketing the party. What is
    // asserted is the shape that removed them: a fixed mark at most, then the
    // body, and nothing after it.
    for (const [name, row] of Object.entries(rows(await mountHome()))) {
      const children = [...row.children]

      expect(children.length, name).toBeLessThanOrEqual(2)

      const body = children.at(-1)!

      expect(classesOf(body), name).toContain('min-w-0')
      expect(classesOf(body), name).toContain('flex-1')
      expect(classesOf(body), name).toContain('flex-col')

      for (const child of children.slice(0, -1))
        expect(classesOf(child), name).toContain('shrink-0')
    }
  })

  it('lets the meta line wrap, which is where the numbers that gave way went', async () => {
    for (const [name, row] of Object.entries(rows(await mountHome()))) {
      const meta = row.querySelector('[data-testid="battle-meta"]')

      expect(meta, name).toBeTruthy()
      expect(classesOf(meta!), name).toContain('flex-wrap')
    }
  })

  it('gives the rating change back its scan column from sm up', async () => {
    // The one prefix on this row. It has to stay a prefix: below sm the meta
    // line is already wrapping, and an `ml-auto` there would push the number
    // onto a line of its own.
    const { recent } = rows(await mountHome())
    const rating = classesOf(recent.querySelector('[data-testid="rating-change"]')!)

    expect(rating).toContain('sm:ml-auto')
    expect(rating).not.toContain('ml-auto')
  })

  it('moves the numbers that used to bracket the party onto that line', async () => {
    const { recent, series } = rows(await mountHome())

    for (const [name, element] of [
      ['rating change', recent.querySelector('[data-testid="rating-change"]')],
      ['game number', series.querySelector('[data-testid="battle-number"]')],
      ['turn count', series.querySelector('[data-testid="turn-count"]')],
    ] as const) {
      expect(element, name).toBeTruthy()
      expect(element!.closest('[data-testid="battle-meta"]'), name).toBeTruthy()
    }
  })

  it('lets every truncating name shrink, or it truncates nothing', async () => {
    for (const [name, row] of Object.entries(rows(await mountHome()))) {
      for (const element of row.querySelectorAll('.truncate'))
        expect(classesOf(element), name).toContain('min-w-0')
    }
  })

  describe('the two teams on a row', () => {
    it('lets the pair wrap and keeps each side one group', async () => {
      for (const [name, row] of Object.entries(rows(await mountHome()))) {
        const teams = row.querySelector('[data-testid="battle-teams"]')

        expect(teams, name).toBeTruthy()
        expect(classesOf(teams!), name).toContain('flex-wrap')

        const sides = [...teams!.querySelectorAll('[data-testid="battle-side"]')]

        expect(sides, name).toHaveLength(2)
        for (const side of sides) expect(classesOf(side), name).toContain('min-w-0')
      }
    })

    it('keeps the separator between the two sides rather than inside one', async () => {
      // "mine vs theirs" is the only thing that says which party is whose, and
      // it survives a wrap only while it is a sibling of both.
      for (const [name, row] of Object.entries(rows(await mountHome()))) {
        const teams = row.querySelector('[data-testid="battle-teams"]')!
        const order = [...teams.children].map((child) => child.getAttribute('data-testid'))

        expect(order, name).toEqual(['battle-side', 'battle-versus', 'battle-side'])
      }
    })

    it('keeps the winner’s mark inside the side it belongs to', async () => {
      // Spectated rows name no "me", so the mark is the whole answer to "who
      // won" — a wrap that left it between the two parties would answer
      // nothing.
      const { spectated } = rows(await mountHome())
      const won = spectated.querySelector('[data-testid="side-won"]')

      expect(won).toBeTruthy()
      expect(won!.closest('[data-testid="battle-side"]')).toBe(
        spectated.querySelectorAll('[data-testid="battle-side"]')[0],
      )
    })
  })

  describe('the spectated section’s search box', () => {
    it('takes its width from the row it is on rather than a number', async () => {
      const search = (await mountHome()).get('[data-testid="spectated-search"]').classes()

      // `w-48` was 192px of a 320px screen taken before the heading and the
      // count had asked for any.
      expect(search.some((name: string) => /^w-\d/.test(name))).toBe(false)
      expect(search).toContain('min-w-0')
      expect(search).toContain('flex-1')
    })

    it('holds the touch-target floor, being something to press', async () => {
      const search = (await mountHome()).get('[data-testid="spectated-search"]').classes()

      expect(search).toContain('min-h-11')
    })

    it('lets the heading, the box and the count fall apart when they must', async () => {
      const page = await mountHome()
      const header = page.get('[data-testid="spectated-header"]').classes()

      expect(header).toContain('flex-wrap')

      // A wrap the group can never reach is not a wrap: a flex item is put on
      // a line by its basis, so `flex-1 min-w-0` on its own would shrink the
      // box beside the heading forever instead of ever taking a line.
      const group = page.get('[data-testid="spectated-search"]').element.parentElement!

      expect([...group.classList].some((name) => /^basis-/.test(name))).toBe(true)
    })
  })
})
